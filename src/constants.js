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
export const STRIKE_DESCRIPTIONS = ["Flush","High","Light","Half Pocket","Trip 4","Kick 10","Brooklyn"];
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
