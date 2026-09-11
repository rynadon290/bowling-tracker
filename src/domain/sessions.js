import { isSplit, isTenPinLeave, isSinglePinLeave } from './splits.js';

export function emptyShot(){
  return{
    id:crypto.randomUUID(),bowler:"",teamId:"",league:"",date:new Date().toISOString().slice(0,10),
    lane:"",game:"1",frame:"1",ballNum:null,
    ball:"",surface:"",startingBoard:"",targetArrows:"",
    actualBoard:"",actualArrows:"",ballSpeed:"",heelNumber:"",soleNumber:"",revRate:"",axisRotation:"",
    result:"",otherLeave:[],spareMade:"",strikeDescription:"",
    release:"",miss:[],ballChangeReason:[],pinCount:"",notes:"",
  };
}

export function computeSessionStats(shotsForNight){
  shotsForNight = Array.isArray(shotsForNight) ? shotsForNight : [];
  return{
    shotCount:shotsForNight.length, // every shot delivered, including 10th-frame bonus balls
    strikes:shotsForNight.filter(s=>s.result==="Strike").length,
    weakTens:shotsForNight.filter(s=>s.result==="Weak 10").length,
    ringingTens:shotsForNight.filter(s=>s.result==="Ringing 10").length,
    tenPinLeaves:shotsForNight.filter(isTenPinLeave).length,
    singlePinLeaves:shotsForNight.filter(isSinglePinLeave).length,
    singlePinSpares:shotsForNight.filter(s=>isSinglePinLeave(s)&&s.spareMade==="Yes").length,
    spareAttempts:shotsForNight.filter(s=>s.result!=="Strike"&&s.spareMade!==""&&!isSplit(s)).length,
    sparesMade:shotsForNight.filter(s=>s.spareMade==="Yes"&&!isSplit(s)).length,
    splits:shotsForNight.filter(isSplit).length,
    splitsConverted:shotsForNight.filter(s=>isSplit(s)&&s.spareMade==="Yes").length,
    ballsUsed:[...new Set(shotsForNight.map(s=>s.ball).filter(Boolean))],
    misses:shotsForNight.flatMap(s=>Array.isArray(s.miss)?s.miss:s.miss?[s.miss]:[]),
    releases:shotsForNight.filter(s=>s.release).map(s=>s.release),
  };
}

export function findExistingShotSlot(shots,candidate){
  // Null elements too -- one bad row threw on s.bowler.
  shots = (Array.isArray(shots) ? shots : []).filter(s => s && typeof s === "object");
  const c = (candidate && typeof candidate === "object") ? candidate : {};

  // A first ball is ball ONE whether it was stored as 1 or as null.
  //
  // This used to compare `(s.ballNum||null)`, which made null and 1
  // different slots -- while the database's shots_identity_uniq index
  // collapses them with COALESCE(ball_num, 1). The app would therefore
  // decide a delivery was new, write it, and the database would refuse
  // it as a duplicate. Since a 23505 is now correctly treated as
  // "already saved" and dropped from the queue, the shot would vanish
  // with nothing shown to the bowler.
  //
  // Both forms are already in the data -- 137 nulls against 15 ones on a
  // real device -- and the scorer reads them as the same thing
  // (`!s.ballNum || s.ballNum === 1`). This makes the third place agree.
  const slot = x => (x === null || x === undefined || x === "" ? 1 : x);

  return shots.find(s=>
    s.bowler===c.bowler&&s.league===c.league&&s.date===c.date&&
    s.game===c.game&&s.frame===c.frame&&
    slot(s.ballNum)===slot(c.ballNum)
  );
}

// ── Prebowling ──────────────────────────────────────────────────────────
//
// A bowler who can't make next week's league bowls those games early --
// commonly on the same night as the current week's session, before or
// after it.
//
// The games count for the FUTURE week. Filing them under the date they
// count for is both correct for standings and the thing that keeps them
// from colliding: sessions and shots are keyed on
// (bowler, league, date), so a prebowl filed under today would share a
// key with tonight's real session and one would overwrite the other.

// The next occurrence of a weekday strictly AFTER the given date.
//
// Strictly after, deliberately: prebowling on league night is the common
// case, and returning today would file the prebowl on top of the session
// being bowled tonight -- the exact collision this exists to prevent.
export function nextLeagueDate(fromDate, weekday) {
  if (weekday === null || weekday === undefined) return "";
  const base = new Date(`${fromDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  let delta = (weekday - base.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  base.setDate(base.getDate() + delta);
  return base.toISOString().slice(0, 10);
}

// Would filing a session on this date overwrite one that already exists?
//
// Same key as findExistingShotSlot uses, so this answers the question the
// storage layer will actually ask.
export function sessionExistsFor(sessions, bowler, league, date) {
  sessions = Array.isArray(sessions) ? sessions : [];
  return (sessions || []).some(s =>
    s.bowler === bowler && s.league === league && s.date === date);
}

// A prebowl is valid when it lands on a date that isn't already taken.
export function prebowlConflict(sessions, bowler, league, countsForDate, bowledOnDate) {
  if (!countsForDate) return "Pick the date these games count for.";
  if (countsForDate === bowledOnDate) {
    return "That's today — prebowled games count for a future date.";
  }
  if (countsForDate < bowledOnDate) {
    return "That date has passed. Prebowled games count for an upcoming session.";
  }
  if (sessionExistsFor(sessions, bowler, league, countsForDate)) {
    return "You already have a session on that date. Saving would overwrite it.";
  }
  return "";
}
