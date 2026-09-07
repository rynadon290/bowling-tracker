// The app's name, in one place so a rename doesn't mean hunting through
// JSX for a hardcoded string.
export const APP_NAME = "Board & Arrow";

// Practice and casual nights aren't leagues, but every per-night record in
// this app -- manual game scores, session recaps -- is keyed by
// (bowler, league, date). Rather than special-case every one of those,
// these two act as the "league" for those environments.
//
// They are deliberately plain names a bowler would recognise if they ever
// saw them in an export, not opaque ids.
export const PRACTICE_SESSION_KEY = "Practice";

// The name the practice league is stored under IN THE CLOUD.
//
// leagues.name is globally unique (leagues_name_key), because real leagues
// are shared objects -- a team joins "Tuesday House Shot" and everyone
// means the same one. Practice is the opposite: personal to one bowler.
// Storing it as plain "Practice" meant the first bowler to practise
// claimed the name for the entire system and every other bowler got a
// 23505 on their first practice session.
//
// So the row is per-user and the display name stays "Practice" -- see
// practiceLeagueDisplayName, which translates at the mapping boundary so
// nothing else in the app has to know.
export function practiceLeagueCloudName(userId) {
  return `${PRACTICE_SESSION_KEY}\u00b7${userId}`;
}

export function isPracticeLeagueName(name) {
  return typeof name === "string" && name.startsWith(`${PRACTICE_SESSION_KEY}\u00b7`);
}

// Any per-user practice league reads back as plain "Practice".
export function practiceLeagueDisplayName(name) {
  return isPracticeLeagueName(name) ? PRACTICE_SESSION_KEY : name;
}
export const CASUAL_SESSION_KEY = "Just Bowling";

// Domain/form constants shared across BowlingTracker.jsx and the view
// files split out of it. Kept separate from ui.jsx, which is specifically
// about styling/presentation -- these are actual data values (the set of
// valid ball surfaces, shot results, etc.), not visual concerns.

// Seed arsenal for the very first bowler created (preserves continuity with
// existing logged data). Every bowler added after that starts with an empty
// arsenal and builds their own list.
export const DEFAULT_ARSENAL = [
  "Bionic","Ion Max Solid","Ion Max Pearl",
  "Phaze II Solid","Phaze II Pearl",
  "Harsh Reality Pearl","Road Warrior Pearl","Equinox Pearl",
];
export const SURFACES = ["Box","500","1000","1500","2000","3000","4000","Polish","Lane Shine"];
export const RESULTS = ["Strike","Weak 10","Ringing 10","Other Leave"];

// A left-handed bowler's ball hooks the opposite way, so the corner pin
// they characteristically leave is the 7, not the 10. The two failure
// modes are the same (weak = missed light/early, ringing = hit slightly
// high) -- only which pin survives differs. These are display labels; the
// underlying stored result values stay "Weak 10"/"Ringing 10" so all
// existing scoring, stats, and history logic keeps working unchanged.
export function resultsForHandedness(leftHanded){
  if(!leftHanded)return RESULTS;
  return RESULTS.map(r=>
    r==="Weak 10"?"Weak 7":r==="Ringing 10"?"Ringing 7":r
  );
}

// Maps a displayed label back to the stored result value, so a lefty
// tapping "Weak 7" still saves the same "Weak 10" record everything else
// already understands.
export function storedResultFor(label){
  if(label==="Weak 7")return"Weak 10";
  if(label==="Ringing 7")return"Ringing 10";
  return label;
}
export const STRIKE_DESCRIPTIONS = ["Flush","High","Light","Messenger","Half Pocket","Trip 4","Kick 10","Brooklyn"];

// "Trip 4" and "Kick 10" name the specific pin that carried through or
// got kicked out -- a lefty's ball approaches from the opposite side, so
// her equivalent pins are the mirror image (4\u21946, 10\u21947, matching the
// same deck mirror domain/splits.js uses for corner pins, washouts, and
// drill targets). The other five descriptions ("Flush", "Brooklyn", etc)
// aren't tied to a specific pin number and stay as-is for both hands.
//
// Same convention as resultsForHandedness below: the STORED value stays
// canonical ("Trip 4") for both hands so history and stats keep working
// off one identifier; only the label a lefty sees flips.
export function strikeDescriptionsForHand(leftHanded){
  if(!leftHanded)return STRIKE_DESCRIPTIONS;
  return STRIKE_DESCRIPTIONS.map(d=>
    d==="Trip 4"?"Trip 6":d==="Kick 10"?"Kick 7":d
  );
}

export function storedStrikeDescriptionFor(label){
  if(label==="Trip 6")return"Trip 4";
  if(label==="Kick 7")return"Kick 10";
  return label;
}
export const RELEASES = ["Good","Acceptable","Bad"];
export const MISSES = ["Left","Right","Fast","Slow","Execution"];
export const BALL_CHANGE_REASONS = [
  "Too early","Too late","Too round","Too sharp",
  "Roll out","Poor carry","No miss room","Lane transition","Surface worn",
];
export const DEFAULT_LEAGUES = ["Tuesday House Shot","Thursday House Shot"];

// Returns today's date as YYYY-MM-DD using LOCAL date components, not UTC.
// new Date().toISOString() always converts to UTC first -- for anyone west
// of UTC (all of the US, for instance), bowling in the evening can already
// be "tomorrow" in UTC while it's still today locally, silently dating a
// session one day ahead of when it was actually bowled.
export function localDateString(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
