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

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("gemini_api_key");
const MODEL = "gemini-3.6-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;


// Takes its CORS headers as an argument rather than reading a module-level
// constant.
//
// CORS used to be a module-level object, so this helper closed over it.
// Making the origin per-request moved CORS INSIDE the handler, which left
// this reference dangling -- and because it only evaluates when json() is
// actually called, it compiled and deployed fine, then threw
// "ReferenceError: CORS is not defined" on the first real request.
//
// Passing it in makes the dependency explicit and impossible to break the
// same way again.
function json(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
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
5. Every *Rate, *Conversion and percentage field is ALREADY a percentage on a 0-100 scale. splitRate: 9 means nine percent. Do not multiply or divide these by 100, and quote them exactly as given -- the bowler is looking at the same number elsewhere in the app, and a mismatch destroys their trust in both.
5. Do not diagnose physical technique. You cannot see the bowler throw. "Your 10-pin rate rises in later games" is supportable; "your ball speed is dropping because you're tiring" is not -- that is an invented cause.
6. Do not prescribe equipment or coaching changes. Report what the numbers show and let the bowler decide.

TONE
Direct and factual. A knowledgeable friend reading the same spreadsheet, not a coach and not a hype machine. Do not praise. Do not pad. If the data supports only two observations, give two.

CONFIDENCE
Mark an observation "tentative" when its sample is near the minimum, "moderate" for a comfortable sample, "clear" only for a large sample showing a large effect. Err toward the lower rating.`;

// Requires a real, signed-in user before spending anything.
//
// These functions bill against an external API key held on the server.
// Without this check, anyone who discovers the URL can spend that budget
// -- the client-side gating is a UX and data-quality mechanism, not a
// security boundary, because nothing stops a caller skipping the client
// entirely and POSTing here directly.
//
// Mirrors the check import-scorecard has always had. The anon key plus
// the caller's own Authorization header is deliberate: getUser() then
// validates that JWT rather than trusting it, and the function never
// needs service-role privileges to do this.
async function requireUser(req, cors) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { user: null, response: new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" } }) };
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, response: new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" } }) };
  }
  return { user, response: null };
}

// Per-user ceiling, checked in the database.
//
// Authentication stops a stranger spending your budget; this stops one
// signed-in account looping. Stateless functions can't count in memory --
// an in-process counter resets on cold start and isn't shared between
// instances -- so the count lives in a table.
//
// Fails OPEN on an unexpected error: a rate limiter that breaks should
// degrade to "no limit", not "nobody can use the app". The auth check
// above is the security boundary; this is cost control.
async function withinRateLimit(req, endpoint, limit, windowInterval) {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("Authorization") } } },
    );
    const { data, error } = await supabase.rpc("check_api_rate_limit", {
      p_endpoint: endpoint,
      p_limit: limit,
      p_window: windowInterval,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

// Allowed origins, rather than "*".
//
// Auth is the real boundary -- a stranger's browser now gets a 401 -- but
// "*" lets any site on the internet make credentialed calls to these
// endpoints from a victim's browser, and these three spend money against
// external API keys. Pinning the origin is cheap defence in depth.
//
// ALLOWED_ORIGINS is a comma-separated env var so the origin can change
// (custom domain, preview deploys) without a code change. If it isn't set
// the function falls back to "*" -- deliberately, so an unconfigured
// deploy keeps working rather than locking every request out; set it in
// production.
function corsFor(req) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") || "";
  const allow = configured.length === 0
    ? "*"
    : (configured.includes(origin) ? origin : configured[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    // Tells caches the response varies per origin, so a permissive cached
    // response can't be served to a different site.
    "Vary": "Origin",
  };
}

// Deno.serve, not the std/http `serve` import.
//
// The import pulled from a pinned deno.land URL, which the runtime has to
// fetch when the function boots. If that fetch fails -- deno.land being
// slow, a network hiccup at deploy time, or the pinned version being
// unavailable -- the function never starts, and the client sees only
// "Failed to send a request to the Edge Function" with no clue why.
//
// Deno.serve is built into the runtime: no import, no fetch, nothing to
// fail. import-scorecard already used it and has been working, which is
// what made this the difference worth suspecting.
Deno.serve(async (req) => {
  const CORS = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth BEFORE the key check: an unauthenticated caller should get
  // 401, not a hint about whether the server is configured.
  const auth = await requireUser(req, CORS);
  if (auth.response) return auth.response;

  if (!(await withinRateLimit(req, "analyze-performance", 30, "1 hour"))) {
    return new Response(JSON.stringify({
      error: "You've used this quite a lot in the last hour. Give it a little while and try again.",
    }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!GEMINI_API_KEY) {
    return json({ error: "Insights aren't configured on the server." }, CORS, 500);
  }

  try {
    const { payload } = await req.json();

    // Defence in depth: the client gates before calling, but an empty
    // payload must never reach the model -- there'd be nothing to analyse
    // and it would invent something to fill the space.
    const included = payload?.included ?? {};
    if (!payload || Object.keys(included).length === 0) {
      return json({ error: "Not enough data yet to analyse." }, CORS, 400);
    }

    // The client gates the payload to a handful of summary figures. A
    // legitimate one is a few hundred bytes. Anything large is either a
    // bug or someone deliberately running up the Gemini bill through a
    // signed-in account -- refuse it before it costs anything.
    const serialised = JSON.stringify(included);
    if (serialised.length > 8_000) {
      console.warn("analyze-performance: oversized payload rejected", serialised.length);
      return json({ error: "Payload too large." }, CORS, 413);
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
      return json({ error: `Analysis failed (${res.status}).` }, CORS, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Gemini returned no text", JSON.stringify(data).slice(0, 500));
      return json({ error: "Analysis came back empty. Try again." }, CORS, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("Unparseable analysis", text.slice(0, 500));
      return json({ error: "Analysis came back malformed. Try again." }, CORS, 502);
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
    }, CORS);
  } catch (err) {
    console.error("analyze-performance failed", err);
    return json({ error: "Couldn't generate insights right now." }, CORS, 500);
  }
});
