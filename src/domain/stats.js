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

// Counts, per bowler, how many times they were the ONLY non-strike in a
// frame where 2+ teammates all threw a first ball -- i.e. everyone else
// struck and this bowler alone got "hung" out to dry needing a spare.
// Uses first-ball-only shots (ballNum null or 1), grouped by the exact
// frame (league+date+game+frame) so only genuinely shared frames count.
export function hungCounts(shots,league){
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

// "Beat the high average bowler" -- the giant for a given week is whoever
// has the highest cumulative average using ONLY data from strictly BEFORE
// that week (never that week's own results) -- the giant is crowned before
// the challenge, not decided by the outcome being compared against. This
// also means the very first week ever logged has no giant at all yet
// (there's no prior data to crown one from), which is correct: the first
// week sets the baseline, the challenge starts in week two. Once a week's
// giant is determined, it's locked in permanently -- if the title changes
// hands in a later week, earlier weeks are never retroactively recomputed
// against the new giant.
export function beatHighBowlerStats(sessions,league){
  const dates=[...new Set(sessions.filter(s=>s.league===league).map(s=>s.date))].sort();
  const tally={};
  function ensure(b){if(!tally[b])tally[b]={won:0,total:0,weeksAsHigh:0};}
  dates.forEach(date=>{
    const priorBowlers=[...new Set(sessions.filter(s=>s.league===league&&s.date<date).map(s=>s.bowler))];
    if(!priorBowlers.length)return; // first week ever — no prior data, no giant yet
    let highBowler=null,highAvg=-Infinity;
    priorBowlers.forEach(b=>{
      const avg=cumulativeAvgBeforeDate(sessions,b,league,date);
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

// The raw pool of score values Score Consistency computes std. dev./min/max
// over. Three modes: a specific bowler's own individual games; every
// individual bowler's games pooled together (pooled=true, for a team-wide
// per-person consistency figure); or, if neither, the TEAM's combined game
// totals per night (via teamDateGroups) -- comparing one person's score to
// a whole team's summed total was never a fair comparison in the first
// place, so that case intentionally uses team totals instead of raw scores.
export function scoreValues(sessions,bowler,league,pooled){
  if(bowler)return sessions.filter(s=>s.bowler===bowler&&(league?s.league===league:true)).flatMap(s=>s.scores);
  if(pooled)return sessions.filter(s=>league?s.league===league:true).flatMap(s=>s.scores);
  return teamDateGroups(sessions,league).flatMap(g=>g.gameTotals.filter(v=>v!=null));
}

// Standard deviation, min, and max across whichever pool of scores
// scoreValues resolves to (see above) -- the actual shape behind an
// average, tightly bunched vs. a long tail of bad nights dragging it down.
export function scoreConsistency(sessions,bowler,league,pooled){
  const all=scoreValues(sessions,bowler,league,pooled);
  if(all.length<2)return null;
  const mean=all.reduce((a,b)=>a+b,0)/all.length;
  const variance=all.reduce((a,b)=>a+(b-mean)**2,0)/all.length;
  return{stdDev:Math.round(Math.sqrt(variance)*10)/10,min:Math.min(...all),max:Math.max(...all),games:all.length};
}

// Buckets a flat array of numeric values into up to bucketCount roughly-
// equal-width ranges, for histogram-style charting. Not session/shot-
// specific at all -- takes any plain array of numbers.
export function histogramBuckets(values,bucketCount=8){
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

// The "3-6-9" side game: NOT a per-game win. To win the pot for the night,
// a bowler must strike in frames 3, 6, and 9 of EVERY game in the series
// (games 1, 2, AND 3) -- 9 specific strikes total, all-or-nothing for the
// whole session. Missing even one of those 9 strikes (in any of the 3
// games) means no win at all that night, regardless of how the other
// frames or games went.
//
// The jackpot is reachable ONLY when the whole-session win already
// happened, and additionally requires a full turkey (three strikes) in
// the 10th frame of game 3 specifically -- games 1 and 2 are irrelevant
// to the jackpot regardless of what happened in their 10th frames.
//
// Money won (the actual pot/jackpot dollar amounts) isn't something this
// can compute -- that depends on real-world buy-ins, not shot data -- so
// this only determines eligibility. Amounts are tracked separately,
// stored on the session record similar to the existing poker winnings.
//
// Fully computable from already-logged shots -- no new data entry needed
// for the win/eligibility determination itself.
export function threeSixNineResults(shots,bowler,league,date){
  const nightShots=shots.filter(s=>s.bowler===bowler&&s.league===league&&s.date===date);

  const strikeAt=(game,frameNum)=>nightShots.some(s=>s.game===game&&parseInt(s.frame)===frameNum&&s.result==="Strike");

  const perGame=["1","2","3"].map(game=>({
    game,frame3:strikeAt(game,3),frame6:strikeAt(game,6),frame9:strikeAt(game,9),
  }));

  // All 9 specific strikes across all 3 games -- the only way to win.
  const qualifies=perGame.every(g=>g.frame3&&g.frame6&&g.frame9);

  const tenthShots=nightShots.filter(s=>s.game==="3"&&parseInt(s.frame)===10);
  const tenthBallStrike=(ballNum)=>tenthShots.some(s=>
    (ballNum===1?(!s.ballNum||s.ballNum===1):s.ballNum===ballNum)&&s.result==="Strike"
  );
  const tenthTripleStrike=tenthBallStrike(1)&&tenthBallStrike(2)&&tenthBallStrike(3);

  // Jackpot requires BOTH the whole-session win AND game 3's 10th-frame
  // turkey -- never eligible from game 1 or 2's 10th frame under any
  // circumstances, and never eligible at all without the full 9 strikes.
  const jackpotEligible=qualifies&&tenthTripleStrike;

  return{perGame,qualifies,tenthTripleStrike,jackpotEligible};
}
