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

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const HERE_API_KEY = Deno.env.get("here_api_key");
const DISCOVER_URL = "https://discover.search.hereapi.com/v1/discover";

// HERE's category id for a bowling centre. A venue can carry several
// categories, and the PRIMARY one isn't always this: "Pins Mechanical Co."
// is primarily a "Bar or Pub" that also has lanes. Filtering on the primary
// category would drop real venues, so any match anywhere in the list counts.
const BOWLING_CATEGORY = "800-8600-0184";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!HERE_API_KEY) {
    return json({ error: "Location search isn't configured on the server." }, 500);
  }

  try {
    const { query, lat, lng } = await req.json();

    const q = (query ?? "").toString().trim();
    // Without a location to search near, HERE has no idea where to look.
    // Requiring one is better than silently returning centres in another
    // state.
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ error: "A location is needed to search nearby centers." }, 400);
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
      return json({ error: `Location search failed (${res.status}).` }, 502);
    }

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    const centers = items
      .filter((item: any) =>
        (item?.categories ?? []).some((c: any) => c?.id === BOWLING_CATEGORY)
      )
      .map(toCenter)
      .filter((c: any) => c.name && c.lat !== null);

    return json({ centers });
  } catch (err) {
    console.error("find-centers failed", err);
    return json({ error: "Couldn't search for centers right now." }, 500);
  }
});
