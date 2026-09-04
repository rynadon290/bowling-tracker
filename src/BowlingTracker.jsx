import { useState, useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import TeamManagement from "./TeamManagement.jsx";
import Friends from "./Friends.jsx";
import HistoryView from "./HistoryView.jsx";
import LogView from "./LogView.jsx";
import { useAuth } from "./AuthProvider.jsx";
import { cloudRead, cloudWrite, cloudDelete, getQueuedRecordsForTable, getPendingCount, onPendingCountChange, inspectPendingQueue, clearPendingQueue, flushPendingQueue } from "./syncQueue.js";
import { isSplit, isTenPinLeave, isSinglePinLeave, isWashout, isMakeableSpare } from "./domain/splits.js";
import {
  isStk, firstBallOf, secondBallOf, tenthBall3Available, tenthBall3Pins,
  nextState, tenthFrameStatus, strictPartial, frameQualityScore, makeTheoreticalShots,
  freshRackShots, theoreticalFillBallValue,
} from "./domain/scoring.js";
import { emptyShot, computeSessionStats, findExistingShotSlot } from "./domain/sessions.js";
import { bowlerHighGame, bowlerHighSeries, teamDateGroups, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData, gameAvg, teamGameTotalAvg, teamGameTotalAvgAt, rAvg, cAvg, avgProgress, cumulativeAvgBeforeDate, hungCounts, beatHighBowlerStats, scoreValues, scoreConsistency, histogramBuckets } from "./domain/stats.js";
import { lineupSort, renameLeagueInRecords } from "./domain/leagues.js";
import { C, S, Chip, CompareBadge } from "./ui.jsx";
import { DEFAULT_ARSENAL, STRIKE_DESCRIPTIONS, RELEASES, MISSES, BALL_CHANGE_REASONS, DEFAULT_LEAGUES, localDateString } from "./constants.js";
import {
  shotToSupabaseRow, shotFromSupabaseRow, sessionToSupabaseRow, sessionFromSupabaseRow,
  matchToSupabaseRow, matchFromSupabaseRow, lanePatternToSupabaseRow, lanePatternFromSupabaseRow,
} from "./domain/supabaseMapping.js";

// Browser persistence adapter. The original app used the ChatGPT host
// storage API; GitHub Pages needs a browser-native equivalent. Guarded by
// typeof so this module can also be imported under Vitest's Node test
// environment, where there is no `window` at all.
if (typeof window !== "undefined" && !window.storage) {
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

const STORAGE_KEY = "bowling-shots-v2";
const SESSIONS_KEY = "bowling-sessions-v2";
const BOWLERS_KEY = "bowling-bowlers-v1";
const ARSENALS_KEY = "bowling-arsenals-v1";
const MATCHES_KEY = "bowling-matches-v1";
const LANE_PATTERNS_KEY = "bowling-lane-patterns-v1";
const LEAGUES_KEY = "bowling-leagues-v1";

// ── Score calculator ──────────────────────────────────────────────────────────
// Shots: {frame:"1"-"10", ballNum:1-3 (frame 10 only), result, spareMade, pinCount}
// pinCount = total pins for that frame (both balls combined for open frames 1-9)
//            for frame 10: per-ball pin count
// isStk(s): Strike or 9 Pin No-Tap


// A "single pin leave" is any shot where exactly one pin was left standing,
// regardless of which pin — Weak 10/Ringing 10 (always the 10 pin), or
// "Other Leave" with exactly one pin selected (7, 4, 8, 10, etc.).


// first ball pins for a frame (used for bonus calculation)
// For frames 1-9: otherLeave = pins standing after ball 1 → firstBall = 10 - standing
// For 10th frame balls: same logic applies when ball is at a fresh set


// Second ball pins for a non-strike frame
// For open frames: pinCount is the TOTAL frame pins (both balls)
// so second ball = pinCount - firstBall


// 10th-frame ball 3 doesn't always face a fresh 10-pin rack: if ball 1 struck
// but ball 2 did NOT (left some pins standing), ball 3 is attempting only
// those specific remaining pins — not a full fresh rack. This computes how
// many pins were actually available to ball 3.


// Pins knocked on 10th-frame ball 3, correctly scoped to what was available
// (rather than always assuming a fresh 10-pin rack).


// ── Empty shot factory ────────────────────────────────────────────────────────


// Maps a client shot object to a Supabase `shots` row. league_id is
// resolved from the shot's league NAME via leagueIdsMap (name -> id) — the
// client keeps working with league names everywhere else, this is the one
// place that needs the real id.


// The inverse: a Supabase row back to the client's shot shape. leagueNameById
// is id -> name, the reverse of leagueIdsMap above.






// ── Determine next state after saving a shot ─────────────────────────────────


// Given a bowler's shots for one specific night, returns which ball
// number(s) are valid to enter next in the 10th frame — [] means the frame
// is complete (no bonus ball earned), [1] means it hasn't started yet.
// Scoped by league+date+game for the same reason nextState is: game
// numbers (1/2/3) repeat every night, so an unscoped lookup would let an
// unrelated night's 10th frame contaminate tonight's.


// Aggregates a night's worth of shots for one bowler into the derived stats
// a session record stores. Takes exactly the shots that belong to that
// night (already filtered by bowler+league+date) — deliberately doesn't do
// that filtering itself, so it stays a pure function of "these shots" with
// no dependency on how the caller found them.


// A "slot" is uniquely identified by bowler+league+date+game+frame+ballNum.
// Finding an existing match before saving is what prevents a duplicate shot
// from corrupting frame lookups in strictPartial, which expects exactly one
// shot per slot.


// Cascades a league rename across any record type that carries a `.league`
// field (shots, sessions, matches, lane patterns) — renaming a league must
// never leave old records silently orphaned under a name nothing matches
// anymore.







export default function BowlingTracker(){
  const{user}=useAuth();
  // Maps league name -> its Supabase row id. The client keeps `leagues` as
  // plain name strings everywhere (unchanged, to avoid rewriting every call
  // site that compares/filters by league name) — this ref is what lets
  // renameLeague update the correct row in place by id, instead of
  // deleting-and-recreating it (which would cascade-delete every team in
  // that league, since teams.league_id references leagues.id).
  const leagueIdsRef=useRef({});
  const[view,setView]=useState("log");
  const[shots,setShots]=useState([]);
  const[sessions,setSessions]=useState([]);
  const[bowlers,setBowlers]=useState([]);
  // The fixed footer's actual height changes depending on which optional
  // rows are showing (the spare-made warning, the Cancel Edit button) — a
  // static guess is always wrong in some state, either leaving visible dead
  // space above it or letting it overlap the last card. Measured live via
  // ResizeObserver instead, so the spacer above it always matches exactly.
  const footerRef=useRef(null);
  const[footerHeight,setFooterHeight]=useState(80);
  useEffect(()=>{
    if(!footerRef.current)return;
    const el=footerRef.current;
    const measure=()=>setFooterHeight(el.offsetHeight);
    measure();
    const ro=new ResizeObserver(measure);
    ro.observe(el);
    return()=>ro.disconnect();
  },[view]);
  const[teams,setTeams]=useState(()=>{
  try{
    const raw=window.localStorage.getItem("bowling-teams-v1");
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
  });
  const[leagues,setLeagues]=useState(DEFAULT_LEAGUES);
  const[activeBowler,setActiveBowler]=useState("");
  const[newBowlerName,setNewBowlerName]=useState("");
  const[arsenals,setArsenals]=useState({}); // {bowlerName: [ballName,...]}
  const[newBallName,setNewBallName]=useState("");
  const[form,setForm]=useState(emptyShot());
  const[editingId,setEditingId]=useState(null);
  const[preEditForm,setPreEditForm]=useState(null);
  const[saved,setSaved]=useState(false);
  const[sessionSaved,setSessionSaved]=useState(false);
  const[sessionSaveMessage,setSessionSaveMessage]=useState(null);
  const[filterBall,setFilterBall]=useState("");
  const[filterResult,setFilterResult]=useState("");
  const[filterBowler,setFilterBowler]=useState("");
  const[statsBowler,setStatsBowler]=useState("");
  const[compareBowler,setCompareBowler]=useState("");
  const[statsLeague,setStatsLeague]=useState("");
  const[trendMetric,setTrendMetric]=useState("weekly"); // 0, 1, 2, or "weekly"
  const[trendScope,setTrendScope]=useState(""); // "" = combined both teams, or a specific league
  const[compareLeague,setCompareLeague]=useState("");
  const[sessionLeague,setSessionLeague]=useState("");
  const[sessionDate,setSessionDate]=useState(localDateString());
  const[startingLane,setStartingLane]=useState("");
  const[showSummary,setShowSummary]=useState(false);
  const[confirmClear,setConfirmClear]=useState(false);
  const[showBackup,setShowBackup]=useState(false);
  const[expandedSections,setExpandedSections]=useState({releaseMiss:false,ballChange:false,notes:false,tonightSession:false,arsenal:false,surface:false});
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
  // Dedup safety net: if a slot somehow ends up with more than one shot
  // record (a sync race, a retry that landed twice), keep only the most
  // recently-saved one so a duplicate never double-counts anywhere.
  function migrateShots(rawShots){
    const lastIndexForKey=new Map();
    rawShots.forEach((s,idx)=>{
      const key=`${s.bowler}|${s.league}|${s.date}|${s.game}|${s.frame}|${s.ballNum||""}`;
      lastIndexForKey.set(key,idx);
    });
    return rawShots.filter((s,idx)=>{
      const key=`${s.bowler}|${s.league}|${s.date}|${s.game}|${s.frame}|${s.ballNum||""}`;
      return lastIndexForKey.get(key)===idx;
    });
  }

  // Dedup safety net for sessions, same reasoning as migrateShots.
  function migrateSessions(rawSessions){
    const lastIndexForSessionKey=new Map();
    rawSessions.forEach((s,idx)=>{
      lastIndexForSessionKey.set(`${s.bowler}|${s.league}|${s.date}`,idx);
    });
    return rawSessions.filter((s,idx)=>
      lastIndexForSessionKey.get(`${s.bowler}|${s.league}|${s.date}`)===idx
    );
  }

  useEffect(()=>{
    async function load(){
      try{
        let migratedShots=[];
        // Shots: cloud-first, local storage as the offline fallback/cache.
        // Fetches its own small league id<->name map rather than relying on
        // the separate leagues-loading effect's timing, since effects don't
        // guarantee ordering relative to each other.
        const leaguesForShots=await cloudRead("leagues",q=>q.select("id,name"));
        const leagueNameById={};
        if(leaguesForShots.online&&leaguesForShots.data){
          leaguesForShots.data.forEach(l=>{leagueNameById[l.id]=l.name;});
        }
        const shotsRes=await cloudRead("shots",q=>q.select("*"));
        if(shotsRes.online&&shotsRes.data){
          const pending=await getQueuedRecordsForTable("shots");
          const pendingIds=new Set(pending.map(p=>p.id));
          const cloudShots=shotsRes.data.filter(row=>!pendingIds.has(row.id)).map(row=>shotFromSupabaseRow(row,leagueNameById));
          const pendingShots=pending.map(row=>shotFromSupabaseRow(row,leagueNameById));
          migratedShots=migrateShots([...cloudShots,...pendingShots]);
          setShots(migratedShots);
          try{await window.storage.set(STORAGE_KEY,JSON.stringify(migratedShots));}catch{}
        }else{
          const r=await window.storage.get(STORAGE_KEY);
          if(r){
            const loaded=JSON.parse(r.value);
            migratedShots=migrateShots(loaded);
            setShots(migratedShots);
            if(JSON.stringify(migratedShots)!==JSON.stringify(loaded)){
              try{await window.storage.set(STORAGE_KEY,JSON.stringify(migratedShots));}catch{}
            }
          }
        }
        const sessionsRes=await cloudRead("sessions",q=>q.select("*"));
        if(sessionsRes.online&&sessionsRes.data){
          const pendingSessions=await getQueuedRecordsForTable("sessions");
          const pendingIds=new Set(pendingSessions.map(p=>p.id));
          const cloudSessions=sessionsRes.data.filter(row=>!pendingIds.has(row.id)).map(row=>sessionFromSupabaseRow(row,leagueNameById));
          const pendingSessionObjs=pendingSessions.map(row=>sessionFromSupabaseRow(row,leagueNameById));
          const migratedSessions=migrateSessions([...cloudSessions,...pendingSessionObjs]);
          setSessions(migratedSessions);
          try{await window.storage.set(SESSIONS_KEY,JSON.stringify(migratedSessions));}catch{}
        }else{
          const s=await window.storage.get(SESSIONS_KEY);
          if(s){
            const loadedSessions=JSON.parse(s.value);
            const migratedSessions=migrateSessions(loadedSessions);
            setSessions(migratedSessions);
            if(JSON.stringify(migratedSessions)!==JSON.stringify(loadedSessions)){
              try{await window.storage.set(SESSIONS_KEY,JSON.stringify(migratedSessions));}catch{}
            }
          }
        }
        const bowlersRes=await cloudRead("bowler_names",q=>q.select("name"));
        if(bowlersRes.online&&bowlersRes.data){
          const pendingBowlers=await getQueuedRecordsForTable("bowler_names");
          const names=[...new Set([...bowlersRes.data.map(r=>r.name),...pendingBowlers.map(r=>r.name)])];
          setBowlers(names);
          if(names.length)setActiveBowler(names[0]);
          try{await window.storage.set(BOWLERS_KEY,JSON.stringify(names));}catch{}
        }else{
          const b=await window.storage.get(BOWLERS_KEY);
          if(b){
            const list=JSON.parse(b.value);
            setBowlers(list);
            if(list.length)setActiveBowler(list[0]);
          }
        }

        const arsenalsRes=await cloudRead("arsenals",q=>q.select("bowler_name,ball"));
        if(arsenalsRes.online&&arsenalsRes.data){
          const pendingArsenalRows=await getQueuedRecordsForTable("arsenals");
          const rebuilt={};
          [...arsenalsRes.data,...pendingArsenalRows].forEach(row=>{
            if(!rebuilt[row.bowler_name])rebuilt[row.bowler_name]=[];
            if(!rebuilt[row.bowler_name].includes(row.ball))rebuilt[row.bowler_name].push(row.ball);
          });
          setArsenals(rebuilt);
          try{await window.storage.set(ARSENALS_KEY,JSON.stringify(rebuilt));}catch{}
        }else{
          const a=await window.storage.get(ARSENALS_KEY);
          if(a)setArsenals(JSON.parse(a.value));
        }

        const matchesRes=await cloudRead("matches",q=>q.select("*"));
        if(matchesRes.online&&matchesRes.data){
          const pendingMatches=await getQueuedRecordsForTable("matches");
          const pendingMatchIds=new Set(pendingMatches.map(p=>p.id));
          const cloudMatches=matchesRes.data.filter(row=>!pendingMatchIds.has(row.id)).map(row=>matchFromSupabaseRow(row,leagueNameById));
          const pendingMatchObjs=pendingMatches.map(row=>matchFromSupabaseRow(row,leagueNameById));
          const mergedMatches=[...cloudMatches,...pendingMatchObjs];
          setMatches(mergedMatches);
          try{await window.storage.set(MATCHES_KEY,JSON.stringify(mergedMatches));}catch{}
        }else{
          const m=await window.storage.get(MATCHES_KEY);
          if(m)setMatches(JSON.parse(m.value));
        }

        const lanePatternsRes=await cloudRead("lane_patterns",q=>q.select("*"));
        if(lanePatternsRes.online&&lanePatternsRes.data){
          const pendingPatterns=await getQueuedRecordsForTable("lane_patterns");
          const pendingPatternIds=new Set(pendingPatterns.map(p=>p.id));
          const cloudPatterns=lanePatternsRes.data.filter(row=>!pendingPatternIds.has(row.id)).map(row=>lanePatternFromSupabaseRow(row,leagueNameById));
          const pendingPatternObjs=pendingPatterns.map(row=>lanePatternFromSupabaseRow(row,leagueNameById));
          const mergedPatterns=[...cloudPatterns,...pendingPatternObjs];
          setLanePatterns(mergedPatterns);
          try{await window.storage.set(LANE_PATTERNS_KEY,JSON.stringify(mergedPatterns));}catch{}
        }else{
          const lp=await window.storage.get(LANE_PATTERNS_KEY);
          if(lp)setLanePatterns(JSON.parse(lp.value));
        }
        const bl=await window.storage.get("bowling-ball-lane-lines-v1");
        if(bl)setBallLaneLines(JSON.parse(bl.value));
      }catch{}
    }
    load();
  },[]);

  // Leagues: cloud-first, falling back to whatever's cached locally if
  // there's no signal right now. Local storage doubles as the offline
  // cache here — every successful cloud load mirrors into it, so a later
  // offline load still has something to show instead of nothing.
  useEffect(()=>{
    async function loadLeagues(){
      const{data,online}=await cloudRead("leagues",q=>q.select("id,name"));
      if(online&&data){
        const pending=await getQueuedRecordsForTable("leagues");
        data.forEach(r=>{leagueIdsRef.current[r.name]=r.id;});
        pending.forEach(r=>{if(!leagueIdsRef.current[r.name])leagueIdsRef.current[r.name]=r.id;});
        const names=[...new Set([...data.map(r=>r.name),...pending.map(r=>r.name)])];
        if(names.length){
          setLeagues(names);
          try{await window.storage.set(LEAGUES_KEY,JSON.stringify(names));}catch{}
        }
        return;
      }
      try{
        const lg=await window.storage.get(LEAGUES_KEY);
        if(lg){
          const list=JSON.parse(lg.value);
          if(Array.isArray(list)&&list.length)setLeagues([...new Set(list.map(String).map(s=>s.trim()).filter(Boolean))]);
        }
      }catch{}
    }
    loadLeagues();
  },[]);

  // Live count of writes sitting in the offline queue, not yet confirmed
  // synced to Supabase. Surfaced in the header so "is my data actually
  // reaching the cloud" has a direct, always-visible answer instead of
  // needing to manually check Supabase after every entry.
  const[pendingSyncCount,setPendingSyncCount]=useState(0);
  // Debounce timers for match text fields (opponent, handicap) — typing
  // fires a cloud write on every keystroke otherwise, which is both
  // wasteful and a plausible way to overwhelm the connection with rapid
  // concurrent requests to the same row. Keyed per team+date so editing one
  // match doesn't reset another's pending save.
  const matchSaveTimers=useRef({});
  const lanePatternSaveTimers=useRef({});
  const pokerSaveTimers=useRef({});
  useEffect(()=>{
    getPendingCount().then(setPendingSyncCount);
    return onPendingCountChange(setPendingSyncCount);
  },[]);

  const[showSyncDetail,setShowSyncDetail]=useState(false);
  const[syncBreakdown,setSyncBreakdown]=useState(null);
  async function openSyncDetail(){
    const inspection=await inspectPendingQueue();
    setSyncBreakdown(inspection);
    setShowSyncDetail(true);
  }
  async function handleClearPendingQueue(){
    if(!window.confirm(`Discard all ${pendingSyncCount} queued writes without syncing them? This cannot be undone — anything not yet confirmed as reaching the cloud will be lost.`))return;
    await clearPendingQueue();
    setShowSyncDetail(false);
  }

  // Forces every match currently held locally through a fresh diff-and-sync
  // attempt using whatever the CURRENT code actually does — not a retry of
  // some already-queued payload. Needed because flushPendingQueue() resends
  // a stuck item's stored payload verbatim; it was captured at the moment
  // of the original failure using whatever mapping logic existed then, and
  // never gets re-transformed on retry. If that logic was buggy at the
  // time, every retry just resends the exact same broken data forever —
  // this is the only way to actually apply a fix to data that predates it.
  async function handleResyncAll(){
    await syncShotsToCloud([],shots);
    await syncSessionsToCloud([],sessions);
    await syncMatchesToCloud([],matches);
    await syncLanePatternsToCloud([],lanePatterns);
  }

  async function handleDiscardAndResyncAll(){
    if(!window.confirm(`Discard all ${pendingSyncCount} queued writes, then attempt a fresh sync of everything currently saved on this device? Anything not yet confirmed as reaching the cloud will be lost from the queue, but your local shots, sessions, matches, and lane conditions are untouched and will be re-attempted.`))return;
    await clearPendingQueue();
    handleResyncAll();
    setShowSyncDetail(false);
  }

  const[syncingNow,setSyncingNow]=useState(false);
  async function handleSyncNow(){
    setSyncingNow(true);
    await flushPendingQueue();
    const inspection=await inspectPendingQueue();
    setSyncBreakdown(inspection);
    setSyncingNow(false);
  }

    async function saveBowlers(u){
      const prevSet=new Set(bowlers);
      const nextSet=new Set(u);
      setBowlers(u);
      try{await window.storage.set(BOWLERS_KEY,JSON.stringify(u));}catch{}

      for(const name of prevSet){
        if(!nextSet.has(name))cloudDelete("bowler_names",{name});
      }
      for(const name of nextSet){
        if(!prevSet.has(name))cloudWrite("bowler_names",{id:crypto.randomUUID(),name,created_by:user?.id||null});
      }
    }

    // Arsenals are a nested {bowlerName: [balls]} object locally, but a flat
    // set of (bowler_name, ball) rows in Supabase — diffed as composite
    // pairs (via JSON.stringify, safe against any separator-collision risk
    // a plain string key could have) rather than by a single id.
    async function saveArsenals(u){
      const prevPairs=new Map();
      Object.entries(arsenals).forEach(([bowler,balls])=>{
        balls.forEach(ball=>prevPairs.set(JSON.stringify([bowler,ball]),{bowler,ball}));
      });
      const nextPairs=new Map();
      Object.entries(u).forEach(([bowler,balls])=>{
        balls.forEach(ball=>nextPairs.set(JSON.stringify([bowler,ball]),{bowler,ball}));
      });

      setArsenals(u);
      try{await window.storage.set(ARSENALS_KEY,JSON.stringify(u));}catch{}

      for(const[key,{bowler,ball}]of prevPairs){
        if(!nextPairs.has(key))cloudDelete("arsenals",{bowler_name:bowler,ball});
      }
      for(const[key,{bowler,ball}]of nextPairs){
        if(!prevPairs.has(key))cloudWrite("arsenals",{id:crypto.randomUUID(),bowler_name:bowler,ball,created_by:user?.id||null});
      }
    }
  async function syncLanePatternsToCloud(prevPatterns,nextPatterns){
    const prevById=new Map(prevPatterns.map(p=>[p.id,p]));
    const nextById=new Map(nextPatterns.map(p=>[p.id,p]));
    for(const id of prevById.keys()){
      if(!nextById.has(id))await cloudDelete("lane_patterns",id);
    }
    for(const[id,pattern]of nextById){
      const prev=prevById.get(id);
      if(!prev||JSON.stringify(prev)!==JSON.stringify(pattern)){
        const row=lanePatternToSupabaseRow(pattern,leagueIdsRef.current);
        // Without a real team_id, this write can never succeed — same
        // reasoning as matches, see syncMatchesToCloud.
        if(row.team_id)await cloudWrite("lane_patterns",row);
      }
    }
  }
  async function saveLanePatterns(u){
    const prev=lanePatterns;
    setLanePatterns(u);
    try{await window.storage.set(LANE_PATTERNS_KEY,JSON.stringify(u));}catch{}
    await syncLanePatternsToCloud(prev,u);
  }
  async function saveLeagues(u){setLeagues(u);try{await window.storage.set(LEAGUES_KEY,JSON.stringify(u));}catch{}}

  // Ensures each of these league names has a real row in Supabase, inserting
  // one (with a client-generated id, so it's stable even if this goes
  // through the offline sync queue) for any name not already tracked.
  // Returns the list of names that failed to actually sync, so callers can
  // warn rather than silently trust a write that may never have happened.
  async function ensureLeaguesInCloud(names){
    const failed=[];
    for(const name of names){
      if(!leagueIdsRef.current[name]){
        const id=crypto.randomUUID();
        const result=await cloudWrite("leagues",{id,name,created_by:user?.id||null});
        if(result.synced){
          leagueIdsRef.current[name]=id;
        }else{
          failed.push(name);
        }
      }
    }
    return failed;
  }

  async function addLeague(name){
    const clean=name.trim();
    if(!clean)return;
    if(leagues.some(l=>l.toLowerCase()===clean.toLowerCase())){alert("A league with that name already exists.");return;}
    await saveLeagues([...leagues,clean]);
    const failed=await ensureLeaguesInCloud([clean]);
    if(failed.length){
      alert(`"${clean}" was saved on this device only and hasn't reached the cloud yet — it won't be visible to teammates or usable for creating a team until it syncs. It'll keep retrying in the background if you're offline; check back if this persists.`);
    }
  }

  async function renameLeague(oldName,newName){
    const clean=newName.trim();
    if(!clean||oldName===clean)return;
    if(leagues.some(l=>l!==oldName&&l.toLowerCase()===clean.toLowerCase())){alert("A league with that name already exists.");return;}
    const updatedShots=renameLeagueInRecords(shots,oldName,clean);
    const updatedSessions=renameLeagueInRecords(sessions,oldName,clean);
    const updatedMatches=renameLeagueInRecords(matches,oldName,clean);
    const updatedLanePatterns=renameLeagueInRecords(lanePatterns,oldName,clean);
    const updatedLeagues=leagues.map(l=>l===oldName?clean:l);
    await saveShots(updatedShots);
    await saveSessions(updatedSessions);
    await saveMatches(updatedMatches);
    await saveLanePatterns(updatedLanePatterns);
    await saveLeagues(updatedLeagues);
    // Update the SAME row by its existing id — never delete-and-recreate,
    // since teams.league_id references this row and deleting it would
    // cascade-delete every team in the league.
    const existingId=leagueIdsRef.current[oldName];
    let renameFailed=false;
    if(existingId){
      delete leagueIdsRef.current[oldName];
      leagueIdsRef.current[clean]=existingId;
      const result=await cloudWrite("leagues",{id:existingId,name:clean});
      renameFailed=!result.synced;
    }else{
      const failed=await ensureLeaguesInCloud([clean]);
      renameFailed=failed.length>0;
    }
    if(renameFailed){
      alert(`"${clean}" was renamed on this device only and hasn't reached the cloud yet. It'll keep retrying in the background if you're offline; check back if this persists.`);
    }
    setSessionLeague(v=>v===oldName?clean:v);
    setStatsLeague(v=>v===oldName?clean:v);
    setTrendScope(v=>v===oldName?clean:v);
    setCompareLeague(v=>v===oldName?clean:v);
    setForm(f=>f.league===oldName?{...f,league:clean}:f);
    setPreEditForm(f=>f?.league===oldName?{...f,league:clean}:f);
  }

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

  // The ball used on the most recently logged shot for whoever's active
  // right now (editing an existing shot uses that shot's own bowler/league/
  // date instead). Used to show Ball Change Reason only when the current
  // ball selection actually differs from what was just thrown — not on
  // every shot, and not on the very first shot of the night when there's
  // nothing yet to compare against.
  function previousShotBall(){
    const bowlerName=editingId?form.bowler:activeBowler;
    const league=editingId?form.league:sessionLeague;
    const date=editingId?form.date:sessionDate;
    if(!bowlerName||!league||!date)return null;
    const relevant=shots.filter(s=>s.bowler===bowlerName&&s.league===league&&s.date===date&&s.id!==editingId);
    if(!relevant.length)return null;
    const last=[...relevant].sort((a,b)=>{
      const ga=parseInt(a.game),gb=parseInt(b.game);
      if(ga!==gb)return ga-gb;
      const fa=parseInt(a.frame),fb=parseInt(b.frame);
      if(fa!==fb)return fa-fb;
      return (a.ballNum||0)-(b.ballNum||0);
    }).pop();
    return last?.ball||null;
  }

  function selectBowler(name){
    const team=teams.find(t=>t.league===sessionLeague&&t.members.includes(name));
    const teamId=team?.id||"";
    setActiveBowler(name);
    setShowSummary(false);

    // Everything about the shot itself — equipment, execution, and what
    // happened on the delivery — is specific to whoever's actually at the
    // line right now. None of it should follow from one bowler to another,
    // or linger from this same bowler's last completed shot.
    const resetFields={
      ball:"",surface:"",startingBoard:"",targetArrows:"",
      result:"",otherLeave:[],spareMade:"",strikeDescription:"",
      release:"",miss:[],ballChangeReason:[],pinCount:"",notes:"",
    };

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
        const{game:ng,frame:nf,ballNum:nb}=nextState(allBShots,name,sessionLeague,sessionDate,last.game,last.frame,last.ballNum);
        setForm(f=>({...f,...resetFields,bowler:name,teamId,league:sessionLeague,date:sessionDate,game:ng,frame:nf,ballNum:nb}));
        return;
      }
      // No shots yet for this bowler tonight — start fresh at Game 1 Frame 1
      setForm(f=>({...f,...resetFields,bowler:name,teamId,league:sessionLeague,date:sessionDate,game:"1",frame:"1",ballNum:null}));
      return;
    }
    setForm(f=>({...f,...resetFields,bowler:name}));
  }

  // Every existing call site passes the WHOLE new shots array (unchanged
  // from before this migration) — this diffs it against current state so
  // only what actually changed gets pushed to Supabase, rather than
  // rewriting every shot on every save.
  async function syncShotsToCloud(prevShots,nextShots){
    const prevById=new Map(prevShots.map(s=>[s.id,s]));
    const nextById=new Map(nextShots.map(s=>[s.id,s]));
    for(const id of prevById.keys()){
      if(!nextById.has(id))await cloudDelete("shots",id);
    }
    for(const[id,shot]of nextById){
      const prev=prevById.get(id);
      if(!prev||JSON.stringify(prev)!==JSON.stringify(shot)){
        await cloudWrite("shots",shotToSupabaseRow(shot,user?.id,leagueIdsRef.current));
      }
    }
  }
  async function saveShots(u){
    const prev=shots;
    setShots(u);
    try{await window.storage.set(STORAGE_KEY,JSON.stringify(u));}catch{}
    await syncShotsToCloud(prev,u);
  }
  async function syncSessionsToCloud(prevSessions,nextSessions){
    const prevById=new Map(prevSessions.map(s=>[s.id,s]));
    const nextById=new Map(nextSessions.map(s=>[s.id,s]));
    for(const id of prevById.keys()){
      if(!nextById.has(id))await cloudDelete("sessions",id);
    }
    for(const[id,session]of nextById){
      const prev=prevById.get(id);
      if(!prev||JSON.stringify(prev)!==JSON.stringify(session)){
        await cloudWrite("sessions",sessionToSupabaseRow(session,user?.id,leagueIdsRef.current));
      }
    }
  }
  async function saveSessions(u){
    const prev=sessions;
    setSessions(u);
    try{await window.storage.set(SESSIONS_KEY,JSON.stringify(u));}catch{}
    await syncSessionsToCloud(prev,u);
  }
  async function syncMatchesToCloud(prevMatches,nextMatches){
    const prevById=new Map(prevMatches.map(m=>[m.id,m]));
    const nextById=new Map(nextMatches.map(m=>[m.id,m]));
    for(const id of prevById.keys()){
      if(!nextById.has(id))await cloudDelete("matches",id);
    }
    for(const[id,match]of nextById){
      const prev=prevById.get(id);
      if(!prev||JSON.stringify(prev)!==JSON.stringify(match)){
        const row=matchToSupabaseRow(match,leagueIdsRef.current);
        // Without a real team_id, this write can never succeed — matches
        // RLS requires team_id is not null. Rather than queue a doomed
        // write forever, leave it tracked locally only until the bowler
        // is actually set up as a team member.
        if(row.team_id)await cloudWrite("matches",row);
      }
    }
  }
  async function saveMatches(u){
    const prev=matches;
    setMatches(u);
    try{await window.storage.set(MATCHES_KEY,JSON.stringify(u));}catch{}
    await syncMatchesToCloud(prev,u);
  }

  // Matches are keyed by teamId (not league) so two teams in the same
  // league on the same date don't collide into one shared record. league is
  // still carried on each record for the stats-reading side (seasonRecord,
  // weeklyPointsData, handicapMatches), which filter by league and don't
  // need to change.
  function getMatch(teamId,date,league){
    const byTeam=matches.find(m=>m.teamId===teamId&&m.date===date);
    if(byTeam)return byTeam;
    // Falls back to league+date when the team_id-based lookup finds
    // nothing — this happens when a bowler's team-membership resolution
    // has changed since the match was originally saved (not yet a real
    // team member when first logged, but resolves differently now), so
    // today's teamId no longer matches what's actually stored on the old
    // record even though it's the same match.
    if(league)return matches.find(m=>m.league===league&&m.date===date);
    return null;
  }

  // Lane condition (oil pattern) for a specific lane on a specific night —
  // defaults to House Shot implicitly (no record needed) until the user
  // actively records an official pattern for that lane. Lookup stays
  // league+date+lane based (unaffected by team resolution) since a lane's
  // physical condition isn't inherently team-specific — teamId is only
  // attached at creation time, for the Supabase row's RLS/ownership.
  function getLanePattern(league,date,lane){
    return lanePatterns.find(p=>p.league===league&&p.date===date&&String(p.lane)===String(lane));
  }
  function setLanePattern(teamId,league,date,lane,updates){
    const existing=getLanePattern(league,date,lane);
    const prevPatterns=lanePatterns;
    const updatedPatterns=existing
      ?lanePatterns.map(p=>p===existing?{...p,...updates}:p)
      :[...lanePatterns,{id:crypto.randomUUID(),teamId,league,date,lane:String(lane),patternType:"house",patternName:"",length:"",volume:"",ratio:"",...updates}];

    setLanePatterns(updatedPatterns);
    try{window.storage.set(LANE_PATTERNS_KEY,JSON.stringify(updatedPatterns));}catch{}

    const debounceKey=`${teamId}|${date}|${lane}`;
    clearTimeout(lanePatternSaveTimers.current[debounceKey]);
    lanePatternSaveTimers.current[debounceKey]=setTimeout(()=>{
      syncLanePatternsToCloud(prevPatterns,updatedPatterns);
    },600);
  }
  // Cycles a result through Not Marked → Won → Lost → Not Marked
  function nextResult(cur){ return cur===null?true:cur===true?false:null; }

  async function cycleGameResult(teamId,league,date,gameIdx){
    const existing=getMatch(teamId,date,league);
    if(existing){
      const games=[...existing.games];
      games[gameIdx]=nextResult(games[gameIdx]??null);
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,games}:m));
    } else {
      const games=[null,null,null];
      games[gameIdx]=true;
      await saveMatches([...matches,{id:crypto.randomUUID(),teamId,league,date,games,series:null,opponent:"",handicap:""}]);
    }
  }

  async function cycleSeriesResult(teamId,league,date){
    const existing=getMatch(teamId,date,league);
    if(existing){
      await saveMatches(matches.map(m=>m.id===existing.id?{...m,series:nextResult(existing.series??null)}:m));
    } else {
      await saveMatches([...matches,{id:crypto.randomUUID(),teamId,league,date,games:[null,null,null],series:true,opponent:"",handicap:""}]);
    }
  }

  function updateMatchField(teamId,league,date,field,value){
    const existing=getMatch(teamId,date,league);
    const prevMatches=matches;
    const updatedMatches=existing
      ?matches.map(m=>m.id===existing.id?{...m,[field]:value}:m)
      :[...matches,{id:crypto.randomUUID(),teamId,league,date,games:[null,null,null],series:null,opponent:"",handicap:"",[field]:value}];

    setMatches(updatedMatches);
    try{window.storage.set(MATCHES_KEY,JSON.stringify(updatedMatches));}catch{}

    const debounceKey=`${teamId}|${date}`;
    clearTimeout(matchSaveTimers.current[debounceKey]);
    matchSaveTimers.current[debounceKey]=setTimeout(()=>{
      syncMatchesToCloud(prevMatches,updatedMatches);
    },600);
  }
  function setMatchOpponent(teamId,league,date,opponent){
    updateMatchField(teamId,league,date,"opponent",opponent);
  }
  function setMatchHandicap(teamId,league,date,value){
    updateMatchField(teamId,league,date,"handicap",value);
  }

  // Normalizes legacy per-game handicap arrays (from before this was a single
  // value) down to one number, so old saved data still displays correctly.
  function matchHandicap(m){
    if(!m)return "";
    if(Array.isArray(m.handicap))return m.handicap.find(v=>v!=="" && v!=null) ?? "";
    return m.handicap ?? "";
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
      // in strictPartial, which expects exactly one shot per slot.
      const existingSlot=findExistingShotSlot(shots,form);
      const toSave={
        ...form,
        id:existingSlot?existingSlot.id:crypto.randomUUID(),
        result:effectiveResult,
        _displayResult:form.result,
        _displayLeave:[...(form.otherLeave||[])],
        lane:autoLane?String(autoLane):form.lane,
      };
      const updated=existingSlot?shots.map(s=>s.id===existingSlot.id?toSave:s):[...shots,toSave];
      await saveShots(updated);

      // Determine next frame/game/ballNum
      const{game:ng,frame:nf,ballNum:nb}=nextState(updated,form.bowler,form.league,form.date,form.game,form.frame,form.ballNum);

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
    await saveLanePatterns([]);
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
      shots,sessions,bowlers,arsenals,matches,ballLaneLines,lanePatterns,leagues,
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
    const discoveredLeagues=[
      ...(Array.isArray(data.leagues)?data.leagues:[]),
      ...newShots.map(s=>s.league),
      ...newSessions.map(s=>s.league),
      ...newMatches.map(m=>m.league),
      ...newLanePatterns.map(p=>p.league),
    ].filter(Boolean);
    const importedLeagues=[...new Set(discoveredLeagues.map(String).map(s=>s.trim()).filter(Boolean))];
    const migratedShots=migrateShots(newShots);
    await saveShots(migratedShots);
    await saveSessions(migrateSessions(newSessions));
    await saveBowlers(newBowlers);
    await saveArsenals(newArsenals);
    await saveMatches(newMatches);
    await saveLanePatterns(newLanePatterns);
    const finalLeagues=importedLeagues.length?importedLeagues:DEFAULT_LEAGUES;
    await saveLeagues(finalLeagues);
    const failedLeagues=await ensureLeaguesInCloud(finalLeagues);
    if(failedLeagues.length){
      alert(`These leagues were restored on this device only and haven't reached the cloud yet: ${failedLeagues.join(", ")}. They'll keep retrying in the background if you're offline.`);
    }
    setBallLaneLines(newBallLaneLines);
    try{window.localStorage.setItem("bowling-ball-lane-lines-v1",JSON.stringify(newBallLaneLines));}catch{}
    if(newBowlers.length)setActiveBowler(newBowlers[0]);
  }

  // ── Score helpers ─────────────────────────────────────────────────────────

  // Strict running score: only frames with fully resolved bonus balls

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
    if(!scores.length){
      // Previously silently did nothing here — no feedback at all, even
      // though this is a common, valid state (e.g. only the match points
      // have been entered so far, no shots logged yet for this night).
      // Says so plainly instead of leaving the tap looking like it failed.
      setSessionSaveMessage("No shots logged yet for this night");
      setTimeout(()=>setSessionSaveMessage(null),2000);
      return;
    }
    const ss=shots.filter(s=>s.bowler===activeBowler&&s.league===sessionLeague&&s.date===sessionDate);
    // A session is uniquely identified by bowler+league+date. If one already
    // exists (e.g. a double-tap on Save), update it in place rather than
    // adding a duplicate — a duplicate would silently double-count this
    // night in every average, the leaderboard, and the season record.
    const existing=sessions.find(s=>s.bowler===activeBowler&&s.league===sessionLeague&&s.date===sessionDate);
    const session={
      id:existing?existing.id:crypto.randomUUID(),bowler:activeBowler,teamId:ss[0]?.teamId||"",league:sessionLeague,date:sessionDate,scores,
      total:scores.reduce((a,b)=>a+b,0),
      average:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length),
      pokerQuarter:existing?.pokerQuarter||[0,0,0],
      pokerDollar:existing?.pokerDollar||[0,0,0],
      ...computeSessionStats(ss),
    };
    const updated=existing?sessions.map(s=>s.id===existing.id?session:s):[...sessions,session];
    await saveSessions(updated);
    setShowSummary(true);
    setSessionSaved(true);
    setTimeout(()=>setSessionSaved(false),1500);
  }

  // Updates one game's poker winnings on an already-saved session. Local
  // state updates instantly; the cloud sync is debounced the same way
  // match opponent/handicap and lane pattern fields are, since typing a
  // dollar amount digit-by-digit would otherwise fire a write per
  // keystroke.
  function setPokerWinnings(sessionId,gameIdx,type,amount){
    const prevSessions=sessions;
    const key=type==="quarter"?"pokerQuarter":"pokerDollar";
    const updatedSessions=sessions.map(s=>{
      if(s.id!==sessionId)return s;
      const arr=[...(s[key]||[0,0,0])];
      arr[gameIdx]=amount;
      return{...s,[key]:arr};
    });
    setSessions(updatedSessions);
    try{window.storage.set(SESSIONS_KEY,JSON.stringify(updatedSessions));}catch{}

    const debounceKey=`${sessionId}|${type}`;
    clearTimeout(pokerSaveTimers.current[debounceKey]);
    pokerSaveTimers.current[debounceKey]=setTimeout(()=>{
      syncSessionsToCloud(prevSessions,updatedSessions);
    },600);
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
    return tenthFrameStatus(shots,form.bowler,form.league,form.date,form.game);
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
  // Specifically the lone 5-pin (not any other single pin) — a shot the
  // request specifically wants counted as a named stat, not folded into
  // the general single-pin spare rate above.
  const fivePinAttempts=statsShots.filter(s=>s.result==="Other Leave"&&Array.isArray(s.otherLeave)&&s.otherLeave.filter(p=>p!=="9 Pin No-Tap").length===1&&s.otherLeave.includes("5")&&s.spareMade!=="");
  const fivePinMisses=fivePinAttempts.filter(s=>s.spareMade==="No").length;
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
  const freshRackCount=freshRackShots(statsShots);

  // The bowler's average of their most recent N (default 10) fresh-rack
  // first-ball deliveries, ordered chronologically, counting only
  // deliveries strictly BEFORE the given reference shot. Always
  // computable given at least one prior fresh-rack delivery exists
  // anywhere in the bowler's history — frames 1-9 of the SAME game alone
  // already provide up to 9 of them, so even a bowler's very first game
  // has this available by the time the 10th frame is reached.
  // The value to use for a theoretical 10th-frame fill ball: the bowler's
  // cumulative first-ball average from every OTHER game they've bowled,
  // blended with THIS specific game's own first-ball average so far
  // (frames 1-9 plus the 10th frame's own first ball, up to 10 values).
  // If no other games exist yet (this is their very first game), uses
  // only this game's data — there's nothing else to blend with.

  // Theoretical score for one specific game: what the bowler would have
  // scored had every makeable spare (including the 10th frame's first
  // ball, filled with their own recent first-ball average) been converted.
  // Returns null if that game isn't fully logged yet.
  function theoreticalScoreForGame(bowler,league,date,game){
    const gameShots=shots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date&&s.game===String(game));
    if(!gameShots.length)return null;
    const f10b1=gameShots.find(s=>parseInt(s.frame)===10&&(!s.ballNum||s.ballNum===1));
    const avgFB=f10b1?theoreticalFillBallValue(shots,bowler,league,date,game):null;
    const team=teams.find(t=>t.league===league);
    const isLeftHanded=!!team?.memberHandedness?.[bowler];
    const theoretical=makeTheoreticalShots(gameShots,isLeftHanded,avgFB);
    return strictPartial(theoretical);
  }

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
  // Filtered by league name, not team_id — a shot's league is set directly
  // and reliably at log time, matching statsShots' approach for the same
  // team viewed directly. team_id depends on team-membership resolution
  // that's proven fragile (a bowler not yet recognized as a team member
  // when a shot was logged, a team recreated afterward, etc.), so relying
  // on it here could silently compare against a skewed subset of shots
  // that share a league but disagree on team_id for reasons that have
  // nothing to do with which team they actually belong to.
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
        <div>
          <div style={S.title}>🎳 Shot Tracker</div>
          {pendingSyncCount>0?(
            <button onClick={openSyncDetail} style={{background:"none",border:"none",padding:0,fontSize:"10px",fontWeight:600,color:C.spare,marginTop:"2px",cursor:"pointer",textDecoration:"underline"}}>
              ⏳ {pendingSyncCount} syncing… (tap for details)
            </button>
          ):(
            <div style={{fontSize:"10px",fontWeight:600,color:C.strike,marginTop:"2px"}}>✓ All synced</div>
          )}
        </div>
        <div style={S.nav}>
          {["log","history","stats","teams","friends"].map(v=>(
  <button key={v} style={S.navBtn(view===v)} onClick={()=>setView(v)}>
    {v==="log"?"Log":v==="history"?"History":v==="stats"?"Stats":v==="teams"?"Teams":"Friends"}
  </button>
))}
        </div>
      </div>

      {showSyncDetail&&syncBreakdown&&(
        <div style={{...S.card,margin:"12px 16px",border:`1px solid ${C.spare}44`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
            <div style={S.label}>Pending Sync — {syncBreakdown.total} total</div>
            <button style={{...S.btn(),padding:"4px 10px",fontSize:"11px"}} onClick={()=>setShowSyncDetail(false)}>Close</button>
          </div>
          {Object.entries(syncBreakdown.byTable).length===0?(
            <div style={{fontSize:"12px",color:C.textMuted}}>Nothing queued.</div>
          ):(
            <div style={{marginBottom:"10px"}}>
              {Object.entries(syncBreakdown.byTable).map(([table,count])=>(
                <div key={table} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px"}}>
                    <span style={{color:C.text}}>{table}</span>
                    <span style={{color:C.textMuted}}>{count}</span>
                  </div>
                  {syncBreakdown.reasonsByTable?.[table]&&(
                    <div style={{fontSize:"11px",color:C.miss,marginTop:"3px",fontFamily:"monospace"}}>
                      {syncBreakdown.reasonsByTable[table]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
            These writes haven't been confirmed as reaching the cloud. Sync Now retries them immediately instead of waiting for the automatic retry — if the underlying issue is actually fixed, this drains the queue without losing anything. If it's still stuck after retrying, clearing discards all of it without syncing, which can't be undone.
          </div>
          <button style={{...S.btn("primary"),marginBottom:"8px"}} onClick={handleSyncNow} disabled={syncingNow}>
            {syncingNow?"Syncing…":"Sync Now"}
          </button>
          <button style={S.btn("warn")} onClick={handleClearPendingQueue}>Discard All Queued Writes</button>
          <div style={{fontSize:"11px",color:C.textMuted,margin:"10px 0"}}>
            If a stuck item's error message looks like bad data rather than a connection issue (e.g. a value that clearly shouldn't be there), Sync Now will keep failing on it forever — it resends exactly what's already stored, not a fresh attempt. This clears the queue AND re-attempts your actual local shots, sessions, matches, and lane conditions fresh, using whatever the app currently does.
          </div>
          <button style={{...S.btn(),width:"100%",color:C.accent,borderColor:C.accent+"44"}} onClick={handleDiscardAndResyncAll}>Discard &amp; Resync Everything</button>
        </div>
      )}

      <div style={S.content}>
        
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TEAMS VIEW                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="teams"&&(
          <TeamManagement
            leagues={leagues}
            onTeamsChange={setTeams}
            onLeagueAdd={addLeague}
            onLeagueRename={renameLeague}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* FRIENDS VIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="friends"&&(
          <Friends/>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LOG VIEW                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="log"&&(
          <LogView
            shots={shots} sessions={sessions} bowlers={bowlers} footerHeight={footerHeight} footerRef={footerRef} teams={teams} leagues={leagues}
            activeBowler={activeBowler} newBowlerName={newBowlerName} setNewBowlerName={setNewBowlerName} arsenals={arsenals} newBallName={newBallName} setNewBallName={setNewBallName}
            form={form} setForm={setForm} editingId={editingId} saved={saved} sessionSaved={sessionSaved} sessionSaveMessage={sessionSaveMessage}
            sessionLeague={sessionLeague} setSessionLeague={setSessionLeague} sessionDate={sessionDate} setSessionDate={setSessionDate}
            startingLane={startingLane} setStartingLane={setStartingLane} setShowSummary={setShowSummary} expandedSections={expandedSections}
            ballNumLabel={ballNumLabel} curSession={curSession} currentLane={currentLane} firstBallPins={firstBallPins} g1score={g1score} g2score={g2score} g3score={g3score}
            hasLeave={hasLeave} inTenth={inTenth} isNoTap={isNoTap} isStrike={isStrike} needsSpareMade={needsSpareMade} sessionTotal={sessionTotal} showPinCount={showPinCount}
            standingPins={standingPins} tenthOptions={tenthOptions}
            addBall={addBall} addBowler={addBowler} autoFillLine={autoFillLine} calcLane={calcLane} cancelEdit={cancelEdit} cycleGameResult={cycleGameResult} cycleSeriesResult={cycleSeriesResult}
            getLanePattern={getLanePattern} getMatch={getMatch} handleBallChange={handleBallChange} handleLeaveToggle={handleLeaveToggle} handleLineChange={handleLineChange}
            handleSpareMadeToggle={handleSpareMadeToggle} matchHandicap={matchHandicap} previousShotBall={previousShotBall} removeBall={removeBall} removeBowler={removeBowler}
            selectBowler={selectBowler} set={set} setLanePattern={setLanePattern} setMatchHandicap={setMatchHandicap} setMatchOpponent={setMatchOpponent} setPokerWinnings={setPokerWinnings}
            stepPinCount={stepPinCount} submitSession={submitSession} submitShot={submitShot} theoreticalScoreForGame={theoreticalScoreForGame} toggle={toggle} toggleMulti={toggleMulti} toggleSection={toggleSection}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HISTORY VIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="history"&&(
          <HistoryView
            bowlers={bowlers} leagues={leagues}
            filterBowler={filterBowler} setFilterBowler={setFilterBowler}
            filterBall={filterBall} setFilterBall={setFilterBall}
            filterResult={filterResult} setFilterResult={setFilterResult}
            filtered={filtered} ballUniverse={ballUniverse}
            startEdit={startEdit} deleteShot={deleteShot}
          />
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
                      a.download=`bowling-backup-${localDateString()}.json`;
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
                      {leagues.map(l=>{
  const isSelected=statsLeague===l&&!statsBowler;
  return(
    <Chip key={l} label={`${l.replace(" House Shot","")} Team`} selected={isSelected} onToggle={()=>{
      setStatsLeague(isSelected?"":l);
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
                          {leagues.filter(l=>l!==statsLeague).map(l=>(
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
                  const recordsBowler=statsBowler||(!statsLeague&&bowlers.length<=1?(bowlers[0]||""):"");
                  if(!recordsBowler&&!statsLeague&&bowlers.length>1){
                    return(
                      <div style={S.card}>
                        <div style={S.label}>Team Records</div>
                        <div style={{fontSize:"12px",color:C.textMuted}}>Select "Tuesday Team" or "Thursday Team" above to see this — high game/series need one specific roster, since combining different-sized teams would unfairly favor whichever has more bowlers.</div>
                      </div>
                    );
                  }
                  const hg=recordsBowler?bowlerHighGame(sessions,recordsBowler):teamHighGame(sessions,statsLeague);
                  const hs=recordsBowler?bowlerHighSeries(sessions,recordsBowler):teamHighSeries(sessions,statsLeague);
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
                  const rMain=seasonRecord(matches,statsLeague);
                  if(!rMain.gameWins&&!rMain.gameLosses&&!rMain.seriesWins&&!rMain.seriesLosses)return null;
                  const otherRecords=leagues.filter(l=>l!==statsLeague).map(league=>({league,record:seasonRecord(matches,league)})).filter(x=>x.record.gameWins+x.record.gameLosses+x.record.seriesWins+x.record.seriesLosses>0);
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
                        <div style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:C.strike}}>{rMain.gameWins}-{rMain.gameLosses}</div><div style={S.statLbl}>Games</div></div>
                        <div style={S.statBox}><div style={{...S.statNum,fontSize:"18px",color:C.spare}}>{rMain.seriesWins}-{rMain.seriesLosses}</div><div style={S.statLbl}>Pinfall</div></div>
                      </div>
                      {!statsLeague&&otherRecords.map(({league,record})=><div key={league} style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>{league.replace(" House Shot","")}: {record.pointsWon}/{record.pointsAvailable} points ({record.gameWins}-{record.gameLosses} games, {record.seriesWins}-{record.seriesLosses} pinfall)</div>)}
                    </div>
                  );
                })()}

                {!statsBowler&&(()=>{
                  const weekly=weeklyPointsData(matches,statsLeague);
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
                  const sorted=[...leagueBowlers].sort((a,b)=>(cAvg(sessions,b,statsLeague)||0)-(cAvg(sessions,a,statsLeague)||0));
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Team Leaderboard</div>
                      {sorted.map(b=>{
                        const avg=cAvg(sessions,b,statsLeague);
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
                  const tally=beatHighBowlerStats(sessions,statsLeague);
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
                  const counts=hungCounts(shots,statsLeague);
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

                  // Rows stay fixed regardless of which night — union of
                  // every bowler who appears on any of these team nights,
                  // in lineup order, rather than per-night bowler lists.
                  const allBowlerNames=[...new Set(teamDates.flatMap(g=>g.entries.map(e=>e.bowler)))];
                  const rowBowlers=lineupSort(allBowlerNames,statsLeague||teamDates[0]?.league,teams);
                  const rowH=28,totalRowH=32,colW=62,nameColW=84;

                  return(
                    <div style={S.card}>
                      <div style={S.label}>Team Series</div>
                      <div style={{display:"flex"}}>
                        {/* Fixed name column -- stays put while dates scroll */}
                        <div style={{flexShrink:0,width:`${nameColW}px`}}>
                          <div style={{height:`${rowH}px`}}/>
                          {rowBowlers.map(name=>(
                            <div key={name} style={{height:`${rowH}px`,display:"flex",alignItems:"center",fontSize:"12px",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                          ))}
                          <div style={{height:`${totalRowH}px`,display:"flex",alignItems:"center",fontSize:"12px",fontWeight:700,color:C.accent,borderTop:`1px solid ${C.border}`,marginTop:"4px"}}>Team Total</div>
                        </div>
                        {/* Scrollable date columns, most recent on the left */}
                        <div style={{overflowX:"auto",flex:1}}>
                          <div style={{display:"flex"}}>
                            {teamDates.map((g,i)=>(
                              <div key={i} style={{flexShrink:0,width:`${colW}px`,borderLeft:`1px solid ${C.border}`,paddingLeft:"6px"}}>
                                <div style={{height:`${rowH}px`,display:"flex",alignItems:"center",fontSize:"10px",color:C.textMuted}}>
                                  {statsLeague?g.date.slice(5):`${g.league.startsWith("Tuesday")?"Tu":"Th"} ${g.date.slice(5)}`}
                                </div>
                                {rowBowlers.map(name=>{
                                  const e=g.entries.find(en=>en.bowler===name);
                                  return(
                                    <div key={name} style={{height:`${rowH}px`,display:"flex",alignItems:"center",fontSize:"12px",fontWeight:600}}>{e?e.total:"—"}</div>
                                  );
                                })}
                                <div style={{height:`${totalRowH}px`,display:"flex",alignItems:"center",fontSize:"13px",fontWeight:700,color:C.accent,borderTop:`1px solid ${C.border}`,marginTop:"4px"}}>
                                  {g.entries.reduce((a,e)=>a+e.total,0)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
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

                {fivePinAttempts.length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Lone 5-Pin</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>The 5-pin standing completely alone, nothing else in the way.</div>
                    <div style={{display:"flex",gap:"8px"}}>
                      <div style={{...S.statBox,border:`1px solid ${C.miss}44`}}>
                        <div style={{...S.statNum,color:C.miss,fontSize:"20px"}}>{fivePinMisses}</div>
                        <div style={S.statLbl}>Misses</div>
                      </div>
                      <div style={S.statBox}>
                        <div style={{...S.statNum,color:C.textMuted,fontSize:"20px"}}>{fivePinAttempts.length-fivePinMisses}/{fivePinAttempts.length}</div>
                        <div style={S.statLbl}>Made / Attempts</div>
                      </div>
                    </div>
                  </div>
                )}

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

                {sessions.length>0&&(()=>{
                  const leagueAvgs=leagues.map(league=>({league,avg:rAvg(sessions,statsBowler,league)})).filter(x=>x.avg!=null);
                  const combined=cAvg(sessions,statsBowler);
                  if(!leagueAvgs.length&&!combined)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Running Averages</div>
                      {isTeamView&&<div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Top number is the average bowler's score. "Team" below it is what the whole team scores together that game.</div>}
                      <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap"}}>
                        {leagueAvgs.map(({league,avg})=>(
                          <div key={league} style={S.statBox}>
                            <div style={S.statNum}>{avg}</div>
                            <div style={S.statLbl}>{league.replace(" House Shot","")}</div>
                            {isTeamView&&teamGameTotalAvg(sessions,league)!=null&&<div style={{fontSize:"11px",color:C.accent,fontWeight:600,marginTop:"2px"}}>Team: {teamGameTotalAvg(sessions,league)}</div>}
                            {showTeamCompare&&<CompareBadge value={avg} teamValue={compareBowler?rAvg(sessions,compareBowler,league):(isTeamView?teamGameTotalAvg(sessions,league):rAvg(sessions,"",league))} label={compareLabel}/>}
                          </div>
                        ))}
                        {!statsLeague&&(!statsBowler||bowlerLeagueCount>1)&&combined&&(<div style={{...S.statBox,border:`1px solid ${C.accent}44`}}><div style={{...S.statNum,color:C.accent}}>{combined}</div><div style={S.statLbl}>Combined</div>{showTeamCompare&&compareBowler&&<CompareBadge value={combined} teamValue={cAvg(sessions,compareBowler)} label={compareLabel}/>}</div>)}
                      </div>
                      {!statsLeague&&showTeamCompare&&!compareBowler&&<div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px"}}>Combined spans all leagues, so there's no single team to compare it against — pick a specific bowler under "Compare To", or select a specific league above.</div>}
                    </div>
                  );
                })()}

                {(()=>{
                  const relevantSessions=sessions.filter(s=>(statsBowler?s.bowler===statsBowler:true)&&(statsLeague?s.league===statsLeague:true));
                  const theoreticalGameScores=relevantSessions.flatMap(s=>
                    [1,2,3].map(g=>theoreticalScoreForGame(s.bowler,s.league,s.date,g)).filter(v=>v!=null)
                  );
                  if(!theoreticalGameScores.length)return null;
                  const theoreticalAvg=theoreticalGameScores.reduce((a,b)=>a+b,0)/theoreticalGameScores.length;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Theoretical Average</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>What the average would be if every makeable spare (not a split, not a washout) had been made — including a theoretical 10th-frame fill ball, estimated from each game's own recent first-ball average at that point.</div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <div style={{...S.statBox,border:`1px solid ${C.spare}44`}}>
                          <div style={{...S.statNum,color:C.spare}}>{Math.floor(theoreticalAvg)}</div>
                          <div style={S.statLbl}>Theoretical Avg</div>
                        </div>
                        <div style={S.statBox}>
                          <div style={{...S.statNum,color:C.textMuted}}>{theoreticalGameScores.length}</div>
                          <div style={S.statLbl}>Games</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {(()=>{
                  const relevantSessions=sessions.filter(s=>(statsBowler?s.bowler===statsBowler:true)&&(statsLeague?s.league===statsLeague:true));
                  const totalQuarter=relevantSessions.reduce((sum,s)=>sum+(s.pokerQuarter||[0,0,0]).reduce((a,b)=>a+(b||0),0),0);
                  const totalDollar=relevantSessions.reduce((sum,s)=>sum+(s.pokerDollar||[0,0,0]).reduce((a,b)=>a+(b||0),0),0);
                  if(!relevantSessions.length)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{isTeamView?"Team Poker Winnings":"Poker Winnings"}</div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <div style={{...S.statBox,border:`1px solid ${C.spare}44`}}>
                          <div style={{...S.statNum,color:C.spare}}>${totalQuarter.toFixed(2)}</div>
                          <div style={S.statLbl}>Quarter Game</div>
                        </div>
                        <div style={{...S.statBox,border:`1px solid ${C.strike}44`}}>
                          <div style={{...S.statNum,color:C.strike}}>${totalDollar.toFixed(2)}</div>
                          <div style={S.statLbl}>Dollar Game</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}


                {(()=>{
                  const progress=avgProgress(sessions,statsBowler,statsLeague);
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
                  const consistency=scoreConsistency(sessions,statsBowler,statsLeague);
                  if(!consistency)return null;
                  const compareConsistency=showTeamCompare?scoreConsistency(sessions,compareBowler,compareLeague,!isTeamView):null;
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
                  const values=scoreValues(sessions,statsBowler,statsLeague);
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

                {sessions.length>0&&(gameAvg(sessions,statsBowler,0,statsLeague)||gameAvg(sessions,statsBowler,1,statsLeague)||gameAvg(sessions,statsBowler,2,statsLeague))&&(
                  <div style={S.card}>
                    <div style={S.label}>Game-by-Game Averages</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      Cumulative average at each position in the night, across the whole season — shows whether {statsBowler?"they're":"the team is"} bowling better early, middle, or late.
                      {isTeamView&&" \"Team\" is what the whole team scores together at that position."}
                    </div>
                    <div style={{display:"flex",gap:"6px"}}>
                      {[0,1,2].map(idx=>{
                        const v=gameAvg(sessions,statsBowler,idx,statsLeague);
                        if(v==null)return null;
                        const teamV=(isTeamView&&statsLeague)?teamGameTotalAvgAt(sessions,statsLeague,idx):null;
                        return(
                          <div key={idx} style={{...S.statBox,padding:"8px 4px",minWidth:0}}>
                            <div style={{...S.statNum,fontSize:"18px"}}>{v}</div>
                            <div style={{...S.statLbl,fontSize:"9px"}}>Game {idx+1}</div>
                            {teamV!=null&&<div style={{fontSize:"10px",color:C.accent,fontWeight:600,marginTop:"2px"}}>Team: {teamV}</div>}
                            {showTeamCompare&&<CompareBadge value={v} teamValue={compareBowler?gameAvg(sessions,compareBowler,idx,compareLeague):(isTeamView?teamGameTotalAvgAt(sessions,compareLeague,idx):gameAvg(sessions,"",idx,compareLeague))} label={compareLabel}/>}
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
                        {leagues.map(l=>(
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
                          This deletes every logged shot, session, match result (opponents, handicaps, win/loss), and lane condition note. This can't be undone.
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
