// Pure stats/records functions, extracted from BowlingTracker.jsx so they're
// independently testable — same pattern as scoring.js and splits.js. Each
// takes the relevant data (sessions/matches) as an explicit parameter
// instead of closing over component state, since a plain function can't
// read React state directly outside the component.

// The single highest game this bowler has ever bowled, across every
// session on file for them (any league, any night).
export function bowlerHighGame(sessions,bowler){
  let best=null;
  sessions.filter(s=>s.bowler===bowler).forEach(s=>s.scores.forEach((v,i)=>{
    if(best===null||v>best.value)best={value:v,date:s.date,league:s.league,game:i+1};
  }));
  return best;
}

// The single highest 3-game series total this bowler has ever bowled.
export function bowlerHighSeries(sessions,bowler){
  let best=null;
  sessions.filter(s=>s.bowler===bowler).forEach(s=>{
    if(best===null||s.total>best.value)best={value:s.total,date:s.date,league:s.league};
  });
  return best;
}

// Every night where 2+ bowlers share a league+date — i.e. a real team
// night, not just one person's individual session — with each game
// position (1/2/3) summed across everyone who bowled that night, plus the
// full series total. This is what team-wide records and averages are
// actually built from.
export function teamDateGroups(sessions,league){
  const byKey={};
  sessions.filter(s=>s.league===league).forEach(s=>{
    const k=`${s.league}__${s.date}`;
    if(!byKey[k])byKey[k]={league:s.league,date:s.date,entries:[]};
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

// The single highest TEAM game total (summed across the whole team for one
// game position on one night) this league has ever bowled.
export function teamHighGame(sessions,league){
  let best=null;
  teamDateGroups(sessions,league).forEach(g=>g.gameTotals.forEach((v,i)=>{
    if(v!=null&&(best===null||v>best.value))best={value:v,date:g.date,league:g.league,game:i+1};
  }));
  return best;
}

// The single highest TEAM series total this league has ever bowled.
export function teamHighSeries(sessions,league){
  let best=null;
  teamDateGroups(sessions,league).forEach(g=>{
    if(best===null||g.seriesTotal>best.value)best={value:g.seriesTotal,date:g.date,league:g.league};
  });
  return best;
}

// Tallies game/series wins-losses and points won/available from match
// records for a league (or every league combined, if none given).
export function seasonRecord(matches,league){
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

// Per-week points-won/points-available, chronological, for charting a
// season's trend. Skips any match with nothing decided yet (no games and
// no series result logged) rather than plotting a false 0/0 week.
export function weeklyPointsData(matches,league){
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

// This bowler's average for one specific game position (1st, 2nd, or 3rd
// game of the night) across every session on file, optionally scoped to
// one league. bowler="" or omitted pools every bowler together.
export function gameAvg(sessions,bowler,gameIdx,league){
  const ls=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true));
  const vals=ls.map(s=>s.scores[gameIdx]).filter(v=>v!=null);
  if(!vals.length)return null;
  return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
}

// The team's average game total (any of the 3 game positions pooled
// together) across every real team night in this league. Truncated, not
// rounded — same convention as teamGameTotalAvgAt, so the two stay
// consistent with each other.
export function teamGameTotalAvg(sessions,league){
  const vals=teamDateGroups(sessions,league).flatMap(g=>g.gameTotals.filter(v=>v!=null));
  if(!vals.length)return null;
  return Math.trunc(vals.reduce((a,b)=>a+b,0)/vals.length);
}

// Same as teamGameTotalAvg, but for one specific game position only (game
// 1, 2, or 3 of the night) rather than all three pooled together.
export function teamGameTotalAvgAt(sessions,league,gameIdx){
  const vals=teamDateGroups(sessions,league).map(g=>g.gameTotals[gameIdx]).filter(v=>v!=null);
  if(!vals.length)return null;
  return Math.trunc(vals.reduce((a,b)=>a+b,0)/vals.length);
}

// This bowler's running average within ONE specific league only. Requires
// a league (unlike cAvg) -- this is the per-league number, not a combined
// figure across every league a bowler plays in.
export function rAvg(sessions,bowler,league){
  const ls=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&s.league===league);
  if(!ls.length)return null;
  const all=ls.flatMap(s=>s.scores);
  return Math.round(all.reduce((a,b)=>a+b,0)/all.length);
}

// This bowler's combined average across every league they bowl in (or, if
// league is given, scoped to just that one -- functionally identical to
// rAvg in that case, but also supports the no-league "combined" view rAvg
// doesn't).
export function cAvg(sessions,bowler,league){
  const all=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true)).flatMap(s=>s.scores);
  if(!all.length)return null;
  return Math.round(all.reduce((a,b)=>a+b,0)/all.length);
}

// How close this bowler's average is to their next 5-pin milestone (e.g.
// climbing from a 200 toward a 205 average) -- current milestone band,
// the raw (unrounded) average, and a 0-100% progress figure through the
// current 5-pin band, for a progress-bar-style display.
export function avgProgress(sessions,bowler,league){
  const all=sessions.filter(s=>(bowler?s.bowler===bowler:true)&&(league?s.league===league:true)).flatMap(s=>s.scores);
  if(!all.length)return null;
  const raw=all.reduce((a,b)=>a+b,0)/all.length;
  const current=Math.trunc(raw);
  const nextMilestone=current-(current%5)+5;
  const prevMilestone=nextMilestone-5;
  const pct=Math.max(0,Math.min(100,((raw-prevMilestone)/5)*100));
  return{raw,current,prevMilestone,nextMilestone,pct};
}

// This bowler's average using only sessions strictly BEFORE a given date
// -- i.e. what their average looked like entering a specific night, not
// including that night's own results. Used for "who was the reigning
// giant coming into this week" style comparisons where including the
// week's own results would be circular.
export function cumulativeAvgBeforeDate(sessions,bowler,league,beforeDate){
  const all=sessions.filter(s=>s.bowler===bowler&&s.league===league&&s.date<beforeDate).flatMap(s=>s.scores);
  if(!all.length)return null;
  return all.reduce((a,b)=>a+b,0)/all.length;
}
