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
  return shots.find(s=>
    s.bowler===candidate.bowler&&s.league===candidate.league&&s.date===candidate.date&&
    s.game===candidate.game&&s.frame===candidate.frame&&
    (s.ballNum||null)===(candidate.ballNum||null)
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
