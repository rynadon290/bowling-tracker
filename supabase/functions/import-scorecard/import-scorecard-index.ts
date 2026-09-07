// Supabase Edge Function: import-scorecard
//
// Receives one or more scorecard screenshot images (e.g. from LaneTalk),
// sends them to Google's Gemini API for vision extraction, and returns
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

// Reads BOTH spellings. analyze-performance has always used the
// lowercase "gemini_api_key", and this function used the uppercase one --
// so the secret that made Insights work left the scorecard reader dead,
// reporting "not configured" on a project where the key was configured
// all along. Accepting either means one secret serves both, whichever
// name it happens to be stored under.
const GEMINI_API_KEY = Deno.env.get("gemini_api_key") || Deno.env.get("GEMINI_API_KEY");
// Kept in step with analyze-performance, which was migrated to this model
// already. gemini-2.5-flash was retired for new callers and returns a 404
// -- which surfaced here as a bare "Gemini API error" for a while because
// the client was discarding the detail the function sent alongside it.
const GEMINI_MODEL = "gemini-3.6-flash";
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
      description: "Every delivery physically thrown in this frame, in order. Frames 1-9: 1 ball if a strike, 2 if not. Frame 10: 2 or 3 balls depending on strikes/spares earned -- only include balls actually shown, never guess or pad to a fixed count. Omit this entirely if the scorecard shows no per-frame detail.",
    },
  },
  required: ["frameNumber", "balls"],
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    // FLAT list of games, exactly as this schema was before team support
    // was added -- one bowler per game, identified by bowlerName, rather
    // than games nested inside a bowlers array.
    //
    // The nested version added a level (bowlers > games > frames > balls
    // > pinsStanding) to a schema that already sat five deep, and Gemini
    // rejects a responseSchema past its complexity limit. Carrying the
    // bowler on each game keeps the depth identical to the version that
    // demonstrably worked, and the client groups by bowlerName.
    games: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bowlerName: { type: "string", nullable: true, description: "The bowler this game belongs to, exactly as printed on the scorecard including abbreviations (e.g. 'R. Nadon'). Null on a single-bowler card with no name shown." },
          lineupPosition: { type: "integer", nullable: true, description: "Zero-based position of this bowler's column on the card, in the order bowlers appear." },
          seriesTotal: { type: "integer", nullable: true, description: "This bowler's printed series total, if the card shows one. Repeat the same value on each of that bowler's games." },
          gameNumber: { type: "integer" },
          ballUsed: { type: "string", nullable: true, description: "The ball name shown for this game, if visible (e.g. 'Bionic'). Null if not shown or not legible." },
          frames: { type: "array", items: FRAME_SCHEMA },
          totalScore: { type: "integer", nullable: true, description: "The game's final score as printed on the scorecard, if visible. Null if not shown or not legible." },
        },
        required: ["gameNumber"],
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

Also record each game's final printed score in totalScore when the scorecard shows one.

IMPORTANT -- some scorecards show only game totals with no per-frame detail at all (no pin-deck graphics, no frame boxes). That is a valid and common case, not a failure. When that happens, return the games with their totalScore and an empty frames array. Do not invent frames to fill the gap.

TEAM SCORECARDS -- many scorecards show a whole team, one column or row per bowler. Return EVERY bowler's games in the single flat "games" list, and tag each game with who it belongs to:
- bowlerName exactly as printed, including abbreviations ("R. Nadon", "RYAN N"). Do not expand, correct, or guess at a fuller name; the app matches the printed text itself.
- lineupPosition as the zero-based position of that bowler's column, in the order bowlers appear on the card.
- seriesTotal if the card prints a series total for that bowler, repeated on each of their games.
So a four-bowler team playing three games each returns twelve entries in "games", not four. On a single-bowler card, bowlerName may be null.

Repeat bowlerName and lineupPosition on EVERY game belonging to that bowler -- not just their first one. Game 2 and game 3 of the same bowler must each carry that bowler's name and position, otherwise there is no way to tell whose game it is.

Respond with valid JSON matching the provided schema exactly. If a screenshot shows partial or cut-off games, only include complete frames you can actually read clearly from the pin-deck graphic -- do not guess or fabricate a frame or ball you can't clearly see.`;

