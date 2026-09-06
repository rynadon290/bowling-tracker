import { useState, useEffect, useRef } from "react";
import TeamManagement from "./TeamManagement.jsx";
import Friends from "./Friends.jsx";
import HistoryView from "./HistoryView.jsx";
import LogView from "./LogView.jsx";
import StatsView from "./StatsView.jsx";
import ImportScorecard from "./ImportScorecard.jsx";
import Settings from "./Settings.jsx";
import Profile from "./Profile.jsx";
import TournamentSession from "./TournamentSession.jsx";
import SessionStart from "./SessionStart.jsx";
import InsightsView from "./InsightsView.jsx";
import { useAuth } from "./AuthProvider.jsx";
import { supabase } from "./supabaseClient.js";
import { cloudRead, cloudWrite, cloudUpdate, cloudDelete, getQueuedRecordsForTable, getPendingCount, onPendingCountChange, inspectPendingQueue, clearPendingQueue, discardQueuedTable, flushPendingQueue } from "./syncQueue.js";
import { isSplit, isTenPinLeave, isSinglePinLeave, isWashout, isMakeableSpare } from "./domain/splits.js";
import {
  isStk, firstBallOf, secondBallOf, tenthBall3Available, tenthBall3Pins,
  nextState, tenthFrameStatus, strictPartial, frameQualityScore, makeTheoreticalShots,
  freshRackShots, theoreticalFillBallValue,
} from "./domain/scoring.js";
import { emptyShot, computeSessionStats, findExistingShotSlot } from "./domain/sessions.js";
import { normalizeLayout } from "./domain/layouts.js";
import { profileFromRow, profileToRow, emptyProfile, normalizeProfile, resolveHandedness } from "./domain/profiles.js";
import { emptyTournament, normalizeTournament, tournamentToRow, tournamentFromRow } from "./domain/tournaments.js";
import { emptyBag, normalizeBag, bagToRow, bagFromRow, availableBalls, bagsForEnvironment, bagHasRoom, toggleBallInBag, removeBagMemberships, ballsByBagFor, membershipKey } from "./domain/bags.js";
import { DEFAULT_BALL_GROUPS, emptyBallSpecs, normalizeBallSpecs, specsToRow, specsFromRow, groupToRow, groupFromRow } from "./domain/ballSpecs.js";
import { ballKey, catalogState, bestEntry, rejectedBallsFor, clearedSpecsAfterRejection, canVote } from "./domain/ballCatalog.js";
import { normalizeCenter, centerToRow, centerFromRow, findExistingCenter, statsByCenter } from "./domain/centers.js";
import { visibleLeagues, isLeagueHidden, teamsInLeague, describeLeaveImpact, leaveConfirmationText } from "./domain/leagueMembership.js";
import { setManualScore as setManualScoreIn, getManualScore, resolveGameScore, normalizeManualScores, manualScoreToRow, manualScoresFromRows, isManualNight } from "./domain/manualScores.js";
import { bowlerHighGame, bowlerHighSeries, teamDateGroups, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData, gameAvg, teamGameTotalAvg, teamGameTotalAvgAt, rAvg, cAvg, avgProgress, cumulativeAvgBeforeDate, hungCounts, beatHighBowlerStats, scoreValues, scoreConsistency, histogramBuckets } from "./domain/stats.js";
import { lineupSort, renameLeagueInRecords } from "./domain/leagues.js";
import { C, S, Chip } from "./ui.jsx";
import { DEFAULT_ARSENAL, MISSES, DEFAULT_LEAGUES, localDateString } from "./constants.js";
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
const LAYOUTS_KEY = "bowling-ball-layouts-v1";
const PROFILES_KEY = "bowling-bowler-profiles-v1";
const TOURNAMENT_KEY = "bowling-active-tournament-v1";
const BAGS_KEY = "bowling-bags-v1";
const BALL_BAGS_KEY = "bowling-ball-bag-assignments-v1";
const BALL_SPECS_KEY = "bowling-ball-specs-v1";
const BALL_GROUPS_KEY = "bowling-ball-groups-v1";
const CATALOG_ACK_KEY = "bowling-catalog-ack-v1";
const CENTERS_KEY = "bowling-centers-v1";
const LEAGUE_CENTERS_KEY = "bowling-league-centers-v1";
const HIDDEN_LEAGUES_KEY = "bowling-hidden-leagues-v1";
const MANUAL_SCORES_KEY = "bowling-manual-scores-v1";
const SESSION_START_KEY = "bowling-session-start-dismissed-v1";
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








// A stable id derived from a natural key, so writes that represent "the
// same logical row" upsert instead of colliding with a unique constraint.
// Used where a table has a uniqueness rule the app must respect on retry:
// one vote per (user, submission), one submission per (user, ball).
async function stableId(...parts){
  // Length-prefix each part so no choice of separator inside a value can
  // make two different inputs hash the same -- ball names are free text.
  const data=new TextEncoder().encode(parts.map(p=>`${String(p).length}:${p}`).join("|"));
  const hash=await crypto.subtle.digest("SHA-256",data);
  const hex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
  // Format as a UUID so Postgres accepts it in a uuid column.
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}


// Reads a locally cached value and rejects it if it isn't the expected
// shape. Local storage outlives app versions -- a key written by an old
// build, or a bad restore, can hold anything. A wrong-shaped value doesn't
// just render oddly; it crashes the first handler that spreads or maps it.
async function readCached(key,expect){
  try{
    const r=await window.storage.get(key);
    if(!r)return null;
    const v=JSON.parse(r.value);
    if(expect==="array"&&!Array.isArray(v))return null;
    if(expect==="object"&&(typeof v!=="object"||v===null||Array.isArray(v)))return null;
    return v;
  }catch{return null;}
}

