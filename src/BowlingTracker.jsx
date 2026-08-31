import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import TeamManagement from "./TeamManagement.jsx";

// Browser persistence adapter. The original app used the ChatGPT host
// storage API; GitHub Pages needs a browser-native equivalent.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = window.localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      window.localStorage.setItem(key, value);
      return { value };
    },
    async delete(key) {
      window.localStorage.removeItem(key);
    },
  };
}

// Seed arsenal for the very first bowler created (preserves continuity with
// existing logged data). Every bowler added after that starts with an empty
// arsenal and builds their own list.
const DEFAULT_ARSENAL = [
  "Bionic","Ion Max Solid","Ion Max Pearl",
  "Phaze II Solid","Phaze II Pearl",
  "Harsh Reality Pearl","Road Warrior Pearl","Equinox Pearl",
];
const SURFACES = ["Box","500","1000","1500","2000","3000","4000","Polish"];
const RESULTS = ["Strike","Weak 10","Ringing 10","Other Leave"];
const STRIKE_DESCRIPTIONS = ["Flush","High","Light","Half Pocket","Trip 4","Kick 10","Brooklyn"];
const RELEASES = ["Good","Acceptable","Bad"];
const MISSES = ["Left","Right","Fast","Slow","Execution"];
const BALL_CHANGE_REASONS = [
  "Too early","Too late","Too round","Too sharp",
  "Roll out","Poor carry","No miss room","Lane transition","Surface worn",
];
const LEAGUES = ["Tuesday House Shot","Thursday House Shot"];
// Bowling lineup order per league — used to display per-bowler breakdowns
// within a shared night (e.g. Team Series) in actual turn order rather than
// alphabetically. Anyone not listed here falls to the end, in whatever
// order they'd otherwise appear, so a new bowler doesn't break the sort.
const LINEUP_ORDER = {
  "Thursday House Shot": ["Tommy","Zack","Ryan","Rob","Aaron"],
  "Tuesday House Shot": ["Tommy","Zack","Ryan","Lee"],
};
function lineupSort(bowlers,league){
  const order=LINEUP_ORDER[league]||[];
  return [...bowlers].sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia===-1&&ib===-1)return 0;
    if(ia===-1)return 1;
    if(ib===-1)return -1;
    return ia-ib;
  });
}
const STORAGE_KEY = "bowling-shots-v2";
const SESSIONS_KEY = "bowling-sessions-v2";
const BOWLERS_KEY = "bowling-bowlers-v1";
const ARSENALS_KEY = "bowling-arsenals-v1";
const MATCHES_KEY = "bowling-matches-v1";
const LANE_PATTERNS_KEY = "bowling-lane-patterns-v1";

const C = {
  bg:"#0f1117",surface:"#1a1d27",card:"#22263a",
  accent:"#4a9eff",accentDim:"#1e3a5f",
  strike:"#22c55e",spare:"#f59e0b",miss:"#ef4444",
  text:"#e8eaf0",textMuted:"#8892a4",border:"#2e3347",
};