// Per-user ceiling. This is the most expensive of the three functions --
// up to six images through a vision model per call -- so it gets the
// tightest limit. Auth already stops a stranger; this stops one account
// looping.
//
// Fails OPEN: a broken rate limiter should degrade to "no limit", not
// "nobody can import". Auth is the security boundary; this is cost control.
async function withinRateLimit(req, endpoint, limit, windowInterval) {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("Authorization") } } },
    );
    const { data, error } = await supabase.rpc("check_api_rate_limit", {
      p_endpoint: endpoint, p_limit: limit, p_window: windowInterval,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

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
      return new Response(JSON.stringify({
        error: "No Gemini API key configured for this function. Set a secret named gemini_api_key (the same one analyze-performance uses) in Project Settings > Edge Functions > Secrets, then redeploy.",
      }), {
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

    if (!(await withinRateLimit(req, "import-scorecard", 20, "1 hour"))) {
      return new Response(JSON.stringify({
        error: "You've imported a lot in the last hour. Give it a little while and try again.",
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // Size limits enforced HERE, not just in the client.
    //
    // The app downscales before uploading, but that's a courtesy to the
    // bowler's data plan, not a control -- nothing stops a caller skipping
    // the client and POSTing a 200MB body straight at this function, which
    // would then forward it to Gemini and bill for it.
    //
    // 8MB per image and 20MB total: comfortably above a downscaled
    // 1600px photo, far below anything worth paying to process.
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

    let totalBytes = 0;
    for (const img of images) {
      if (typeof img?.base64 !== "string" || !img.base64) {
        return new Response(JSON.stringify({ error: "One of the images was empty or malformed." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const type = (img.mimeType || "image/jpeg").toLowerCase();
      if (!ALLOWED_TYPES.includes(type)) {
        return new Response(JSON.stringify({ error: `Unsupported image type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // base64 encodes 3 bytes as 4 characters, so decoded size is ~3/4
      // of the string length. Measured on the string to avoid decoding a
      // huge payload just to find out it's too big.
      const bytes = Math.floor(img.base64.length * 0.75);
      if (bytes > MAX_IMAGE_BYTES) {
        return new Response(JSON.stringify({ error: "One of the images is too large. Try a smaller photo." }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      totalBytes += bytes;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return new Response(JSON.stringify({ error: "Those images come to too much to send at once. Try fewer at a time." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parts = [
      { text: EXTRACTION_PROMPT },
      ...images.map((img) => ({
        inline_data: { mime_type: img.mimeType || "image/jpeg", data: img.base64 },
      })),
    ];

    // 503 (model overloaded) and 429 (rate limited) are transient -- the
    // model is busy, not broken, and a spike usually clears in seconds.
    // Retrying here rather than showing the bowler an error means most
    // spikes never surface at all. Everything else fails immediately;
    // retrying a bad request just wastes the bowler's time.
    const requestBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const RETRY_DELAYS_MS = [2000, 5000];
    let geminiRes: Response | null = null;
    let lastErrText = "";
    // Counts RETRIES, not attempts. Reporting the constant meant the
    // message claimed three retries when a request that failed twice had
    // been retried twice -- and a non-transient failure isn't retried at
    // all, so a fixed number would have been wrong there too.
    let retries = 0;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (geminiRes.ok) break;

      lastErrText = await geminiRes.text();
      const transient = geminiRes.status === 503 || geminiRes.status === 429;
      if (!transient || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      retries++;
    }

    if (!geminiRes || !geminiRes.ok) {
      const status = geminiRes?.status ?? 0;
      // A machine-readable reason so the client can say something useful
      // instead of showing raw API JSON to a bowler.
      const reason = status === 503 ? "busy"
        : status === 429 ? "rate_limited"
        : status === 404 ? "model_unavailable"
        : "api_error";
      return new Response(JSON.stringify({
        error: "Gemini API error",
        reason,
        upstreamStatus: status,
        // Raw upstream text is useful while developing and is not
        // something to expose indefinitely on a public endpoint -- it can
        // carry internal quota details and request identifiers. The
        // `reason` above is what the client actually branches on.
        retries,
        detail: Deno.env.get("EXPOSE_UPSTREAM_ERRORS") === "true" ? lastErrText : undefined,
      }), {
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
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
