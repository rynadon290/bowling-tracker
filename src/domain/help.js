// The app's documentation, as searchable data.
//
// Written as structured entries rather than prose pages so the same
// content can be searched, ranked, and — crucially — used to NAVIGATE.
// A bowler who searches "buy-in" doesn't want an article, they want the
// money card on the Bowl tab.
//
// `view` is the app view an entry lives in, so search results can jump
// there. Ids must match BowlingTracker's navTabs and iconViews:
//   log, history, data, insights, locker, profile, settings, inbox,
//   social, coaching, import
// A null view means the entry is explanatory with nowhere to jump.

export const HELP = [
  // ── Logging ───────────────────────────────────────────────────────────
  {
    id: "start-session",
    view: "log",
    title: "Start a session",
    keywords: ["begin", "new night", "league night", "start", "tonight"],
    body: "On the Bowl tab, pick where you're bowling — practice, league, tournament or just bowling. For league, choose which league and the date. The app remembers your usual night, so on a regular Tuesday it sets itself up.",
  },
  {
    id: "tracking-modes",
    view: "log",
    title: "Shot by shot vs scores only",
    keywords: ["tracking", "mode", "detail", "frames", "quick", "switch"],
    body: "Shot by shot records every ball — pins left, ball used, release. That's what powers spare stats, the scoresheet and ball comparisons. Scores only takes three numbers a night. You can switch any time, and start a night one way and finish the other: unlock the score boxes to type totals even mid-game.",
  },
  {
    id: "scoresheet",
    view: "log",
    title: "The ten-frame scoresheet",
    keywords: ["frames", "scoresheet", "edit frame", "running score", "tap"],
    body: "When logging shot by shot, the ten frames sit between the frame picker and the result buttons. It fills in as you bowl. Tap any frame to edit it. Tapping an empty frame while editing cancels the edit; tapping the next frame when your shot is complete saves it.",
  },
  {
    id: "delete-shot",
    view: "log",
    title: "Delete a shot",
    keywords: ["remove", "delete", "mistake", "wrong frame", "undo"],
    body: "Tap the frame on the scoresheet to open it, then either press Delete this shot, or deselect the result — clearing what happened deletes the frame. Both ask you to confirm, because it can't be undone.",
  },
  {
    id: "prebowl",
    view: "log",
    title: "Prebowl for a future week",
    keywords: ["prebowl", "pre-bowl", "early", "miss next week", "absent"],
    body: "Bowling next week's league games early? Turn on Prebowling in Tonight's Session. The games are filed under the date they count for, not the day you threw them — so you can prebowl and bowl tonight's league on the same night without one overwriting the other.",
  },
  {
    id: "money-games",
    view: "log",
    title: "Money games and buy-ins",
    keywords: ["poker", "brackets", "side pot", "3-6-9", "high game", "buy in", "winnings"],
    body: "Buy-ins are saved per league — enter them once and they apply every week. Each night, tap the pots you're actually in; sitting one out costs you nothing. Hide pots your house doesn't run in Settings.",
  },

  // ── Importing ─────────────────────────────────────────────────────────
  {
    id: "import-scorecard",
    view: "import",
    title: "Import a scorecard photo",
    keywords: ["photo", "screenshot", "scan", "monitor", "camera", "ocr"],
    body: "Press Import in the header. Say whether it's practice, league or a tournament, pick the team and date, then add photos of the scoring monitor. The app reads the games and frames, and you map each column to a bowler before saving.",
  },
  {
    id: "import-teammates",
    view: "import",
    title: "Send teammates their scores",
    keywords: ["teammate", "share scores", "send", "confirm", "frame data"],
    body: "Any column you map to a teammate is sent to them to confirm. They get the frame-by-frame data too, not just totals — once they accept, it lands in their shot history marked as imported.",
  },

  // ── Stats ─────────────────────────────────────────────────────────────
  {
    id: "compare",
    view: "data",
    title: "Compare yourself to someone",
    keywords: ["compare", "versus", "head to head", "friend", "team average"],
    body: "On the Stats tab, use Compare To. You can compare against a bowler on your device, a friend, or your team's average. Teammates are added as friends automatically, so they're there without sending a request.",
  },
  {
    id: "trends",
    view: "data",
    title: "Trends over time",
    keywords: ["trend", "graph", "improving", "over time", "chart", "per ball"],
    body: "Switch to Trends on the Stats tab to see a metric plotted over time. Filter by ball to see how one piece of equipment is performing — that works on game scores too, if you record which ball bowled which game.",
  },

  // ── Improve ───────────────────────────────────────────────────────────
  {
    id: "goals",
    view: "insights",
    title: "Set a goal",
    keywords: ["goal", "target", "improve", "aim"],
    body: "On the Improve tab, press Add a goal and pick what to work on — average, strike rate, spare conversion and so on. Progress updates as you bowl.",
  },
  {
    id: "drills",
    view: "insights",
    title: "Practice drills",
    keywords: ["drill", "practice", "spare shooting", "target"],
    body: "Start a drill from the Improve tab. Pick a target — a specific spare, or a pin combination — and the app tracks makes and misses for that session.",
  },
  {
    id: "coaching",
    view: "coaching",
    title: "Coaching",
    keywords: ["coach", "student", "roster", "task", "assign"],
    body: "A coach sees every bowler they work with on one roster: what each is working on, how far along, and when the next session is. Tasks are set per bowler, and the bowler sees them on their Improve tab.",
  },

  // ── Setup ─────────────────────────────────────────────────────────────
  {
    id: "leagues",
    view: "locker",
    title: "Add a league",
    keywords: ["league", "season", "add league", "center", "house"],
    body: "In the Vault, add a league with its name, center and season dates. Season dates let the app prompt you to update your book average when the season ends.",
  },
  {
    id: "teams",
    view: "locker",
    title: "Add a team and its roster",
    keywords: ["team", "roster", "lineup", "teammate", "invite", "placeholder",
               "not signed up", "hasn't joined", "email required", "bowling order", "add a teammate"],
    body: "Teams live under their league in the Vault — add a league, then add your team right underneath. Open the team to set the bowling order and add each teammate by name and email. The email is required: it's what connects them to their spot when they sign up. Teammates who haven't joined yet still work — you can log their scores straight away, and everything you've recorded is waiting for them when they accept the invite.",
  },
  {
    id: "arsenal",
    view: "locker",
    title: "Your ball arsenal",
    keywords: ["ball", "arsenal", "equipment", "layout", "surface", "bag"],
    body: "Add your balls in the Vault, with layout and surface. Balls you log shots with feed the per-ball stats and the trend filters. Bags let you group what you actually carry.",
  },
  {
    id: "friends",
    view: "social",
    title: "Friends",
    keywords: ["friend", "add friend", "search", "connect", "qr"],
    body: "Search for someone by name and send a request. Teammates are added automatically. Friends can compare stats with each other. There's also a QR code here for handing someone the app link.",
  },
  {
    id: "profile",
    view: "profile",
    title: "Your name and profile",
    keywords: ["name", "handedness", "left handed", "two handed", "book average", "alias"],
    body: "Set your display name — that's what teammates see. Also here: handedness, book average, home centers, and scorecard names, which are the other spellings of your name that appear on a printed scorecard so imports match you correctly.",
  },
  {
    id: "history",
    view: "history",
    title: "Your history",
    keywords: ["history", "past", "sessions", "shots", "previous"],
    body: "Every night you've bowled and every shot you've logged. Filter by team or result. You only see your own — teammates keep theirs.",
  },
  {
    id: "sync",
    view: null,
    title: "Syncing and offline use",
    keywords: ["offline", "sync", "wifi", "backup", "cloud", "pending"],
    body: "Everything is saved on your phone first and uploaded when there's a connection, so you can log a whole night on bad alley wifi. If something can't upload, the app says so and keeps retrying — nothing is lost.",
  },
  {
    id: "themes",
    view: "settings",
    title: "Appearance and settings",
    keywords: ["theme", "dark", "light", "colour", "color", "settings", "reset"],
    body: "Change the theme in Settings, along with which stats cards you see, which money games are shown, and whether shot-by-shot fields like ball speed and rev rate appear.",
  },
];

