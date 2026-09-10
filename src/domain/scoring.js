import { isSplit, isMakeableSpare } from './splits.js';

export function isStk(s){ return s&&(s.result==="Strike"); }

export function firstBallOf(s){
  if(!s)return null;
  if(isStk(s))return 10;
  // Derive from otherLeave (pins standing after this ball's delivery)
  if(Array.isArray(s.otherLeave)&&s.otherLeave.length>0){
    const standing=s.otherLeave.filter(p=>p!=="9 Pin No-Tap").length;
    return Math.max(0,10-standing);
  }
  // Weak 10 or Ringing 10: first ball = 9
  if(s.result==="Weak 10"||s.result==="Ringing 10") return 9;
  // Fallback to pinCount
  if(s.pinCount!==""&&s.pinCount!==undefined&&s.pinCount!==null) return parseInt(s.pinCount);
  return null;
}

export function secondBallOf(s){
  if(!s||isStk(s))return null;
  if(s.spareMade==="Yes"){
    const fb=firstBallOf(s);
    return fb===null?null:10-fb;
  }
  const fb=firstBallOf(s);
  const total=(s.pinCount!==""&&s.pinCount!==undefined&&s.pinCount!==null)?parseInt(s.pinCount):null;
  if(fb===null||total===null)return null;
  return Math.max(0,total-fb);
}

export function tenthBall3Available(f10b1,f10b2){
  if(!isStk(f10b1))return 10; // ball 3 only reached here via ball1's embedded spare -> fresh rack
  if(!f10b2)return null; // not yet known
  if(isStk(f10b2))return 10; // two strikes -> rack reset again
  const b2Knocked=firstBallOf(f10b2);
  return b2Knocked===null?null:10-b2Knocked;
}

export function tenthBall3Pins(f10b1,f10b2,f10b3){
  if(!f10b3)return null;
  const available=tenthBall3Available(f10b1,f10b2);
  if(available===null)return null;
  if(isStk(f10b3))return available; // cleared everything that was standing
  if(Array.isArray(f10b3.otherLeave)&&f10b3.result==="Other Leave"){
    const standing=f10b3.otherLeave.filter(p=>p!=="9 Pin No-Tap").length;
    return Math.max(0,available-standing);
  }
  if(f10b3.result==="Weak 10"||f10b3.result==="Ringing 10")return Math.max(0,available-1);
  if(f10b3.pinCount!==""&&f10b3.pinCount!==undefined&&f10b3.pinCount!==null)return parseInt(f10b3.pinCount);
  return null;
}

export function nextState(savedShots, bowler, league, date, game, frame, ballNum){
  const g=parseInt(game),f=parseInt(frame);

  if(f<10){
    // Frames 1-9: advance to next frame. Landing on frame 10 must set ballNum
    // explicitly to 1 (not null) — every 10th-frame lookup elsewhere expects
    // ball 1's shot to be tagged ballNum===1, and a null here caused it to
    // go unrecognized, looping the ball selector back to "Ball 1" forever.
    return{game:String(g),frame:String(f+1),ballNum:(f+1===10)?1:null};
  }

  // Frame 10 logic. Every lookup below is scoped by league+date, not just
  // bowler+game — game numbers (1/2/3) repeat every single night, so
  // without this, a brand-new frame tonight could "find" an unrelated
  // completed frame from a past night sharing the same game number and
  // jump straight to whatever ball that old frame ended on, or a genuine
  // 3rd ball earned tonight could get miscounted against that old data and
  // skipped entirely.
  if(!ballNum||ballNum===1){
    // Just saved ball 1
    const f10shots=savedShots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date&&s.game===String(g)&&parseInt(s.frame)===10);
    const b1=f10shots.find(s=>(!s.ballNum||s.ballNum===1));
    if(!b1) return{game:String(g),frame:"10",ballNum:2};

    if(isStk(b1)){
      // Strike on ball 1 → always go to ball 2
      return{game:String(g),frame:"10",ballNum:2};
    }
    if(b1.spareMade==="Yes"){
      // Non-strike spare: ball 2 was the spare conversion, skip to ball 3
      return{game:String(g),frame:"10",ballNum:3};
    }
    if(b1.spareMade==="No"){
      // Open on ball 1: game over
      return{game:String(g+1),frame:"1",ballNum:null};
    }
    // spareMade blank — shouldn't happen, default to ball 2
    return{game:String(g),frame:"10",ballNum:2};
  }

  if(ballNum===2){
    // Just saved ball 2 (only reached if ball 1 was a strike). If ball 2 also
    // struck, the rack reset again and a genuine 3rd ball is still owed. If
    // ball 2 was NOT a strike, it bundles its own spare attempt (Spare Made
    // Yes/No) just like any other frame — the frame is complete right here.
    const f10shots=savedShots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date&&s.game===String(g)&&parseInt(s.frame)===10);
    const b2=f10shots.find(s=>s.ballNum===2);
    if(b2&&isStk(b2)){
      return{game:String(g),frame:"10",ballNum:3};
    }
    return{game:String(g+1),frame:"1",ballNum:null};
  }

  if(ballNum===3){
    // Done with 10th — next game
    return{game:String(g+1),frame:"1",ballNum:null};
  }

  return{game:String(g+1),frame:"1",ballNum:null};
}

