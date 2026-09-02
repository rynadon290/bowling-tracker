import { isSplit, isTenPinLeave, isSinglePinLeave } from './splits.js';

export function emptyShot(){
  return{
    id:crypto.randomUUID(),bowler:"",teamId:"",league:"",date:new Date().toISOString().slice(0,10),
    lane:"",game:"1",frame:"1",ballNum:null,
    ball:"",surface:"",startingBoard:"",targetArrows:"",
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
