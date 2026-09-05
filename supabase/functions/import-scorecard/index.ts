// Supabase Edge Function: import-scorecard
//
// Receives one or more scorecard screenshot images (e.g. from LaneTalk),
// sends them to Google's Gemini API for vision extraction and returns
// structured frame-by-frame data shaped to match this app's own `shots`
// model as closely as possible -- so the client-side conversion step is
// close to a direct field mapping, not a translation.
//
// Uses Gemini specifically because it has a genuine, permanent free tier
// for this kind of vision-understanding call (not image generation, which
// is priced differently) -- see the project's ideas discussion for why.
// The API key lives here, server-side, specifically so it's never exposed
// in the client-side bundle where anyone could extract and abuse it.
//
// Deploy with: supabase functions deploy import-scorecard
// Requires a GEMINI_API_KEY secret set via:
//   supabase secrets set GEMINI_API_KEY=your-key-here
// Get a free key (no credit card required) at https://aistudio.google.com

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("gemini_app_key");
const GEMINI_MODEL = "gemini-3.6-flash"; // multimodal, on the free tier
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// One uniform shape for every frame, 1 through 10. Each frame is just a
// list of the actual deliveries (balls) physically thrown in it, each with
// its own strike/pins-standing observation -- Gemini reports raw physical
// facts, not this app's internal data-modeling conventions for how frame
// 10 splits across separate vs. embedded shot records. That translation
// happens in tested client-side code instead, since asking a vision model
// to reason about an app-specific data model on top of reading the image
// is a needless extra source of error.
//
// Frames 1-9 have 1 ball (if a strike) or 2 balls (if not). Frame 10 has
// 2 or 3 balls, depending on strikes/spares -- the client-side conversion
// figures out how many balls SHOULD exist and only trusts what's present.
const BALL_SCHEMA = {
  type: "object",
  properties: {
    ballIndex: { type: "integer", description: "1, 2, or 3 -- which delivery within the frame this is" },
    isStrike: { type: "boolean" },
    pinsStanding: {
      type: "array",
      items: { type: "string" },
      description: "Pin numbers 1-10 left standing on the rack immediately after THIS delivery, read from the pin-deck graphic. Empty array if isStrike is true, or if this delivery cleared every pin that was left (a spare/conversion).",
    },
  },
  required: ["ballIndex", "isStrike", "pinsStanding"],
};

const FRAME_SCHEMA = {
  type: "object",
  properties: {
    frameNumber: { type: "integer", description: "1 through 10" },
    balls: {
      type: "array",
      items: BALL_SCHEMA,
      description: "Every delivery physically thrown in this frame, in order. Frames 1-9: 1 ball if a strike, 2 if not. Frame 10: 2 or 3 balls depending on strikes/spares earned -- only include balls actually shown, never guess or pad to a fixed count.",
    },
  },
  required: ["frameNumber", "balls"],
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        properties: {
          gameNumber: { type: "integer" },
          ballUsed: { type: "string", nullable: true, description: "The ball name shown for this game, if visible (e.g. 'Bionic'). Null if not shown or not legible." },
          frames: { type: "array", items: FRAME_SCHEMA },
        },
        required: ["gameNumber", "frames"],
      },
    },
  },
  required: ["games"],
};

const EXTRACTION_PROMPT = `You are reading a bowling scorecard screenshot (from an app called LaneTalk). Extract every game and frame shown into the exact JSON shape requested.

For each frame, focus on the small triangular pin-deck graphic above the frame's score box, not just the text notation -- the graphic shows which of the 10 pins were knocked down (typically colored/filled) versus left standing (typically gray/outlined) after each ball thrown. Standard ten-pin numbering: pin 1 is the headpin at the front; pins 2-3 are the next row back; pins 4-6 the next; pins 7-10 are the back row.

Report each frame as a plain, ordered list of the actual deliveries (balls) physically thrown in it -- do not try to interpret bowling scoring rules or bonus-ball logic, just describe what you see, ball by ball, in the order thrown:

- Frames 1-9: report 1 ball if it was a strike (all 10 pins down), or 2 balls if not (the first ball's leave, then the second ball's result on whatever remained).
- Frame 10: report every ball actually shown for that frame -- this could be 2 or 3 balls depending on strikes and spares earned, but only report what the screenshot actually shows. Do not guess or invent a ball that isn't visibly recorded.

For each ball, read the pin-deck graphic carefully to determine EXACTLY which pin numbers were left standing immediately after that specific delivery -- this is the most important and most error-prone part, so take your time with it. An empty list means either a strike (if the first ball of a fresh rack) or that the delivery cleared every pin that was still standing (a spare/conversion on a later ball in the frame).

If a game's ball name is shown as a tag/label near that game, include it. If not visible or you're unsure, use null rather than guessing.

Respond with valid JSON matching the provided schema exactly. If a screenshot shows partial or cut-off games, only include complete frames you can actually read clearly from the pin-deck graphic -- do not guess or fabricate a frame or ball you can't clearly see.`;

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured on the server" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require a real, signed-in user -- this costs API quota, so it
    // shouldn't be callable by anyone who happens to find the URL.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { images } = await req.json();
    // images: array of { base64: string, mimeType: string } -- one entry per uploaded screenshot
    if (!Array.isArray(images) || !images.length) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (images.length > 6) {
      return new Response(JSON.stringify({ error: "Too many images in one request (max 6)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts = [
      { text: EXTRACTION_PROMPT },
      ...images.map((img) => ({
        inline_data: { mime_type: img.mimeType || "image/jpeg", data: img.base64 },
      })),
    ];

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!geminiRes.ok) {
  const errText = await geminiRes.text();
  console.error("GEMINI API ERROR:", errText);
  return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return new Response(JSON.stringify({ error: "Gemini returned no extractable content", detail: geminiData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "Gemini's response wasn't valid JSON", detail: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
 } catch (err) {
  console.error("UNEXPECTED ERROR:", err);
  return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