export function tenthFrameStatus(shots,bowler,league,date,game){
  const f10shots=shots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date&&s.game===game&&parseInt(s.frame)===10);
  const b1=f10shots.find(s=>(!s.ballNum||s.ballNum===1));
  if(!b1)return[1];
  if(isStk(b1)){
    const b2=f10shots.find(s=>s.ballNum===2);
    if(!b2)return[2];
    if(isStk(b2))return[3];
    return[];
  }
  if(b1.spareMade==="Yes")return[3];
  if(b1.spareMade==="No")return[];
  return[2];
}

export function strictPartial(shots){
  const byFrame={};
  for(let f=1;f<=9;f++) byFrame[f]=shots.find(s=>parseInt(s.frame)===f&&!s.ballNum)||null;
  const f10shots=shots.filter(s=>parseInt(s.frame)===10);
  const f10b1=f10shots.find(s=>(!s.ballNum||s.ballNum===1))||null;
  const f10b2=f10shots.find(s=>s.ballNum===2)||null;
  const f10b3=f10shots.find(s=>s.ballNum===3)||null;

  function nextFirst(f){
    if(f===9)return f10b1?firstBallOf(f10b1):null;
    return byFrame[f+1]?firstBallOf(byFrame[f+1]):null;
  }
  function nextSecond(f){
    if(f===8){
      const n1=byFrame[9];
      if(!n1)return null;
      if(isStk(n1))return f10b1?firstBallOf(f10b1):null;
      return secondBallOf(n1);
    }
    if(f===9){
      const p1=f10b1?firstBallOf(f10b1):null;
      if(p1===null)return null;
      if(isStk(f10b1))return f10b2?firstBallOf(f10b2):null;
      // f10b1 isn't a strike — its own second delivery is embedded in its
      // own record (spareMade/pinCount), not a separate f10b2 shot.
      return secondBallOf(f10b1);
    }
    const n1=byFrame[f+1];
    if(!n1)return null;
    if(isStk(n1)){
      if(f+2===10)return f10b1?firstBallOf(f10b1):null;
      const n2=byFrame[f+2];
      return n2?firstBallOf(n2):null;
    }
    return secondBallOf(n1);
  }

  let total=0;
  let framesResolved=0;
  for(let f=1;f<=9;f++){
    const s=byFrame[f];
    if(!s)break;
    if(isStk(s)){
      const n1=nextFirst(f);
      const n2=nextSecond(f);
      if(n1===null||n2===null)break;
      total+=10+n1+n2;
      framesResolved++;
    } else if(s.spareMade==="Yes"){
      const n1=nextFirst(f);
      if(n1===null)break;
      total+=10+n1;
      framesResolved++;
    } else {
      // Open frame — pinCount is total pins for the frame
      const pc=s.pinCount!==""&&s.pinCount!==undefined&&s.pinCount!==null?parseInt(s.pinCount):null;
      if(pc===null)break;
      total+=pc;
      framesResolved++;
    }
  }

  // 10th frame — only add once frames 1-9 are ALL fully resolved. If the
  // loop above broke early (framesResolved<9), adding the 10th's value on
  // top would silently skip the stuck frame and report a wrong total.
  if(f10b1&&framesResolved===9){
    const p1=firstBallOf(f10b1);
    if(p1===null)return framesResolved>0?total:null;
    if(isStk(f10b1)){
      if(!f10b2)return framesResolved>0?total:null;
      if(isStk(f10b2)){
        // Rack cleared again — a genuine 3rd ball is owed on a fresh rack.
        const p3=tenthBall3Pins(f10b1,f10b2,f10b3);
        if(p3===null)return framesResolved>0?total:null;
        total+=10+10+p3;
        framesResolved++;
      } else if(f10b3){
        // Backward compatibility: older pattern with ball 2 + a separate
        // ball 3 record already saved — score independently, as before.
        const p2=firstBallOf(f10b2);
        const p3=tenthBall3Pins(f10b1,f10b2,f10b3);
        if(p2===null||p3===null)return framesResolved>0?total:null;
        total+=10+p2+p3;
        framesResolved++;
      } else {
        // Ball 2 wasn't a strike — bundles its own spare attempt, frame done in 2 balls.
        const b2Total=f10b2.spareMade==="Yes"?10:
          (f10b2.pinCount!==""&&f10b2.pinCount!==undefined&&f10b2.pinCount!==null?parseInt(f10b2.pinCount):null);
        if(b2Total===null)return framesResolved>0?total:null;
        total+=10+b2Total;
        framesResolved++;
      }
    } else if(f10b1.spareMade==="Yes"){
      // Ball 2 was the spare conversion, embedded in f10b1 — need ball 3 bonus
      const p3=f10b3?firstBallOf(f10b3):null;
      if(p3===null)return framesResolved>0?total:null;
      total+=10+p3;
      framesResolved++;
    } else if(f10b1.spareMade==="No"){
      // Open 10th frame — no bonus ball, game over. pinCount is the frame total.
      const frameTotal=(f10b1.pinCount!==""&&f10b1.pinCount!==undefined&&f10b1.pinCount!==null)?parseInt(f10b1.pinCount):null;
      if(frameTotal===null)return framesResolved>0?total:null;
      total+=frameTotal;
      framesResolved++;
    } else if(f10b2){
      // Legacy data: ball 2 logged as a separate shot
      const p2=firstBallOf(f10b2);
      if(p2===null)return framesResolved>0?total:null;
      if(f10b2.spareMade==="Yes"){
        const p3=f10b3?firstBallOf(f10b3):null;
        if(p3===null)return framesResolved>0?total:null;
        total+=10+p3;
        framesResolved++;
      } else {
        const b2total=(f10b2.pinCount!==""&&f10b2.pinCount!==undefined)?parseInt(f10b2.pinCount):null;
        if(b2total===null)return framesResolved>0?total:null;
        const b2pins=Math.max(0,b2total-p1);
        total+=p1+b2pins;
        framesResolved++;
      }
    } else {
      // f10b1 thrown but its outcome (spareMade) not yet chosen — don't add anything
      return framesResolved>0?total:null;
    }
  }

  return framesResolved>0?total:null;
}