// Normalised for matching: lowercase, punctuation stripped.
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Search the documentation.
//
// Ranked rather than filtered, because a bowler searching "ball" should
// get the arsenal entry above one that merely mentions a ball in passing.
// Title matches beat keyword matches beat body matches, and an exact
// phrase beats scattered words.
export function searchHelp(query, entries = HELP) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ").filter(Boolean);

  return entries
    .map(entry => {
      const title = norm(entry.title);
      const keys = norm((entry.keywords || []).join(" "));
      const body = norm(entry.body);

      let score = 0;
      if (title.includes(q)) score += 100;
      if (keys.includes(q)) score += 60;
      if (body.includes(q)) score += 20;

      for (const w of words) {
        if (title.includes(w)) score += 10;
        if (keys.includes(w)) score += 6;
        if (body.includes(w)) score += 2;
      }

      // Every word present somewhere is a strong signal even when no
      // single field holds the whole phrase.
      const all = `${title} ${keys} ${body}`;
      if (words.length > 1 && words.every(w => all.includes(w))) score += 25;

      return { entry, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .map(r => r.entry);
}

// Entries grouped for browsing when nothing has been typed yet.
export function helpByArea(entries = HELP) {
  const AREAS = [
    { view: "log", label: "Bowling" },
    { view: "import", label: "Importing" },
    { view: "data", label: "Stats" },
    { view: "insights", label: "Improving" },
    { view: "coaching", label: "Coaching" },
    { view: "locker", label: "Leagues, teams and gear" },
    { view: "social", label: "Friends" },
    { view: "profile", label: "Your profile" },
    { view: "history", label: "History" },
    { view: "settings", label: "Settings" },
    { view: null, label: "Good to know" },
  ];
  return AREAS
    .map(a => ({ ...a, entries: entries.filter(e => e.view === a.view) }))
    .filter(a => a.entries.length);
}
