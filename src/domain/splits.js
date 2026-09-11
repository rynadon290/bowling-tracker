// Pin geometry and leave classification — no dependencies on anything else
// in the app. Row/column numbering matches the standard pin deck layout:
//
//   Col:  1  2  3  4  5  6  7
//   Row4: 7     8     9     10
//   Row3:    4     5     6
//   Row2:       2     3
//   Row1:          1
const PIN_ROW={1:1,2:2,3:2,4:3,5:3,6:3,7:4,8:4,9:4,10:4};
// Pin columns, left to right: col1=7; col2=4; col3=2,8; col4=1,5; col5=3,9; col6=6; col7=10.
const PIN_COL={7:1,4:2,2:3,8:3,1:4,5:4,3:5,9:5,6:6,10:7};
const COLUMN_PINS={};
for(const pin of Object.keys(PIN_COL)){
  const col=PIN_COL[pin];
  (COLUMN_PINS[col]=COLUMN_PINS[col]||[]).push(Number(pin));
}

// The full deck mirrors left-right across the 1-5 centerline: a lefty's
// ball hooks the opposite way, so whatever pin a righty characteristically
// leaves, a lefty leaves its mirror image instead. This is the complete
// mapping -- not just the two corners -- verified against the same
// row/column layout PIN_ROW/PIN_COL below already encode:
//
//   Row4: 7  8  9  10        7↔10   8↔9
//   Row3:   4  5  6      ->    4↔6   5 stays
//   Row2:     2  3              2↔3
//   Row1:       1                 1 stays
const PIN_MIRROR={1:1,2:3,3:2,4:6,5:5,6:4,7:10,8:9,9:8,10:7};

// Mirrors a single pin number. Non-numeric input (e.g. the sentinel
// "9 Pin No-Tap", which names an outcome rather than a pin position)
// passes through unchanged rather than being coerced into a wrong number.
export function mirrorPin(pin){
  const n=Number(pin);
  return Number.isInteger(n)&&PIN_MIRROR[n]!==undefined?PIN_MIRROR[n]:pin;
}

// Mirrors a whole leave -- an array of pin-number strings, as otherLeave
// stores them, possibly including "9 Pin No-Tap" -- for cross-hand
// comparison. "8-9" for a righty and "9-8" for... no: mirrors to "9-8"
// meaning the SET {9,8}, same two pins, since 8↔9. A leave of {2,4,10}
// (righty) mirrors to {3,6,7} (lefty's equivalent shape on her side).
export function mirrorLeave(pins){
  return (Array.isArray(pins)?pins:[]).map(p=>
    p==="9 Pin No-Tap"?p:String(mirrorPin(p)));
}

// The pin THIS bowler's hand would leave in place of a canonical
// (right-handed reference) pin. resolveHandedness/goalTypeFor/etc already
// use "righty" as the reference orientation everywhere else in this app,
// so this keeps that same convention: pinForHand(10,false)===10,
// pinForHand(10,true)===7.
export function pinForHand(canonicalPin,leftHanded){
  return leftHanded?mirrorPin(canonicalPin):canonicalPin;
}

export function isSplit(shot){
  if(!shot||shot.result!=="Other Leave")return false;
  const leave=Array.isArray(shot.otherLeave)?shot.otherLeave:[];
  if(leave.includes("9 Pin No-Tap"))return false; // scored as a strike, not a real leave
  const standing=leave.map(Number).filter(n=>!isNaN(n));
  if(standing.includes(1))return false; // headpin must be down
  if(standing.length<2)return false; // need 2+ standing pins to split
  const standingSet=new Set(standing);

  // Condition 1: a row with 2+ standing pins, and nothing standing ahead of it.
  const rows={};
  standing.forEach(p=>{(rows[PIN_ROW[p]]=rows[PIN_ROW[p]]||[]).push(p);});
  for(const rowNum of Object.keys(rows).map(Number)){
    if(rows[rowNum].length>=2){
      const hasLowerRowStanding=standing.some(p=>PIN_ROW[p]<rowNum);
      if(!hasLowerRowStanding)return true;
    }
  }

  // Condition 2: two standing pins with a completely empty column between them.
  for(const p of standing){
    for(const q of standing){
      if(p>=q)continue;
      const lo=Math.min(PIN_COL[p],PIN_COL[q]),hi=Math.max(PIN_COL[p],PIN_COL[q]);
      for(let c=lo+1;c<hi;c++){
        const pinsInCol=COLUMN_PINS[c]||[];
        if(pinsInCol.every(pin=>!standingSet.has(pin)))return true;
      }
    }
  }

  return false;
}

// The corner pin a bowler characteristically leaves depends on which hand
// they throw with: a righty's ball hooks left-to-right and leaves the 10,
// a lefty's leaves the 7.
//
// Two data shapes have to be handled differently here, following the
// convention already set in constants.js (resultsForHandedness):
//
//   - "Weak 10" / "Ringing 10" are STORED values and stay canonical for
//     everyone. A lefty taps "Weak 7" in the UI but the record says
//     "Weak 10", so these match regardless of handedness.
//   - An "Other Leave" records the pin that actually stood. A lefty's
//     corner pin is logged as "7", so this is where handedness genuinely
//     changes the test.
//
// Without the second case a left-handed bowler's corner-pin conversion
// would silently ignore every leave they logged by pin number.
export function isCornerPinLeave(shot, leftHanded = false){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result==="Other Leave"){
    const standing=(Array.isArray(shot.otherLeave)?shot.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap");
    return standing.length===1&&standing[0]===String(pinForHand(10,leftHanded));
  }
  return false;
}