// Theoretical scoring: reuses strictPartial's already-correct scoring
// logic entirely, rather than reimplementing bowling scoring rules a
// second time. Transforms the INPUT — any open frame whose leave was
// makeable (not a split, not a washout) gets its spareMade flipped to
// "Yes" — then strictPartial scores the transformed shots exactly as it
// would score a real game where every makeable spare was actually
// converted. Strikes, already-made spares, and genuinely unmakeable opens
// (splits/washouts) pass through unchanged, since even a theoretically
// perfect bowler can't convert those.
//
// The 10th frame's first ball converts too when makeable — but only when
// avgFirstBall is supplied. Converting it earns a fill ball that was never
// actually thrown in a real open 10th (the game legitimately ended
// there), and there's no way to know what that ball would have scored, so
// it's synthesized from the bowler's own overall first-ball average on a
// fresh rack, floored to a whole number. Without that average available,
// the 10th frame is left as its actual result rather than converted into
// an unscoreable state.
export function makeTheoreticalShots(shots,leftHanded,avgFirstBall){
  const f10Shots=shots.filter(s=>parseInt(s.frame)===10);
  const f10b1=f10Shots.find(s=>!s.ballNum||s.ballNum===1);
  const f10HasLaterBalls=f10Shots.some(s=>s.ballNum===2||s.ballNum===3);
  const canConvertF10b1=!!(f10b1&&f10b1.spareMade==="No"&&isMakeableSpare(f10b1,leftHanded)&&!f10HasLaterBalls&&avgFirstBall!=null);

  const transformed=shots.map(s=>{
    if(s===f10b1&&!canConvertF10b1)return s; // can't properly score a theoretical conversion here, leave untouched
    if(s.spareMade!=="No")return s; // already made, a strike, or not yet decided
    if(!isMakeableSpare(s,leftHanded))return s; // splits/washouts stay open
    return {...s,spareMade:"Yes"};
  });

  if(canConvertF10b1){
    const fillBall={frame:"10",ballNum:3,result:"Other Leave",otherLeave:[],spareMade:"No",pinCount:String(Math.floor(avgFirstBall))};
    return [...transformed,fillBall];
  }
  return transformed;
}