const S = {
  app:{minHeight:"100vh",backgroundColor:C.bg,color:C.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:"14px"},
  header:{backgroundColor:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100},
  title:{fontSize:"16px",fontWeight:700,letterSpacing:"0.05em",color:C.accent,textTransform:"uppercase"},
  nav:{display:"flex",gap:"4px"},
  navBtn:(a)=>({padding:"6px 12px",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:600,backgroundColor:a?C.accent:"transparent",color:a?"#fff":C.textMuted}),
  content:{padding:"16px",maxWidth:"480px",margin:"0 auto"},
  card:{backgroundColor:C.card,borderRadius:"12px",padding:"16px",marginBottom:"12px",border:`1px solid ${C.border}`},
  label:{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textMuted,marginBottom:"8px"},
  chips:{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"12px"},
  chip:(sel,col)=>({padding:"6px 12px",borderRadius:"20px",border:`1px solid ${sel?(col||C.accent):C.border}`,backgroundColor:sel?(col?col+"22":C.accentDim):"transparent",color:sel?(col||C.accent):C.textMuted,cursor:"pointer",fontSize:"12px",fontWeight:sel?600:400,WebkitTapHighlightColor:"transparent"}),
  row:{display:"flex",gap:"8px",marginBottom:"8px"},
  input:{width:"100%",backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",color:C.text,fontSize:"14px",boxSizing:"border-box",outline:"none"},
  sel:{flex:1,backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",color:C.text,fontSize:"14px",outline:"none",appearance:"none"},
  btn:(v)=>({padding:"12px 20px",borderRadius:"10px",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:700,WebkitTapHighlightColor:"transparent",...(v==="primary"?{backgroundColor:C.accent,color:"#fff",width:"100%"}:v==="sm"?{backgroundColor:C.surface,color:C.textMuted,border:`1px solid ${C.border}`,padding:"8px 14px",fontSize:"18px"}:v==="warn"?{backgroundColor:"#ef444422",color:"#ef4444",border:`1px solid #ef444444`,width:"100%"}:{backgroundColor:C.surface,color:C.textMuted,border:`1px solid ${C.border}`})}),
  divider:{height:"1px",backgroundColor:C.border,margin:"12px 0"},
  shotCard:{backgroundColor:C.card,borderRadius:"10px",padding:"12px",marginBottom:"8px",border:`1px solid ${C.border}`,display:"flex",gap:"12px",alignItems:"flex-start"},
  dot:(r)=>({width:"32px",height:"32px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,flexShrink:0,backgroundColor:r==="Strike"?C.strike+"22":r?.includes("10")?C.miss+"22":C.spare+"22",color:r==="Strike"?C.strike:r?.includes("10")?C.miss:C.spare}),
  tag:(c)=>({display:"inline-block",padding:"2px 8px",borderRadius:"10px",fontSize:"11px",backgroundColor:(c||C.accent)+"22",color:c||C.accent,marginRight:"4px",marginBottom:"4px"}),
  statBox:{backgroundColor:C.surface,borderRadius:"10px",padding:"12px",textAlign:"center",flex:1,border:`1px solid ${C.border}`},
  statNum:{fontSize:"24px",fontWeight:700,color:C.accent,lineHeight:1,marginBottom:"4px"},
  statLbl:{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"},
};

function Chip({label,selected,onToggle,color}){
  return <button style={S.chip(selected,color)} onClick={onToggle}>{label}</button>;
}

function CollapsibleCard({title,summary,expanded,onToggle,children}){
  return (
    <div style={S.card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",WebkitTapHighlightColor:"transparent"}} onClick={onToggle}>
        <div style={{...S.label,marginBottom:0}}>
          {title}
          {summary&&<span style={{color:C.textMuted,fontWeight:400,textTransform:"none",letterSpacing:"normal"}}> · {summary}</span>}
        </div>
        <span style={{color:C.textMuted,fontSize:"12px",transform:expanded?"rotate(180deg)":"none",transition:"transform 0.15s",flexShrink:0,marginLeft:"8px"}}>▾</span>
      </div>
      {expanded&&<div style={{marginTop:"12px"}}>{children}</div>}
    </div>
  );
}

function CompareBadge({value,teamValue,lowerIsBetter,label}){
  if(value==null||teamValue==null||isNaN(value)||isNaN(teamValue))return null;
  const who=label||"team";
  const diff=Math.round(value-teamValue);
  if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {who}</div>;
  const better=lowerIsBetter?diff<0:diff>0;
  return (
    <div style={{fontSize:"10px",color:better?C.strike:C.miss,marginTop:"2px",fontWeight:600,whiteSpace:"nowrap"}}>
      {diff>0?"▲":"▼"} {Math.abs(diff)} vs {who}
    </div>
  );
}

function resultSym(r){
  if(r==="Strike")return"X";
  if(r==="Weak 10")return"W";
  if(r==="Ringing 10")return"R";
  return"L";
}

// ── Score calculator ──────────────────────────────────────────────────────────
// Shots: {frame:"1"-"10", ballNum:1-3 (frame 10 only), result, spareMade, pinCount}
// pinCount = total pins for that frame (both balls combined for open frames 1-9)
//            for frame 10: per-ball pin count
// isStk(s): Strike or 9 Pin No-Tap

function isStk(s){ return s&&(s.result==="Strike"); }

// ── Split detection ───────────────────────────────────────────────────────────
// Pin rows, front to back: row 1 = pin 1; row 2 = pins 2,3; row 3 = pins 4,5,6;
// row 4 = pins 7,8,9,10.
const PIN_ROW={1:1,2:2,3:2,4:3,5:3,6:3,7:4,8:4,9:4,10:4};
// Pin columns, left to right: col1=7; col2=4; col3=2,8; col4=1,5; col5=3,9; col6=6; col7=10.
const PIN_COL={7:1,4:2,2:3,8:3,1:4,5:4,3:5,9:5,6:6,10:7};
const COLUMN_PINS={};
for(const pin of Object.keys(PIN_COL)){
  const col=PIN_COL[pin];
  (COLUMN_PINS[col]=COLUMN_PINS[col]||[]).push(Number(pin));
}

// A split is a multi-pin leave with the headpin (1) down, where either:
// (1) two or more standing pins share a row, with no standing pin in any
//     row ahead of it (a "row" leave with nothing left to guide the ball in), or
// (2) two standing pins have at least one completely empty pin column
//     between their columns (a gap the ball can't carry through).
function isSplit(shot){
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

// A "10 pin leave" is any shot where the 10 pin was the only pin left
// standing — whether logged via the dedicated Weak 10 / Ringing 10 buttons,
// or via "Other Leave" with just pin 10 selected.
function isTenPinLeave(shot){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result==="Other Leave"){
    const standing=(Array.isArray(shot.otherLeave)?shot.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap");
    return standing.length===1&&standing[0]==="10";
  }
  return false;
}

// A "single pin leave" is any shot where exactly one pin was left standing,
// regardless of which pin — Weak 10/Ringing 10 (always the 10 pin), or
// "Other Leave" with exactly one pin selected (7, 4, 8, 10, etc.).
function isSinglePinLeave(shot){
  if(!shot)return false;
  if(shot.result==="Weak 10"||shot.result==="Ringing 10")return true;
  if(shot.result==="Other Leave"){
    const standing=(Array.isArray(shot.otherLeave)?shot.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap");
    return standing.length===1;
  }
  return false;
}

// first ball pins for a frame (used for bonus calculation)
// For frames 1-9: otherLeave = pins standing after ball 1 → firstBall = 10 - standing
// For 10th frame balls: same logic applies when ball is at a fresh set
function firstBallOf(s){
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

// Second ball pins for a non-strike frame
// For open frames: pinCount is the TOTAL frame pins (both balls)
// so second ball = pinCount - firstBall
function secondBallOf(s){
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

// 10th-frame ball 3 doesn't always face a fresh 10-pin rack: if ball 1 struck
// but ball 2 did NOT (left some pins standing), ball 3 is attempting only
// those specific remaining pins — not a full fresh rack. This computes how
// many pins were actually available to ball 3.
function tenthBall3Available(f10b1,f10b2){
  if(!isStk(f10b1))return 10; // ball 3 only reached here via ball1's embedded spare -> fresh rack
  if(!f10b2)return null; // not yet known
  if(isStk(f10b2))return 10; // two strikes -> rack reset again
  const b2Knocked=firstBallOf(f10b2);
  return b2Knocked===null?null:10-b2Knocked;
}

// Pins knocked on 10th-frame ball 3, correctly scoped to what was available
// (rather than always assuming a fresh 10-pin rack).
function tenthBall3Pins(f10b1,f10b2,f10b3){
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

// ── Empty shot factory ────────────────────────────────────────────────────────
function emptyShot(){
  return{
    id:Date.now(),bowler:"",teamId:"",league:"",date:new Date().toISOString().slice(0,10),
    lane:"",game:"1",frame:"1",ballNum:null,
    ball:"",surface:"",startingBoard:"",targetArrows:"",
    result:"",otherLeave:[],spareMade:"",strikeDescription:"",
    release:"",miss:[],ballChangeReason:[],pinCount:"",notes:"",
  };
}

// ── Determine next state after saving a shot ─────────────────────────────────
function nextState(savedShots, bowler, game, frame, ballNum){
  const g=parseInt(game),f=parseInt(frame);

  if(f<10){
    // Frames 1-9: advance to next frame. Landing on frame 10 must set ballNum
    // explicitly to 1 (not null) — every 10th-frame lookup elsewhere expects
    // ball 1's shot to be tagged ballNum===1, and a null here caused it to
    // go unrecognized, looping the ball selector back to "Ball 1" forever.
    return{game:String(g),frame:String(f+1),ballNum:(f+1===10)?1:null};
  }

  // Frame 10 logic
  if(!ballNum||ballNum===1){
    // Just saved ball 1
    const f10shots=savedShots.filter(s=>s.bowler===bowler&&s.game===String(g)&&parseInt(s.frame)===10);
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
    const f10shots=savedShots.filter(s=>s.bowler===bowler&&s.game===String(g)&&parseInt(s.frame)===10);
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

export default function BowlingTracker(){
  const[view,setView]=useState("log");
  const[shots,setShots]=useState([]);
  const[sessions,setSessions]=useState([]);
  const[bowlers,setBowlers]=useState([]);
  const[teams,setTeams]=useState([]);
  const[activeBowler,setActiveBowler]=useState("");
  const[newBowlerName,setNewBowlerName]=useState("");
  const[arsenals,setArsenals]=useState({}); // {bowlerName: [ballName,...]}
  const[newBallName,setNewBallName]=useState("");
  const[form,setForm]=useState(emptyShot());
  const[editingId,setEditingId]=useState(null);
  const[preEditForm,setPreEditForm]=useState(null);
  const[saved,setSaved]=useState(false);
  const[filterBall,setFilterBall]=useState("");
  const[filterResult,setFilterResult]=useState("");
  const[filterBowler,setFilterBowler]=useState("");
  const[statsBowler,setStatsBowler]=useState("");
  const[compareBowler,setCompareBowler]=useState("");
  const[statsLeague,setStatsLeague]=useState("");
  const[statsTeamId,setStatsTeamId]=useState("");
  const[trendMetric,setTrendMetric]=useState("weekly"); // 0, 1, 2, or "weekly"
  const[trendScope,setTrendScope]=useState(""); // "" = combined both teams, or a specific league
  const[compareLeague,setCompareLeague]=useState("");
  const[sessionLeague,setSessionLeague]=useState("");
  const[sessionDate,setSessionDate]=useState(new Date().toISOString().slice(0,10));
  const[startingLane,setStartingLane]=useState("");
  const[showSummary,setShowSummary]=useState(false);
  const[confirmClear,setConfirmClear]=useState(false);
  const[showBackup,setShowBackup]=useState(false);
  const[expandedSections,setExpandedSections]=useState({releaseMiss:false,ballChange:false,notes:false});
  function toggleSection(key){setExpandedSections(s=>({...s,[key]:!s[key]}));}
  const[importText,setImportText]=useState("");
  const[backupStatus,setBackupStatus]=useState("");
  const[ballLaneLines,setBallLaneLines]=useState({});
  const[matches,setMatches]=useState([]); // [{id,league,date,games:[null|true|false×3],series:null|true|false}]
  const[lanePatterns,setLanePatterns]=useState([]); // [{league,date,lane,patternType:"house"|"official",patternName,length,volume,ratio}]

  // One-time self-healing cleanup for a fixed bug: some 10th-frame "ball 1"
  // shots got saved with ballNum null instead of an explicit 1 (a frame
  // 9→10 transition bug, since fixed). That produced phantom duplicate rows
  // in history — one untagged, one correctly tagged ballNum:1 — for the same
  // physical shot. This normalizes them and keeps only the most recent copy
  // per slot, so old corrupted data cleans itself up automatically on load.
  function migrateShots(rawShots){
    const normalized=rawShots.map(s=>
      (parseInt(s.frame)===10&&!s.ballNum)?{...s,ballNum:1}:s
    );
    const lastIndexForKey=new Map();
    normalized.forEach((s,idx)=>{
      const key=`${s.bowler}|${s.league}|${s.date}|${s.game}|${s.frame}|${s.ballNum||""}`;
      lastIndexForKey.set(key,idx); // later entries overwrite earlier ones for the same slot
    });
    return normalized.filter((s,idx)=>{
      const key=`${s.bowler}|${s.league}|${s.date}|${s.game}|${s.frame}|${s.ballNum||""}`;
      return lastIndexForKey.get(key)===idx;
    });
  }

  function migrateShotTeams(rawShots,currentTeams){
    if(!currentTeams.length)return rawShots;

    let changed=false;
    const updated=rawShots.map(s=>{
      if(s.teamId||!s.bowler||!s.league)return s;

      const team=currentTeams.find(
        t=>t.league===s.league&&t.members.includes(s.bowler)
      );

      if(!team)return s;

      changed=true;
      return {...s,teamId:team.id};
    });

    return changed?updated:rawShots;
    }
  
  // Retroactively fixes sessions with stale/missing derived stats:
  // (a) tenPinLeaves/singlePin* fields that didn't exist yet when the session
  //     was saved (only counted Weak 10/Ringing 10, missing Other-Leave-10),
  // (b) splits/splitsConverted, which need recomputing unconditionally since
  //     the split-detection RULE itself changed — an old count isn't just
  //     missing, it's wrong under the current definition, and
  // (c) shotCount, whose DEFINITION changed from "frames only" to "every
  //     shot delivered" — old sessions' stored shotCount undercounted
  //     relative to 'strikes' (which always counted every strike, bonus
  //     balls included), producing an inflated strike % in Session History.
  // Recomputes from the still-available underlying shots for that exact
  // bowler+league+date. Only touches a session when matching shots are
  // actually found, so it never overwrites a real count with a false zero.
  function migrateSessions(rawSessions,allShots){
    // Dedup first: if duplicate sessions exist for the same bowler+league+date
    // (possible before the double-save guard existed), keep only the most
    // recently-saved one so old duplicates don't double-count anywhere.
    const lastIndexForSessionKey=new Map();
    rawSessions.forEach((s,idx)=>{
      lastIndexForSessionKey.set(`${s.bowler}|${s.league}|${s.date}`,idx);
    });
    const deduped=rawSessions.filter((s,idx)=>
      lastIndexForSessionKey.get(`${s.bowler}|${s.league}|${s.date}`)===idx
    );
    if(!allShots.length)return deduped;
    return deduped.map(s=>{
      const ss=allShots.filter(sh=>sh.bowler===s.bowler&&sh.league===s.league&&sh.date===s.date);
      if(!ss.length)return s; // no matching shots found; leave whatever was already stored untouched
      return{
        ...s,
        teamId:s.teamId||ss[0]?.teamId||"",
        shotCount:ss.length,
        strikes:ss.filter(sh=>sh.result==="Strike").length,
        tenPinLeaves:ss.filter(isTenPinLeave).length,
        singlePinLeaves:ss.filter(isSinglePinLeave).length,
        singlePinSpares:ss.filter(sh=>isSinglePinLeave(sh)&&sh.spareMade==="Yes").length,
        splits:ss.filter(isSplit).length,
        splitsConverted:ss.filter(sh=>isSplit(sh)&&sh.spareMade==="Yes").length,
        spareAttempts:ss.filter(sh=>sh.result!=="Strike"&&sh.spareMade!==""&&!isSplit(sh)).length,
        sparesMade:ss.filter(sh=>sh.spareMade==="Yes"&&!isSplit(sh)).length,
      };
    });
  }

  useEffect(()=>{
    async function load(){
      try{
        let migratedShots=[];
        const r=await window.storage.get(STORAGE_KEY);
        if(r){
          const loaded=JSON.parse(r.value);
          migratedShots=migrateShots(loaded);
          setShots(migratedShots);
          if(JSON.stringify(migratedShots)!==JSON.stringify(loaded)){
            try{await window.storage.set(STORAGE_KEY,JSON.stringify(migratedShots));}catch{}
          }
        }
        const s=await window.storage.get(SESSIONS_KEY);
        if(s){
          const loadedSessions=JSON.parse(s.value);
          const migratedSessions=migrateSessions(loadedSessions,migratedShots);
          setSessions(migratedSessions);
          if(JSON.stringify(migratedSessions)!==JSON.stringify(loadedSessions)){
            try{await window.storage.set(SESSIONS_KEY,JSON.stringify(migratedSessions));}catch{}
          }
        }
        const b=await window.storage.get(BOWLERS_KEY);
        if(b){
          const list=JSON.parse(b.value);
          setBowlers(list);
          if(list.length)setActiveBowler(list[0]);
        }
        const a=await window.storage.get(ARSENALS_KEY);
        if(a)setArsenals(JSON.parse(a.value));
        const m=await window.storage.get(MATCHES_KEY);
        if(m)setMatches(JSON.parse(m.value));
        const lp=await window.storage.get(LANE_PATTERNS_KEY);
        if(lp)setLanePatterns(JSON.parse(lp.value));
        const bl=await window.storage.get("bowling-ball-lane-lines-v1");
        if(bl)setBallLaneLines(JSON.parse(bl.value));
      }catch{}
    }
    load();
  },[]);

    useEffect(()=>{
    if(!teams.length||!shots.length)return;

    const migrated=migrateShotTeams(shots,teams);
    if(migrated===shots)return;

    setShots(migrated);
    try{
      window.storage.set(STORAGE_KEY,JSON.stringify(migrated));
    }catch{}
  },[teams,shots]);
  
  async function saveBowlers(u){setBowlers(u);try{await window.storage.set(BOWLERS_KEY,JSON.stringify(u));}catch{}}
  async function saveArsenals(u){setArsenals(u);try{await window.storage.set(ARSENALS_KEY,JSON.stringify(u));}catch{}}
  async function saveLanePatterns(u){setLanePatterns(u);try{await window.storage.set(LANE_PATTERNS_KEY,JSON.stringify(u));}catch{}}

  async function addBowler(){
    const name=newBowlerName.trim();
    if(!name||bowlers.includes(name))return;
    const updated=[...bowlers,name];
    await saveBowlers(updated);
    // The very first bowler ever added inherits the legacy default arsenal
    // (continuity with existing logged data). Everyone after starts blank.
    if(bowlers.length===0&&Object.keys(arsenals).length===0){
      await saveArsenals({...arsenals,[name]:[...DEFAULT_ARSENAL]});
    } else if(!arsenals[name]){
      await saveArsenals({...arsenals,[name]:[]});
    }
    setNewBowlerName("");
    if(!activeBowler)setActiveBowler(name);
  }

  async function removeBowler(name){
    const updated=bowlers.filter(b=>b!==name);
    await saveBowlers(updated);
    const{[name]:_,...restArsenals}=arsenals;
    await saveArsenals(restArsenals);
    if(activeBowler===name)setActiveBowler(updated[0]||"");
    if(filterBowler===name)setFilterBowler("");
    if(statsBowler===name)setStatsBowler("");
    if(compareBowler===name)setCompareBowler("");
  }

  async function addBall(){
    const name=newBallName.trim();
    if(!name||!activeBowler)return;
    const current=arsenals[activeBowler]||[];
    if(current.includes(name))return;
    await saveArsenals({...arsenals,[activeBowler]:[...current,name]});
    setNewBallName("");
  }

  async function removeBall(bowlerName,ballName){
    const current=arsenals[bowlerName]||[];
    await saveArsenals({...arsenals,[bowlerName]:current.filter(b=>b!==ballName)});
    if(form.bowler===bowlerName&&form.ball===ballName){
      handleBallChange("");
    }
  }

  // Ball names to iterate for a given bowler's stats/filters — the union of
  // their current arsenal plus any ball names appearing in their logged shots
  // (so removing a ball from the arsenal never hides historical data).
  // bowlerKey==="" means everyone combined.
  function ballUniverse(bowlerKey){
    const fromArsenal=bowlerKey?(arsenals[bowlerKey]||[]):[...new Set(Object.values(arsenals).flat())];
    const relevantShots=bowlerKey?shots.filter(s=>s.bowler===bowlerKey):shots;
    const fromShots=[...new Set(relevantShots.map(s=>s.ball).filter(Boolean))];
    return[...new Set([...fromArsenal,...fromShots])];
  }

  function autoFillLineFor(bowlerName,ball,game,frame){
    const lane=calcLane(startingLane,game,frame);
    if(!ball||!lane||!bowlerName)return{startingBoard:"",targetArrows:""};
    return ballLaneLines[bowlerName]?.[ball]?.[lane]||{startingBoard:"",targetArrows:""};
  }
  function autoFillLine(ball,game,frame){
    return autoFillLineFor(activeBowler,ball,game,frame);
  }

  function selectBowler(name){
    const team=teams.find(t=>t.league===sessionLeague&&t.members.includes(name));
    const teamId=team?.id||"";
    setActiveBowler(name);
    setShowSummary(false);

    // Resume this bowler at their own next unplayed frame for tonight's
    // league/date, instead of leaving them wherever the previous bowler was.
    if(sessionLeague){
      const bShots=shots.filter(s=>s.bowler===name&&s.league===sessionLeague&&s.date===sessionDate&&(!s.ballNum||s.ballNum===1));
      if(bShots.length){
        const last=[...bShots].sort((a,b)=>{
          const ga=parseInt(a.game),gb=parseInt(b.game);
          if(ga!==gb)return ga-gb;
          return parseInt(a.frame)-parseInt(b.frame);
        }).pop();
        const allBShots=shots.filter(s=>s.bowler===name&&s.league===sessionLeague&&s.date===sessionDate);
        const{game:ng,frame:nf,ballNum:nb}=nextState(allBShots,name,last.game,last.frame,last.ballNum);
        const line=nb===null?autoFillLineFor(name,form.ball,ng,nf):{startingBoard:form.startingBoard,targetArrows:form.targetArrows};
        setForm(f=>({...f,bowler:name,teamId,league:sessionLeague,date:sessionDate,game:ng,frame:nf,ballNum:nb,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
        return;
      }
      // No shots yet for this bowler tonight — start fresh at Game 1 Frame 1
      const line=autoFillLineFor(name,form.ball,"1","1");
      setForm(f=>({...f,bowler:name,teamId,league:sessionLeague,date:sessionDate,game:"1",frame:"1",ballNum:null,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
      return;
    }
    set("bowler",name);
  }

  async function saveShots(u){setShots(u);try{await window.storage.set(STORAGE_KEY,JSON.stringify(u));}catch{}}
  async function saveSessions(u){setSessions(u);try{await window.storage.set(SESSIONS_KEY,JSON.stringify(u));}catch{}}
  async function saveMatches(u){setMatches(u);try{await window.storage.set(MATCHES_KEY,JSON.stringify(u));}catch{}}

  function getMatch(league,date){
    return matches.find(m=>m.league===league&&m.date===date);
  }

  // Lane condition (oil pattern) for a specific lane on a specific night —
  // defaults to House Shot implicitly (no record needed) until the user
  // actively records an official pattern for that lane.
  function getLanePattern(league,date,lane){
    return lanePatterns.find(p=>p.league===league&&p.date===date&&String(p.lane)===String(lane));
  }
  async function setLanePattern(league,date,lane,updates){
    const existing=getLanePattern(league,date,lane);
    if(existing){
      await saveLanePatterns(lanePatterns.map(p=>p===existing?{...p,...updates}:p));
    } else {
      await saveLanePatterns([...lanePatterns,{league,date,lane:String(lane),patternType:"house",patternName:"",length:"",volume:"",ratio:"",...updates}]);
    }
  }
  // Cycles a result through Not Marked → Won → Lost → Not Marked
  function nextResult(cur){ return cur===null?true:cur===true?false:null; }

  async function cycleGameResult(league,date,gameIdx){
    const existing=getMatch(league,date);
    if(existing){
      const games=[...existing.games];
      games[gameIdx]=nextResult(games[gameIdx]??null);
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,games}:m));
    } else {
      const games=[null,null,null];
      games[gameIdx]=true;
      await saveMatches([...matches,{id:Date.now(),league,date,games,series:null,opponent:"",handicap:""}]);
    }
  }

  async function cycleSeriesResult(league,date){
    const existing=getMatch(league,date);
    if(existing){
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,series:nextResult(existing.series??null)}:m));
    } else {
      await saveMatches([...matches,{id:Date.now(),league,date,games:[null,null,null],series:true,opponent:"",handicap:""}]);
    }
  }

  async function setMatchOpponent(league,date,opponent){
    const existing=getMatch(league,date);
    if(existing){
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,opponent}:m));
    } else {
      await saveMatches([...matches,{id:Date.now(),league,date,games:[null,null,null],series:null,opponent,handicap:""}]);
    }
  }

  // Handicap: one value per match (same for all 3 games), typically 80% of
  // the gap between the two teams' averages.
  async function setMatchHandicap(league,date,value){
    const existing=getMatch(league,date);
    if(existing){
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,handicap:value}:m));
    } else {
      await saveMatches([...matches,{id:Date.now(),league,date,games:[null,null,null],series:null,opponent:"",handicap:value}]);
    }
  }

  // Normalizes legacy per-game handicap arrays (from before this was a single
  // value) down to one number, so old saved data still displays correctly.
  function matchHandicap(m){
    if(!m)return "";
    if(Array.isArray(m.handicap))return m.handicap.find(v=>v!=="" && v!=null) ?? "";
    return m.handicap ?? "";
  }


  // Cumulative win/loss record for the season. league==="" combines every league.
  function seasonRecord(league){
    const ms=league?matches.filter(m=>m.league===league):matches;
    let gameWins=0,gameLosses=0,seriesWins=0,seriesLosses=0,pointsWon=0,pointsAvailable=0;
    ms.forEach(m=>{
      (m.games||[]).forEach(g=>{
        if(g===true){gameWins++;pointsWon++;pointsAvailable++;}
        else if(g===false){gameLosses++;pointsAvailable++;}
      });
      if(m.series===true){seriesWins++;pointsWon++;pointsAvailable++;}
      else if(m.series===false){seriesLosses++;pointsAvailable++;}
    });
    return{gameWins,gameLosses,seriesWins,seriesLosses,pointsWon,pointsAvailable};
  }

  // Points won per week, chronologically — Season Record only shows the
  // cumulative total, never WHEN those points came. This surfaces momentum
  // (a hot streak or a slump) that a running total hides.
  function weeklyPointsData(league){
    return matches
      .filter(m=>!league||m.league===league)
      .map(m=>{
        const pointsAvailable=m.games.filter(v=>v!==null).length+(m.series!==null?1:0);
        if(!pointsAvailable)return null;
        const pointsWon=m.games.filter(v=>v===true).length+(m.series===true?1:0);
        return{date:m.date,pointsWon,pointsAvailable,opponent:m.opponent};
      })
      .filter(Boolean)
      .sort((a,b)=>a.date.localeCompare(b.date));
  }

  // Distinct (league,date) pairs that have at least one session logged, newest first.
  function sessionDateGroups(){
    const seen={};
    sessions.forEach(s=>{
      const k=`${s.league}__${s.date}`;
      if(!seen[k])seen[k]={league:s.league,date:s.date};
    });
    return Object.values(seen).sort((a,b)=>b.date.localeCompare(a.date));
  }

  // (league,date) groups where 2+ bowlers logged a session — the only groups
  // where we actually have a legitimate combined team total. league, if
  // given, scopes to just that league's sessions.
  function teamDateGroups(teamId){
  const byKey={};
  sessions.filter(s=>s.teamId===teamId).forEach(s=>{
    const k=`${s.teamId}__${s.league}__${s.date}`;
    if(!byKey[k])byKey[k]={teamId:s.teamId,league:s.league,date:s.date,entries:[]};
    byKey[k].entries.push(s);
  });
  return Object.values(byKey).filter(g=>g.entries.length>1).map(g=>{
    const gameTotals=[0,1,2].map(i=>{
      const vals=g.entries.map(e=>e.scores[i]).filter(v=>v!=null);
      return vals.length?vals.reduce((a,b)=>a+b,0):null;
    });
    const seriesTotal=g.entries.reduce((a,e)=>a+e.total,0);
    return{...g,gameTotals,seriesTotal};
  });
  }

  // High game / high series — auto-derived from logged sessions, always up to date.
  function bowlerHighGame(bowler){
    let best=null;
    sessions.filter(s=>s.bowler===bowler).forEach(s=>s.scores.forEach((v,i)=>{
      if(best===null||v>best.value)best={value:v,date:s.date,league:s.league,game:i+1};
    }));
    return best;
  }
  function bowlerHighSeries(bowler){
    let best=null;
    sessions.filter(s=>s.bowler===bowler).forEach(s=>{
      if(best===null||s.total>best.value)best={value:s.total,date:s.date,league:s.league};
    });
    return best;
  }
  function teamHighGame(teamId){
  let best=null;
  teamDateGroups(teamId).forEach(g=>g.gameTotals.forEach((v,i)=>{
      if(v!=null&&(best===null||v>best.value))best={value:v,date:g.date,league:g.league,game:i+1};
    }));
    return best;
  }
  function teamHighSeries(teamId){
  let best=null;
  teamDateGroups(teamId).forEach(g=>{
      if(best===null||g.seriesTotal>best.value)best={value:g.seriesTotal,date:g.date,league:g.league};
    });
    return best;
  }

  // ── Lane calculation ──────────────────────────────────────────────────────
  function calcLane(sl,game,frame,ballNum){
    if(!sl||!game||!frame)return null;
    const start=parseInt(sl),g=parseInt(game),f=parseInt(frame);
    function lat(gsl,fr){
      const gp=gsl%2===0?gsl-1:gsl+1;
      if(fr<=9)return fr%2===1?gsl:gp;
      // frame 10: same lane as frame 10 ball 1
      return 10%2===0?gp:gsl;
    }
    let gs=start;
    for(let gn=1;gn<g;gn++)gs=lat(gs,10);
    // For frame 10 ball 2 and 3, lane = same as ball 1 (frame 10)
    // calcLane for frame 10 always returns the frame 10 lane
    return lat(gs,f);
  }

  function handleBallChange(newBall){
    const lane=calcLane(startingLane,form.game,form.frame);
    const stored=activeBowler?ballLaneLines[activeBowler]?.[newBall]?.[lane]:null;
    setForm(f=>({...f,ball:newBall,startingBoard:stored?.startingBoard||"",targetArrows:stored?.targetArrows||""}));
  }

  function handleLineChange(field,val){
    setForm(f=>{
      const lane=calcLane(startingLane,f.game,f.frame);
      if(f.ball&&lane&&activeBowler&&!editingId){
        setBallLaneLines(prev=>{
          const updated={
            ...prev,
            [activeBowler]:{
              ...(prev[activeBowler]||{}),
              [f.ball]:{...(prev[activeBowler]?.[f.ball]||{}),[lane]:{startingBoard:field==="startingBoard"?val:f.startingBoard,targetArrows:field==="targetArrows"?val:f.targetArrows}}
            }
          };
          try{window.localStorage.setItem("bowling-ball-lane-lines-v1",JSON.stringify(updated));}catch{}
          return updated;
        });
      }
      return{...f,[field]:val};
    });
  }

  function handleSpareMadeToggle(val){
    setForm(f=>{
      const newVal=f.spareMade===val?"":val;
      let pc=f.pinCount;
      const isSingle=f.result==="Weak 10"||f.result==="Ringing 10"||standingCount(f.otherLeave)===1;
      if(newVal==="Yes"){
        pc="10";
      } else if(newVal==="No"&&isSingle){
        const fb=f.result==="Other Leave"?Math.max(0,10-standingCount(f.otherLeave)):9;
        pc=String(fb);
      }
      return{...f,spareMade:newVal,pinCount:pc};
    });
  }

  function set(field,val){setForm(f=>({...f,[field]:val}));}
  function toggle(field,val){setForm(f=>({...f,[field]:f[field]===val?"":val}));}
  function toggleMulti(field,val){
    setForm(f=>{
      const arr=Array.isArray(f[field])?f[field]:[];
      return{...f,[field]:arr.includes(val)?arr.filter(x=>x!==val):[...arr,val]};
    });
  }

  // Standing pins (excluding 9 Pin No-Tap)
  function standingCount(leave){return(Array.isArray(leave)?leave:[]).filter(p=>p!=="9 Pin No-Tap").length;}

  function handleLeaveToggle(pin){
    setForm(f=>{
      const arr=Array.isArray(f.otherLeave)?f.otherLeave:[];
      const newLeave=arr.includes(pin)?arr.filter(x=>x!==pin):[...arr,pin];
      const standing=newLeave.filter(p=>p!=="9 Pin No-Tap").length;
      const fb=Math.max(0,10-standing);
      return{...f,otherLeave:newLeave,pinCount:String(fb),spareMade:""};
    });
  }

  const standingPins=standingCount(form.otherLeave);
  const firstBallPins=form.result==="Other Leave"?Math.max(0,10-standingPins):null;
  const maxPinCount=firstBallPins!==null?firstBallPins+Math.max(0,standingPins-1):9;
  const minPinCount=firstBallPins!==null?firstBallPins:0;
  const isSinglePin=standingPins===1;
  const isNoTap=form.result==="Other Leave"&&form.otherLeave.includes("9 Pin No-Tap");
  const isStrike=form.result==="Strike";
  const hasLeave=form.result&&!isStrike&&!isNoTap;
  // A blank Spare Made isn't a safe "no" — the scoring engine treats it
  // exactly like an explicit "No" (a full miss on the second ball), which
  // can silently produce a wrong score if the question just never got
  // answered. 10th-frame ball 3 is the one case that never asks (it's the
  // last delivery, nothing left to convert).
  const needsSpareMade=hasLeave&&!(parseInt(form.frame)===10&&form.ballNum===3)&&!form.spareMade;
  const showPinCount=hasLeave&&form.spareMade==="No"&&!isSinglePin&&standingPins>0;

  function stepPinCount(delta){
    setForm(f=>{
      const cur=f.pinCount!==""?parseInt(f.pinCount):minPinCount;
      const next=Math.max(minPinCount,Math.min(maxPinCount,cur+delta));
      return{...f,pinCount:String(next)};
    });
  }

  // ── Submit shot ───────────────────────────────────────────────────────────
  async function submitShot(){
    if(!form.result||!form.bowler)return;
    const effectiveResult=isNoTap?"Strike":form.result;
    const autoLane=calcLane(startingLane,form.game,form.frame,form.ballNum);

    if(editingId){
      const shotData={...form,result:effectiveResult,_displayResult:form.result,_displayLeave:[...(form.otherLeave||[])]};
      const updated=shots.map(s=>s.id===editingId?{...shotData,id:editingId}:s);
      await saveShots(updated);
      setEditingId(null);
      // Return to wherever the user was actively logging before they jumped
      // into edit mode, instead of resetting all the way back to Frame 1.
      setForm(preEditForm||emptyShot());
      setPreEditForm(null);
    } else {
      // A "slot" is uniquely identified by bowler+league+date+game+frame+ballNum.
      // If one somehow already exists (e.g. a stale ball selector re-offering an
      // already-played 10th-frame ball), overwrite it rather than adding a
      // second shot for the same slot — a duplicate would corrupt frame lookups
      // in calcScore/strictPartial, which expect exactly one shot per slot.
      const slotMatch=s=>s.bowler===form.bowler&&s.league===form.league&&s.date===form.date&&
        s.game===form.game&&s.frame===form.frame&&(s.ballNum||null)===(form.ballNum||null);
      const existingSlot=shots.find(slotMatch);
      const toSave={
        ...form,
        id:existingSlot?existingSlot.id:Date.now(),
        result:effectiveResult,
        _displayResult:form.result,
        _displayLeave:[...(form.otherLeave||[])],
        lane:autoLane?String(autoLane):form.lane,
      };
      const updated=existingSlot?shots.map(s=>s.id===existingSlot.id?toSave:s):[...shots,toSave];
      await saveShots(updated);

      // Determine next frame/game/ballNum
      const{game:ng,frame:nf,ballNum:nb}=nextState(updated,form.bowler,form.game,form.frame,form.ballNum);

      // Auto-fill line for next shot
      let line={startingBoard:"",targetArrows:""};
      if(nb===null){
        // New frame — auto-fill from stored lines
        line=autoFillLine(form.ball,ng,nf);
      } else {
        // Frame 10 ball 2/3 — same lane, keep current line
        line={startingBoard:form.startingBoard,targetArrows:form.targetArrows};
      }

      setForm({
        ...emptyShot(),
        bowler:form.bowler,
        league:form.league,
        date:form.date,
        game:ng,
        frame:nf,
        ballNum:nb,
        ball:form.ball,
        surface:form.surface,
        startingBoard:line.startingBoard,
        targetArrows:line.targetArrows,
      });
    }
    setSaved(true);
    setTimeout(()=>setSaved(false),1500);
  }

  function startEdit(shot){
    if(!editingId) setPreEditForm(form);
    setForm({...shot,result:shot._displayResult||shot.result,otherLeave:shot._displayLeave||shot.otherLeave||[]});
    setEditingId(shot.id);
    setView("log");
    window.scrollTo(0,0);
  }

  function cancelEdit(){
    setEditingId(null);
    setForm(preEditForm||emptyShot());
    setPreEditForm(null);
  }

  async function deleteShot(id){await saveShots(shots.filter(s=>s.id!==id));}

  async function clearAllData(){
    await saveShots([]);
    await saveSessions([]);
    await saveMatches([]);
    setForm({...emptyShot(),bowler:activeBowler});
    setEditingId(null);
    setShowSummary(false);
    setSessionLeague("");
    setStartingLane("");
    setBallLaneLines({});
    try{window.localStorage.removeItem("bowling-ball-lane-lines-v1");}catch{}
  }

  function exportData(){
    return JSON.stringify({
      exportedAt:new Date().toISOString(),
      version:2,
      shots,sessions,bowlers,arsenals,matches,ballLaneLines,lanePatterns,
    },null,2);
  }

  async function importData(jsonText){
    const data=JSON.parse(jsonText); // let this throw — caller shows the error
    if(!data||typeof data!=="object")throw new Error("Not a valid backup file");
    const newShots=Array.isArray(data.shots)?data.shots:[];
    const newSessions=Array.isArray(data.sessions)?data.sessions:[];
    const newBowlers=Array.isArray(data.bowlers)?data.bowlers:[];
    const newArsenals=(data.arsenals&&typeof data.arsenals==="object")?data.arsenals:{};
    const newMatches=Array.isArray(data.matches)?data.matches:[];
    const newBallLaneLines=(data.ballLaneLines&&typeof data.ballLaneLines==="object")?data.ballLaneLines:{};
    const newLanePatterns=Array.isArray(data.lanePatterns)?data.lanePatterns:[];
    const migratedShots=migrateShots(newShots);
    await saveShots(migratedShots);
    await saveSessions(migrateSessions(newSessions,migratedShots));
    await saveBowlers(newBowlers);
    await saveArsenals(newArsenals);
    await saveMatches(newMatches);
    await saveLanePatterns(newLanePatterns);
    setBallLaneLines(newBallLaneLines);
    try{window.localStorage.setItem("bowling-ball-lane-lines-v1",JSON.stringify(newBallLaneLines));}catch{}
    if(newBowlers.length)setActiveBowler(newBowlers[0]);
  }

  // ── Score helpers ─────────────────────────────────────────────────────────

  // Strict running score: only frames with fully resolved bonus balls
  function strictPartial(shots){
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

  function getGameStrict(bowler,league,date,game){
    const gs=shots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date&&s.game===String(game));
    return strictPartial(gs);
  }

  function getSessionTotal(){
    if(!sessionLeague||!activeBowler)return null;
    const scores=[1,2,3].map(g=>getGameStrict(activeBowler,sessionLeague,sessionDate,g));
    const valid=scores.filter(s=>s!=null);
    return valid.length?valid.reduce((a,b)=>a+b,0):null;
  }
  async function submitSession(){
    if(!sessionLeague||!activeBowler)return;
    const scores=[1,2,3].map(g=>getGameStrict(activeBowler,sessionLeague,sessionDate,g)).filter(s=>s!=null);
    if(!scores.length)return;
    const ss=shots.filter(s=>s.bowler===activeBowler&&s.league===sessionLeague&&s.date===sessionDate);
    // A session is uniquely identified by bowler+league+date. If one already
    // exists (e.g. a double-tap on Save), update it in place rather than
    // adding a duplicate — a duplicate would silently double-count this
    // night in every average, the leaderboard, and the season record.
    const existing=sessions.find(s=>s.bowler===activeBowler&&s.league===sessionLeague&&s.date===sessionDate);
    const session={
      id:existing?existing.id:Date.now(),bowler:activeBowler,teamId:ss[0]?.teamId||"",league:sessionLeague,date:sessionDate,scores,
      total:scores.reduce((a,b)=>a+b,0),
      average:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length),
      shotCount:ss.length, // every shot delivered, including 10th-frame bonus balls — matches how 'strikes' is counted
      strikes:ss.filter(s=>s.result==="Strike").length,
      weakTens:ss.filter(s=>s.result==="Weak 10").length,
      ringingTens:ss.filter(s=>s.result==="Ringing 10").length,
      tenPinLeaves:ss.filter(isTenPinLeave).length,
      singlePinLeaves:ss.filter(isSinglePinLeave).length,
      singlePinSpares:ss.filter(s=>isSinglePinLeave(s)&&s.spareMade==="Yes").length,
      spareAttempts:ss.filter(s=>s.result!=="Strike"&&s.spareMade!==""&&!isSplit(s)).length,
      sparesMade:ss.filter(s=>s.spareMade==="Yes"&&!isSplit(s)).length,
      splits:ss.filter(isSplit).length,
      splitsConverted:ss.filter(s=>isSplit(s)&&s.spareMade==="Yes").length,
      ballsUsed:[...new Set(ss.map(s=>s.ball).filter(Boolean))],
      misses:ss.flatMap(s=>Array.isArray(s.miss)?s.miss:s.miss?[s.miss]:[]),
      releases:ss.filter(s=>s.release).map(s=>s.release),
    };
    const updated=existing?sessions.map(s=>s.id===existing.id?session:s):[...sessions,session];
    await saveSessions(updated);
    setShowSummary(true);
  }

  // bowler === "" means combined/team (every bowler's sessions included)
  function rAvg(bowler,league){
    const ls=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&s.league===league);
    if(!ls.length)return null;
    const all=ls.flatMap(s=>s.scores);
    return Math.round(all.reduce((a,b)=>a+b,0)/all.length);
  }
  function cAvg(bowler,league){
    const all=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true)).flatMap(s=>s.scores);
    if(!all.length)return null;
    return Math.round(all.reduce((a,b)=>a+b,0)/all.length);
  }

  // Progress toward the next 5-pin average milestone (e.g. 187 -> 190). Uses
  // the precise, unrounded average for the progress fraction so the bar
  // moves smoothly game to game, even though the displayed average elsewhere
  // in the app is rounded/truncated.
  function avgProgress(bowler,league){
    const all=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true)).flatMap(s=>s.scores);
    if(!all.length)return null;
    const raw=all.reduce((a,b)=>a+b,0)/all.length;
    const current=Math.trunc(raw);
    const nextMilestone=current-(current%5)+5;
    const prevMilestone=nextMilestone-5;
    const pct=Math.max(0,Math.min(100,((raw-prevMilestone)/5)*100));
    return{raw,current,prevMilestone,nextMilestone,pct};
  }

  // "Beat the high average bowler" — the giant for a given week is whoever
  // has the highest cumulative average using ONLY data from strictly BEFORE
  // that week (never that week's own results) — the giant is crowned before
  // the challenge, not decided by the outcome being compared against. This
  // also means the very first week ever logged has no giant at all yet
  // (there's no prior data to crown one from), which is correct: the first
  // week sets the baseline, the challenge starts in week two. Once a week's
  // giant is determined, it's locked in permanently — if the title changes
  // hands in a later week, earlier weeks are never retroactively recomputed
  // against the new giant.
  function cumulativeAvgBeforeDate(bowler,league,beforeDate){
    const all=sessions.filter(s=>s.bowler===bowler&&s.league===league&&s.date<beforeDate).flatMap(s=>s.scores);
    if(!all.length)return null;
    return all.reduce((a,b)=>a+b,0)/all.length;
  }
  function beatHighBowlerStats(league){
    const dates=[...new Set(sessions.filter(s=>s.league===league).map(s=>s.date))].sort();
    const tally={};
    function ensure(b){if(!tally[b])tally[b]={won:0,total:0,weeksAsHigh:0};}
    dates.forEach(date=>{
      const priorBowlers=[...new Set(sessions.filter(s=>s.league===league&&s.date<date).map(s=>s.bowler))];
      if(!priorBowlers.length)return; // first week ever — no prior data, no giant yet
      let highBowler=null,highAvg=-Infinity;
      priorBowlers.forEach(b=>{
        const avg=cumulativeAvgBeforeDate(b,league,date);
        if(avg!=null&&avg>highAvg){highAvg=avg;highBowler=b;}
      });
      if(!highBowler)return;
      const weekSessions=sessions.filter(s=>s.league===league&&s.date===date);
      const highSession=weekSessions.find(s=>s.bowler===highBowler);
      if(!highSession)return; // reigning giant didn't bowl this week — title carries over, no comparison this week
      ensure(highBowler);
      tally[highBowler].weeksAsHigh++;
      weekSessions.forEach(s=>{
        if(s.bowler===highBowler)return; // don't compare the giant to themselves
        ensure(s.bowler);
        for(let i=0;i<3;i++){
          const mine=s.scores[i],theirs=highSession.scores[i];
          if(mine!=null&&theirs!=null){
            tally[s.bowler].total++;
            if(mine>theirs)tally[s.bowler].won++;
          }
        }
      });
    });
    return tally;
  }

  // "Hung" — in a given (league, date, game, frame), if every bowler who
  // logged that frame struck except exactly one, that one bowler is hung.
  function hungCounts(league){
    const groups={};
    shots.filter(s=>(!league||s.league===league)&&(!s.ballNum||s.ballNum===1)).forEach(s=>{
      const key=`${s.league}|${s.date}|${s.game}|${s.frame}`;
      (groups[key]=groups[key]||[]).push(s);
    });
    const counts={};
    Object.values(groups).forEach(group=>{
      if(group.length<2)return;
      const nonStrikers=group.filter(s=>s.result!=="Strike");
      if(nonStrikers.length===1){
        const bowler=nonStrikers[0].bowler;
        counts[bowler]=(counts[bowler]||0)+1;
      }
    });
    return counts;
  }
  // Standard deviation of game scores — how consistent a bowler (or team) is
  // night to night, independent of what the average itself is. Two bowlers
  // can share a 180 average while one always shoots 170-190 and the other
  // swings 140-220; this is what tells them apart. Lower = steadier.
  // For an individual, this uses their own game scores. For a team (bowler
  // === ""), it uses actual TEAM GAME TOTALS — the combined score across the
  // whole team for each date+game — not every bowler's individual scores
  // pooled together, which would measure the spread of individual
  // performances rather than the team's actual combined-score volatility.
  function scoreValues(bowler,league,teamId){
    return bowler
      ?sessions.filter(s=>s.bowler===bowler&&(league?s.league===league:true)).flatMap(s=>s.scores)
      :teamDateGroups(teamId).flatMap(g=>g.gameTotals.filter(v=>v!=null));
  }
  function scoreConsistency(bowler,league,teamId){
    const all=scoreValues(bowler,league,teamId);
    if(all.length<2)return null;
    const mean=all.reduce((a,b)=>a+b,0)/all.length;
    const variance=all.reduce((a,b)=>a+(b-mean)**2,0)/all.length;
    return{stdDev:Math.round(Math.sqrt(variance)*10)/10,min:Math.min(...all),max:Math.max(...all),games:all.length};
  }
  // Bins an array of numbers into a fixed number of roughly-equal-width
  // buckets for a histogram — used to show the actual SHAPE of a score
  // distribution, which a single std-dev number can't convey (tightly
  // bunched around the average vs. a long tail of bad nights look the same
  // in a std-dev figure but very different in a histogram).
  function histogramBuckets(values,bucketCount=8){
    if(!values.length)return[];
    const min=Math.min(...values),max=Math.max(...values);
    if(min===max)return[{label:String(min),count:values.length}];
    const width=Math.max(1,Math.ceil((max-min+1)/bucketCount));
    const counts={};
    values.forEach(v=>{
      const start=min+Math.floor((v-min)/width)*width;
      counts[start]=(counts[start]||0)+1;
    });
    return Object.keys(counts).map(Number).sort((a,b)=>a-b).map(start=>({
      label:width===1?String(start):`${start}-${start+width-1}`,
      count:counts[start],
    }));
  }
  // Average score at a specific position in the night (gameIdx 0/1/2 = Game
  // 1/2/3), across every session logged so far this season. bowler==="" pools
  // every bowler's individual game scores together — this is a per-person
  // average (e.g. "the average bowler on this team scores 191"), NOT the
  // team's combined total. See teamGameTotalAvg/teamGameTotalAvgAt below for
  // the actual team-total companion figure.
  function gameAvg(bowler,gameIdx,league){
    const ls=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true));
    const vals=ls.map(s=>s.scores[gameIdx]).filter(v=>v!=null);
    if(!vals.length)return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  }

  // Team's average COMBINED total per game — every bowler's score for that
  // game, summed, then averaged across nights. This is the companion to
  // gameAvg's per-person average: gameAvg answers "what does the average
  // bowler score," this answers "what does the team score together." Built
  // from the same teamDateGroups concept already used for Team High
  // Game/Series and Score Consistency, so it stays consistent with those.
  // Truncated rather than rounded — a whole number, but never bumped up past
  // what was actually earned the way rounding up would.
  function teamGameTotalAvgAt(teamId,gameIdx){
    const vals=teamDateGroups(teamId).map(g=>g.gameTotals[gameIdx]).filter(v=>v!=null);
    if(!vals.length)return null;
    return Math.trunc(vals.reduce((a,b)=>a+b,0)/vals.length);
  }
  // Same idea but pooling all 3 game positions together — the team-total
  // companion to rAvg's per-person combined average.
  function teamGameTotalAvg(teamId){
    const vals=teamDateGroups(teamId).flatMap(g=>g.gameTotals.filter(v=>v!=null));
    if(!vals.length)return null;
    return Math.trunc(vals.reduce((a,b)=>a+b,0)/vals.length);
  }

  // Longest run of consecutive strikes for a bowler this season. Strikes
  // carry across game boundaries within the same night (e.g. striking out
  // game 1 and opening game 2 with strikes continues the streak), but reset
  // between different nights (league+date), since those aren't consecutive
  // deliveries in real life.
  function longestStrikeStreak(bowler){
    const bowlerShots=bowler?shots.filter(s=>s.bowler===bowler):[];
    const nights={};
    bowlerShots.forEach(s=>{
      const key=`${s.league}|${s.date}`;
      (nights[key]=nights[key]||[]).push(s);
    });
    let best=0;
    Object.values(nights).forEach(nightShots=>{
      const ordered=[...nightShots].sort((a,b)=>{
        const ga=parseInt(a.game),gb=parseInt(b.game);
        if(ga!==gb)return ga-gb;
        const fa=parseInt(a.frame),fb=parseInt(b.frame);
        if(fa!==fb)return fa-fb;
        return(a.ballNum||0)-(b.ballNum||0);
      });
      let run=0;
      ordered.forEach(s=>{
        if(s.result==="Strike"){run++;if(run>best)best=run;}
        else{run=0;}
      });
    });
    return best;
  }

  // Cumulative running-average trend over the season, one point per date.
  // metric: 0/1/2 = that game's score, "weekly" = the night's overall average.
  // bowler==="" pools every bowler together (team); league==="" blends both
  // leagues. On a shared date with multiple bowlers, each date's value is the
  // average ACROSS those bowlers for that night before folding into the
  // running average — this works identically whether there's one bowler
  // (individual trend) or many (team trend).
  function trendData(bowler,league,metric){
    const ls=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true));
    const byDate={};
    ls.forEach(s=>{(byDate[s.date]=byDate[s.date]||[]).push(s);});
    const dates=Object.keys(byDate).sort();
    let sum=0,count=0;
    const points=[];
    for(const date of dates){
      const dayVals=byDate[date].map(s=>metric==="weekly"?s.average:s.scores[metric]).filter(v=>v!=null);
      if(!dayVals.length)continue;
      const dayAvg=dayVals.reduce((a,b)=>a+b,0)/dayVals.length;
      sum+=dayAvg;count++;
      points.push({date,value:Math.round((sum/count)*10)/10});
    }
    return points;
  }

  // Every match with both a handicap value AND at least one result marked,
  // sorted by handicap ascending — the raw data for "do we do better closer
  // to scratch or with a big handicap" analysis.
  function handicapMatches(league){
    return matches
      .filter(m=>!league||m.league===league)
      .map(m=>{
        const h=parseFloat(matchHandicap(m));
        if(isNaN(h))return null;
        const pointsAvailable=m.games.filter(v=>v!==null).length+(m.series!==null?1:0);
        if(!pointsAvailable)return null;
        const pointsWon=m.games.filter(v=>v===true).length+(m.series===true?1:0);
        return{handicap:h,pointsWon,pointsAvailable,rate:Math.round((pointsWon/pointsAvailable)*100),date:m.date,opponent:m.opponent,league:m.league};
      })
      .filter(Boolean)
      .sort((a,b)=>a.handicap-b.handicap);
  }

  // Splits matches into "smaller handicap" (closer to scratch) vs "larger
  // handicap" halves by median, and compares the points-won rate for each —
  // directly answers whether performance tracks handicap size.
  function handicapSplit(league){
    const data=handicapMatches(league);
    if(data.length<2)return null;
    const mid=Math.ceil(data.length/2);
    const smaller=data.slice(0,mid),larger=data.slice(mid);
    const rateOf=g=>{
      const won=g.reduce((a,m)=>a+m.pointsWon,0),avail=g.reduce((a,m)=>a+m.pointsAvailable,0);
      return avail?Math.round((won/avail)*100):null;
    };
    const avgHandicapOf=g=>Math.round(g.reduce((a,m)=>a+m.handicap,0)/g.length);
    return{
      smaller:{rate:rateOf(smaller),avgHandicap:avgHandicapOf(smaller),count:smaller.length},
      larger:{rate:rateOf(larger),avgHandicap:avgHandicapOf(larger),count:larger.length},
    };
  }

  const curSession=[...sessions].reverse().find(s=>s.bowler===activeBowler&&s.league===sessionLeague&&s.date===sessionDate);
  const currentLane=calcLane(startingLane,form.game,form.frame,form.ballNum);
  const inTenth=parseInt(form.frame)===10;

  // Which 10th-frame ball numbers are legitimately selectable right now.
  // A non-strike + spare on ball 1 means ball 2 WAS the spare conversion —
  // there is no separate "ball 2" shot to log, so it's never offered.
  function tenthBallOptions(){
    const f10shots=shots.filter(s=>s.bowler===form.bowler&&s.game===form.game&&parseInt(s.frame)===10);
    const b1=f10shots.find(s=>(!s.ballNum||s.ballNum===1));
    if(!b1)return[1];
    if(isStk(b1)){
      const b2=f10shots.find(s=>s.ballNum===2);
      if(!b2)return[2]; // ball 2 not yet played — that's the only open slot
      if(isStk(b2))return[3]; // rack cleared again — a genuine bonus ball is owed
      return[]; // ball 2 wasn't a strike — it bundles its own spare attempt, frame's done
    }
    if(b1.spareMade==="Yes")return[3];
    if(b1.spareMade==="No")return[];
    return[2];
  }
  const tenthOptions=tenthBallOptions();

  useEffect(()=>{
    if(editingId)return;
    if(inTenth&&form.ballNum&&!tenthOptions.includes(form.ballNum)&&tenthOptions.length>0){
      set("ballNum",tenthOptions[0]);
    }
  },[inTenth,form.game,form.bowler,form.ballNum,shots]);
  const ballNumLabel=inTenth?` · Ball ${form.ballNum||1}`:"";

  const g1score=getGameStrict(activeBowler,sessionLeague,sessionDate,1);
  const g2score=getGameStrict(activeBowler,sessionLeague,sessionDate,2);
  const g3score=getGameStrict(activeBowler,sessionLeague,sessionDate,3);
  const sessionTotal=getSessionTotal();

  // ── Stats ─────────────────────────────────────────────────────────────────
  // statsBowler === "" means Team/combined (everyone's shots together)
  const statsShots=shots.filter(s=>(statsBowler?s.bowler===statsBowler:true)&&(statsLeague?s.league===statsLeague:true));
  const filtered=shots.filter(s=>{
    if(filterBowler&&s.bowler!==filterBowler)return false;
    if(filterBall.startsWith("__")){if(s.league!==filterBall.slice(2))return false;}
    else if(filterBall&&s.ball!==filterBall)return false;
    if(filterResult&&s.result!==filterResult)return false;
    return true;
  });
  const tot=statsShots.length;
  const stk=statsShots.filter(s=>s.result==="Strike").length;
  const stkR=tot?Math.round((stk/tot)*100):0;
  const wk=statsShots.filter(s=>s.result==="Weak 10").length;
  const rng=statsShots.filter(s=>s.result==="Ringing 10").length;
  // Spare % excludes splits — splits are tracked as their own conversion
  // rate below, and folding them into the general spare rate understates
  // how well someone is converting the regular, non-split leaves. This
  // matches the standard convention (and LaneTalk).
  const spAtt=statsShots.filter(s=>s.result!=="Strike"&&s.spareMade!==""&&!isSplit(s));
  const spMade=spAtt.filter(s=>s.spareMade==="Yes").length;
  const spR=spAtt.length?Math.round((spMade/spAtt.length)*100):0;
  const splitShots=statsShots.filter(isSplit);
  const splitCount=splitShots.length;
  const splitR=tot?Math.round((splitCount/tot)*100):0;
  const splitConverted=splitShots.filter(s=>s.spareMade==="Yes").length;
  const splitConvR=splitCount?Math.round((splitConverted/splitCount)*100):0;
  const tenPinAttempts=statsShots.filter(s=>isTenPinLeave(s)&&s.spareMade!=="");
  const tenPinMade=tenPinAttempts.filter(s=>s.spareMade==="Yes").length;
  const tenPinSpareR=tenPinAttempts.length?Math.round((tenPinMade/tenPinAttempts.length)*100):0;
  const tenPinLeaveCount=statsShots.filter(isTenPinLeave).length;
  const singlePinAttempts=statsShots.filter(s=>isSinglePinLeave(s)&&s.spareMade!=="");
  const singlePinMade=singlePinAttempts.filter(s=>s.spareMade==="Yes").length;
  const singlePinSpareR=singlePinAttempts.length?Math.round((singlePinMade/singlePinAttempts.length)*100):0;
  const frameShots=statsShots.filter(s=>!s.ballNum||s.ballNum===1);
  const cleanFrameCount=frameShots.filter(s=>s.result==="Strike"||s.spareMade==="Yes").length;
  const cleanFrameR=frameShots.length?Math.round((cleanFrameCount/frameShots.length)*100):0;

  // Weighted frame-quality score (0-100), strict priority order:
  //   Strike (100)
  //   > non-split spare, ranked by how few pins were left (a leave that's
  //     mostly cleared on ball 1, e.g. a lone 10-pin, scores near the top
  //     of this band; a leave needing more pins covered scores near the
  //     bottom of it — but every non-split spare still outscores every
  //     split spare)
  //   > split spare, ranked the same way within its own lower band
  //   > open, ranked by total pinfall (0-9)
  // Each tier gets its own fixed band so a lower tier can never outscore a
  // higher one no matter the pin count — e.g. a converted 7-pin split still
  // beats every open frame, but loses to every made non-split spare.
  function frameQualityScore(s){
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

  // Clean-frame rate broken out by FRAME NUMBER (1-10) instead of aggregated
  // or by game — answers "is there a specific spot in every game where I
  // tend to leave pins" (lane transition, warm-up, 9th-frame score-math
  // lapse), a different axis than Game-by-Game Averages. Each frame number
  // only gets one sample per game played, so this needs real volume before
  // it means anything — 20 games (~6-7 nights) is the threshold below which
  // it's flagged as unreliable rather than hidden outright, since the
  // recording itself doesn't cost anything to keep running in the meantime.
  const FRAME_POSITION_RELIABILITY_THRESHOLD=20;
  function framePositionStats(dataset){
    const stats=[];
    for(let f=1;f<=10;f++){
      const atF=dataset.filter(s=>parseInt(s.frame)===f&&(!s.ballNum||s.ballNum===1));
      const scoreVals=atF.map(frameQualityScore).filter(v=>v!=null);
      const avgScore=scoreVals.length?Math.round((scoreVals.reduce((a,b)=>a+b,0)/scoreVals.length)*10)/10:null;
      stats.push({frame:f,total:atF.length,avgScore});
    }
    return stats;
  }
  const framePosition=framePositionStats(statsShots);
  const framePositionGamesLogged=framePosition[0]?.total||0;
  const framePositionReliable=framePositionGamesLogged>=FRAME_POSITION_RELIABILITY_THRESHOLD;

  // Every genuinely "fresh rack" delivery — not just each frame's official
  // first ball, but also any 10th-frame bonus ball thrown at a full reset
  // rack. A 10th-frame ball 2 only ever exists in this data when ball 1 was
  // a strike, so it's always a fresh rack. Ball 3 is a fresh rack unless a
  // ball 2 exists and wasn't a strike (in which case it's a fill attempt at
  // whatever ball 2 left, not a fresh rack). This is what makes the count
  // range from 30 up to 36 across a 3-game series, matching LaneTalk.
  function freshRackShots(dataset){
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
  const freshRackCount=freshRackShots(statsShots);

  // First-Ball Average — standard definition, every fresh-rack delivery
  // counted with a strike scored as 10. This is the industry-standard
  // metric (matches LaneTalk and most scoring apps), so it's directly
  // comparable elsewhere.
  const allFirstBalls=freshRackCount.map(firstBallOf).filter(v=>v!=null);
  const firstBallAvg=allFirstBalls.length?(allFirstBalls.reduce((a,b)=>a+b,0)/allFirstBalls.length):null;

  // Leave Average — pins on ball 1 (or any fresh-rack ball) when it's NOT a
  // strike. Strike % is binary; this isolates how good the leave actually is
  // on a miss.
  const nonStrikeFirstBalls=freshRackCount.filter(s=>s.result!=="Strike").map(firstBallOf).filter(v=>v!=null);
  const leaveAvg=nonStrikeFirstBalls.length?(nonStrikeFirstBalls.reduce((a,b)=>a+b,0)/nonStrikeFirstBalls.length):null;

  // Split breakdown by specific pin combination (e.g. "5-7", "2-4-5"), not
  // just the aggregate split rate — shows which leaves actually recur.
  function splitBreakdown(dataset){
    const groups={};
    dataset.filter(isSplit).forEach(s=>{
      const key=(Array.isArray(s.otherLeave)?s.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap").map(Number).sort((a,b)=>a-b).join("-");
      if(!groups[key])groups[key]={key,count:0,converted:0};
      groups[key].count++;
      if(s.spareMade==="Yes")groups[key].converted++;
    });
    return Object.values(groups).map(g=>({...g,rate:g.count?Math.round(g.converted/g.count*100):0}))
      .sort((a,b)=>b.count-a.count);
  }
  const splitBreakdownList=splitBreakdown(statsShots);

  // Breakdown of every recurring NON-split leave (e.g. "2-4-5"), single or
  // multi-pin — how often it happens and how often it's converted. Weak 10 /
  // Ringing 10 fold into "10" since they're the same physical leave.
  function nonSplitLeaveBreakdown(dataset){
    const groups={};
    dataset.forEach(s=>{
      if(s.result==="Strike")return;
      if(isSplit(s))return; // already covered by the split breakdown
      let key;
      if(s.result==="Weak 10"||s.result==="Ringing 10"){
        key="10";
      } else if(s.result==="Other Leave"){
        const pins=(Array.isArray(s.otherLeave)?s.otherLeave:[]).filter(p=>p!=="9 Pin No-Tap").map(Number).sort((a,b)=>a-b);
        if(!pins.length)return;
        key=pins.join("-");
      } else return;
      if(!groups[key])groups[key]={key,count:0,converted:0};
      groups[key].count++;
      if(s.spareMade==="Yes")groups[key].converted++;
    });
    return Object.values(groups).map(g=>({...g,rate:g.count?Math.round(g.converted/g.count*100):0}))
      .sort((a,b)=>b.count-a.count);
  }
  const nonSplitLeaveList=nonSplitLeaveBreakdown(statsShots);

  const isTeamView=!statsBowler&&bowlers.length>1;
  // How many distinct leagues the currently-viewed bowler has played — if
  // it's just one, "Combined" would be identical to that single league's
  // average, so there's no point showing it twice.
  const bowlerLeagueCount=statsBowler?new Set(sessions.filter(s=>s.bowler===statsBowler).map(s=>s.league)).size:0;

  // Comparison baseline is fully opt-in via "Compare To" — "None" is a real
  // default (no comparison, no badges) rather than silently comparing to a
  // blended team. Pick a specific bowler (compareBowler) or a specific
  // league's team (compareLeague, e.g. Tuesday Team vs Thursday Team).
  const compareShots=compareBowler
    ?shots.filter(s=>s.bowler===compareBowler)
    :compareLeague
      ?shots.filter(s=>s.league===compareLeague)
      :shots; // unused when showTeamCompare is false
  const teamTot=compareShots.length;
  const teamStkR=teamTot?Math.round((compareShots.filter(s=>s.result==="Strike").length/teamTot)*100):0;
  const teamSpAtt=compareShots.filter(s=>s.result!=="Strike"&&s.spareMade!==""&&!isSplit(s));
  const teamSpR=teamSpAtt.length?Math.round((teamSpAtt.filter(s=>s.spareMade==="Yes").length/teamSpAtt.length)*100):0;
  const teamSplitShotsAll=compareShots.filter(isSplit);
  const teamSplitR=teamTot?Math.round((teamSplitShotsAll.length/teamTot)*100):0;
  const teamSplitConvR=teamSplitShotsAll.length?Math.round((teamSplitShotsAll.filter(s=>s.spareMade==="Yes").length/teamSplitShotsAll.length)*100):0;
  const teamTenPinAttemptsAll=compareShots.filter(s=>isTenPinLeave(s)&&s.spareMade!=="");
  const teamTenPinSpareR=teamTenPinAttemptsAll.length?Math.round((teamTenPinAttemptsAll.filter(s=>s.spareMade==="Yes").length/teamTenPinAttemptsAll.length)*100):0;
  const teamTenPinRate=teamTot?Math.round((compareShots.filter(isTenPinLeave).length/teamTot)*100):0;
  const teamSinglePinAttemptsAll=compareShots.filter(s=>isSinglePinLeave(s)&&s.spareMade!=="");
  const teamSinglePinSpareR=teamSinglePinAttemptsAll.length?Math.round((teamSinglePinAttemptsAll.filter(s=>s.spareMade==="Yes").length/teamSinglePinAttemptsAll.length)*100):0;
  const teamFrameShotsAll=compareShots.filter(s=>!s.ballNum||s.ballNum===1);
  const teamCleanFrameR=teamFrameShotsAll.length?Math.round((teamFrameShotsAll.filter(s=>s.result==="Strike"||s.spareMade==="Yes").length/teamFrameShotsAll.length)*100):0;
  const teamFreshRackCount=freshRackShots(compareShots);
  const teamAllFirstBalls=teamFreshRackCount.map(firstBallOf).filter(v=>v!=null);
  const teamFirstBallAvg=teamAllFirstBalls.length?(teamAllFirstBalls.reduce((a,b)=>a+b,0)/teamAllFirstBalls.length):null;
  const teamNonStrikeFirstBalls=teamFreshRackCount.filter(s=>s.result!=="Strike").map(firstBallOf).filter(v=>v!=null);
  const teamLeaveAvg=teamNonStrikeFirstBalls.length?(teamNonStrikeFirstBalls.reduce((a,b)=>a+b,0)/teamNonStrikeFirstBalls.length):null;
  const showTeamCompare=!!compareBowler||!!compareLeague;
  const compareLabel=compareBowler||(compareLeague?compareLeague.replace(" House Shot",""):"");
  const hideIndividualOnly=isTeamView||!!compareBowler;
  const SHOT_SAMPLE_THRESHOLD=20;
  const bStats=ballUniverse(statsBowler).map(ball=>{
    const bs=statsShots.filter(s=>s.ball===ball);
    const bSt=bs.filter(s=>s.result==="Strike").length;
    const nonStrike=bs.filter(s=>s.result!=="Strike");
    const leaveVals=nonStrike.map(firstBallOf).filter(v=>v!=null);
    const leaveAvg=leaveVals.length?Math.round((leaveVals.reduce((a,b)=>a+b,0)/leaveVals.length)*10)/10:null;
    const tenPin=bs.filter(isTenPinLeave).length;
    const splits=bs.filter(isSplit).length;
    const spAtt=bs.filter(s=>s.result!=="Strike"&&s.spareMade!==""&&!isSplit(s));
    const spMade=spAtt.filter(s=>s.spareMade==="Yes").length;
    return{
      ball,total:bs.length,strikes:bSt,
      rate:bs.length?Math.round((bSt/bs.length)*100):null,
      wk:bs.filter(s=>s.result==="Weak 10").length,
      leaveAvg,
      tenPinRate:bs.length?Math.round((tenPin/bs.length)*100):null,
      splitRate:bs.length?Math.round((splits/bs.length)*100):null,
      spareRate:spAtt.length?Math.round((spMade/spAtt.length)*100):null,
      reliable:bs.length>=SHOT_SAMPLE_THRESHOLD,
    };
  }).filter(b=>b.total>0);
  const mCounts=MISSES.map(m=>({miss:m,count:statsShots.filter(s=>Array.isArray(s.miss)?s.miss.includes(m):s.miss===m).length})).filter(m=>m.count>0);

  return(
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.title}>🎳 Shot Tracker</div>
        <div style={S.nav}>
          {["log","history","stats","teams"].map(v=>(
  <button key={v} style={S.navBtn(view===v)} onClick={()=>setView(v)}>
    {v==="log"?"Log":v==="history"?"History":v==="stats"?"Stats":"Teams"}
  </button>
))}
        </div>
      </div>

      <div style={S.content}>
        
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TEAMS VIEW                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="teams"&&(
          <TeamManagement
            bowlers={bowlers}
            setBowlers={setBowlers}
            leagues={LEAGUES}
            lineupOrder={LINEUP_ORDER}
            onTeamsChange={setTeams}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LOG VIEW                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="log"&&(
          <>
            {/* Edit banner */}
            {editingId&&(
              <div style={{backgroundColor:C.spare+"22",border:`1px solid ${C.spare}44`,borderRadius:"10px",padding:"12px 16px",marginBottom:"12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:"13px",color:C.spare,fontWeight:600}}>✏️ Editing Shot</div>
                <button style={{...S.btn(),padding:"6px 12px",fontSize:"12px"}} onClick={cancelEdit}>Cancel</button>
              </div>
            )}

            {/* Session card */}
            {!editingId&&(
              <div style={S.card}>
                <div style={S.label}>Who's Bowling</div>
                <div style={S.chips}>
                  {bowlers.map(b=>(
                    <Chip key={b} label={b} selected={activeBowler===b} onToggle={()=>selectBowler(b)} color={C.accent}/>
                  ))}
                </div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Add a bowler's name" value={newBowlerName}
                    onChange={e=>setNewBowlerName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")addBowler();}}/>
                  <button style={S.btn("sm")} onClick={addBowler}>+</button>
                </div>
                {activeBowler&&bowlers.length>0&&(
                  <div style={{marginTop:"8px"}}>
                    <button style={{...S.btn(),padding:"4px 10px",fontSize:"11px",color:C.miss,borderColor:C.miss+"44"}}
                      onClick={()=>removeBowler(activeBowler)}>Remove "{activeBowler}"</button>
                  </div>
                )}
                {!activeBowler&&(
                  <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>Add and select a bowler to start logging shots.</div>
                )}
              </div>
            )}

            {/* Arsenal card */}
            {!editingId&&activeBowler&&(
              <div style={S.card}>
                <div style={S.label}>{activeBowler}'s Arsenal</div>
                <div style={S.chips}>
                  {(arsenals[activeBowler]||[]).map(b=>(
                    <Chip key={b} label={`${b}  ×`} selected onToggle={()=>removeBall(activeBowler,b)} color={C.accent}/>
                  ))}
                </div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Add a ball (e.g. Storm Phaze II)" value={newBallName}
                    onChange={e=>setNewBallName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")addBall();}}/>
                  <button style={S.btn("sm")} onClick={addBall}>+</button>
                </div>
                {(arsenals[activeBowler]||[]).length===0&&(
                  <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>Add {activeBowler}'s balls to start logging shots. Tap a ball above to remove it.</div>
                )}
              </div>
            )}

            {/* Session card */}
            {!editingId&&activeBowler&&(
              <div style={S.card}>
                <div style={S.label}>Tonight's Session</div>
                <div style={S.chips}>
                  {LEAGUES.map(l=>(
                    <Chip key={l} label={l.replace(" House Shot","")} selected={sessionLeague===l}
                      onToggle={()=>{const team=teams.find(t=>t.league===l&&t.members.includes(activeBowler));setSessionLeague(l);setForm(f=>({...f,league:l,teamId:team?.id||"",date:sessionDate}));setShowSummary(false);}}/>
                  ))}
                </div>
                <div style={{marginBottom:"10px"}}>
                  <input style={S.input} type="date" value={sessionDate}
                    onChange={e=>{setSessionDate(e.target.value);set("date",e.target.value);setShowSummary(false);}}/>
                </div>

                {/* Starting lane */}
                <div style={{marginBottom:"12px"}}>
                  <div style={S.label}>Starting Lane</div>
                  <div style={S.row}>
                    <input style={{...S.input,flex:1,textAlign:"center",fontSize:"18px",fontWeight:700}}
                      type="number" placeholder="e.g. 8" value={startingLane}
                      onChange={e=>setStartingLane(e.target.value)}/>
                    {startingLane&&(()=>{
                      const l=parseInt(startingLane),p=l%2===0?l-1:l+1;
                      return(
                        <div style={{flex:2,backgroundColor:C.surface,borderRadius:"8px",padding:"8px 12px",border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:"13px",fontWeight:600,color:C.accent}}>Lanes {Math.min(l,p)} & {Math.max(l,p)}</div>
                          <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>
                            G1F1→{startingLane} · G1F10→{calcLane(startingLane,1,10)||"?"} · G2F1→{calcLane(startingLane,2,1)||"?"}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Lane conditions (oil pattern) — one entry per physical lane in
                    tonight's pair, since leagues sometimes run a different
                    pattern on each lane of the pair. Defaults to House Shot
                    implicitly; no record exists until something is changed. */}
                {startingLane&&sessionLeague&&(()=>{
                  const l=parseInt(startingLane),p=l%2===0?l-1:l+1;
                  const lanesToShow=[...new Set([l,p])].filter(n=>!isNaN(n));
                  const renderLaneRow=(lane)=>{
                    const rec=getLanePattern(sessionLeague,sessionDate,lane)||{patternType:"house",patternName:"",length:"",volume:"",ratio:""};
                    const isOfficial=rec.patternType==="official";
                    return(
                      <div key={lane} style={{marginBottom:"10px"}}>
                        <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"4px"}}>Lane {lane}</div>
                        <div style={S.chips}>
                          <Chip label="House Shot" selected={!isOfficial} onToggle={()=>setLanePattern(sessionLeague,sessionDate,lane,{patternType:"house"})}/>
                          <Chip label="Official Pattern" selected={isOfficial} onToggle={()=>setLanePattern(sessionLeague,sessionDate,lane,{patternType:"official"})} color={C.spare}/>
                        </div>
                        {isOfficial&&(
                          <div style={{marginTop:"6px"}}>
                            <input style={{...S.input,marginBottom:"6px"}} placeholder="Pattern name (e.g. Kegel Main Street)"
                              value={rec.patternName} onChange={e=>setLanePattern(sessionLeague,sessionDate,lane,{patternName:e.target.value})}/>
                            <div style={S.row}>
                              <input style={{...S.input,flex:1}} type="number" placeholder="Length (ft)"
                                value={rec.length} onChange={e=>setLanePattern(sessionLeague,sessionDate,lane,{length:e.target.value})}/>
                              <input style={{...S.input,flex:1}} type="number" placeholder="Volume (mL)"
                                value={rec.volume} onChange={e=>setLanePattern(sessionLeague,sessionDate,lane,{volume:e.target.value})}/>
                              <input style={{...S.input,flex:1}} placeholder="Ratio (e.g. 3:1)"
                                value={rec.ratio} onChange={e=>setLanePattern(sessionLeague,sessionDate,lane,{ratio:e.target.value})}/>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };
                  return(
                    <div style={{marginBottom:"12px"}}>
                      <div style={S.label}>Lane Conditions</div>
                      {lanesToShow.map(renderLaneRow)}
                    </div>
                  );
                })()}

                {/* Live scores */}
                {sessionLeague&&(
                  <>
                    <div style={S.label}>Live Scores</div>
                    <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                      {[{lbl:"G1",score:g1score},{lbl:"G2",score:g2score},{lbl:"G3",score:g3score}].map(({lbl,score},i)=>(
                        <div key={i} style={S.statBox}>
                          <div style={{...S.statNum,fontSize:"20px",color:score!=null?C.text:C.textMuted}}>
                            {score!=null?score:"—"}
                          </div>
                          <div style={S.statLbl}>{lbl}</div>
                        </div>
                      ))}
                      <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                        <div style={{...S.statNum,fontSize:"20px",color:C.accent}}>
                          {sessionTotal!=null?sessionTotal:"—"}
                        </div>
                        <div style={S.statLbl}>Total</div>
                      </div>
                    </div>
                    <button style={S.btn("primary")} onClick={submitSession}>
                      Save Session & View Summary
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Summary */}
            {!editingId&&showSummary&&curSession&&(()=>{
              const cs=curSession;
              const sr=cs.shotCount?Math.round((cs.strikes/cs.shotCount)*100):0;
              const spr=cs.spareAttempts?Math.round((cs.sparesMade/cs.spareAttempts)*100):0;
              const tA=rAvg(activeBowler,"Tuesday House Shot"),thA=rAvg(activeBowler,"Thursday House Shot"),cA=cAvg(activeBowler);
              const mDist=MISSES.map(m=>({m,c:cs.misses.filter(x=>x===m).length})).filter(x=>x.c>0);
              const gR=cs.releases.filter(r=>r==="Good").length,bR=cs.releases.filter(r=>r==="Bad").length,rT=cs.releases.length;
              return(
                <div style={{...S.card,border:`1px solid ${C.accent}44`}}>
                  <div style={{...S.label,color:C.accent}}>Summary — {cs.bowler?`${cs.bowler} · `:""}{cs.league.replace(" House Shot","")} · {cs.date}</div>
                  <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                    {cs.scores.map((s,i)=>(<div key={i} style={S.statBox}><div style={{...S.statNum,fontSize:"20px"}}>{s}</div><div style={S.statLbl}>G{i+1}</div></div>))}
                    <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                      <div style={{...S.statNum,fontSize:"20px",color:C.accent}}>{cs.total}</div>
                      <div style={S.statLbl}>Series</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                    <div style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:C.strike}}>{sr}%</div><div style={S.statLbl}>Strike %</div></div>
                    <div style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:C.spare}}>{spr}%</div><div style={S.statLbl}>Spare %</div></div>
                    <div style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:C.miss}}>{cs.tenPinLeaves??(cs.weakTens+cs.ringingTens)}</div><div style={S.statLbl}>10 Pins</div></div>
                  </div>
                  {(cs.weakTens>0||cs.ringingTens>0||cs.tenPinLeaves>0)&&(
                    <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                      <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.miss}}>{cs.weakTens}</div><div style={S.statLbl}>Weak 10s</div></div>
                      <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.spare}}>{cs.ringingTens}</div><div style={S.statLbl}>Ringing 10s</div></div>
                      {cs.tenPinLeaves>(cs.weakTens+cs.ringingTens)&&(
                        <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.textMuted}}>{cs.tenPinLeaves-cs.weakTens-cs.ringingTens}</div><div style={S.statLbl}>Other 10s</div></div>
                      )}
                    </div>
                  )}
                  {cs.splits>0&&(
                    <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                      <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.miss}}>{cs.splits}</div><div style={S.statLbl}>Splits</div></div>
                      <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.strike}}>{Math.round((cs.splitsConverted/cs.splits)*100)}%</div><div style={S.statLbl}>Converted</div></div>
                    </div>
                  )}
                  {cs.ballsUsed.length>0&&(<div style={{marginBottom:"10px"}}><div style={S.label}>Balls Used</div><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{cs.ballsUsed.map(b=><span key={b} style={S.tag()}>{b}</span>)}</div></div>)}
                  {rT>0&&(
                    <div style={{marginBottom:"10px"}}>
                      <div style={S.label}>Release Quality</div>
                      <div style={{display:"flex",gap:"6px"}}>
                        <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.strike}}>{rT?Math.round((gR/rT)*100):0}%</div><div style={S.statLbl}>Good</div></div>
                        <div style={S.statBox}><div style={{...S.statNum,fontSize:"16px",color:C.miss}}>{rT?Math.round((bR/rT)*100):0}%</div><div style={S.statLbl}>Bad</div></div>
                      </div>
                    </div>
                  )}
                  {mDist.length>0&&(<div style={{marginBottom:"12px"}}><div style={S.label}>Misses</div><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{mDist.map(x=><span key={x.m} style={S.tag(C.miss)}>{x.m}: {x.c}</span>)}</div></div>)}
                  <div style={S.divider}/>
                  <div style={S.label}>Running Averages</div>
                  <div style={{display:"flex",gap:"6px"}}>
                    {tA&&<div style={S.statBox}><div style={{...S.statNum,fontSize:"18px"}}>{tA}</div><div style={S.statLbl}>Tuesday</div></div>}
                    {thA&&<div style={S.statBox}><div style={{...S.statNum,fontSize:"18px"}}>{thA}</div><div style={S.statLbl}>Thursday</div></div>}
                    {cA&&<div style={{...S.statBox,border:`1px solid ${C.accent}44`}}><div style={{...S.statNum,fontSize:"18px",color:C.accent}}>{cA}</div><div style={S.statLbl}>Combined</div></div>}
                  </div>
                </div>
              );
            })()}

            {!editingId&&<div style={S.divider}/>}

            {/* Shot Context */}
            <div style={S.card}>
              <div style={S.label}>
                Shot Context
                {inTenth&&<span style={{color:C.spare,marginLeft:"8px"}}>10th Frame{ballNumLabel}</span>}
              </div>
              {!editingId&&(
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                  {activeBowler||"No bowler selected"} · {sessionLeague||"No league selected"} · {sessionDate}
                </div>
              )}
              {editingId&&(
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="League" value={form.league} onChange={e=>set("league",e.target.value)}/>
                  <input style={{...S.input,flex:1}} type="date" value={form.date} onChange={e=>set("date",e.target.value)}/>
                </div>
              )}

              {/* Game stepper */}
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"4px",textTransform:"uppercase",letterSpacing:"0.08em"}}>Game</div>
                  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                    <button style={S.btn("sm")} onClick={()=>{
                      const v=String(Math.max(1,(parseInt(form.game)||1)-1));
                      const line=!editingId?autoFillLine(form.ball,v,form.frame):{startingBoard:form.startingBoard,targetArrows:form.targetArrows};
                      setForm(p=>({...p,game:v,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
                    }}>−</button>
                    <div style={{flex:1,textAlign:"center",fontSize:"22px",fontWeight:700}}>{form.game||1}</div>
                    <button style={S.btn("sm")} onClick={()=>{
                      const v=String(Math.min(3,(parseInt(form.game)||1)+1));
                      const line=!editingId?autoFillLine(form.ball,v,form.frame):{startingBoard:form.startingBoard,targetArrows:form.targetArrows};
                      setForm(p=>({...p,game:v,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
                    }}>+</button>
                  </div>
                </div>

                {/* Frame stepper — max 10 */}
                <div style={{flex:1}}>
                  <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"4px",textTransform:"uppercase",letterSpacing:"0.08em"}}>Frame</div>
                  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                    <button style={S.btn("sm")} onClick={()=>{
                      const v=String(Math.max(1,(parseInt(form.frame)||1)-1));
                      const line=!editingId?autoFillLine(form.ball,form.game,v):{startingBoard:form.startingBoard,targetArrows:form.targetArrows};
                      setForm(p=>({...p,frame:v,ballNum:null,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
                    }}>−</button>
                    <div style={{flex:1,textAlign:"center",fontSize:"22px",fontWeight:700}}>{form.frame||1}</div>
                    <button style={S.btn("sm")} onClick={()=>{
                      const v=String(Math.min(10,(parseInt(form.frame)||1)+1));
                      const line=!editingId?autoFillLine(form.ball,form.game,v):{startingBoard:form.startingBoard,targetArrows:form.targetArrows};
                      setForm(p=>({...p,frame:v,ballNum:parseInt(v)===10?1:null,startingBoard:line.startingBoard,targetArrows:line.targetArrows}));
                    }}>+</button>
                  </div>
                </div>
              </div>

              {/* 10th frame ball selector */}
              {inTenth&&!editingId&&(
                <div style={{marginBottom:"10px"}}>
                  <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.08em"}}>Ball in 10th</div>
                  <div style={S.chips}>
                    {tenthOptions.map(n=>(
                      <Chip key={n} label={`Ball ${n}`} selected={form.ballNum===n} onToggle={()=>set("ballNum",n)} color={C.spare}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Lane display */}
              {!editingId&&startingLane&&(
                <div style={{textAlign:"center",padding:"10px",backgroundColor:C.surface,borderRadius:"8px",border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:"11px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Lane · </span>
                  <span style={{fontSize:"22px",fontWeight:700,color:C.accent}}>{currentLane||"—"}</span>
                </div>
              )}
              {editingId&&(
                <input style={S.input} placeholder="Lane" type="number" value={form.lane} onChange={e=>set("lane",e.target.value)}/>
              )}
            </div>

            {/* Equipment */}
            <div style={S.card}>
              <div style={S.label}>Ball</div>
              <div style={S.chips}>
                {(arsenals[form.bowler]||[]).map(b=><Chip key={b} label={b} selected={form.ball===b} onToggle={()=>editingId?set("ball",b):handleBallChange(b)}/>)}
              </div>
              {(arsenals[form.bowler]||[]).length===0&&(
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"12px"}}>
                  {form.bowler?`No balls in ${form.bowler}'s arsenal yet — add some above.`:"Select a bowler to see their arsenal."}
                </div>
              )}
              <div style={S.label}>Surface (grit)</div>
              <div style={S.chips}>
                {SURFACES.map(s=><Chip key={s} label={s} selected={form.surface===s} onToggle={()=>toggle("surface",s)}/>)}
              </div>
            </div>

            {/* Line */}
            <div style={S.card}>
              <div style={S.label}>Line{!editingId&&currentLane?` · Lane ${currentLane}`:""}{!editingId&&form.startingBoard&&form.targetArrows?" (stored)":""}</div>
              <div style={S.row}>
                <input style={{...S.input,flex:1}} placeholder="Starting Board" type="number"
                  value={form.startingBoard} onChange={e=>editingId?set("startingBoard",e.target.value):handleLineChange("startingBoard",e.target.value)}/>
                <input style={{...S.input,flex:1}} placeholder="Arrow Target" type="number"
                  value={form.targetArrows} onChange={e=>editingId?set("targetArrows",e.target.value):handleLineChange("targetArrows",e.target.value)}/>
              </div>
            </div>

            {/* Result */}
            <div style={S.card}>
              <div style={S.label}>Result</div>
              <div style={S.chips}>
                {RESULTS.map(r=>(
                  <Chip key={r} label={r} selected={form.result===r}
                    onToggle={()=>{
                      const newResult=form.result===r?"":r;
                      setForm(f=>({
                        ...f,
                        result:newResult,
                        otherLeave:newResult==="Other Leave"?f.otherLeave:[],
                        spareMade:"",
                        // Weak 10 / Ringing 10 always leave a single pin (the ten-pin):
                        // first ball = 9, and if missed, adds 0 — so the frame total is
                        // deterministic and doesn't need a manual pin-count entry.
                        pinCount:(newResult==="Weak 10"||newResult==="Ringing 10")?"9":"",
                      }));
                    }}
                    color={r==="Strike"?C.strike:r.includes("10")?C.miss:C.spare}/>
                ))}
              </div>

              {form.result==="Other Leave"&&(
                <>
                  <div style={S.label}>Pins Standing</div>
                  <div style={S.chips}>
                    {["1","2","3","4","5","6","7","8","9","10","9 Pin No-Tap"].map(p=>(
                      <Chip key={p} label={p}
                        selected={Array.isArray(form.otherLeave)&&form.otherLeave.includes(p)}
                        onToggle={()=>handleLeaveToggle(p)}
                        color={p==="9 Pin No-Tap"?C.strike:C.spare}/>
                    ))}
                  </div>
                  {isNoTap&&<div style={{fontSize:"13px",color:C.strike,fontWeight:600,marginTop:"4px"}}>9 Pin No-Tap → scored as Strike</div>}
                  {!isNoTap&&Array.isArray(form.otherLeave)&&form.otherLeave.length>0&&(
                    <div style={{fontSize:"13px",color:C.spare,fontWeight:600,marginTop:"4px"}}>
                      Leave: {[...form.otherLeave].sort((a,b)=>Number(a)-Number(b)).join("-")}
                      {standingPins>0&&<span style={{color:C.textMuted,fontWeight:400}}> · First ball: {firstBallPins}</span>}
                    </div>
                  )}
                </>
              )}

              {isStrike&&(
                <>
                  <div style={S.divider}/>
                  <div style={S.label}>Strike Description</div>
                  <div style={S.chips}>
                    {STRIKE_DESCRIPTIONS.map(d=>(
                      <Chip key={d} label={d} selected={form.strikeDescription===d} onToggle={()=>toggle("strikeDescription",d)} color={C.strike}/>
                    ))}
                  </div>
                </>
              )}

              {hasLeave&&!(inTenth&&form.ballNum===3)&&(
                <>
                  <div style={S.divider}/>
                  <div style={S.label}>Spare Made</div>
                  <div style={S.chips}>
                    {["Yes","No"].map(s=>(
                      <Chip key={s} label={s} selected={form.spareMade===s} onToggle={()=>handleSpareMadeToggle(s)}
                        color={s==="Yes"?C.strike:C.miss}/>
                    ))}
                  </div>
                </>
              )}

              {showPinCount&&(
                <>
                  <div style={S.divider}/>
                  <div style={S.label}>Total Pins This Frame</div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                    <button style={{...S.btn("sm"),padding:"10px 18px",fontSize:"20px"}} onClick={()=>stepPinCount(-1)}>−</button>
                    <div style={{flex:1,textAlign:"center",fontSize:"30px",fontWeight:700,color:C.spare}}>
                      {form.pinCount!==""?form.pinCount:"—"}
                    </div>
                    <button style={{...S.btn("sm"),padding:"10px 18px",fontSize:"20px"}} onClick={()=>stepPinCount(1)}>+</button>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-around",fontSize:"12px",color:C.textMuted}}>
                    <span>First ball: <strong style={{color:C.text}}>{firstBallPins}</strong></span>
                    <span>Second ball: <strong style={{color:C.text}}>{form.pinCount!==""?parseInt(form.pinCount)-firstBallPins:"—"}</strong></span>
                  </div>
                </>
              )}
            </div>

            {/* Release & Miss */}
            <CollapsibleCard
              title="Release & Miss"
              summary={[form.release,form.miss.length?`${form.miss.length} miss`:""].filter(Boolean).join(", ")}
              expanded={editingId?true:expandedSections.releaseMiss}
              onToggle={()=>toggleSection("releaseMiss")}>
              <div style={S.label}>Release</div>
              <div style={S.chips}>
                {RELEASES.map(r=>(
                  <Chip key={r} label={r} selected={form.release===r} onToggle={()=>toggle("release",r)}
                    color={r==="Good"?C.strike:r==="Bad"?C.miss:C.spare}/>
                ))}
              </div>
              <div style={S.divider}/>
              <div style={S.label}>Miss</div>
              <div style={S.chips}>
                {MISSES.map(m=>(
                  <Chip key={m} label={m} selected={form.miss.includes(m)} onToggle={()=>toggleMulti("miss",m)} color={C.miss}/>
                ))}
              </div>
            </CollapsibleCard>

            {/* Ball Change */}
            <CollapsibleCard
              title="Ball Change Reason"
              summary={form.ballChangeReason.length?`${form.ballChangeReason.length} selected`:""}
              expanded={editingId?true:expandedSections.ballChange}
              onToggle={()=>toggleSection("ballChange")}>
              <div style={S.chips}>
                {BALL_CHANGE_REASONS.map(r=>(
                  <Chip key={r} label={r} selected={form.ballChangeReason.includes(r)} onToggle={()=>toggleMulti("ballChangeReason",r)}/>
                ))}
              </div>
            </CollapsibleCard>

            {/* Notes */}
            <CollapsibleCard
              title="Notes"
              summary={form.notes?"✓":""}
              expanded={editingId?true:expandedSections.notes}
              onToggle={()=>toggleSection("notes")}>
              <textarea style={{...S.input,minHeight:"60px",resize:"vertical"}}
                placeholder="Optional notes..." value={form.notes} onChange={e=>set("notes",e.target.value)}/>
            </CollapsibleCard>

            <button style={S.btn("primary")} onClick={submitShot} disabled={!form.result||!form.bowler||needsSpareMade}>
              {saved?(editingId?"✓ Shot Updated":"✓ Shot Saved"):(editingId?"Update Shot":"Save Shot")}
            </button>
            {needsSpareMade&&(
              <div style={{fontSize:"12px",color:C.spare,marginTop:"8px",textAlign:"center"}}>Answer "Spare Made" above before saving — it directly affects the score.</div>
            )}
            {editingId&&(
              <button style={{...S.btn("warn"),marginTop:"8px"}} onClick={cancelEdit}>Cancel Edit</button>
            )}
            <div style={{height:"32px"}}/>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HISTORY VIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="history"&&(
          <>
            <div style={S.card}>
              <div style={S.label}>Filter</div>
              {bowlers.length>1&&(
                <div style={S.chips}>
                  {bowlers.map(b=>(
                    <Chip key={b} label={b} selected={filterBowler===b} onToggle={()=>setFilterBowler(filterBowler===b?"":b)}/>
                  ))}
                </div>
              )}
              <div style={S.chips}>
                {LEAGUES.map(l=>(
                  <Chip key={l} label={l.replace(" House Shot","")}
                    selected={filterBall==="__"+l} onToggle={()=>setFilterBall(filterBall==="__"+l?"":"__"+l)}/>
                ))}
              </div>
              <div style={S.row}>
                <select style={S.sel} value={filterBall.startsWith("__")?"":filterBall} onChange={e=>setFilterBall(e.target.value)}>
                  <option value="">All Balls</option>
                  {ballUniverse(filterBowler).map(b=><option key={b}>{b}</option>)}
                </select>
                <select style={S.sel} value={filterResult} onChange={e=>setFilterResult(e.target.value)}>
                  <option value="">All Results</option>
                  {RESULTS.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div style={{color:C.textMuted,fontSize:"12px"}}>{filtered.length} shots {filterBall||filterResult||filterBowler?"(filtered)":"total"}</div>
            </div>

            {filtered.length===0&&<div style={{textAlign:"center",color:C.textMuted,padding:"40px 0"}}>No shots logged yet.</div>}

            {[...filtered].reverse().map(shot=>(
              <div key={shot.id} style={S.shotCard}>
                <div style={S.dot(shot.result)}>{resultSym(shot._displayResult||shot.result)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
                    <div style={{fontSize:"12px",fontWeight:600}}>
                      {bowlers.length>1&&shot.bowler&&<span style={{color:C.accent}}>{shot.bowler} · </span>}
                      {shot.ball||"—"}
                      {shot.surface&&<span style={{color:C.textMuted,fontWeight:400}}> · {shot.surface}</span>}
                    </div>
                    <div style={{fontSize:"10px",color:C.textMuted,textAlign:"right"}}>
                      {shot.date}<br/>
                      G{shot.game} F{shot.frame}{shot.ballNum?` B${shot.ballNum}`:""} L{shot.lane}
                    </div>
                  </div>
                  <div style={{marginBottom:"4px"}}>
                    {shot.result&&(
                      <span style={S.tag(shot.result==="Strike"?C.strike:shot.result.includes("10")?C.miss:C.spare)}>
                        {shot._displayResult||shot.result}
                        {Array.isArray(shot._displayLeave)&&shot._displayLeave.filter(p=>p!=="9 Pin No-Tap").length>0
                          ?` (${shot._displayLeave.filter(p=>p!=="9 Pin No-Tap").sort((a,b)=>Number(a)-Number(b)).join("-")})`
                          :""}
                      </span>
                    )}
                    {shot.strikeDescription&&<span style={S.tag(C.strike)}>{shot.strikeDescription}</span>}
                    {shot.spareMade&&<span style={S.tag(shot.spareMade==="Yes"?C.strike:C.miss)}>Spare: {shot.spareMade}</span>}
                    {isSplit(shot)&&<span style={S.tag(C.miss)}>SPLIT</span>}
                    {shot.pinCount!==""&&shot.pinCount!==undefined&&<span style={S.tag(C.spare)}>{shot.pinCount} pins</span>}
                  </div>
                  <div style={{marginBottom:"4px"}}>
                    {shot.release&&<span style={S.tag(shot.release==="Good"?C.strike:shot.release==="Bad"?C.miss:C.spare)}>{shot.release}</span>}
                    {Array.isArray(shot.miss)&&shot.miss.length>0&&<span style={S.tag(C.miss)}>Miss: {shot.miss.join(", ")}</span>}
                  </div>
                  {shot.startingBoard&&<div style={{fontSize:"11px",color:C.textMuted}}>Board {shot.startingBoard} → Arrow {shot.targetArrows}</div>}
                  {Array.isArray(shot.ballChangeReason)&&shot.ballChangeReason.length>0&&(
                    <div style={{fontSize:"11px",color:C.spare,marginTop:"2px"}}>Ball change: {shot.ballChangeReason.join(", ")}</div>
                  )}
                  {shot.notes&&<div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px",fontStyle:"italic"}}>{shot.notes}</div>}
                  <button style={{...S.btn(),padding:"4px 10px",fontSize:"11px",marginTop:"6px"}} onClick={()=>startEdit(shot)}>✏️ Edit</button>
                </div>
                <button style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:"16px",padding:"0 0 0 8px",flexShrink:0}} onClick={()=>deleteShot(shot.id)}>×</button>
              </div>
            ))}
            <div style={{height:"32px"}}/>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STATS VIEW                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="stats"&&(
          <>
            <div style={{...S.card,border:`1px solid ${C.accent}44`}}>
              <div style={{...S.label,color:C.accent}}>Backup & Restore</div>
              <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                Save a copy of everything — shots, sessions, bowlers, arsenals, and match results — so your season is safe no matter what. If you ever open this app and your history looks empty, restore it here.
              </div>
              {!showBackup?(
                <button style={S.btn()} onClick={()=>{setShowBackup(true);setBackupStatus("");}}>Open Backup & Restore</button>
              ):(
                <>
                  <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                    <button style={{...S.btn("primary"),flex:1}} onClick={()=>{
                      const json=exportData();
                      const blob=new Blob([json],{type:"application/json"});
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement("a");
                      a.href=url;
                      a.download=`bowling-backup-${new Date().toISOString().slice(0,10)}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      setBackupStatus("Backup downloaded.");
                    }}>Download Backup</button>
                    <button style={{...S.btn(),flex:1}} onClick={()=>setShowBackup(false)}>Close</button>
                  </div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"6px"}}>
                    If the download doesn't work in this environment, copy the text below instead and save it somewhere safe.
                  </div>
                  <textarea readOnly value={exportData()} onClick={e=>e.target.select()}
                    style={{...S.input,minHeight:"90px",fontFamily:"monospace",fontSize:"11px",marginBottom:"12px"}}/>
                  <div style={S.divider}/>
                  <div style={S.label}>Restore From Backup</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"6px"}}>
                    Paste a previously saved backup below. This replaces all current data.
                  </div>
                  <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                    placeholder="Paste backup JSON here..."
                    style={{...S.input,minHeight:"90px",fontFamily:"monospace",fontSize:"11px",marginBottom:"8px"}}/>
                  <button style={S.btn("warn")} onClick={async()=>{
                    try{
                      await importData(importText);
                      setBackupStatus("Backup restored successfully.");
                      setImportText("");
                    }catch(err){
                      setBackupStatus("Couldn't restore: "+(err?.message||"invalid backup file"));
                    }
                  }}>Restore This Backup</button>
                  {backupStatus&&<div style={{fontSize:"12px",color:backupStatus.startsWith("Couldn't")?C.miss:C.strike,marginTop:"8px"}}>{backupStatus}</div>}
                </>
              )}
            </div>
            {shots.length===0&&<div style={{textAlign:"center",color:C.textMuted,padding:"40px 0"}}>No data yet.</div>}
            {shots.length>0&&(
              <>
                {bowlers.length>1&&(
                  <div style={S.card}>
                    <div style={S.label}>Viewing</div>
                    <div style={S.chips}>
                      {LEAGUES.map(l=>{
  const team=teams.find(t=>t.league===l);
  return(
    <Chip key={l} label={`${l.replace(" House Shot","")} Team`} selected={statsTeamId===team?.id&&!statsBowler} onToggle={()=>{
      const next=statsTeamId===team?.id&&!statsBowler?"":team?.id||"";
      setStatsTeamId(next);
      setStatsLeague(next?l:"");
      setStatsBowler("");
      setCompareBowler("");
      setCompareLeague("");
    }}/>
  );
})}
                      {bowlers.map(b=>(
                        <Chip key={b} label={b} selected={statsBowler===b} onToggle={()=>{
                          const next=statsBowler===b?"":b;
                          setStatsBowler(next);
                          setStatsLeague("");
                          setStatsTeamId("");
                          setCompareBowler("");
                          setCompareLeague("");
                        }}/>
                      ))}
                    </div>
                    {(statsBowler||statsLeague)&&(
                      <>
                        <div style={S.divider}/>
                        <div style={S.label}>Compare To</div>
                        <div style={S.chips}>
                          <Chip label="None" selected={!compareBowler&&!compareLeague} onToggle={()=>{setCompareBowler("");setCompareLeague("");}}/>
                          {bowlers.filter(b=>b!==statsBowler).map(b=>(
                            <Chip key={b} label={b} selected={compareBowler===b} onToggle={()=>{
                              setCompareBowler(compareBowler===b?"":b);
                              setCompareLeague("");
                            }} color={C.spare}/>
                          ))}
                          {LEAGUES.filter(l=>l!==statsLeague).map(l=>(
                            <Chip key={l} label={`${l.replace(" House Shot","")} Team`} selected={compareLeague===l} onToggle={()=>{
                              setCompareLeague(compareLeague===l?"":l);
                              setCompareBowler("");
                            }} color={C.accent}/>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {showTeamCompare&&(()=>{
                  const pctData=[
                    {metric:"Strike %",you:stkR,opp:teamStkR},
                    {metric:"Spare %",you:spR,opp:teamSpR},
                    {metric:"Clean Frame %",you:cleanFrameR,opp:teamCleanFrameR},
                    {metric:"Split Rate",you:splitR,opp:teamSplitR},
                    {metric:"10-Pin Spare %",you:tenPinSpareR,opp:teamTenPinSpareR},
                    {metric:"Single-Pin Spare %",you:singlePinSpareR,opp:teamSinglePinSpareR},
                  ];
                  const pinData=[
                    {metric:"First-Ball Avg",you:firstBallAvg!=null?Math.round(firstBallAvg*10)/10:null,opp:teamFirstBallAvg!=null?Math.round(teamFirstBallAvg*10)/10:null},
                    {metric:"Leave Avg",you:leaveAvg!=null?Math.round(leaveAvg*10)/10:null,opp:teamLeaveAvg!=null?Math.round(teamLeaveAvg*10)/10:null},
                  ].filter(d=>d.you!=null||d.opp!=null);
                  const meLabel=statsBowler||"Team";
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Head-to-Head</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Every rate stat side by side against {compareLabel}, instead of hunting through separate cards. Split Rate is the one metric here where lower is better.
                      </div>
                      <div style={{fontSize:"10px",color:C.textMuted,marginBottom:"6px",display:"flex",gap:"12px"}}>
                        <span><span style={{color:C.accent}}>●</span> {meLabel}</span>
                        <span><span style={{color:C.spare}}>●</span> {compareLabel}</span>
                      </div>
                      <div style={{height:`${pctData.length*36+20}px`}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={pctData} layout="vertical" margin={{top:0,right:16,left:0,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                            <XAxis type="number" domain={[0,100]} tick={{fill:C.textMuted,fontSize:10}}/>
                            <YAxis type="category" dataKey="metric" tick={{fill:C.textMuted,fontSize:10}} width={110}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v)=>[`${v}%`]}/>
                            <Bar dataKey="you" fill={C.accent} radius={[0,4,4,0]} barSize={12}/>
                            <Bar dataKey="opp" fill={C.spare} radius={[0,4,4,0]} barSize={12}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {pinData.length>0&&(
                        <div style={{height:`${pinData.length*36+20}px`,marginTop:"8px"}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pinData} layout="vertical" margin={{top:0,right:16,left:0,bottom:0}}>
                              <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                              <XAxis type="number" domain={[0,10]} tick={{fill:C.textMuted,fontSize:10}}/>
                              <YAxis type="category" dataKey="metric" tick={{fill:C.textMuted,fontSize:10}} width={110}/>
                              <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}}/>
                              <Bar dataKey="you" fill={C.accent} radius={[0,4,4,0]} barSize={12}/>
                              <Bar dataKey="opp" fill={C.spare} radius={[0,4,4,0]} barSize={12}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(()=>{
                  const recordsBowler=statsBowler||(bowlers.length<=1?(bowlers[0]||""):"");
                  if(!recordsBowler&&!statsLeague&&bowlers.length>1){
                    return(
                      <div style={S.card}>
                        <div style={S.label}>Team Records</div>
                        <div style={{fontSize:"12px",color:C.textMuted}}>Select "Tuesday Team" or "Thursday Team" above to see this — high game/series need one specific roster, since combining different-sized teams would unfairly favor whichever has more bowlers.</div>
                      </div>
                    );
                  }
                  const hg=recordsBowler?bowlerHighGame(recordsBowler):teamHighGame(statsTeamId);
                  const hs=recordsBowler?bowlerHighSeries(recordsBowler):teamHighSeries(statsTeamId);
                  if(!hg&&!hs)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{recordsBowler?`${recordsBowler}'s Records`:"Team Records"}</div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.strike}}>{hg?hg.value:"—"}</div>
                          <div style={S.statLbl}>High Game</div>
                          {hg&&<div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>{hg.date}{hg.game?` · G${hg.game}`:""}</div>}
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.accent}}>{hs?hs.value:"—"}</div>
                          <div style={S.statLbl}>High Series</div>
                          {hs&&<div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>{hs.date}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {!statsBowler&&(()=>{
                  const rMain=seasonRecord(statsLeague);
                  if(!rMain.gameWins&&!rMain.gameLosses&&!rMain.seriesWins&&!rMain.seriesLosses)return null;
                  const rTue=!statsLeague?seasonRecord("Tuesday House Shot"):null;
                  const rThu=!statsLeague?seasonRecord("Thursday House Shot"):null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{statsLeague?`${statsLeague.replace(" House Shot","")} Season Record`:"Season Record"}</div>
                      <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                        <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                          <div style={{...S.statNum,color:C.accent}}>{rMain.pointsWon}/{rMain.pointsAvailable}</div>
                          <div style={S.statLbl}>Points</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,fontSize:"18px",color:C.strike}}>{rMain.gameWins}-{rMain.gameLosses}</div>
                          <div style={S.statLbl}>Games</div>
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,fontSize:"18px",color:C.spare}}>{rMain.seriesWins}-{rMain.seriesLosses}</div>
                          <div style={S.statLbl}>Pinfall</div>
                        </div>
                      </div>
                      {rTue&&(rTue.gameWins+rTue.gameLosses>0)&&(
                        <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>Tuesday: {rTue.pointsWon}/{rTue.pointsAvailable} points ({rTue.gameWins}-{rTue.gameLosses} games, {rTue.seriesWins}-{rTue.seriesLosses} pinfall)</div>
                      )}
                      {rThu&&(rThu.gameWins+rThu.gameLosses>0)&&(
                        <div style={{fontSize:"12px",color:C.textMuted}}>Thursday: {rThu.pointsWon}/{rThu.pointsAvailable} points ({rThu.gameWins}-{rThu.gameLosses} games, {rThu.seriesWins}-{rThu.seriesLosses} pinfall)</div>
                      )}
                    </div>
                  );
                })()}

                {!statsBowler&&(()=>{
                  const weekly=weeklyPointsData(statsLeague);
                  if(weekly.length<2)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Weekly Points</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Points won each week, out of 4 — Season Record only shows the running total, never when those points actually came. Shows momentum: a hot streak or a slump.
                      </div>
                      <div style={{height:"180px"}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weekly} margin={{top:8,right:8,left:-16,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                            <XAxis dataKey="date" tick={{fill:C.textMuted,fontSize:10}} tickFormatter={d=>d.slice(5)}/>
                            <YAxis tick={{fill:C.textMuted,fontSize:10}} domain={[0,4]} allowDecimals={false}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v,n,p)=>[`${v}/${p.payload.pointsAvailable}`,p.payload.opponent||"Points won"]}/>
                            <Bar dataKey="pointsWon" radius={[4,4,0,0]}>
                              {weekly.map((w,i)=>(
                                <Cell key={i} fill={w.pointsWon>=w.pointsAvailable/2?C.strike:C.miss}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()}

                {!statsBowler&&sessionDateGroups().length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Log Match Results</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      4 points per night — 1 per game, 1 for total pinfall. Tap to cycle: not marked → won → lost.
                    </div>
                    {sessionDateGroups().map((g,i)=>{
                      const m=getMatch(g.league,g.date)||{games:[null,null,null],series:null,opponent:"",handicap:""};
                      const handicap=matchHandicap(m);
                      const pointsWon=m.games.filter(v=>v===true).length+(m.series===true?1:0);
                      const pointsMarked=m.games.filter(v=>v!==null).length+(m.series!==null?1:0);
                      const resultChip=(val,onTap,label)=>(
                        <button key={label} onClick={onTap} style={{
                          padding:"6px 10px",borderRadius:"8px",border:`1px solid ${val===true?C.strike:val===false?C.miss:C.border}`,
                          backgroundColor:val===true?C.strike+"22":val===false?C.miss+"22":"transparent",
                          color:val===true?C.strike:val===false?C.miss:C.textMuted,
                          fontSize:"12px",fontWeight:600,cursor:"pointer",WebkitTapHighlightColor:"transparent",
                        }}>{label}{val===true?" ✓":val===false?" ✗":""}</button>
                      );
                      return(
                        <div key={i} style={{borderBottom:`1px solid ${C.border}`,paddingBottom:"10px",marginBottom:"10px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                            <span style={{fontSize:"12px",fontWeight:600}}>{g.league.replace(" House Shot","")}</span>
                            <span style={{fontSize:"11px",color:C.textMuted}}>{g.date}</span>
                          </div>
                          <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
                            <input style={{...S.input,flex:2}} placeholder="Opponent (e.g. Team Name)"
                              value={m.opponent||""} onChange={e=>setMatchOpponent(g.league,g.date,e.target.value)}/>
                            <input style={{...S.input,flex:1,textAlign:"center"}} type="number" placeholder="Handicap"
                              value={handicap} onChange={e=>setMatchHandicap(g.league,g.date,e.target.value)}/>
                          </div>
                          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"6px"}}>
                            {[0,1,2].map(idx=>resultChip(m.games[idx]??null,()=>cycleGameResult(g.league,g.date,idx),`G${idx+1}`))}
                            {resultChip(m.series??null,()=>cycleSeriesResult(g.league,g.date),"Pinfall")}
                          </div>
                          {pointsMarked>0&&(
                            <div style={{fontSize:"12px",fontWeight:600,color:C.accent}}>{pointsWon} of 4 points</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!statsBowler&&(()=>{
                  if(!statsLeague&&bowlers.length>1){
                    return(
                      <div style={S.card}>
                        <div style={S.label}>Handicap Impact</div>
                        <div style={{fontSize:"12px",color:C.textMuted}}>Select "Tuesday Team" or "Thursday Team" above to see this — "the team" needs to mean one specific roster, not Tuesday and Thursday's matches blended together.</div>
                      </div>
                    );
                  }
                  const split=handicapSplit(statsLeague);
                  if(!split)return null;
                  const data=handicapMatches(statsLeague);
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Handicap Impact</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Points-won rate split by handicap size — shows whether the team does better closer to scratch or with a bigger handicap cushion.
                      </div>
                      <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.accent}}>{split.smaller.rate!=null?`${split.smaller.rate}%`:"—"}</div>
                          <div style={S.statLbl}>Smaller HDCP</div>
                          <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>avg {split.smaller.avgHandicap} · {split.smaller.count} nights</div>
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.accent}}>{split.larger.rate!=null?`${split.larger.rate}%`:"—"}</div>
                          <div style={S.statLbl}>Larger HDCP</div>
                          <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>avg {split.larger.avgHandicap} · {split.larger.count} nights</div>
                        </div>
                      </div>
                      {data.length>=2&&(
                        <div style={{height:"200px"}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{top:8,right:8,left:-16,bottom:0}}>
                              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                              <XAxis dataKey="handicap" tick={{fill:C.textMuted,fontSize:10}} label={{value:"Handicap",position:"insideBottom",offset:-2,fill:C.textMuted,fontSize:10}}/>
                              <YAxis tick={{fill:C.textMuted,fontSize:10}} domain={[0,100]} label={{value:"Points won %",angle:-90,position:"insideLeft",fill:C.textMuted,fontSize:10}}/>
                              <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v,n,p)=>[`${v}%`,p.payload.opponent||"Points won"]}/>
                              <Bar dataKey="rate" fill={C.accent} radius={[4,4,0,0]}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!statsBowler&&bowlers.length>1&&(()=>{
                  const leagueBowlers=bowlers.filter(b=>shots.some(s=>s.bowler===b&&(!statsLeague||s.league===statsLeague)));
                  if(!leagueBowlers.length)return null;
                  const sorted=[...leagueBowlers].sort((a,b)=>(cAvg(b,statsLeague)||0)-(cAvg(a,statsLeague)||0));
                  const chartData=sorted.map(b=>({bowler:b,avg:cAvg(b,statsLeague)||0})).reverse(); // reverse so the highest average plots at the top
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Team Leaderboard</div>
                      <div style={{height:`${chartData.length*32+20}px`,marginBottom:"12px"}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{top:0,right:24,left:0,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                            <XAxis type="number" tick={{fill:C.textMuted,fontSize:10}}/>
                            <YAxis type="category" dataKey="bowler" tick={{fill:C.textMuted,fontSize:11}} width={70}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v)=>[v,"Average"]}/>
                            <Bar dataKey="avg" fill={C.accent} radius={[0,4,4,0]} barSize={16}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {sorted.map(b=>{
                        const avg=cAvg(b,statsLeague);
                        const bShots=shots.filter(s=>s.bowler===b&&(!statsLeague||s.league===statsLeague));
                        const bStk=bShots.filter(s=>s.result==="Strike").length;
                        const bStkR=bShots.length?Math.round((bStk/bShots.length)*100):0;
                        return(
                          <div key={b} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                            <span style={{fontSize:"13px",fontWeight:600}}>{b}</span>
                            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                              <span style={S.tag(C.strike)}>{bStkR}% stk</span>
                              <span style={{fontSize:"11px",color:C.textMuted}}>{bShots.length} shots</span>
                              <span style={{fontSize:"16px",fontWeight:700,color:avg!=null?C.accent:C.textMuted}}>{avg!=null?avg:"—"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {!statsBowler&&bowlers.length>1&&(()=>{
                  if(!statsLeague)return(
                    <div style={S.card}>
                      <div style={S.label}>Giant Killer</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>Select "Tuesday Team" or "Thursday Team" above to see this — it needs a specific roster to know who's on top.</div>
                    </div>
                  );
                  const tally=beatHighBowlerStats(statsLeague);
                  const rows=Object.entries(tally).map(([b,t])=>({bowler:b,...t,pct:t.total?Math.round((t.won/t.total)*1000)/10:null}))
                    .filter(r=>r.total>0||r.weeksAsHigh>0)
                    .sort((a,b)=>{
                      if(a.pct==null&&b.pct==null)return b.weeksAsHigh-a.weeksAsHigh;
                      if(a.pct==null)return 1;
                      if(b.pct==null)return -1;
                      return b.pct-a.pct;
                    });
                  if(!rows.length)return(
                    <div style={S.card}>
                      <div style={S.label}>Giant Killer</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>No comparisons yet — the first week just sets the baseline average for everyone. Once a second week is logged, that week's giant (whoever had the best average entering it) gets challenged and this fills in.</div>
                    </div>
                  );
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Giant Killer</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        % of games each bowler beat that week's reigning giant, game-by-game — the giant is whoever had the highest average entering that week, based only on weeks before it (never that week's own results). The very first week ever logged sets the baseline with no giant to challenge yet; the hunt starts week two. Locked in per week — if the title changes hands later, earlier weeks stay compared against whoever actually held it at the time. "Weeks on top" counts how many weeks they themselves held the title.
                      </div>
                      {rows.map(r=>(
                        <div key={r.bowler} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                          <span style={{fontSize:"13px",fontWeight:600}}>{r.bowler}</span>
                          <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                            {r.weeksAsHigh>0&&<span style={S.tag(C.spare)}>{r.weeksAsHigh}wk{r.weeksAsHigh===1?"":"s"} on top</span>}
                            {r.total>0&&<span style={{fontSize:"11px",color:C.textMuted}}>{r.won}/{r.total} games</span>}
                            <span style={{fontSize:"16px",fontWeight:700,color:r.pct!=null?C.accent:C.textMuted}}>{r.pct!=null?`${r.pct}%`:"—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {!statsBowler&&bowlers.length>1&&(()=>{
                  if(!statsLeague)return(
                    <div style={S.card}>
                      <div style={S.label}>🎣 Hung</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>Select "Tuesday Team" or "Thursday Team" above to see this — it needs a specific roster to know who else was bowling that frame.</div>
                    </div>
                  );
                  const counts=hungCounts(statsLeague);
                  const leagueBowlers=bowlers.filter(b=>shots.some(s=>s.bowler===b&&s.league===statsLeague));
                  const rows=leagueBowlers.map(b=>({bowler:b,count:counts[b]||0})).sort((a,b)=>b.count-a.count);
                  if(!rows.some(r=>r.count>0))return(
                    <div style={S.card}>
                      <div style={S.label}>🎣 Hung</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>Nobody's been hung yet — every strike in this data has had at least one teammate join in, or company on the miss.</div>
                    </div>
                  );
                  return(
                    <div style={S.card}>
                      <div style={S.label}>🎣 Hung</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Every teammate struck that frame except them. The wall of shame.
                      </div>
                      {rows.map(r=>(
                        <div key={r.bowler} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                          <span style={{fontSize:"13px",fontWeight:600}}>{r.bowler}</span>
                          <span style={{fontSize:"16px",fontWeight:700,color:r.count>0?C.miss:C.textMuted}}>{r.count}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}


                {!statsBowler&&bowlers.length>1&&(()=>{
                  // Team Series: sum each bowler's session total for dates where 2+ bowlers share a league+date
                  const byKey={};
                  sessions.filter(s=>!statsLeague||s.league===statsLeague).forEach(s=>{
                    const k=`${s.league}__${s.date}`;
                    if(!byKey[k])byKey[k]={league:s.league,date:s.date,entries:[]};
                    byKey[k].entries.push(s);
                  });
                  const teamDates=Object.values(byKey).filter(g=>g.entries.length>1).sort((a,b)=>b.date.localeCompare(a.date));
                  if(!teamDates.length)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Team Series</div>
                      {teamDates.map((g,i)=>(
                        <div key={i} style={{borderBottom:`1px solid ${C.border}`,paddingBottom:"10px",marginBottom:"10px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
                            <span style={{fontSize:"12px",fontWeight:600}}>{g.league.replace(" House Shot","")}</span>
                            <span style={{fontSize:"11px",color:C.textMuted}}>{g.date}</span>
                          </div>
                          {lineupSort(g.entries.map(e=>e.bowler),g.league).map(bowlerName=>{
                            const e=g.entries.find(en=>en.bowler===bowlerName);
                            return(
                              <div key={e.id} style={{display:"flex",justifyContent:"space-between",fontSize:"12px",marginBottom:"2px"}}>
                                <span style={{color:C.textMuted}}>{e.bowler}</span>
                                <span style={{fontWeight:600}}>{e.total}</span>
                              </div>
                            );
                          })}
                          <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                            <span style={{fontSize:"12px",fontWeight:700,color:C.accent}}>Team Total</span>
                            <span style={{fontSize:"14px",fontWeight:700,color:C.accent}}>{g.entries.reduce((a,e)=>a+e.total,0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                  <div style={S.statBox}><div style={S.statNum}>{tot}</div><div style={S.statLbl}>Shots</div></div>
                  <div style={S.statBox}>
                    <div style={{...S.statNum,color:C.strike}}>{stkR}%</div>
                    <div style={S.statLbl}>Strike %</div>
                    {showTeamCompare&&<CompareBadge value={stkR} teamValue={teamStkR} label={compareLabel}/>}
                  </div>
                  <div style={S.statBox}>
                    <div style={{...S.statNum,color:C.spare}}>{spR}%</div>
                    <div style={S.statLbl}>Spare %</div>
                    {showTeamCompare&&<CompareBadge value={spR} teamValue={teamSpR} label={compareLabel}/>}
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                  <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                    <div style={{...S.statNum,color:C.accent}}>{frameShots.length?`${cleanFrameR}%`:"—"}</div>
                    <div style={S.statLbl}>Clean Frame %</div>
                    {showTeamCompare&&<CompareBadge value={cleanFrameR} teamValue={teamCleanFrameR} label={compareLabel}/>}
                  </div>
                  <div style={S.statBox}>
                    <div style={{...S.statNum,color:C.textMuted}}>{cleanFrameCount}/{frameShots.length}</div>
                    <div style={S.statLbl}>Clean Frames</div>
                  </div>
                </div>

                {!isTeamView&&framePositionGamesLogged>0&&(()=>{
                  const withData=framePosition.filter(f=>f.avgScore!=null);
                  const vals=withData.map(f=>f.avgScore);
                  const minVal=vals.length?Math.min(...vals):null;
                  const maxVal=vals.length?Math.max(...vals):null;
                  const allTied=vals.length>1&&minVal===maxVal;
                  const worstFrames=(!allTied&&vals.length)?withData.filter(f=>f.avgScore===minVal).map(f=>f.frame):[];
                  const bestFrames=(!allTied&&vals.length)?withData.filter(f=>f.avgScore===maxVal).map(f=>f.frame):[];
                  const listFrames=arr=>arr.length>1?`Frames ${arr.join(", ")}`:`Frame ${arr[0]}`;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Frame Position</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Broken out by frame number, not by game — shows whether there's a specific spot in every night (warm-up, lane transition, the 9th-frame score-math lapse) where {statsBowler||"the team"} tends to leave pins, regardless of which game it is.
                      </div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Weighted quality score, strict priority order: strike beats every spare, a non-split spare beats every split spare, and within each of those a leave with fewer pins standing scores higher — an open frame always scores lowest, ranked by total pinfall.</div>
                      {!framePositionReliable&&(
                        <div style={{fontSize:"11px",color:C.spare,backgroundColor:C.spare+"15",border:`1px solid ${C.spare}44`,borderRadius:"8px",padding:"8px 10px",marginBottom:"10px"}}>
                          ⚠️ Only {framePositionGamesLogged} game{framePositionGamesLogged===1?"":"s"} logged — each frame number needs at least {FRAME_POSITION_RELIABILITY_THRESHOLD} to tell a real pattern from noise. Treat this as a preview, not a conclusion, until then.
                        </div>
                      )}
                      <div style={{height:"180px"}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={framePosition} margin={{top:8,right:8,left:-16,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                            <XAxis dataKey="frame" tick={{fill:C.textMuted,fontSize:10}}/>
                            <YAxis tick={{fill:C.textMuted,fontSize:10}} domain={[0,100]}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v,n,p)=>[v,`Frame ${p.payload.frame} (n=${p.payload.total})`]}/>
                            <Bar dataKey="avgScore" radius={[4,4,0,0]}>
                              {framePosition.map((f,i)=>(
                                <Cell key={i} fill={worstFrames.includes(f.frame)?C.miss:bestFrames.includes(f.frame)?C.strike:C.accent}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{fontSize:"10px",color:C.textMuted,marginTop:"6px",display:"flex",gap:"12px",flexWrap:"wrap"}}>
                        <span><span style={{color:C.miss}}>●</span> Weakest</span>
                        <span><span style={{color:C.strike}}>●</span> Strongest</span>
                        <span><span style={{color:C.accent}}>●</span> Everything else</span>
                      </div>
                      {framePositionReliable&&worstFrames.length>0&&bestFrames.length>0&&(
                        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px"}}>
                          Weakest: {listFrames(worstFrames)} ({minVal}) · Strongest: {listFrames(bestFrames)} ({maxVal})
                        </div>
                      )}
                      {framePositionReliable&&allTied&&(
                        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px"}}>Every frame is even on this metric — no standout weak spot.</div>
                      )}
                    </div>
                  );
                })()}

                <div style={S.card}>
                  <div style={S.label}>First-Ball Average</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Average pins on every fresh-rack delivery — every frame's first ball, plus any 10th-frame bonus ball thrown at a full reset rack — strikes counted as 10. The standard metric, comparable to LaneTalk and other scoring apps.</div>
                  <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                    <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                      <div style={{...S.statNum,color:C.accent}}>{firstBallAvg!=null?firstBallAvg.toFixed(2):"—"}</div>
                      <div style={S.statLbl}>First-Ball Avg</div>
                      {showTeamCompare&&firstBallAvg!=null&&teamFirstBallAvg!=null&&(()=>{
                        const diff=Math.round((firstBallAvg-teamFirstBallAvg)*100)/100;
                        if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {compareLabel}</div>;
                        return(
                          <div style={{fontSize:"10px",color:diff>0?C.strike:C.miss,marginTop:"2px",fontWeight:600,whiteSpace:"nowrap"}}>
                            {diff>0?"▲":"▼"} {Math.abs(diff).toFixed(2)} vs {compareLabel}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted}}>{allFirstBalls.length}</div>
                      <div style={S.statLbl}>Fresh Racks</div>
                    </div>
                  </div>
                  <div style={S.divider}/>
                  <div style={{...S.label,marginBottom:"6px"}}>Leave Average</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Same fresh-rack deliveries, but only the ones that weren't a strike — isolates how good the leave is on a miss, separate from strike rate.</div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={{...S.statBox,border:`1px solid ${C.spare}44`}}>
                      <div style={{...S.statNum,color:C.spare}}>{leaveAvg!=null?leaveAvg.toFixed(2):"—"}</div>
                      <div style={S.statLbl}>Leave Avg</div>
                      {showTeamCompare&&leaveAvg!=null&&teamLeaveAvg!=null&&(()=>{
                        const diff=Math.round((leaveAvg-teamLeaveAvg)*100)/100;
                        if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {compareLabel}</div>;
                        return(
                          <div style={{fontSize:"10px",color:diff>0?C.strike:C.miss,marginTop:"2px",fontWeight:600,whiteSpace:"nowrap"}}>
                            {diff>0?"▲":"▼"} {Math.abs(diff).toFixed(2)} vs {compareLabel}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted}}>{nonStrikeFirstBalls.length}</div>
                      <div style={S.statLbl}>Non-Strike Balls</div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={S.label}>Ten Pin Leaves</div>
                  <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
                    {!isTeamView&&(
                      <>
                        <div style={S.statBox}><div style={{...S.statNum,color:C.miss,fontSize:"20px"}}>{wk}</div><div style={S.statLbl}>Weak 10s</div></div>
                        <div style={S.statBox}><div style={{...S.statNum,color:C.spare,fontSize:"20px"}}>{rng}</div><div style={S.statLbl}>Ringing 10s</div></div>
                      </>
                    )}
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted,fontSize:"20px"}}>{tot>0?Math.round((tenPinLeaveCount/tot)*100):0}%</div>
                      <div style={S.statLbl}>10-Pin Rate</div>
                      {showTeamCompare&&<CompareBadge value={tot>0?Math.round((tenPinLeaveCount/tot)*100):0} teamValue={teamTenPinRate} lowerIsBetter label={compareLabel}/>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={{...S.statBox,border:`1px solid ${C.strike}44`}}>
                      <div style={{...S.statNum,color:C.strike,fontSize:"20px"}}>{tenPinAttempts.length?`${tenPinSpareR}%`:"—"}</div>
                      <div style={S.statLbl}>10-Pin Spare %</div>
                      {showTeamCompare&&<CompareBadge value={tenPinSpareR} teamValue={teamTenPinSpareR} label={compareLabel}/>}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted,fontSize:"20px"}}>{tenPinMade}/{tenPinAttempts.length}</div>
                      <div style={S.statLbl}>Made / Attempts</div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={S.label}>Single Pin Spares</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Any leave with exactly one pin standing — 7, 4, 8, 10, or any other single pin.</div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={{...S.statBox,border:`1px solid ${C.strike}44`}}>
                      <div style={{...S.statNum,color:C.strike,fontSize:"20px"}}>{singlePinAttempts.length?`${singlePinSpareR}%`:"—"}</div>
                      <div style={S.statLbl}>Single-Pin Spare %</div>
                      {showTeamCompare&&<CompareBadge value={singlePinSpareR} teamValue={teamSinglePinSpareR} label={compareLabel}/>}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted,fontSize:"20px"}}>{singlePinMade}/{singlePinAttempts.length}</div>
                      <div style={S.statLbl}>Made / Attempts</div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={S.label}>Splits</div>
                  <div style={{display:"flex",gap:"8px",marginBottom:splitBreakdownList.length?"14px":"0"}}>
                    <div style={S.statBox}><div style={{...S.statNum,color:C.miss,fontSize:"20px"}}>{splitCount}</div><div style={S.statLbl}>Splits Left</div></div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.textMuted,fontSize:"20px"}}>{splitR}%</div>
                      <div style={S.statLbl}>Split Rate</div>
                      {showTeamCompare&&<CompareBadge value={splitR} teamValue={teamSplitR} lowerIsBetter label={compareLabel}/>}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.strike,fontSize:"20px"}}>{splitCount?`${splitConvR}%`:"—"}</div>
                      <div style={S.statLbl}>Converted</div>
                      {showTeamCompare&&<CompareBadge value={splitConvR} teamValue={teamSplitConvR} label={compareLabel}/>}
                    </div>
                  </div>
                  {!isTeamView&&splitBreakdownList.length>0&&(
                    <>
                      <div style={S.divider}/>
                      <div style={{...S.label,marginBottom:"8px"}}>By Leave</div>
                      <div style={{height:`${Math.min(splitBreakdownList.length,8)*28+16}px`,marginBottom:"10px"}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[...splitBreakdownList.slice(0,8)].reverse()} layout="vertical" margin={{top:0,right:16,left:0,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                            <XAxis type="number" allowDecimals={false} tick={{fill:C.textMuted,fontSize:10}}/>
                            <YAxis type="category" dataKey="key" tick={{fill:C.textMuted,fontSize:11}} width={60}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v,n,p)=>[`${v}× (${p.payload.rate}% conv.)`,"Left"]}/>
                            <Bar dataKey="count" fill={C.miss} radius={[0,4,4,0]} barSize={14}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {splitBreakdownList.map(g=>(
                        <div key={g.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                          <span style={{fontSize:"13px",fontWeight:600}}>{g.key}</span>
                          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                            <span style={{fontSize:"11px",color:C.textMuted}}>{g.count}×</span>
                            <span style={S.tag(g.converted>0?C.strike:C.miss)}>{g.rate}% conv.</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {!isTeamView&&nonSplitLeaveList.length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Non-Split Leaves</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Every recurring leave that isn't a split — how often it happens and how often it gets converted.</div>
                    <div style={{height:`${Math.min(nonSplitLeaveList.length,8)*28+16}px`,marginBottom:"10px"}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[...nonSplitLeaveList.slice(0,8)].reverse()} layout="vertical" margin={{top:0,right:16,left:0,bottom:0}}>
                          <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                          <XAxis type="number" allowDecimals={false} tick={{fill:C.textMuted,fontSize:10}}/>
                          <YAxis type="category" dataKey="key" tick={{fill:C.textMuted,fontSize:11}} width={60}/>
                          <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v,n,p)=>[`${v}× (${p.payload.rate}% conv.)`,"Left"]}/>
                          <Bar dataKey="count" fill={C.spare} radius={[0,4,4,0]} barSize={14}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {nonSplitLeaveList.slice(0,10).map(g=>(
                      <div key={g.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                        <span style={{fontSize:"13px",fontWeight:600}}>{g.key}</span>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <span style={{fontSize:"11px",color:C.textMuted}}>{g.count}×</span>
                          <span style={S.tag(g.converted>0?C.strike:C.miss)}>{g.rate}% conv.</span>
                        </div>
                      </div>
                    ))}
                    {nonSplitLeaveList.length>10&&(
                      <div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px"}}>+{nonSplitLeaveList.length-10} more leave{nonSplitLeaveList.length-10===1?"":"s"} not shown</div>
                    )}
                  </div>
                )}

                {!isTeamView&&(
                  <div style={S.card}>
                    <div style={S.label}>Longest Strike Streak</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Consecutive strikes, carrying across games within the same night.</div>
                    <div style={{display:"flex",gap:"8px"}}>
                      <div style={{...S.statBox,border:`1px solid ${C.strike}44`}}>
                        <div style={{...S.statNum,color:C.strike}}>{longestStrikeStreak(statsBowler)}</div>
                        <div style={S.statLbl}>Best Streak</div>
                        {compareBowler&&<CompareBadge value={longestStrikeStreak(statsBowler)} teamValue={longestStrikeStreak(compareBowler)} label={compareLabel}/>}
                      </div>
                    </div>
                  </div>
                )}

                {!hideIndividualOnly&&(
                  <div style={S.card}>
                    <div style={S.label}>By Ball</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Under {SHOT_SAMPLE_THRESHOLD} shots on a ball isn't enough to trust the rate yet — flagged rather than hidden, so you can watch it firm up.</div>
                    {bStats.map(b=>(
                      <div key={b.ball} style={{marginBottom:"14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                          <span style={{fontSize:"13px",fontWeight:600}}>{b.ball}</span>
                          <span style={{fontSize:"12px",color:b.reliable?C.textMuted:C.spare}}>n={b.total}{!b.reliable?" — low sample":""}</span>
                        </div>
                        <div style={{display:"flex",gap:"6px",marginBottom:"4px",flexWrap:"wrap"}}>
                          <span style={S.tag(b.reliable?C.strike:C.textMuted)}>Strike {b.rate}%</span>
                          {b.leaveAvg!=null&&<span style={S.tag(b.reliable?C.accent:C.textMuted)}>Leave Avg {b.leaveAvg}</span>}
                          {b.spareRate!=null&&<span style={S.tag(b.reliable?C.strike:C.textMuted)}>Spare {b.spareRate}%</span>}
                          <span style={S.tag(b.reliable?C.spare:C.textMuted)}>10-Pin {b.tenPinRate}%</span>
                          <span style={S.tag(b.reliable?C.miss:C.textMuted)}>Split {b.splitRate}%</span>
                        </div>
                        <div style={{height:"6px",backgroundColor:C.surface,borderRadius:"3px",overflow:"hidden",opacity:b.reliable?1:0.4}}>
                          <div style={{height:"100%",width:`${b.rate}%`,backgroundColor:b.rate>=60?C.strike:b.rate>=40?C.spare:C.miss,borderRadius:"3px"}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!hideIndividualOnly&&mCounts.length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Miss Distribution</div>
                    {mCounts.sort((a,b)=>b.count-a.count).map(m=>(
                      <div key={m.miss} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                        <span style={{fontSize:"13px"}}>{m.miss}</span>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <div style={{width:"80px",height:"6px",backgroundColor:C.surface,borderRadius:"3px",overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${(m.count/Math.max(...mCounts.map(x=>x.count)))*100}%`,backgroundColor:C.miss,borderRadius:"3px"}}/>
                          </div>
                          <span style={{fontSize:"12px",color:C.textMuted,minWidth:"20px",textAlign:"right"}}>{m.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!hideIndividualOnly&&(
                  <div style={S.card}>
                    <div style={S.label}>Release Quality</div>
                    <div style={{display:"flex",gap:"8px"}}>
                      {RELEASES.map(r=>{
                        const count=statsShots.filter(s=>s.release===r).length;
                        const pct=tot?Math.round((count/tot)*100):0;
                        return(<div key={r} style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:r==="Good"?C.strike:r==="Bad"?C.miss:C.spare}}>{pct}%</div><div style={S.statLbl}>{r}</div></div>);
                      })}
                    </div>
                  </div>
                )}

                {!hideIndividualOnly&&statsShots.filter(s=>s.ballChangeReason&&s.ballChangeReason.length>0).length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Ball Change Triggers</div>
                    {BALL_CHANGE_REASONS.map(r=>{
                      const count=statsShots.filter(s=>Array.isArray(s.ballChangeReason)?s.ballChangeReason.includes(r):s.ballChangeReason===r).length;
                      if(!count)return null;
                      return(<div key={r} style={{display:"flex",justifyContent:"space-between",marginBottom:"6px",fontSize:"12px"}}><span>{r}</span><span style={{color:C.spare}}>{count}</span></div>);
                    })}
                  </div>
                )}

                {!hideIndividualOnly&&statsShots.filter(s=>s.strikeDescription).length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Strike Quality</div>
                    {STRIKE_DESCRIPTIONS.map(d=>{
                      const count=statsShots.filter(s=>s.strikeDescription===d).length;
                      if(!count)return null;
                      const pct=stk?Math.round((count/stk)*100):0;
                      return(
                        <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                          <span style={{fontSize:"12px"}}>{d}</span>
                          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                            <div style={{width:"80px",height:"6px",backgroundColor:C.surface,borderRadius:"3px",overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${pct}%`,backgroundColor:C.strike,borderRadius:"3px"}}/>
                            </div>
                            <span style={{fontSize:"11px",color:C.textMuted}}>{count} ({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {sessions.length>0&&(rAvg(statsBowler,"Tuesday House Shot")||rAvg(statsBowler,"Thursday House Shot"))&&(
                  <div style={S.card}>
                    <div style={S.label}>Running Averages</div>
                    {isTeamView&&<div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Top number is the average bowler's score. "Team" below it is what the whole team scores together that game.</div>}
                    <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
                      {(!statsLeague||statsLeague==="Tuesday House Shot")&&rAvg(statsBowler,"Tuesday House Shot")&&(
                        <div style={S.statBox}>
                          <div style={S.statNum}>{rAvg(statsBowler,"Tuesday House Shot")}</div>
                          <div style={S.statLbl}>Tuesday</div>
                          {isTeamView&&teamGameTotalAvg(teams.find(t=>t.league==="Tuesday House Shot")?.id||"")!=null&&<div style={{fontSize:"11px",color:C.accent,fontWeight:600,marginTop:"2px"}}>Team: {teamGameTotalAvg(teams.find(t=>t.league==="Tuesday House Shot")?.id||"")}</div>}
                          {showTeamCompare&&<CompareBadge value={rAvg(statsBowler,"Tuesday House Shot")} teamValue={rAvg(compareBowler,"Tuesday House Shot")} label={compareLabel}/>}
                        </div>
                      )}
                      {(!statsLeague||statsLeague==="Thursday House Shot")&&rAvg(statsBowler,"Thursday House Shot")&&(
                        <div style={S.statBox}>
                          <div style={S.statNum}>{rAvg(statsBowler,"Thursday House Shot")}</div>
                          <div style={S.statLbl}>Thursday</div>
                          {isTeamView&&teamGameTotalAvg(teams.find(t=>t.league==="Thursday House Shot")?.id||"")!=null&&<div style={{fontSize:"11px",color:C.accent,fontWeight:600,marginTop:"2px"}}>Team: {teamGameTotalAvg(teams.find(t=>t.league==="Thursday House Shot")?.id||"")}</div>}
                          {showTeamCompare&&<CompareBadge value={rAvg(statsBowler,"Thursday House Shot")} teamValue={rAvg(compareBowler,"Thursday House Shot")} label={compareLabel}/>}
                        </div>
                      )}
                      {!statsLeague&&(!statsBowler||bowlerLeagueCount>1)&&cAvg(statsBowler)&&(
                        <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                          <div style={{...S.statNum,color:C.accent}}>{cAvg(statsBowler)}</div>
                          <div style={S.statLbl}>Combined</div>
                          {showTeamCompare&&compareBowler&&<CompareBadge value={cAvg(statsBowler)} teamValue={cAvg(compareBowler)} label={compareLabel}/>}
                        </div>
                      )}
                    </div>
                    {!statsLeague&&showTeamCompare&&!compareBowler&&<div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px"}}>Combined spans both leagues, so there's no single team to compare it against — pick a specific bowler under "Compare To" above, or see the Tuesday/Thursday comparisons instead.</div>}
                  </div>
                )}

                {(()=>{
                  const progress=avgProgress(statsBowler,statsLeague);
                  if(!progress)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Progress to Next Milestone</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Tracked in 5-pin steps{isTeamView?" — the team's average bowler":""}.
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
                        <span style={{fontSize:"12px",color:C.textMuted}}>{progress.prevMilestone}</span>
                        <span style={{fontSize:"12px",color:C.textMuted}}>{progress.nextMilestone}</span>
                      </div>
                      <div style={{height:"14px",backgroundColor:C.surface,borderRadius:"7px",overflow:"hidden",border:`1px solid ${C.border}`}}>
                        <div style={{height:"100%",width:`${progress.pct}%`,backgroundColor:C.accent,borderRadius:"7px"}}/>
                      </div>
                      <div style={{textAlign:"center",marginTop:"8px"}}>
                        <span style={{fontSize:"20px",fontWeight:700,color:C.accent}}>{progress.raw.toFixed(1)}</span>
                        <span style={{fontSize:"12px",color:C.textMuted,marginLeft:"6px"}}>({Math.round(progress.pct)}% to {progress.nextMilestone})</span>
                      </div>
                    </div>
                  );
                })()}

                {(()=>{
                  const consistency=scoreConsistency(statsBowler,statsLeague,statsTeamId);
                  if(!consistency)return null;
                  const compareTeamId=compareLeague?teams.find(t=>t.league===compareLeague)?.id||"":""; 
                  const compareConsistency=showTeamCompare?scoreConsistency(compareBowler,compareLeague,compareTeamId):null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Score Consistency</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        {statsBowler
                          ?"How steady their game scores are night to night, independent of the average itself. Lower is steadier."
                          :"How steady the team's combined game totals are night to night — not each bowler's individual scores. Lower is steadier."}
                      </div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                          <div style={{...S.statNum,color:C.accent}}>±{consistency.stdDev}</div>
                          <div style={S.statLbl}>Std. Dev.</div>
                          {showTeamCompare&&compareConsistency&&<CompareBadge value={consistency.stdDev} teamValue={compareConsistency.stdDev} lowerIsBetter label={compareLabel}/>}
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.textMuted}}>{consistency.min}–{consistency.max}</div>
                          <div style={S.statLbl}>Range</div>
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.textMuted}}>{consistency.games}</div>
                          <div style={S.statLbl}>{statsBowler?"Games":"Team Games"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {(()=>{
                  const values=scoreValues(statsBowler,statsLeague,statsTeamId);
                  if(values.length<4)return null;
                  const buckets=histogramBuckets(values);
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Score Distribution</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        The actual shape behind the std. dev. above — tightly bunched around the average, or a long tail of bad nights dragging it down.
                      </div>
                      <div style={{height:"180px"}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={buckets} margin={{top:8,right:8,left:-16,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                            <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={0} angle={-35} textAnchor="end" height={50}/>
                            <YAxis tick={{fill:C.textMuted,fontSize:10}} allowDecimals={false}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v)=>[v,"Games"]}/>
                            <Bar dataKey="count" fill={C.accent} radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()}

                {sessions.length>0&&(gameAvg(statsBowler,0,statsLeague)||gameAvg(statsBowler,1,statsLeague)||gameAvg(statsBowler,2,statsLeague))&&(
                  <div style={S.card}>
                    <div style={S.label}>Game-by-Game Averages</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      Cumulative average at each position in the night, across the whole season — shows whether {statsBowler?"they're":"the team is"} bowling better early, middle, or late.
                      {isTeamView&&" \"Team\" is what the whole team scores together at that position."}
                    </div>
                    <div style={{display:"flex",gap:"8px"}}>
                      {[0,1,2].map(idx=>{
                        const v=gameAvg(statsBowler,idx,statsLeague);
                        if(v==null)return null;
                        const teamV=(isTeamView&&statsTeamId)?teamGameTotalAvgAt(statsTeamId,idx):null;
                        return(
                          <div key={idx} style={S.statBox}>
                            <div style={S.statNum}>{v}</div>
                            <div style={S.statLbl}>Game {idx+1}</div>
                            {teamV!=null&&<div style={{fontSize:"11px",color:C.accent,fontWeight:600,marginTop:"2px"}}>Team: {teamV}</div>}
                            {showTeamCompare&&<CompareBadge value={v} teamValue={gameAvg(compareBowler,idx,compareLeague)} label={compareLabel}/>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sessions.length>0&&(()=>{
                  const data=trendData(statsBowler,trendScope,trendMetric);
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Trend</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Cumulative average across the season — shows whether {statsBowler||"the team"} is trending up or down.
                      </div>
                      <div style={S.chips}>
                        <Chip label="Game 1" selected={trendMetric===0} onToggle={()=>setTrendMetric(0)}/>
                        <Chip label="Game 2" selected={trendMetric===1} onToggle={()=>setTrendMetric(1)}/>
                        <Chip label="Game 3" selected={trendMetric===2} onToggle={()=>setTrendMetric(2)}/>
                        <Chip label="Weekly" selected={trendMetric==="weekly"} onToggle={()=>setTrendMetric("weekly")}/>
                      </div>
                      <div style={{...S.chips,marginTop:"8px"}}>
                        <Chip label="Combined" selected={!trendScope} onToggle={()=>setTrendScope("")} color={C.accent}/>
                        {LEAGUES.map(l=>(
                          <Chip key={l} label={l.replace(" House Shot","")} selected={trendScope===l} onToggle={()=>setTrendScope(trendScope===l?"":l)} color={C.accent}/>
                        ))}
                      </div>
                      {data.length<2?(
                        <div style={{fontSize:"12px",color:C.textMuted,textAlign:"center",padding:"24px 0"}}>Need at least 2 nights logged for this view to plot a trend.</div>
                      ):(
                        <div style={{height:"220px",marginTop:"12px"}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{top:8,right:8,left:-16,bottom:0}}>
                              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                              <XAxis dataKey="date" tick={{fill:C.textMuted,fontSize:10}} tickFormatter={d=>d.slice(5)}/>
                              <YAxis tick={{fill:C.textMuted,fontSize:10}} domain={["auto","auto"]}/>
                              <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}}/>
                              <Line type="monotone" dataKey="value" stroke={C.accent} strokeWidth={2} dot={{r:3,fill:C.accent}}/>
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {sessions.filter(s=>(!statsBowler||s.bowler===statsBowler)&&(!statsLeague||s.league===statsLeague)).length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Session History</div>
                    {[...sessions].filter(s=>(!statsBowler||s.bowler===statsBowler)&&(!statsLeague||s.league===statsLeague)).reverse().map(s=>(
                      <div key={s.id} style={{borderBottom:`1px solid ${C.border}`,paddingBottom:"10px",marginBottom:"10px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                          <span style={{fontSize:"12px",fontWeight:600}}>{!statsBowler&&s.bowler?`${s.bowler} · `:""}{s.league.replace(" House Shot","")}</span>
                          <span style={{fontSize:"11px",color:C.textMuted}}>{s.date}</span>
                        </div>
                        <div style={{display:"flex",gap:"6px",marginBottom:"4px"}}>
                          {s.scores.map((sc,i)=><span key={i} style={{fontSize:"13px",fontWeight:600}}>{sc}</span>)}
                          <span style={{fontSize:"13px",color:C.textMuted}}>·</span>
                          <span style={{fontSize:"13px",fontWeight:700,color:C.accent}}>{s.total}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                          <span style={S.tag(C.strike)}>{s.shotCount?Math.round((s.strikes/s.shotCount)*100):0}% strikes</span>
                          <span style={S.tag(C.miss)}>{s.tenPinLeaves??(s.weakTens+s.ringingTens)} ten pins</span>
                          {s.spareAttempts>0&&<span style={S.tag(C.spare)}>{Math.round((s.sparesMade/s.spareAttempts)*100)}% spares</span>}
                          {s.splits>0&&<span style={S.tag(C.miss)}>{s.splits} splits</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {shots.length>0&&(
                  <div style={{...S.card,border:`1px solid ${C.miss}44`}}>
                    <div style={{...S.label,color:C.miss}}>Danger Zone</div>
                    {!confirmClear?(
                      <button style={S.btn("warn")} onClick={()=>setConfirmClear(true)}>Clear All Data</button>
                    ):(
                      <>
                        <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                          This deletes every logged shot, session, and match result (opponents, handicaps, win/loss). This can't be undone.
                        </div>
                        <div style={{display:"flex",gap:"8px"}}>
                          <button style={{...S.btn("warn"),flex:1}} onClick={async()=>{await clearAllData();setConfirmClear(false);}}>
                            Yes, Delete Everything
                          </button>
                          <button style={{...S.btn(),flex:1}} onClick={()=>setConfirmClear(false)}>Cancel</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{height:"32px"}}/>
          </>
        )}
      </div>
    </div>
  );
}