// The display name for that pin, so a lefty sees "7 Pin Spare %".
export function cornerPinLabel(leftHanded){
  return String(pinForHand(10,leftHanded));
}

export function isTenPinLeave(shot){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result==="Other Leave"){
    const standing=(Array.isArray(shot.otherLeave)?shot.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap");
    return standing.length===1&&standing[0]==="10";
  }
  return false;
}

export function isSinglePinLeave(shot){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result==="Other Leave"){
    const standing=(Array.isArray(shot.otherLeave)?shot.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap");
    return standing.length===1;
  }
  return false;
}

// A washout: the headpin (1) standing alongside the 6 and/or 10 pin, with
// the 3-pin knocked DOWN (mirrored for a left-handed bowler: 4 and/or 7
// standing, with the 2-pin knocked down). The 3-pin/2-pin condition is
// what actually distinguishes a washout geometrically — it's what shows
// the ball carried through that side of the rack rather than just some
// other leave that happens to include the headpin and a corner pin.
// Requires the headpin UP, making this mutually exclusive with isSplit,
// which requires the headpin DOWN — a leave is never both.
export function isWashout(shot,leftHanded){
  if(!shot||shot.result!=="Other Leave")return false;
  const leave=Array.isArray(shot.otherLeave)?shot.otherLeave:[];
  if(leave.includes("9 Pin No-Tap"))return false;
  const standing=leave.map(Number).filter(n=>!isNaN(n));
  if(!standing.includes(1))return false;
  if(leftHanded){
    if(standing.includes(2))return false;
    return standing.includes(4)||standing.includes(7);
  }
  if(standing.includes(3))return false;
  return standing.includes(6)||standing.includes(10);
}

// A "makeable" spare for theoretical scoring purposes: any leave that
// isn't a split and isn't a washout. Every other pin combination counts as
// makeable regardless of how many pins are standing — per the definition
// given, only these two specific geometries are excluded. A lone 10-pin
// (Weak 10/Ringing 10) is always makeable — it can never be a split or a
// washout, since neither is possible without other pins/the headpin
// involved.
export function isMakeableSpare(shot,leftHanded){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result!=="Other Leave")return false;
  if(isSplit(shot))return false;
  if(isWashout(shot,leftHanded))return false;
  return true;
}

// ── Split conversion by type ────────────────────────────────────────────
//
// An overall split conversion rate hides the thing a bowler actually
// needs to know. The 4-7-10 and the 3-10 are not the same problem: one
// is close to unmakeable and the other is a routine spare for a good
// bowler. Lumping them into one percentage means someone converting
// every baby split and no big ones reads the same as someone doing the
// reverse.

// The pins standing, as a stable sorted key like "3-10". Leaves are
// stored as strings, so sort numerically rather than lexically -- "10"
// would otherwise sort before "3".
export function splitKey(shot){
  const pins=(shot?.otherLeave||[]).map(p=>parseInt(p,10)).filter(n=>!Number.isNaN(n));
  return pins.sort((a,b)=>a-b).join("-");
}

// The well-known splits get a name; anything else shows as its pins.
const SPLIT_NAMES={
  "7-10":"7-10",
  "4-6":"4-6",
  "4-6-7-10":"Big four",
  "4-6-7-9-10":"Greek church",
  "4-6-7-8-10":"Greek church",
  "3-10":"Baby split",
  "2-7":"Baby split",
  "5-7":"5-7",
  "5-10":"5-10",
  "8-10":"8-10",
  "7-9":"7-9",
  "6-7-10":"6-7-10",
  "4-7-10":"4-7-10",
  "2-4-10":"2-4-10",
  "3-6-7":"3-6-7",
  "4-9":"Bucket split",
  "6-8":"Bucket split",
};

export function splitName(key){
  return SPLIT_NAMES[key]||key;
}

// Per-split-type conversion, ordered by how often each is left.
//
// Returns [{key, name, left, made, rate}] where rate is 0-100 or null
// when a split has never been attempted. Only true splits count --
// isSplit already applies the headpin-down and gap rules.
export function splitConversionByType(shots){
  shots = Array.isArray(shots) ? shots : [];
  const byKey={};
  for(const s of (shots||[])){
    if(!isSplit(s))continue;
    const key=splitKey(s);
    if(!key)continue;
    const e=byKey[key]||(byKey[key]={key,name:splitName(key),left:0,made:0});
    e.left+=1;
    if(s.spareMade==="Yes")e.made+=1;
  }
  return Object.values(byKey)
    .map(e=>({...e,rate:e.left?Math.round((e.made/e.left)*100):null}))
    .sort((a,b)=>b.left-a.left||a.key.localeCompare(b.key));
}