export function frameQualityScore(s){
  if(s.result==="Strike")return 100;
  if(s.spareMade==="Yes"){
    const c=firstBallOf(s); // pins knocked on ball 1 -- fewer pins left standing = higher c
    const frac=c!=null?Math.max(0,Math.min(1,c/9)):0;
    const band=isSplit(s)?[50,69]:[70,89];
    return Math.round((band[0]+frac*(band[1]-band[0]))*10)/10;
  }
  const pins=s.pinCount!==""&&s.pinCount!=null?parseInt(s.pinCount):null;
  if(pins==null)return null;
  return Math.round(Math.max(0,Math.min(1,pins/9))*49*10)/10;
}

// Groups shots by (bowler, league, date, game) and keeps only genuine
// fresh-rack deliveries: every non-10th-frame ball (ballNum is null), plus
// the 10th frame's ball 1 always, ball 2 always (it's a fresh rack whether
// converting a spare or opening a new one after a strike), and ball 3 only
// when it's ALSO a fresh rack -- meaning either ball 2 didn't exist (a
// single-ball 10th) or ball 2 was itself a strike. If ball 2 was a spare
// conversion, ball 3 is a bonus ball on an already-cleared rack, not fresh.
export function freshRackShots(dataset){
  const result=[];
  const groups={};
  dataset.forEach(s=>{
    if(!s.ballNum){result.push(s);return;}
    const key=`${s.bowler}|${s.league}|${s.date}|${s.game}`;
    if(!groups[key])groups[key]={};
    groups[key][s.ballNum]=s;
  });
  Object.values(groups).forEach(g=>{
    if(g[1])result.push(g[1]);
    if(g[2])result.push(g[2]);
    if(g[3]&&(!g[2]||g[2].result==="Strike"))result.push(g[3]);
  });
  return result;
}

// Estimates a plausible fill-ball value for a 10th-frame theoretical spare
// conversion, since a never-thrown bonus ball has no real result to fall
// back on. Blends this bowler's first-ball average across every OTHER
// logged game (their broader form) with their first-ball average WITHIN
// this specific game (how they're actually bowling tonight) -- an equal
// blend of the two, rather than trusting either alone. Falls back to
// whichever one is available if only one exists (e.g. this is their very
// first logged game ever, or -- unusual once frames 1-9 are in -- this
// game has no fresh-rack data yet).
export function theoreticalFillBallValue(shots,bowler,league,date,game){
  const bowlerShots=shots.filter(s=>s.bowler===bowler);
  const isThisGame=(s)=>s.league===league&&s.date===date&&s.game===String(game);

  const otherVals=freshRackShots(bowlerShots.filter(s=>!isThisGame(s))).map(firstBallOf).filter(v=>v!=null);
  const cumulativeAvg=otherVals.length?otherVals.reduce((a,b)=>a+b,0)/otherVals.length:null;

  const thisGameVals=freshRackShots(bowlerShots.filter(isThisGame)).map(firstBallOf).filter(v=>v!=null);
  const thisGameAvg=thisGameVals.length?thisGameVals.reduce((a,b)=>a+b,0)/thisGameVals.length:null;

  if(cumulativeAvg==null)return thisGameAvg; // no other games at all -- only this game's data to go on
  if(thisGameAvg==null)return cumulativeAvg; // shouldn't normally happen once frames 1-9 are logged, but be safe
  return (cumulativeAvg+thisGameAvg)/2;
}

