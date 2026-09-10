// Supabase Edge Function: find-centers
//
// Proxies HERE's Discover API to search for bowling centers. Exists as a
// function rather than a direct browser call so the API key stays
// server-side -- shipping it in the bundle would expose it to anyone who
// opens devtools, and HERE bills per call.
//
// Deploy with: supabase functions deploy find-centers
// Secret required: here_api_key  (lowercase -- the Supabase dashboard
// forces lowercase secret names)

import { createClient } from "jsr:@supabase/supabase-js@2";

const HERE_API_KEY = Deno.env.get("here_api_key");
const DISCOVER_URL = "https://discover.search.hereapi.com/v1/discover";

// HERE's category id for a bowling centre. A venue can carry several
// categories, and the PRIMARY one isn't always this: "Pins Mechanical Co."
// is primarily a "Bar or Pub" that also has lanes. Filtering on the primary
// category would drop real venues, so any match anywhere in the list counts.
const BOWLING_CATEGORY = "800-8600-0184";


// Takes its CORS headers as an argument -- see the same note in
// analyze-performance. Making the origin per-request moved CORS inside
// the handler, leaving this module-level reference dangling. It compiles
// fine and throws "CORS is not defined" on the first real request.
function json(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Reduce HERE's very large place objects to just what the app stores.
// Opening hours, payment methods, and social links are all noise here --
// and keeping the payload small matters because HERE bills per call and
// the response travels to a phone.
function toCenter(item: any) {
  const addr = item?.address ?? {};
  return {
    hereId: item?.id ?? null,
    name: item?.title ?? "",
    address: addr.label ?? "",
    street: [addr.houseNumber, addr.street].filter(Boolean).join(" "),
    city: addr.city ?? "",
    state: addr.stateCode ?? addr.state ?? "",
    postalCode: addr.postalCode ?? "",
    country: addr.countryCode ?? "",
    lat: item?.position?.lat ?? null,
    lng: item?.position?.lng ?? null,
    // Distance from the search point, in metres. Null when the search was
    // by text rather than near a location.
    distance: typeof item?.distance === "number" ? item.distance : null,
  };
}

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
// Fails SAFE, not open -- the same fix applied to the other two
// functions. The database check remains the real limiter; this bounds
// the damage when it is unavailable, instead of removing the limit
// entirely. An in-process Map resets on cold start and is not shared
// between instances, so N warm instances allow up to N x limit: weaker
// than the database check, and bounded where returning true was not.
const fallbackHits = new Map<string, number[]>();

function withinFallbackLimit(userId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (fallbackHits.get(userId) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    fallbackHits.set(userId, recent);
    return false;
  }
  recent.push(now);
  fallbackHits.set(userId, recent);
  if (fallbackHits.size > 5000) {
    for (const [k, v] of fallbackHits) {
      if (!v.some((t) => now - t < windowMs)) fallbackHits.delete(k);
    }
  }
  return true;
}

async function withinRateLimit(req, endpoint, limit, windowInterval, userId, windowMs) {
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
    if (error) {
      console.error(`rate limit check failed for ${endpoint}, falling back:`, error.message);
      return withinFallbackLimit(userId, limit, windowMs);
    }
    return data !== false;
  } catch (e) {
    console.error(`rate limit check threw for ${endpoint}, falling back:`, String(e));
    return withinFallbackLimit(userId, limit, windowMs);
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

  if (!(await withinRateLimit(req, "find-centers", 40, "1 hour", auth.user.id, 60 * 60 * 1000))) {
    return new Response(JSON.stringify({
      error: "You've used this quite a lot in the last hour. Give it a little while and try again.",
    }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (!HERE_API_KEY) {
    return json({ error: "Location search isn't configured on the server." }, CORS, 500);
  }

  try {
    const { query, lat, lng } = await req.json();

    const q = (query ?? "").toString().trim();
    // Without a location to search near, HERE has no idea where to look.
    // Requiring one is better than silently returning centres in another
    // state.
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ error: "A location is needed to search nearby centers." }, CORS, 400);
    }

    const params = new URLSearchParams({
      // An empty query still works: it returns nearby bowling centres,
      // which is the right default when someone just opens the picker.
      q: q || "bowling",
      at: `${lat},${lng}`,
      limit: "20",
      apiKey: HERE_API_KEY,
    });

    const res = await fetch(`${DISCOVER_URL}?${params}`);
    if (!res.ok) {
      const detail = await res.text();
      console.error("HERE error", res.status, detail);
      return json({ error: `Location search failed (${res.status}).` }, CORS, 502);
    }

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    const centers = items
      .filter((item: any) =>
        (item?.categories ?? []).some((c: any) => c?.id === BOWLING_CATEGORY)
      )
      .map(toCenter)
      .filter((c: any) => c.name && c.lat !== null);

    return json({ centers }, CORS);
  } catch (err) {
    console.error("find-centers failed", err);
    return json({ error: "Couldn't search for centers right now." }, CORS, 500);
  }
});
