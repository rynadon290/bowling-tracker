// Supabase Edge Function: analyze-performance
//
// Takes PRE-COMPUTED statistics (never raw shot rows) and returns
// observations about a bowler's game.
//
// Two separate safeguards, because they fail differently:
//
//   1. GATING happens client-side, before this is called. Statistics that
//      haven't earned their sample never appear in the payload, so the
//      model cannot comment on them. Asking a model to "be careful with
//      small samples" does not work -- it still finds a story. Removing
//      the data is what works.
//
//   2. The PROMPT below constrains what the model says about the data it
//      DOES get: observations rather than coaching, no invented causes,
//      no claims beyond the numbers supplied.
//
// Deploy with: supabase functions deploy analyze-performance
// Secret required: gemini_api_key (lowercase -- Supabase forces it)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("gemini_api_key");
const MODEL = "gemini-3.6-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      description: "Between 2 and 5 observations. Fewer is better than padding.",
      items: {
        type: "object",
        properties: {
          headline: { type: "string", description: "One short sentence stating what the numbers show." },
          detail: { type: "string", description: "Two or three sentences of context, citing the actual figures and sample sizes given." },
          confidence: {
            type: "string",
            enum: ["clear", "moderate", "tentative"],
            description: "How strongly the supplied sample supports this. Use 'tentative' whenever the sample is near its minimum.",
          },
        },
        required: ["headline", "detail", "confidence"],
      },
    },
    // Separate from observations so the UI can present them differently:
    // a question to look into is not the same as a finding.
    questionsToExplore: {
      type: "array",
      description: "Up to 3 things the bowler might pay attention to next. Phrased as questions, not instructions.",
      items: { type: "string" },
    },
  },
  required: ["observations"],
};

const SYSTEM_PROMPT = `You are analysing a bowler's own statistics and reporting what the numbers show.

WHAT YOU RECEIVE
Pre-computed statistics, each with the sample size it was computed from. Every statistic present has already passed a statistical significance filter. Anything absent was withheld for insufficient sample -- it does not mean the bowler lacks that equipment or skill.

HARD RULES
1. Use ONLY the numbers supplied. Never estimate, infer, or invent a statistic that is not present.
2. Never comment on something absent from the data. Do not note its absence, do not speculate about it.
3. If canCompareBalls is false, do NOT compare balls to each other under any framing. You may describe a single ball's own numbers if that ball is present.
4. Cite sample sizes in your detail text ("across 312 first balls"). A percentage without its sample reads as more certain than it is.
5. Do not diagnose physical technique. You cannot see the bowler throw. "Your 10-pin rate rises in later games" is supportable; "your ball speed is dropping because you're tiring" is not -- that is an invented cause.
6. Do not prescribe equipment or coaching changes. Report what the numbers show and let the bowler decide.

TONE
Direct and factual. A knowledgeable friend reading the same spreadsheet, not a coach and not a hype machine. Do not praise. Do not pad. If the data supports only two observations, give two.

CONFIDENCE
Mark an observation "tentative" when its sample is near the minimum, "moderate" for a comfortable sample, "clear" only for a large sample showing a large effect. Err toward the lower rating.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!GEMINI_API_KEY) {
    return json({ error: "Insights aren't configured on the server." }, 500);
  }

  try {
    const { payload } = await req.json();

    // Defence in depth: the client gates before calling, but an empty
    // payload must never reach the model -- there'd be nothing to analyse
    // and it would invent something to fill the space.
    const included = payload?.included ?? {};
    if (!payload || Object.keys(included).length === 0) {
      return json({ error: "Not enough data yet to analyse." }, 400);
    }

    const userPrompt = [
      `Games logged: ${payload.gameCount ?? "unknown"}`,
      `Ball comparison licensed: ${payload.canCompareBalls ? "yes" : "no"}`,
      "",
      "Statistics (each with the sample it came from):",
      JSON.stringify(included, null, 2),
    ].join("\n");

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // Low temperature: this is reporting, not writing. Variation
          // between runs on identical data would undermine trust.
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Gemini error", res.status, detail);
      return json({ error: `Analysis failed (${res.status}).` }, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Gemini returned no text", JSON.stringify(data).slice(0, 500));
      return json({ error: "Analysis came back empty. Try again." }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("Unparseable analysis", text.slice(0, 500));
      return json({ error: "Analysis came back malformed. Try again." }, 502);
    }

    return json({
      observations: parsed.observations ?? [],
      questionsToExplore: parsed.questionsToExplore ?? [],
      generatedAt: new Date().toISOString(),
      // Echoed back so the UI can show what the analysis was based on,
      // rather than presenting conclusions with no visible basis.
      basedOn: {
        gameCount: payload.gameCount ?? null,
        statistics: Object.keys(included),
      },
    });
  } catch (err) {
    console.error("analyze-performance failed", err);
    return json({ error: "Couldn't generate insights right now." }, 500);
  }
});