// ── Best possible score from here ───────────────────────────────────────
//
// "If I strike out from this point, what do I finish with?" -- the number
// a bowler does in their head from about the sixth frame onward, and the
// reason anyone keeps bowling a game they've already opened in.
//
// Distinct from theoreticalScoreForGame, which asks a backward-looking
// question: what WOULD you have scored had you converted every makeable
// spare. This one is forward-looking and takes the past as given. Frames
// already bowled score exactly as bowled; every remaining ball is a
// strike.
//
// Returns null when the game is over or hasn't started -- there's no
// meaningful ceiling for a game with nothing left to throw.
export function maxPossibleScore(shots) {
  const played = (Array.isArray(shots) ? shots : []).filter(s => s && s.frame);
  if (!played.length) return null;

  // Which frames already have a result.
  const byFrame = {};
  for (let f = 1; f <= 9; f++) {
    byFrame[f] = played.find(s => parseInt(s.frame) === f && !s.ballNum) || null;
  }
  const f10 = played.filter(s => parseInt(s.frame) === 10);
  const f10b1 = f10.find(s => !s.ballNum || s.ballNum === 1) || null;
  const f10b2 = f10.find(s => s.ballNum === 2) || null;
  const f10b3 = f10.find(s => s.ballNum === 3) || null;

  // Nothing left to throw: the tenth is complete.
  const tenthDone =
    (f10b1 && !isStk(f10b1) && f10b1.spareMade === "No") ||          // open tenth
    (f10b3 != null) ||                                               // three balls thrown
    (f10b1 && !isStk(f10b1) && f10b1.spareMade === "Yes" && f10b3);  // spare + fill
  if (tenthDone) return null;

  // A strike, in the shape the scorer expects.
  const strike = (frame, ballNum = null) => ({
    frame: String(frame), ballNum, result: "Strike",
    otherLeave: [], spareMade: "", pinCount: "",
  });

  // Keep what was actually bowled; fill everything unbowled with strikes.
  const filled = [];
  for (let f = 1; f <= 9; f++) {
    filled.push(byFrame[f] || strike(f));
  }
  filled.push(f10b1 || strike(10, 1));
  // Ball 2 is only earned when ball 1 struck or spared. If ball 1 was
  // bowled and did neither, there is no ball 2 to fill -- but that case
  // is already caught by tenthDone above.
  filled.push(f10b2 || strike(10, 2));
  filled.push(f10b3 || strike(10, 3));

  return strictPartial(filled);
}

