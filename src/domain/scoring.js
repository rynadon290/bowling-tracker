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
