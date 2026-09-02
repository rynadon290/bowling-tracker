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