// ── Scoresheet: one row per frame, the way a bowler reads a game ─────────
//
// Editing a shot meant History > Shots > scroll to find it > edit. That's
// a database view of something every bowler already pictures as a
// scoresheet: ten frames left to right, marks in the corners, a running
// total underneath. Tapping the frame you want is how it should work.
//
// Returns one entry per frame:
//   frame      1-10
//   marks      what shows in the frame's boxes, e.g. ["X"], ["7","/"], ["9","-"]
//   running    cumulative score THROUGH this frame, or null if not yet
//              determinable (a strike whose bonus balls aren't thrown yet)
//   shot       the shot record for this frame, so a tap can open it
//   tenth      the three tenth-frame balls, when frame === 10
//
// `running` being null is meaningful, not an error: frame 7's score
// genuinely isn't known until frames 8 and 9 are bowled. Showing a
// provisional number there would be lying.
export function frameScoresheet(shots) {
  const played = (Array.isArray(shots) ? shots : []).filter(s => s && s.frame);

  const byFrame = {};
  for (let f = 1; f <= 9; f++) {
    byFrame[f] = played.find(s => parseInt(s.frame) === f && !s.ballNum) || null;
  }
  const f10 = played.filter(s => parseInt(s.frame) === 10);
  const f10b1 = f10.find(s => !s.ballNum || s.ballNum === 1) || null;
  const f10b2 = f10.find(s => s.ballNum === 2) || null;
  const f10b3 = f10.find(s => s.ballNum === 3) || null;

  // What goes in the frame's little boxes.
  function marksFor(s) {
    if (!s) return [];
    if (isStk(s)) return ["X"];
    const fb = firstBallOf(s);
    if (s.spareMade === "Yes") return [fb === 0 ? "-" : String(fb), "/"];
    const total = (s.pinCount !== "" && s.pinCount != null) ? parseInt(s.pinCount) : null;
    if (fb === null) return [];
    const second = total === null ? null : Math.max(0, total - fb);
    return [
      fb === 0 ? "-" : String(fb),
      second === null ? "" : (second === 0 ? "-" : String(second)),
    ];
  }

  // Running totals come from scoring progressively longer prefixes of the
  // game and reading the total each time. Reusing strictPartial rather
  // than reimplementing the bonus rules means the scoresheet can never
  // disagree with the score shown everywhere else -- which would be worse
  // than showing nothing.
  const full = [];
  for (let i = 1; i <= 9; i++) if (byFrame[i]) full.push(byFrame[i]);
  if (f10b1) full.push(f10b1);
  if (f10b2) full.push(f10b2);
  if (f10b3) full.push(f10b3);

  // Running totals, scored frame by frame with the whole game available
  // for bonus lookup.
  //
  // A prefix-based approach can't see the bonus balls that come AFTER a
  // frame, so frame 1's strike scored null until frame 3 existed --
  // exactly backwards from a real scoresheet, where frame 1 fills in the
  // moment frames 2 and 3 are thrown.
  //
  // Once a frame can't be scored (its bonus balls aren't thrown yet),
  // every later frame is null too: a running total with a gap in the
  // middle would be nonsense.
  const cumulative = {};
  {
    let total = 0, stuck = false;

    // The first ball of frame f, wherever it lives.
    const firstOf = f => {
      if (f <= 9) return byFrame[f] ? firstBallOf(byFrame[f]) : null;
      return f10b1 ? firstBallOf(f10b1) : null;
    };
    // The second ball delivered in frame f (not the frame total).
    const secondOf = f => {
      if (f <= 9) {
        const sh = byFrame[f];
        if (!sh || isStk(sh)) return null;
        return secondBallOf(sh);
      }
      if (!f10b2) return null;
      return isStk(f10b2) ? 10 : firstBallOf(f10b2);
    };

    for (let f = 1; f <= 10; f++) {
      if (stuck) { cumulative[f] = null; continue; }

      if (f === 10) {
        cumulative[10] = f10b1 ? strictPartial(full) : null;
        if (cumulative[10] === null) stuck = true;
        continue;
      }

      const sh = byFrame[f];
      if (!sh) { cumulative[f] = null; stuck = true; continue; }

      let value = null;
      if (isStk(sh)) {
        // Two balls after the strike, which may span the next two frames.
        const b1 = firstOf(f + 1);
        const b2 = (f + 1 <= 9 && byFrame[f + 1] && isStk(byFrame[f + 1]))
          ? firstOf(f + 2)
          : secondOf(f + 1);
        value = (b1 === null || b2 === null) ? null : 10 + b1 + b2;
      } else if (sh.spareMade === "Yes") {
        const b1 = firstOf(f + 1);
        value = b1 === null ? null : 10 + b1;
      } else {
        const pc = (sh.pinCount !== "" && sh.pinCount != null) ? parseInt(sh.pinCount) : null;
        value = pc === null ? null : pc;
      }

      if (value === null) { cumulative[f] = null; stuck = true; continue; }
      total += value;
      cumulative[f] = total;
    }
  }

  const rows = [];
  for (let f = 1; f <= 10; f++) {
    const throughHere = cumulative[f];

    if (f === 10) {
      rows.push({
        frame: 10,
        // flatMap, not [0].
        //
        // A spare on the tenth's first ball embeds both balls in one
        // shot record, so marksFor returns ["9","/"] -- and taking only
        // [0] threw the slash away. The scoresheet showed "9 9" for a
        // spare-out, which reads as an open frame and is the one place
        // a bowler checks the app against the monitor.
        marks: [f10b1, f10b2, f10b3].filter(Boolean)
          .flatMap((b, i) => {
            if (isStk(b)) return ["X"];
            const m = marksFor(b).filter(x => x !== "");
            // Ball 3 is a single fill ball -- it has no "second ball",
            // so only its first mark is real.
            return b.ballNum === 3 ? m.slice(0, 1) : m;
          }),
        running: throughHere,
        shot: f10b1,
        tenth: { ball1: f10b1, ball2: f10b2, ball3: f10b3 },
      });
    } else {
      rows.push({
        frame: f,
        marks: marksFor(byFrame[f]),
        running: throughHere,
        shot: byFrame[f],
        tenth: null,
      });
    }
  }
  return rows;
}