export default function BowlingTracker(){
  const{user,preferences,updatePreferences,displayName}=useAuth();
  // Maps league name -> its Supabase row id. The client keeps `leagues` as
  // plain name strings everywhere (unchanged, to avoid rewriting every call
  // site that compares/filters by league name) — this ref is what lets
  // renameLeague update the correct row in place by id, instead of
  // deleting-and-recreating it (which would cascade-delete every team in
  // that league, since teams.league_id references leagues.id).
  const leagueIdsRef=useRef({});
  const[view,setView]=useState("log");
  // Teams and Friends share one nav slot. Which of the two is showing is
  // its own bit of state so switching between them doesn't disturb `view`.
  const[socialTab,setSocialTab]=useState("teams");
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
  // Drilling layouts, keyed "bowlerName|ballName" -> {system, values}.
  // Kept separate from `arsenals` (a plain string array of ball names)
  // rather than restructuring it, so every existing consumer of arsenals
  // -- ballUniverse, addBall, removeBall, the cloud sync -- keeps working
  // unchanged. A ball with no layout recorded simply has no entry here.
  const[ballLayouts,setBallLayouts]=useState({});
  // Per-bowler profiles, keyed by bowler name -- handedness, two-handed
  // delivery, home centers, notes. Team/league membership is deliberately
  // NOT stored here; it's derived from the roster so the two can't drift.
  const[profiles,setProfiles]=useState({});
  // The tournament currently being entered. Kept as one working record
  // rather than a list -- you're filling in one tournament at a time, and
  // saving commits it to the cloud.
  // Bags are kept alongside `arsenals` rather than restructuring it.
  // `arsenals` stays the flat {bowler: [ball]} list of everything a bowler
  // owns -- which ballUniverse, stats, and history all still depend on --
  // and `ballBags` records which bag each ball is packed in, keyed
  // "bowler|ball". A ball with no entry is unassigned.
  const[bags,setBags]=useState([]);
  const[ballBags,setBallBags]=useState({});
  const[selectedBagId,setSelectedBagId]=useState("");
  // Ball specs keyed "bowler|ball", and the bowler's own ball groups.
  const[ballSpecs,setBallSpecs]=useState({});
  const[ballGroups,setBallGroups]=useState([]);
  // Community ball catalog: every submission, grouped by normalized ball
  // name, plus which rejection notices this user has already dismissed.
  const[catalogEntries,setCatalogEntries]=useState({});
  const[catalogAck,setCatalogAck]=useState([]);
  // Bowling centers are shared across users; `leagueCenters` maps a league
  // NAME to a center id. Kept as a parallel map rather than restructuring
  // `leagues` (a plain string array) that half the app depends on.
  const[centers,setCenters]=useState([]);
  const[leagueCenters,setLeagueCenters]=useState({});
  // Leagues this user has hidden. Personal and reversible -- hidden
  // leagues drop out of pickers but their sessions stay in history and
  // keep counting toward averages.
  const[hiddenLeagues,setHiddenLeagues]=useState([]);
  const[activeTournament,setActiveTournament]=useState(emptyTournament());
  const[tournamentSaved,setTournamentSaved]=useState(false);
  // Manually-entered game scores, keyed bowler|league|date|game. These take
  // precedence over scores computed from shots -- see domain/manualScores.js.
  const[manualScores,setManualScores]=useState({});
  // The launch prompt is shown once per day, not once ever -- what you're
  // bowling changes night to night. Stores the date it was last dismissed.
  const[sessionStartDismissed,setSessionStartDismissed]=useState(true);
  const[newBallName,setNewBallName]=useState("");
  const[form,setForm]=useState(emptyShot());
  const[editingId,setEditingId]=useState(null);
  const[preEditForm,setPreEditForm]=useState(null);
  const[saved,setSaved]=useState(false);
  const[sessionSaved,setSessionSaved]=useState(false);
  const[sessionSaveMessage,setSessionSaveMessage]=useState(null);
  const[winningsSaved,setWinningsSaved]=useState(false);
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
  const[expandedSections,setExpandedSections]=useState({releaseMiss:false,ballChange:false,notes:false,tonightSession:false,arsenal:false,surface:false,manualScores:false});
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

        const arsenalsRes=await cloudRead("arsenals",q=>q.select("bowler_name,ball,layout_system,layout_values,group_id,coverstock,core_type,weight,rg,diff,int_diff"));
        if(arsenalsRes.online&&arsenalsRes.data){
          const pendingArsenalRows=await getQueuedRecordsForTable("arsenals");
          const rebuilt={};
          const rebuiltLayouts={};
          const rebuiltSpecs={};
          [...arsenalsRes.data,...pendingArsenalRows].forEach(row=>{
            if(!rebuilt[row.bowler_name])rebuilt[row.bowler_name]=[];
            if(!rebuilt[row.bowler_name].includes(row.ball))rebuilt[row.bowler_name].push(row.ball);
            const normalized=normalizeLayout({system:row.layout_system,values:row.layout_values});
            if(normalized)rebuiltLayouts[`${row.bowler_name}|${row.ball}`]=normalized;
            rebuiltSpecs[`${row.bowler_name}|${row.ball}`]=specsFromRow(row);
          });
          setArsenals(rebuilt);
          setBallLayouts(rebuiltLayouts);
          setBallSpecs(rebuiltSpecs);
          try{await window.storage.set(BALL_SPECS_KEY,JSON.stringify(rebuiltSpecs));}catch{}
          try{await window.storage.set(ARSENALS_KEY,JSON.stringify(rebuilt));}catch{}
          try{await window.storage.set(LAYOUTS_KEY,JSON.stringify(rebuiltLayouts));}catch{}
        }else{
          const a=await window.storage.get(ARSENALS_KEY);
          if(a)setArsenals(JSON.parse(a.value));
          const bl=await window.storage.get(LAYOUTS_KEY);
          if(bl)setBallLayouts(JSON.parse(bl.value));
          const bsp=await readCached(BALL_SPECS_KEY,"object");
          if(bsp)setBallSpecs(bsp);
          const bb=await readCached(BALL_BAGS_KEY,"object");
          if(bb)setBallBags(bb);
        }

        const profilesRes=await cloudRead("bowler_profiles",q=>q.select("bowler_name,left_handed,two_handed,home_centers,notes"));
        if(profilesRes.online&&profilesRes.data){
          const rebuiltProfiles={};
          profilesRes.data.forEach(row=>{
            const p=profileFromRow(row);
            if(p&&p.bowlerName)rebuiltProfiles[p.bowlerName]=p;
          });
          setProfiles(rebuiltProfiles);
          try{await window.storage.set(PROFILES_KEY,JSON.stringify(rebuiltProfiles));}catch{}
        }else{
          const pr=await readCached(PROFILES_KEY,"object");
          if(pr)setProfiles(Object.fromEntries(Object.entries(pr).map(([k,v])=>[k,normalizeProfile(v,k)])));
        }

        const memberRes=await cloudRead("ball_bags",q=>q.select("bowler_name,ball,bag_id"));
        if(memberRes.online&&memberRes.data){
          const rebuiltMembership={};
          memberRes.data.forEach(r=>{rebuiltMembership[membershipKey(r.bowler_name,r.ball,r.bag_id)]=true;});
          setBallBags(rebuiltMembership);
          try{await window.storage.set(BALL_BAGS_KEY,JSON.stringify(rebuiltMembership));}catch{}
        }else{
        }

        const hiddenRes=await cloudRead("hidden_leagues",q=>q.select("league_id"));
        if(hiddenRes.online&&hiddenRes.data){
          const ids=hiddenRes.data.map(r=>r.league_id).filter(Boolean);
          setHiddenLeagues(ids);
          try{await window.storage.set(HIDDEN_LEAGUES_KEY,JSON.stringify(ids));}catch{}
        }else{
          const hl=await readCached(HIDDEN_LEAGUES_KEY,"array");
          if(hl)setHiddenLeagues(hl.filter(x=>typeof x==="string"));
        }

        const centersRes=await cloudRead("bowling_centers",q=>q.select("id,here_id,name,address,city,state,postal_code,country,lat,lng"));
        if(centersRes.online&&centersRes.data){
          const rebuilt=centersRes.data.map(centerFromRow).filter(Boolean);
          setCenters(rebuilt);
          try{await window.storage.set(CENTERS_KEY,JSON.stringify(rebuilt));}catch{}
        }else{
          const cs=await readCached(CENTERS_KEY,"array");
          if(cs)setCenters(cs.map(normalizeCenter).filter(c=>c.id&&c.name));
        }

        const leagueCentersRes=await cloudRead("leagues",q=>q.select("name,center_id"));
        if(leagueCentersRes.online&&leagueCentersRes.data){
          const map={};
          leagueCentersRes.data.forEach(r=>{if(r.center_id)map[r.name]=r.center_id;});
          setLeagueCenters(map);
          try{await window.storage.set(LEAGUE_CENTERS_KEY,JSON.stringify(map));}catch{}
        }else{
          const lc=await readCached(LEAGUE_CENTERS_KEY,"object");
          if(lc)setLeagueCenters(lc);
        }

        const subsRes=await cloudRead("ball_submissions",q=>q.select("id,submitted_by,ball_key,ball_name,brand,coverstock,core_type,weight,rg,diff,int_diff,created_at"));
        const votesRes=await cloudRead("ball_confirmations",q=>q.select("submission_id,confirmed_by,vote"));
        if(subsRes.online&&subsRes.data){
          const tally={};
          (votesRes.data||[]).forEach(v=>{
            const t=tally[v.submission_id]=tally[v.submission_id]||{approvals:0,rejections:0,mine:null};
            if(v.vote==="reject")t.rejections++; else t.approvals++;
            if(v.confirmed_by===user?.id)t.mine=v.vote;
          });
          const byKey={};
          subsRes.data.forEach(row=>{
            const t=tally[row.id]||{approvals:0,rejections:0,mine:null};
            const entry={
              id:row.id,submittedBy:row.submitted_by,ballKey:row.ball_key,ballName:row.ball_name,
              brand:row.brand||"",createdAt:row.created_at,
              approvals:t.approvals,rejections:t.rejections,myVote:t.mine,
              specs:specsFromRow(row),
            };
            (byKey[row.ball_key]=byKey[row.ball_key]||[]).push(entry);
          });
          setCatalogEntries(byKey);
        }

        try{
          const ack=await readCached(CATALOG_ACK_KEY,"array");
          if(ack)setCatalogAck(ack.filter(x=>typeof x==="string"));
        }catch{}

        const groupsRes=await cloudRead("ball_groups",q=>q.select("id,bowler_name,name,sort_order"));
        if(groupsRes.online&&groupsRes.data){
          const rebuiltGroups=groupsRes.data.map(groupFromRow).filter(Boolean)
            .sort((a,b)=>a.sortOrder-b.sortOrder);
          setBallGroups(rebuiltGroups);
          try{await window.storage.set(BALL_GROUPS_KEY,JSON.stringify(rebuiltGroups));}catch{}
        }else{
          const bg2=await readCached(BALL_GROUPS_KEY,"array");
          if(bg2)setBallGroups(bg2.filter(g=>g&&typeof g==="object"&&g.id));
        }

        const bagsRes=await cloudRead("bags",q=>q.select("id,bowler_name,name,bag_type,ball_limit,includes_plastic"));
        if(bagsRes.online&&bagsRes.data){
          const rebuiltBags=bagsRes.data.map(bagFromRow).filter(Boolean);
          setBags(rebuiltBags);
          try{await window.storage.set(BAGS_KEY,JSON.stringify(rebuiltBags));}catch{}
        }else{
          const bg=await window.storage.get(BAGS_KEY);
          if(bg)setBags(JSON.parse(bg.value).map(b=>normalizeBag(b)));
        }

        const manualRes=await cloudRead("manual_scores",q=>q.select("bowler_name,league_id,date,game,score"));
        if(manualRes.online&&manualRes.data){
          const rebuilt=manualScoresFromRows(manualRes.data,leagueNameById);
          setManualScores(rebuilt);
          try{await window.storage.set(MANUAL_SCORES_KEY,JSON.stringify(rebuilt));}catch{}
        }else{
          const ms=await window.storage.get(MANUAL_SCORES_KEY);
          if(ms)setManualScores(normalizeManualScores(JSON.parse(ms.value)));
        }

        try{
          const dismissed=await window.storage.get(SESSION_START_KEY);
          setSessionStartDismissed(dismissed?.value===localDateString());
        }catch{setSessionStartDismissed(false);}

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
  async function handleDiscardTable(table){
    if(!window.confirm(`Discard the queued writes for "${table}"? Everything else stays queued. This can't be undone.`))return;
    await discardQueuedTable(table);
    setSyncBreakdown(await inspectPendingQueue());
    setPendingSyncCount(await getPendingCount());
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

  // Called with no arguments from the text field, or with a name and specs
  // when someone picks a community catalog suggestion -- which adds the
  // ball and fills its specs in one step.
  async function addBall(presetName,presetSpecs){
    const name=(presetName??newBallName).trim();
    if(!name||!activeBowler)return;
    const current=arsenals[activeBowler]||[];
    if(current.includes(name)){setNewBallName("");return;}
    await saveArsenals({...arsenals,[activeBowler]:[...current,name]});
    if(presetSpecs)setBallSpec(activeBowler,name,presetSpecs);
    setNewBallName("");
  }

  // Saves a ball's drilling layout. Local state updates immediately; the
  // cloud write is debounced because this is typed digit-by-digit and
  // would otherwise fire a write per keystroke.
  // ── Hiding leagues & leaving teams ──────────────────────────────────
  function toggleLeagueHidden(leagueName){
    const leagueId=leagueIdsRef.current[leagueName];
    if(!leagueId)return;
    const isHidden=hiddenLeagues.includes(leagueId);
    const updated=isHidden?hiddenLeagues.filter(id=>id!==leagueId):[...hiddenLeagues,leagueId];
    setHiddenLeagues(updated);
    try{window.storage.set(HIDDEN_LEAGUES_KEY,JSON.stringify(updated));}catch{}
    if(isHidden)cloudDelete("hidden_leagues",{user_id:user?.id,league_id:leagueId});
    else cloudWrite("hidden_leagues",{id:crypto.randomUUID(),user_id:user?.id||null,league_id:leagueId});
  }

  // Leaving a team is visible to other people, so the confirmation spells
  // out exactly what changes -- including that past scores are kept.
  // Leaving acts on the SIGNED-IN user only -- never on activeBowler, which
  // may be a teammate being proxy-logged. Using activeBowler here would show
  // the teammate removed while the cloud actually removed the signed-in
  // user: two different people, silently.
  async function leaveTeam(team,leagueName){
    if(!user?.id||!displayName)return;
    if(!(team.members||[]).includes(displayName)){
      window.alert(`You're not on ${team.name} as ${displayName}, so there's nothing to leave.`);
      return;
    }
    const impact=describeLeaveImpact(team,leagueName,teams,displayName);
    if(!window.confirm(leaveConfirmationText(impact)))return;
    const updatedTeams=teams.map(t=>t.id===team.id
      ?{...t,members:(t.members||[]).filter(m=>m!==displayName)}
      :t);
    setTeams(updatedTeams);
    cloudDelete("team_members",{team_id:team.id,user_id:user.id});
  }

  // ── Bowling centers ─────────────────────────────────────────────────
  async function searchCenters(query){
    // Needs a location to search near -- HERE has no idea where to look
    // otherwise. Falls back to the bowler's last known center if geolocation
    // is refused, so the picker still works without location permission.
    const coords=await new Promise(resolve=>{
      if(!navigator?.geolocation)return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),
        ()=>resolve(null),
        {timeout:8000,maximumAge:600000}
      );
    });
    const fallback=centers.find(c=>c.lat!=null);
    const at=coords||(fallback?{lat:fallback.lat,lng:fallback.lng}:null);
    if(!at)return{error:"Location is needed to find nearby centers. Allow location access, or add the center by name."};

    try{
      const{data,error}=await supabase.functions.invoke("find-centers",{
        body:{query,lat:at.lat,lng:at.lng},
      });
      if(error)return{error:error.message||"Center search failed."};
      if(data?.error)return{error:data.error};
      return{centers:data?.centers||[]};
    }catch(e){
      return{error:e.message||"Couldn't search for centers right now."};
    }
  }

  // Saves a center if it's new, or returns the existing row for the same
  // venue -- so picking the same house twice never creates a duplicate.
  function ensureCenter(candidate){
    const existing=findExistingCenter(candidate,centers);
    if(existing)return existing;
    const created={...normalizeCenter(candidate),id:crypto.randomUUID()};
    const updated=[...centers,created];
    setCenters(updated);
    try{window.storage.set(CENTERS_KEY,JSON.stringify(updated));}catch{}
    cloudWrite("bowling_centers",centerToRow(created,user?.id||null));
    return created;
  }

  function setLeagueCenter(leagueName,candidate){
    const center=candidate?ensureCenter(candidate):null;
    const updated={...leagueCenters};
    if(center)updated[leagueName]=center.id; else delete updated[leagueName];
    setLeagueCenters(updated);
    try{window.storage.set(LEAGUE_CENTERS_KEY,JSON.stringify(updated));}catch{}

    const leagueId=leagueIdsRef.current[leagueName];
    if(leagueId)cloudUpdate("leagues",{id:leagueId},{center_id:center?center.id:null});
  }

  // ── Community ball catalog ──────────────────────────────────────────
  // Publishing specs is opt-in and separate from saving them privately:
  // a bowler's own arsenal is theirs regardless of what the community says.
  async function publishBallSpecs(ballName,specs){
    if(!user?.id)return;
    const key=ballKey(ballName);
    // Stable per (user, ball) so "Update Shared" replaces the row rather
    // than violating unique(submitted_by, ball_key).
    const id=await stableId("submission",key,user.id);
    const entry={
      id,submittedBy:user.id,ballKey:key,ballName,brand:"",
      createdAt:new Date().toISOString(),approvals:0,rejections:0,myVote:null,
      specs:normalizeBallSpecs(specs),
    };
    setCatalogEntries(prev=>{
      const existing=(prev[key]||[]).filter(e=>e.submittedBy!==user.id);
      return{...prev,[key]:[...existing,entry]};
    });
    cloudWrite("ball_submissions",{
      id,submitted_by:user.id,ball_key:key,ball_name:ballName,
      ...specsToRow(normalizeBallSpecs(specs)),
    });
  }

  async function voteOnEntry(entryKey,entryId,vote){
    if(!user?.id)return;
    setCatalogEntries(prev=>({
      ...prev,
      [entryKey]:(prev[entryKey]||[]).map(e=>{
        if(e.id!==entryId)return e;
        // Replace this user's previous vote rather than stacking a second.
        const hadApprove=e.myVote==="approve";
        const hadReject=e.myVote==="reject";
        return{
          ...e,
          approvals:e.approvals-(hadApprove?1:0)+(vote==="approve"?1:0),
          rejections:e.rejections-(hadReject?1:0)+(vote==="reject"?1:0),
          myVote:vote,
        };
      }),
    }));
    // Same user + same submission must always be the same row, or changing
    // your vote violates unique(submission_id, confirmed_by) and the write
    // sits in the sync queue forever.
    const id=await stableId("vote",entryId,user.id);
    cloudWrite("ball_confirmations",{id,submission_id:entryId,confirmed_by:user.id,vote});
  }

  // Dismissing a rejection notice also clears the now-untrusted specs from
  // this bowler's own arsenal -- but keeps the ball itself, since they know
  // they own it and only the numbers were disputed.
  function acknowledgeRejection(ballName){
    const key=ballKey(ballName);
    const updated=[...catalogAck,key];
    setCatalogAck(updated);
    try{window.storage.set(CATALOG_ACK_KEY,JSON.stringify(updated));}catch{}
    if(activeBowler)setBallSpec(activeBowler,ballName,clearedSpecsAfterRejection(ballName));
  }

  // ── Ball specs & groups ─────────────────────────────────────────────
  function setBallSpec(bowlerName,ballName,specs){
    const key=`${bowlerName}|${ballName}`;
    const normalized=normalizeBallSpecs(specs);
    const updated={...ballSpecs,[key]:normalized};
    setBallSpecs(updated);
    try{window.storage.set(BALL_SPECS_KEY,JSON.stringify(updated));}catch{}
    clearTimeout(pokerSaveTimers.current[`spec|${key}`]);
    pokerSaveTimers.current[`spec|${key}`]=setTimeout(()=>{
      // Partial update: `arsenals` also holds this ball's drilling layout,
      // which an upsert would wipe out.
      cloudUpdate("arsenals",{bowler_name:bowlerName,ball:ballName},specsToRow(normalized));
    },600);
  }

  function saveBallGroup(group){
    const withId={...group,id:group.id||crypto.randomUUID(),bowlerName:group.bowlerName||activeBowler};
    const updated=ballGroups.some(g=>g.id===withId.id)
      ?ballGroups.map(g=>g.id===withId.id?withId:g)
      :[...ballGroups,withId];
    setBallGroups(updated);
    try{window.storage.set(BALL_GROUPS_KEY,JSON.stringify(updated));}catch{}
    clearTimeout(pokerSaveTimers.current[`bgroup|${withId.id}`]);
    pokerSaveTimers.current[`bgroup|${withId.id}`]=setTimeout(()=>{
      cloudWrite("ball_groups",groupToRow(withId,user?.id||null));
    },600);
    return withId;
  }

  function deleteBallGroup(groupId){
    setBallGroups(prev=>{
      const updated=prev.filter(g=>g.id!==groupId);
      try{window.storage.set(BALL_GROUPS_KEY,JSON.stringify(updated));}catch{}
      return updated;
    });
    // Balls in a deleted group become ungrouped rather than disappearing.
    setBallSpecs(prev=>{
      const updated={};
      for(const[k,v]of Object.entries(prev))updated[k]=v.groupId===groupId?{...v,groupId:""}:v;
      try{window.storage.set(BALL_SPECS_KEY,JSON.stringify(updated));}catch{}
      return updated;
    });
    cloudDelete("ball_groups",groupId);
  }

  // Seeds the seven standard groups the first time a bowler opens grouping.
  // They're ordinary rows from that point on -- renameable and deletable.
  function seedDefaultGroups(bowlerName){
    if(ballGroups.some(g=>g.bowlerName===bowlerName))return;
    const seeded=DEFAULT_BALL_GROUPS.map((name,i)=>({
      id:crypto.randomUUID(),bowlerName,name,sortOrder:i,
    }));
    const updated=[...ballGroups,...seeded];
    setBallGroups(updated);
    try{window.storage.set(BALL_GROUPS_KEY,JSON.stringify(updated));}catch{}
    seeded.forEach(g=>cloudWrite("ball_groups",groupToRow(g,user?.id||null)));
  }

  // ── Bags ────────────────────────────────────────────────────────────
  function saveBag(bag){
    const withId={...normalizeBag(bag,bag.bowlerName||activeBowler),id:bag.id||crypto.randomUUID()};
    const updated=bags.some(b=>b.id===withId.id)
      ?bags.map(b=>b.id===withId.id?withId:b)
      :[...bags,withId];
    setBags(updated);
    try{window.storage.set(BAGS_KEY,JSON.stringify(updated));}catch{}
    clearTimeout(pokerSaveTimers.current[`bag|${withId.id}`]);
    pokerSaveTimers.current[`bag|${withId.id}`]=setTimeout(()=>{
      cloudWrite("bags",bagToRow(withId,user?.id||null));
    },600);
    return withId;
  }

  function deleteBag(bagId){
    setBags(prev=>{
      const updated=prev.filter(b=>b.id!==bagId);
      try{window.storage.set(BAGS_KEY,JSON.stringify(updated));}catch{}
      return updated;
    });
    // Balls in a deleted bag become unassigned rather than vanishing --
    // the bowler still owns them, they're just not packed for anything.
    setBallBags(prev=>{
      const updated=removeBagMemberships(prev,bagId);
      try{window.storage.set(BALL_BAGS_KEY,JSON.stringify(updated));}catch{}
      return updated;
    });
    if(selectedBagId===bagId)setSelectedBagId("");
    cloudDelete("bags",bagId);
  }

  // A ball can live in many bags at once -- a benchmark ball might be in
  // the league bag and every tournament bag -- so this toggles one
  // membership rather than moving the ball.
  function toggleBallBag(bowlerName,ballName,bagId){
    const wasIn=!!ballBags[membershipKey(bowlerName,ballName,bagId)];
    const updated=toggleBallInBag(ballBags,bowlerName,ballName,bagId);
    setBallBags(updated);
    try{window.storage.set(BALL_BAGS_KEY,JSON.stringify(updated));}catch{}
    if(wasIn)cloudDelete("ball_bags",{bowler_name:bowlerName,ball:ballName,bag_id:bagId});
    else cloudWrite("ball_bags",{id:crypto.randomUUID(),bowler_name:bowlerName,ball:ballName,bag_id:bagId,created_by:user?.id||null});
  }

  function setBallLayout(bowlerName,ballName,layout){
    const key=`${bowlerName}|${ballName}`;
    const updated={...ballLayouts,[key]:layout};
    setBallLayouts(updated);
    try{window.storage.set(LAYOUTS_KEY,JSON.stringify(updated));}catch{}

    clearTimeout(pokerSaveTimers.current[`layout|${key}`]);
    pokerSaveTimers.current[`layout|${key}`]=setTimeout(()=>{
      // Partial update for the same reason as specs above -- these two
      // features write different columns of the same arsenals row.
      cloudUpdate("arsenals",{bowler_name:bowlerName,ball:ballName},{
        layout_system:layout?.system||null,
        layout_values:layout?.values||null,
      });
    },600);
  }

  // Saves a bowler's profile. Debounced like other typed fields so a
  // name or note doesn't fire a cloud write per keystroke.
  function dismissSessionStart(){
    setSessionStartDismissed(true);
    try{window.storage.set(SESSION_START_KEY,localDateString());}catch{}
  }

  function updateTournament(next){
    const normalized=normalizeTournament(next);
    setActiveTournament(normalized);
    try{window.storage.set(TOURNAMENT_KEY,JSON.stringify(normalized));}catch{}
  }

  async function saveTournament(){
    if(!activeTournament.name.trim())return;
    const withIds={...activeTournament,id:activeTournament.id||crypto.randomUUID(),bowler:activeBowler};
    setActiveTournament(withIds);
    try{window.storage.set(TOURNAMENT_KEY,JSON.stringify(withIds));}catch{}
    cloudWrite("tournaments",tournamentToRow(withIds,user?.id||null));
    setTournamentSaved(true);
    setTimeout(()=>setTournamentSaved(false),1500);
  }

  function setProfile(bowlerName,profile){
    const normalized=normalizeProfile(profile,bowlerName);
    const updated={...profiles,[bowlerName]:normalized};
    setProfiles(updated);
    try{window.storage.set(PROFILES_KEY,JSON.stringify(updated));}catch{}

    clearTimeout(pokerSaveTimers.current[`profile|${bowlerName}`]);
    pokerSaveTimers.current[`profile|${bowlerName}`]=setTimeout(()=>{
      cloudWrite("bowler_profiles",profileToRow(normalized,user?.id||null));
    },600);
  }

  async function removeBall(bowlerName,ballName){
    const current=arsenals[bowlerName]||[];
    await saveArsenals({...arsenals,[bowlerName]:current.filter(b=>b!==ballName)});
    if(form.bowler===bowlerName&&form.ball===ballName){
      handleBallChange("");
    }

    // Clean up everything keyed on this ball. Left alone, bag memberships
    // silently reattach if the same ball is ever re-added, and orphaned
    // ball_bags rows accumulate in the cloud. Layouts and specs live on
    // the arsenals row, which saveArsenals already deletes.
    const key=`${bowlerName}|${ballName}`;
    const bagIds=Object.keys(ballBags)
      .filter(k=>k.startsWith(`${key}|`))
      .map(k=>k.split("|")[2]);
    if(bagIds.length){
      const nextBags={...ballBags};
      bagIds.forEach(bagId=>{delete nextBags[membershipKey(bowlerName,ballName,bagId)];});
      setBallBags(nextBags);
      try{window.storage.set(BALL_BAGS_KEY,JSON.stringify(nextBags));}catch{}
      bagIds.forEach(bagId=>cloudDelete("ball_bags",{bowler_name:bowlerName,ball:ballName,bag_id:bagId}));
    }
    setBallLayouts(prev=>{const n={...prev};delete n[key];return n;});
    setBallSpecs(prev=>{const n={...prev};delete n[key];return n;});
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
    // A manually-entered score wins over the shot-derived one. Every score
    // path in the app funnels through here, so overriding at this single
    // point covers live scores, session totals, averages, and stats alike.
    return resolveGameScore(manualScores,bowler,league,date,game,strictPartial(gs));
  }

  function updateManualScore(bowler,league,date,game,value){
    const updated=setManualScoreIn(manualScores,bowler,league,date,game,value);
    setManualScores(updated);
    try{window.storage.set(MANUAL_SCORES_KEY,JSON.stringify(updated));}catch{}

    const leagueId=leagueIdsRef.current[league];
    if(!leagueId)return;
    clearTimeout(pokerSaveTimers.current[`manual|${bowler}|${date}|${game}`]);
    pokerSaveTimers.current[`manual|${bowler}|${date}|${game}`]=setTimeout(()=>{
      const score=getManualScore(updated,bowler,league,date,game);
      if(score===null)cloudDelete("manual_scores",{bowler_name:bowler,league_id:leagueId,date,game});
      else cloudWrite("manual_scores",manualScoreToRow(bowler,leagueId,date,game,score,user?.id||null));
    },600);
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
      threeSixNineWinnings:existing?.threeSixNineWinnings||0,
      jackpotWinnings:existing?.jackpotWinnings||0,
      highGameWinnings:existing?.highGameWinnings||[0,0,0],
      pokerQuarterCost:existing?.pokerQuarterCost||[0,0,0],
      pokerDollarCost:existing?.pokerDollarCost||[0,0,0],
      highGameCost:existing?.highGameCost||[0,0,0],
      threeSixNineCost:existing?.threeSixNineCost||0,
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

  // Generalized per-game money entry, covering High Game Pot winnings plus
  // every buy-in cost array. Same optimistic-then-debounced-sync shape as
  // setPokerWinnings -- factored to one function because these all behave
  // identically and only differ by which field they write.
  function setSessionMoneyArray(sessionId,field,gameIdx,amount){
    const prevSessions=sessions;
    const updatedSessions=sessions.map(s=>{
      if(s.id!==sessionId)return s;
      const arr=[...(s[field]||[0,0,0])];
      arr[gameIdx]=amount;
      return{...s,[field]:arr};
    });
    setSessions(updatedSessions);
    try{window.storage.set(SESSIONS_KEY,JSON.stringify(updatedSessions));}catch{}

    const debounceKey=`${sessionId}|${field}|${gameIdx}`;
    clearTimeout(pokerSaveTimers.current[debounceKey]);
    pokerSaveTimers.current[debounceKey]=setTimeout(()=>{
      syncSessionsToCloud(prevSessions,updatedSessions);
    },600);
  }

  // Single-value money entry (3-6-9's session-wide buy-in), as opposed to
  // the per-game arrays above.
  function setSessionMoneyValue(sessionId,field,amount){
    const prevSessions=sessions;
    const updatedSessions=sessions.map(s=>s.id!==sessionId?s:{...s,[field]:amount});
    setSessions(updatedSessions);
    try{window.storage.set(SESSIONS_KEY,JSON.stringify(updatedSessions));}catch{}

    const debounceKey=`${sessionId}|${field}`;
    clearTimeout(pokerSaveTimers.current[debounceKey]);
    pokerSaveTimers.current[debounceKey]=setTimeout(()=>{
      syncSessionsToCloud(prevSessions,updatedSessions);
    },600);
  }

  function confirmWinningsSaved(){
    setWinningsSaved(true);
    setTimeout(()=>setWinningsSaved(false),1500);
  }

  // 3-6-9 winnings are a single value per session, not a per-game array
  // like poker -- the win itself is whole-session (all 9 specific strikes
  // across games 1, 2, and 3), not something that happens per individual
  // game. type is "pot" for the regular win or "jackpot" for the bonus.
  function setThreeSixNineWinnings(sessionId,type,amount){
    const prevSessions=sessions;
    const key=type==="jackpot"?"jackpotWinnings":"threeSixNineWinnings";
    const updatedSessions=sessions.map(s=>s.id!==sessionId?s:{...s,[key]:amount});
    setSessions(updatedSessions);
    try{window.storage.set(SESSIONS_KEY,JSON.stringify(updatedSessions));}catch{}

    const debounceKey=`${sessionId}|369|${type}`;
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
  // Handedness comes from the team roster (set in Team Management). A
  // lefty's mechanics mirror a righty's, so their weak/ringing corner pin
  // is the 7, not the 10 -- the logging chips flip to match rather than
  // asking them to mentally translate every shot.
  // Profile is the source of truth; the roster value is the fallback for
  // bowlers whose profile hasn't been filled in yet, so existing lefties
  // keep working without needing a data migration.
  // Which balls the Log tab offers. Practice sees everything the bowler
  // owns; league and tournament see only the selected bag. Bags for the
  // current bowler are grouped so the selector can show counts.
  // Per-center performance -- sessions resolve through their league to a
  // center, which is why leagues carry the center rather than sessions.
  // Pickers show only unhidden leagues; stats and history still use the
  // full list, so hiding never removes anyone's scores from their averages.
  const activeLeagues=visibleLeagues(leagues,hiddenLeagues,leagueIdsRef.current);

  const leaguesWithCenters=leagues.map(name=>({name,centerId:leagueCenters[name]}));
  const centerStats=statsByCenter(sessions,leaguesWithCenters,centers,statsBowler||activeBowler);

  // Pre-computed statistics for Insights. Deliberately assembled here and
  // sent as summary figures -- raw shot rows would be 8x the tokens and
  // invite the model to find patterns it can't properly weigh.
  const insightStats=(()=>{
    const who=statsBowler||activeBowler;
    // With no bowler selected, "everyone's shots" would be analysed as if
    // they were one person's game. Return an empty stat block instead so
    // the Insights tab shows its "pick a bowler" state rather than a
    // meaningless blended analysis.
    if(!who)return{gameCount:0,firstBalls:0,balls:[],centers:[]};
    const mine=shots.filter(s=>s.bowler===who);
    const firstBalls=mine.filter(s=>!s.ballNum||s.ballNum===1);
    const strikes=firstBalls.filter(s=>s.result==="Strike").length;
    const spareAtt=mine.filter(s=>s.result!=="Strike"&&s.spareMade!=="");
    const spareMade=spareAtt.filter(s=>s.spareMade==="Yes").length;
    const tenPins=mine.filter(s=>s.result==="Weak 10"||s.result==="Ringing 10");
    const tenMade=tenPins.filter(s=>s.spareMade==="Yes").length;
    const splits=firstBalls.filter(s=>isSplit(s.otherLeave||[])).length;
    const mySessions=sessions.filter(s=>!who||s.bowler===who);
    const gameCount=mySessions.reduce((n,s)=>n+(s.scores?.length||0),0);

    const ballRows=[...new Set(mine.map(s=>s.ball).filter(Boolean))].map(name=>{
      const bs=firstBalls.filter(s=>s.ball===name);
      const spec=ballSpecs[`${who}|${name}`]||{};
      return{
        name,
        firstBalls:bs.length,
        strikeRate:bs.length?bs.filter(s=>s.result==="Strike").length/bs.length:null,
        coverstock:spec.coverstock||"",
        coreType:spec.coreType||"",
      };
    });

    return{
      gameCount,
      firstBalls:firstBalls.length,
      strikeRate:firstBalls.length?strikes/firstBalls.length:null,
      spareAttempts:spareAtt.length,
      spareConversion:spareAtt.length?spareMade/spareAtt.length:null,
      tenPinAttempts:tenPins.length,
      tenPinRate:tenPins.length?tenMade/tenPins.length:null,
      splitRate:firstBalls.length?splits/firstBalls.length:null,
      sessionCount:mySessions.length,
      recentAverages:mySessions.slice(-8).map(s=>s.average).filter(v=>typeof v==="number"),
      balls:ballRows,
      centers:centerStats.map(c=>({name:c.center.name,average:c.average,games:c.games})),
    };
  })();

  async function analyzePerformance(payload){
    try{
      const{data,error}=await supabase.functions.invoke("analyze-performance",{body:{payload}});
      if(error)return{error:error.message||"Analysis failed."};
      if(data?.error)return{error:data.error};
      return data;
    }catch(e){return{error:e.message||"Couldn't generate insights right now."};}
  }

  const bowlerBags=bags.filter(b=>b.bowlerName===activeBowler);
  const envBags=bagsForEnvironment(bowlerBags,preferences.environment);
  // A selected bag from another environment or another bowler isn't in
  // envBags -- resolve it to "nothing selected" rather than letting the
  // Log tab silently show zero balls with no way to tell why.
  const effectiveBagId=envBags.some(b=>b.id===selectedBagId)?selectedBagId:"";
  const bowlerBalls=arsenals[activeBowler]||[];
  const ballsByBag=ballsByBagFor(ballBags,activeBowler,bowlerBalls);
  const logBalls=availableBalls(preferences.environment,ballsByBag,effectiveBagId,bowlerBalls);

  const rosterLeftHanded=!!teams.find(t=>t.memberHandedness&&activeBowler in t.memberHandedness)?.memberHandedness?.[activeBowler];
  const activeBowlerLeftHanded=resolveHandedness(profiles[activeBowler],rosterLeftHanded);

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
          <div style={{display:"flex",alignItems:"center",gap:"10px",paddingRight:"14px"}}>
            <div style={S.title}>🎳 Shot Tracker</div>
            <button onClick={()=>setView("profile")} style={{background:"none",border:"none",cursor:"pointer",fontSize:"16px",padding:0,lineHeight:1}} aria-label="Profile">👤</button>
            <button onClick={()=>setView("settings")} style={{background:"none",border:"none",cursor:"pointer",fontSize:"16px",padding:0,lineHeight:1}} aria-label="Settings">⚙️</button>
          </div>
          {pendingSyncCount>0?(
            <button onClick={openSyncDetail} style={{background:"none",border:"none",padding:0,fontSize:"10px",fontWeight:600,color:C.spare,marginTop:"2px",cursor:"pointer",textDecoration:"underline"}}>
              ⏳ {pendingSyncCount} syncing… (tap for details)
            </button>
          ):(
            <div style={{fontSize:"10px",fontWeight:600,color:C.strike,marginTop:"2px"}}>✓ All synced</div>
          )}
        </div>
        <div style={S.nav}>
          {["log","stats","insights","social"].map(v=>(
  <button key={v} style={S.navBtn(view===v)} onClick={()=>setView(v)}>
    {v==="log"?"Log":v==="stats"?"Stats":v==="insights"?"Insights":"Social"}
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
                  {/* Discarding one table's writes leaves the rest of the
                      backlog intact -- the usual failure is one wedged
                      feature blocking otherwise-good writes behind it. */}
                  <button style={{...S.btn(),padding:"3px 8px",fontSize:"10px",marginTop:"4px"}}
                    onClick={()=>handleDiscardTable(table)}>
                    Discard just {table}
                  </button>
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
        
        {view==="insights"&&(
          <InsightsView stats={insightStats} onAnalyze={analyzePerformance} bowlerName={statsBowler||activeBowler}/>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SOCIAL VIEW — Teams + Friends share one nav slot                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="social"&&(
          <>
            <div style={{...S.card,padding:"10px 12px"}}>
              <div style={S.chips}>
                <Chip label="Teams" selected={socialTab==="teams"} onToggle={()=>setSocialTab("teams")}/>
                <Chip label="Friends" selected={socialTab==="friends"} onToggle={()=>setSocialTab("friends")}/>
              </div>
            </div>
            {socialTab==="teams"&&(
              <TeamManagement
                leagues={leagues}
                onTeamsChange={setTeams}
                onLeagueAdd={addLeague}
                onLeagueRename={renameLeague}
              />
            )}
            {socialTab==="friends"&&<Friends/>}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PROFILE + SETTINGS                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="profile"&&(
          <Profile
            bowlers={bowlers} activeBowler={activeBowler} selectBowler={selectBowler}
            profiles={profiles} setProfile={setProfile} teams={teams}
            arsenals={arsenals} ballLayouts={ballLayouts} setBallLayout={setBallLayout} removeBall={removeBall}
            newBallName={newBallName} setNewBallName={setNewBallName} addBall={addBall}
            bags={bags} ballBags={ballBags} saveBag={saveBag} deleteBag={deleteBag} toggleBallBag={toggleBallBag}
            centers={centers} ensureCenter={ensureCenter} searchCenters={searchCenters}
            ballSpecs={ballSpecs} setBallSpec={setBallSpec} ballGroups={ballGroups}
            saveBallGroup={saveBallGroup} deleteBallGroup={deleteBallGroup} seedDefaultGroups={seedDefaultGroups}
            catalogEntries={catalogEntries} catalogAck={catalogAck} userId={user?.id} publishBallSpecs={publishBallSpecs} voteOnEntry={voteOnEntry} acknowledgeRejection={acknowledgeRejection}/>
        )}

        {view==="settings"&&(
          <Settings
            showBackup={showBackup} setShowBackup={setShowBackup}
            backupStatus={backupStatus} setBackupStatus={setBackupStatus}
            importText={importText} setImportText={setImportText}
            exportData={exportData} importData={importData}
            confirmClear={confirmClear} setConfirmClear={setConfirmClear}
            clearAllData={clearAllData} hasData={shots.length>0}
            sessions={sessions} bowlers={bowlers} leagues={leagues}
            statsBowler={statsBowler} setStatsBowler={setStatsBowler}
            statsLeague={statsLeague} setStatsLeague={setStatsLeague}
            filterBowler={filterBowler} setFilterBowler={setFilterBowler}
            filterBall={filterBall} setFilterBall={setFilterBall}
            filterResult={filterResult} setFilterResult={setFilterResult}
            filtered={filtered} ballUniverse={ballUniverse}
            startEdit={startEdit} deleteShot={deleteShot}
            centers={centers} leagueCenters={leagueCenters} setLeagueCenter={setLeagueCenter} searchCenters={searchCenters}
            hiddenLeagues={hiddenLeagues} leagueIds={leagueIdsRef.current} toggleLeagueHidden={toggleLeagueHidden}
            teams={teams} activeBowler={activeBowler} leaveTeam={leaveTeam}/>
        )}

        {view==="import"&&(
          <ImportScorecard
            bowlers={bowlers} leagues={leagues} teams={teams} shots={shots} saveShots={saveShots}
            updateManualScore={updateManualScore}
            setSessionLeague={setSessionLeague} setSessionDate={setSessionDate} selectBowler={selectBowler}
            setView={setView} setSessionSaveMessage={setSessionSaveMessage}
          />
        )}

        {view==="log"&&(
          <LogView
            shots={shots} sessions={sessions} bowlers={bowlers} footerHeight={footerHeight} footerRef={footerRef} teams={teams} leagues={activeLeagues}
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
            selectBowler={selectBowler} set={set} setLanePattern={setLanePattern} setMatchHandicap={setMatchHandicap} setMatchOpponent={setMatchOpponent} setPokerWinnings={setPokerWinnings} setThreeSixNineWinnings={setThreeSixNineWinnings} winningsSaved={winningsSaved} confirmWinningsSaved={confirmWinningsSaved} setView={setView}
            stepPinCount={stepPinCount} submitSession={submitSession} submitShot={submitShot} theoreticalScoreForGame={theoreticalScoreForGame} toggle={toggle} toggleMulti={toggleMulti} toggleSection={toggleSection}
            preferences={preferences}
            setSessionMoneyArray={setSessionMoneyArray} setSessionMoneyValue={setSessionMoneyValue}
            activeBowlerLeftHanded={activeBowlerLeftHanded}
            ballLayouts={ballLayouts} setBallLayout={setBallLayout}
            activeTournament={activeTournament} updateTournament={updateTournament} saveTournament={saveTournament} tournamentSaved={tournamentSaved}
            manualScores={manualScores} updateManualScore={updateManualScore}
            envBags={envBags} selectedBagId={effectiveBagId} setSelectedBagId={setSelectedBagId} logBalls={logBalls}
            ballSpecs={ballSpecs} setBallSpec={setBallSpec} ballGroups={ballGroups} seedDefaultGroups={seedDefaultGroups}
            catalogEntries={catalogEntries} catalogAck={catalogAck} userId={user?.id} publishBallSpecs={publishBallSpecs} voteOnEntry={voteOnEntry} acknowledgeRejection={acknowledgeRejection}
            sessionStartDismissed={sessionStartDismissed} dismissSessionStart={dismissSessionStart}
            updatePreferences={updatePreferences}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HISTORY VIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STATS VIEW                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view==="stats"&&(
          <StatsView
            centerStats={centerStats}
            view={view} shots={shots} sessions={sessions} bowlers={bowlers} teams={teams} leagues={leagues} arsenals={arsenals} saved={saved}
            statsBowler={statsBowler} setStatsBowler={setStatsBowler} compareBowler={compareBowler} setCompareBowler={setCompareBowler}
            statsLeague={statsLeague} setStatsLeague={setStatsLeague} trendMetric={trendMetric} setTrendMetric={setTrendMetric} trendScope={trendScope} setTrendScope={setTrendScope}
            compareLeague={compareLeague} setCompareLeague={setCompareLeague}
            matches={matches}
            FRAME_POSITION_RELIABILITY_THRESHOLD={FRAME_POSITION_RELIABILITY_THRESHOLD} SHOT_SAMPLE_THRESHOLD={SHOT_SAMPLE_THRESHOLD} allFirstBalls={allFirstBalls} bStats={bStats} bowlerLeagueCount={bowlerLeagueCount}
            cleanFrameCount={cleanFrameCount} cleanFrameR={cleanFrameR} compareLabel={compareLabel} firstBallAvg={firstBallAvg} fivePinAttempts={fivePinAttempts} fivePinMisses={fivePinMisses}
            framePosition={framePosition} framePositionGamesLogged={framePositionGamesLogged} framePositionReliable={framePositionReliable} frameShots={frameShots} hideIndividualOnly={hideIndividualOnly}
            isTeamView={isTeamView} leaveAvg={leaveAvg} mCounts={mCounts} nonSplitLeaveList={nonSplitLeaveList} nonStrikeFirstBalls={nonStrikeFirstBalls} rng={rng} showTeamCompare={showTeamCompare}
            singlePinAttempts={singlePinAttempts} singlePinMade={singlePinMade} singlePinSpareR={singlePinSpareR} spR={spR} splitBreakdownList={splitBreakdownList} splitConvR={splitConvR}
            splitCount={splitCount} splitR={splitR} statsShots={statsShots} stk={stk} stkR={stkR} teamCleanFrameR={teamCleanFrameR} teamFirstBallAvg={teamFirstBallAvg} teamLeaveAvg={teamLeaveAvg}
            teamSinglePinSpareR={teamSinglePinSpareR} teamSpR={teamSpR} teamSplitConvR={teamSplitConvR} teamSplitR={teamSplitR} teamStkR={teamStkR} teamTenPinRate={teamTenPinRate}
            teamTenPinSpareR={teamTenPinSpareR} tenPinAttempts={tenPinAttempts} tenPinLeaveCount={tenPinLeaveCount} tenPinMade={tenPinMade} tenPinSpareR={tenPinSpareR} tot={tot} wk={wk}
            handicapMatches={handicapMatches} handicapSplit={handicapSplit} longestStrikeStreak={longestStrikeStreak}
            theoreticalScoreForGame={theoreticalScoreForGame} trendData={trendData}
            preferences={preferences}
          />
        )}
      </div>
    </div>
  );
}
