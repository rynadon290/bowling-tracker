import { Fragment } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C, S, F, Chip, CompareBadge, StatLead, StatRow, StatRows } from "./ui.jsx";
import { PRACTICE_SESSION_KEY, formatDate, STRIKE_DESCRIPTIONS, RELEASES, BALL_CHANGE_REASONS, strikeDescriptionsForHand, storedStrikeDescriptionFor } from "./constants.js";
import {
  bowlerHighGame, bowlerHighSeries, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData,
  gameAvg, teamGameTotalAvg, teamGameTotalAvgAt, rAvg, cAvg, avgProgress, pinsForNextSession,
  hungCounts, beatHighBowlerStats, scoreValues, scoreConsistency, histogramBuckets, threeSixNineResults,
} from "./domain/stats.js";
import { lineupSort } from "./domain/leagues.js";
import { totalMoney } from "./domain/money.js";
import { visibleStatsCardOrder } from "./domain/preferences.js";

export default function StatsView({
  centerStats,
  preferences,
  view, shots, sessions, bowlers, teams, leagues, arsenals, saved,
  statsBowler, setStatsBowler, compareBowler, setCompareBowler,
  statsLeague, setStatsLeague,
  compareLeague, setCompareLeague, matches,
  FRAME_POSITION_RELIABILITY_THRESHOLD, SHOT_SAMPLE_THRESHOLD, allFirstBalls, bStats, bowlerLeagueCount,
  cleanFrameCount, cleanFrameR, compareLabel, firstBallAvg, fivePinAttempts, fivePinMisses,
  framePosition, framePositionGamesLogged, framePositionReliable, frameShots, hideIndividualOnly,
  isTeamView, leaveAvg, mCounts, nonSplitLeaveList, nonStrikeFirstBalls, rng, showTeamCompare,
  singlePinAttempts, singlePinMade, singlePinSpareR, spR, splitBreakdownList, splitConvR,
  splitCount, splitR, statsShots, stk, stkR, teamCleanFrameR, teamFirstBallAvg, teamLeaveAvg,
  teamSinglePinSpareR, teamSpR, teamSplitConvR, teamSplitR, teamStkR, teamTenPinRate,
  teamTenPinSpareR, tenPinAttempts, tenPinLeaveCount, tenPinMade, tenPinSpareR, tot, wk,
  handicapMatches, handicapSplit, longestStrikeStreak,
  theoreticalScoreForGame,
  viewedLeftHanded=false,
}) {
  // Fixed cards keep anchored positions: "Viewing" is the selector that
  // controls everything below it, and "Danger Zone" holds destructive
  // actions -- neither should float into the middle of the stats.
  // Head-to-head is pulled directly under the Viewing card whenever a
  // comparison is active.
  //
  // It's the only card that exists BECAUSE you're comparing -- with no
  // comparison it renders nothing at all. Leaving it in its saved
  // position meant selecting an opponent put the one card about that
  // opponent somewhere below fifteen cards about you. The saved order
  // still governs everything else, and is untouched when no comparison
  // is running.
  // The team chips are labelled `${league} Team`, built from the bowler's
  // actual leagues -- so hardcoding "Tuesday Team or Thursday Team" was
  // wrong for anyone whose leagues aren't named that. Build the prompt
  // from the same source the chips use.
  // The chips said "Tuesday Team" -- built from the LEAGUE name, not the
  // team's. A bowler whose team is called "Split Happens" saw "Tuesday
  // Team" everywhere, which is not what they call themselves.
  // Match on the normalised name so a team stored against "Tuesday" still
  // matches a league listed as "Tuesday House Shot" (and vice versa) --
  // team.league comes from the raw cloud league name, which may or may not
  // carry the suffix depending on when the row was written.
  const normLeague = (v) => String(v || "").replace(" House Shot", "").trim().toLowerCase();
  const teamNameForLeague = (l) => {
    const t = (teams || []).find(t => t.name && normLeague(t.league) === normLeague(l));
    return t ? t.name : `${String(l).replace(" House Shot", "")} Team`;
  };

  const teamChoiceNames = (leagues || [])
    .filter(l => l !== PRACTICE_SESSION_KEY)
    .map(l => `"${teamNameForLeague(l)}"`);
  const pickATeam = teamChoiceNames.length === 0
    ? "Pick a league above"
    : teamChoiceNames.length === 1
      ? `Select ${teamChoiceNames[0]} above`
      : `Select ${teamChoiceNames.slice(0, -1).join(", ")} or ${teamChoiceNames[teamChoiceNames.length - 1]} above`;

  const baseOrder = ["viewing", ...visibleStatsCardOrder(preferences)];
  const comparing = !!compareBowler || isTeamView;
  const renderOrder = comparing
    ? ["viewing", "headToHead", ...baseOrder.filter(id => id !== "viewing" && id !== "headToHead")]
    : baseOrder;

  return (
          <>
            {shots.length===0&&(
              <div style={{textAlign:"center",padding:"40px 16px"}}>
                <div style={{fontSize:"15px",fontWeight:600,color:C.text,marginBottom:"6px"}}>Nothing to count yet</div>
                <div style={{fontSize:"13px",color:C.textMuted,lineHeight:1.5}}>
                  Log a few frames and this fills in — strike rate, spares, ten pins, and how each ball is carrying.
                </div>
              </div>
            )}
            {shots.length>0&&(
              (()=>{
                // Each card is built into a keyed map, then rendered in the
                // order set in Settings. An entry is a WHOLE card -- the stat
                // boxes grouped inside it travel with it as one unit.
                const byId = {};
                byId["viewing"] = (
bowlers.length>1&&(
                  <div style={S.card}>
                    <div style={S.label}>Viewing</div>
                    <div style={S.chips}>
                      {leagues.map(l=>{
  const isSelected=statsLeague===l&&!statsBowler;
  return(
    <Chip key={l} label={l===PRACTICE_SESSION_KEY?l:teamNameForLeague(l)} selected={isSelected} onToggle={()=>{
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
                            <Chip key={l} label={l===PRACTICE_SESSION_KEY?l:teamNameForLeague(l)} selected={compareLeague===l} onToggle={()=>{
                              setCompareLeague(compareLeague===l?"":l);
                              setCompareBowler("");
                            }} color={C.accent}/>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
                );
                byId["headToHead"] = (
showTeamCompare&&(()=>{
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
                        <span><span style={{color:C.compare}}>●</span> {compareLabel}</span>
                      </div>
                      <div style={{height:`${pctData.length*36+20}px`}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={pctData} layout="vertical" margin={{top:0,right:16,left:0,bottom:0}}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false}/>
                            <XAxis type="number" domain={[0,100]} tick={{fill:C.textMuted,fontSize:10}}/>
                            <YAxis type="category" dataKey="metric" tick={{fill:C.textMuted,fontSize:10}} width={110}/>
                            <Tooltip contentStyle={{backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:C.text}} formatter={(v)=>[`${v}%`]}/>
                            <Bar dataKey="you" fill={C.accent} radius={[0,4,4,0]} barSize={12}/>
                            <Bar dataKey="opp" fill={C.compare} radius={[0,4,4,0]} barSize={12}/>
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
                              <Bar dataKey="opp" fill={C.compare} radius={[0,4,4,0]} barSize={12}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })()
                );
                byId["teamRecords"] = (
(()=>{
                  const recordsBowler=statsBowler||(!statsLeague&&bowlers.length<=1?(bowlers[0]||""):"");
                  if(!recordsBowler&&!statsLeague&&bowlers.length>1){
                    return(
                      <div style={S.card}>
                        <div style={S.label}>Team Records</div>
                        <div style={{fontSize:"12px",color:C.textMuted}}>{pickATeam} to see this — high game/series need one specific roster, since combining different-sized teams would unfairly favor whichever has more bowlers.</div>
                      </div>
                    );
                  }
                  const hg=recordsBowler?bowlerHighGame(sessions,recordsBowler):teamHighGame(sessions,statsLeague);
                  const hs=recordsBowler?bowlerHighSeries(sessions,recordsBowler):teamHighSeries(sessions,statsLeague);
                  if(!hg&&!hs)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{recordsBowler?`${recordsBowler}'s Records`:"Team Records"}</div>
                      {/* Rows, which also lets the date read as a sentence
                          instead of "2026-09-01 · G2". */}
                      <StatRows>
                        <StatRow label="High game" value={hg?hg.value:"—"} color={C.strike}
                          sub={hg?`${formatDate(hg.date)}${hg.game?`, game ${hg.game}`:""}`:null}/>
                        <StatRow label="High series" value={hs?hs.value:"—"} color={C.accent} last
                          sub={hs?formatDate(hs.date):null}/>
                      </StatRows>
                    </div>
                  );
                })()
                );
                byId["seasonRecord"] = (
!statsBowler&&(()=>{
                  const rMain=seasonRecord(matches,statsLeague);
                  if(!rMain.gameWins&&!rMain.gameLosses&&!rMain.seriesWins&&!rMain.seriesLosses)return null;
                  const otherRecords=leagues.filter(l=>l!==statsLeague).map(league=>({league,record:seasonRecord(matches,league)})).filter(x=>x.record.gameWins+x.record.gameLosses+x.record.seriesWins+x.record.seriesLosses>0);
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{statsLeague?`${statsLeague.replace(" House Shot","")} Season Record`:"Season Record"}</div>
                      {/* Points lead -- that's what decides the standings.
                          Games and pinfall are how the points were earned. */}
                      <StatLead
                        value={`${rMain.pointsWon}/${rMain.pointsAvailable}`}
                        caption="points won" color={C.accent}
                        detail={`${rMain.gameWins}-${rMain.gameLosses} on games, ${rMain.seriesWins}-${rMain.seriesLosses} on pinfall.`}/>
                      {!statsLeague&&otherRecords.map(({league,record})=><div key={league} style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>{league.replace(" House Shot","")}: {record.pointsWon}/{record.pointsAvailable} points ({record.gameWins}-{record.gameLosses} games, {record.seriesWins}-{record.seriesLosses} pinfall)</div>)}
                    </div>
                  );
                })()
                );
                byId["weeklyPoints"] = (
!statsBowler&&(()=>{
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
                })()
                );
                byId["handicapImpact"] = (
!statsBowler&&(()=>{
                  if(!statsLeague&&bowlers.length>1){
                    return(
                      <div style={S.card}>
                        <div style={S.label}>Handicap Impact</div>
                        <div style={{fontSize:"12px",color:C.textMuted}}>{pickATeam} to see this — "the team" needs to mean one specific roster, not several leagues' matches blended together.</div>
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
                      {/* A direct two-way comparison, so bars let you see
                          which side wins before reading either number. The
                          dot-joined meta becomes a sentence. */}
                      <StatRows>
                        <StatRow label={`Smaller handicap (avg ${split.smaller.avgHandicap})`}
                          value={split.smaller.rate!=null?`${split.smaller.rate}%`:"—"}
                          sub={`${split.smaller.count} nights`}
                          fill={split.smaller.rate??0} color={C.accent}/>
                        <StatRow label={`Larger handicap (avg ${split.larger.avgHandicap})`}
                          value={split.larger.rate!=null?`${split.larger.rate}%`:"—"}
                          sub={`${split.larger.count} nights`}
                          fill={split.larger.rate??0} color={C.accent} last/>
                      </StatRows>
                      <div style={{height:"12px"}}/>
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
                })()
                );
                byId["teamLeaderboard"] = (
!statsBowler&&bowlers.length>1&&(()=>{
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
                })()
                );
                byId["giantKiller"] = (
!statsBowler&&bowlers.length>1&&(()=>{
                  if(!statsLeague)return(
                    <div style={S.card}>
                      <div style={S.label}>Giant Killer</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>{pickATeam} to see this — it needs a specific roster to know who's on top.</div>
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
                })()
                );
                byId["hung"] = (
!statsBowler&&bowlers.length>1&&(()=>{
                  if(!statsLeague)return(
                    <div style={S.card}>
                      <div style={S.label}>🎣 Hung</div>
                      <div style={{fontSize:"12px",color:C.textMuted}}>{pickATeam} to see this — it needs a specific roster to know who else was bowling that frame.</div>
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
                })()
                );
                byId["teamSeries"] = (
!statsBowler&&bowlers.length>1&&(()=>{
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
                })()
                );
                byId["headlineStats"] = (
<div style={S.card}>
                  {/* Was a bare flex row with no card wrapper and no header,
                      which is why it read as floating -- every other card
                      sits in S.card with a label. These three ARE peers, so
                      they keep the box row; it just belongs to a card now. */}
                  <div style={S.label}>This season</div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <div style={S.statBox}><div style={S.statNum}>{tot}</div><div style={S.statLbl}>Shots</div></div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.strike}}>{stkR}%</div>
                      <div style={S.statLbl}>Strike</div>
                      {showTeamCompare&&<CompareBadge value={stkR} teamValue={teamStkR} label={compareLabel}/>}
                    </div>
                    <div style={S.statBox}>
                      <div style={{...S.statNum,color:C.spare}}>{spR}%</div>
                      <div style={S.statLbl}>Spare</div>
                      {showTeamCompare&&<CompareBadge value={spR} teamValue={teamSpR} label={compareLabel}/>}
                    </div>
                  </div>
                </div>
                );
                byId["cleanFrames"] = (
<div style={S.card}>
                  <div style={S.label}>Clean frames</div>
                  <StatLead
                    value={frameShots.length?cleanFrameR:"—"} unit={frameShots.length?"%":""}
                    caption="of frames closed out" color={C.accent}
                    badge={showTeamCompare?<CompareBadge value={cleanFrameR} teamValue={teamCleanFrameR} label={compareLabel}/>:null}
                    detail={`${cleanFrameCount} of ${frameShots.length} frames with no open.`}/>
                </div>
                );
                byId["framePosition"] = (
!isTeamView&&framePositionGamesLogged>0&&(()=>{
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
                })()
                );
                byId["firstBallAverage"] = (
<div style={S.card}>
                  <div style={S.label}>First-Ball Average</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Average pins on every fresh-rack delivery — every frame's first ball, plus any 10th-frame bonus ball thrown at a full reset rack — strikes counted as 10. The standard metric, comparable to LaneTalk and other scoring apps.</div>
                  {/* Decimal compare kept inline rather than via CompareBadge:
                      that rounds to whole numbers, and 0.4 pins of first-ball
                      average is a real difference worth showing. */}
                  <StatLead
                    value={firstBallAvg!=null?firstBallAvg.toFixed(2):"—"}
                    caption="pins per fresh rack" color={C.accent}
                    badge={showTeamCompare&&firstBallAvg!=null&&teamFirstBallAvg!=null?(()=>{
                      const diff=Math.round((firstBallAvg-teamFirstBallAvg)*100)/100;
                      if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {compareLabel}</div>;
                      return(
                        <div style={{fontSize:"10px",color:diff>0?C.strike:C.miss,marginTop:"2px",fontWeight:600}}>
                          {diff>0?"▲":"▼"} {Math.abs(diff).toFixed(2)} vs {compareLabel}
                        </div>
                      );
                    })():null}
                    detail={`Across ${allFirstBalls.length} fresh racks.`}/>
                  <div style={S.divider}/>
                  <div style={{...S.label,marginBottom:"6px"}}>Leave Average</div>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Same fresh-rack deliveries, but only the ones that weren't a strike — isolates how good the leave is on a miss, separate from strike rate.</div>
                  <StatLead
                    value={leaveAvg!=null?leaveAvg.toFixed(2):"—"}
                    caption="pins when you don't strike" color={C.spare}
                    badge={showTeamCompare&&leaveAvg!=null&&teamLeaveAvg!=null?(()=>{
                      const diff=Math.round((leaveAvg-teamLeaveAvg)*100)/100;
                      if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {compareLabel}</div>;
                      return(
                        <div style={{fontSize:"10px",color:diff>0?C.strike:C.miss,marginTop:"2px",fontWeight:600}}>
                          {diff>0?"▲":"▼"} {Math.abs(diff).toFixed(2)} vs {compareLabel}
                        </div>
                      );
                    })():null}
                    detail={`Across ${nonStrikeFirstBalls.length} non-strike balls.`}/>
                </div>
                );
                byId["tenPinLeaves"] = (
<div style={S.card}>
                  <div style={S.label}>Ten pins</div>
                  {(()=>{
                    const rate=tot>0?Math.round((tenPinLeaveCount/tot)*100):0;
                    const spareRate=tenPinAttempts.length?tenPinSpareR:null;
                    const wkPct=(wk+rng)>0?Math.round((wk/(wk+rng))*100):0;
                    return(<>
                      {/* Conversion leads, not the leave rate: how often you
                          leave a ten is largely the lane and the ball; how
                          often you MAKE it is what you can go practise. */}
                      <StatLead
                        value={tenPinAttempts.length?spareRate:"—"} unit={tenPinAttempts.length?"%":""}
                        caption="of your ten pins converted"
                        badge={showTeamCompare&&spareRate!=null?<CompareBadge value={spareRate} teamValue={teamTenPinSpareR} label={compareLabel}/>:null}
                        detail={`${tenPinMade} of ${tenPinAttempts.length} made. You leave a ten on ${rate}% of first balls.`}/>
                      <StatRows>
                        {!isTeamView&&(<>
                          <StatRow label="Weak 10s" value={wk} fill={wkPct} color={C.miss}/>
                          <StatRow label="Ringing 10s" value={rng} fill={100-wkPct} color={C.spare}/>
                        </>)}
                        <StatRow label="Ten-pin leave rate" value={`${rate}%`} color={C.textMuted} last
                          badge={showTeamCompare?<CompareBadge value={rate} teamValue={teamTenPinRate} lowerIsBetter label={compareLabel}/>:null}/>
                      </StatRows>
                    </>);
                  })()}
                </div>
                );
                byId["singlePinSpares"] = (
<div style={S.card}>
                  <div style={S.label}>Single pin spares</div>
                  <StatLead
                    value={singlePinAttempts.length?singlePinSpareR:"—"} unit={singlePinAttempts.length?"%":""}
                    caption="converted" color={C.strike}
                    badge={showTeamCompare?<CompareBadge value={singlePinSpareR} teamValue={teamSinglePinSpareR} label={compareLabel}/>:null}
                    detail={`${singlePinMade} of ${singlePinAttempts.length} made. Any leave with exactly one pin standing — 7, 4, 8, 10, or any other.`}/>
                </div>
                );
                byId["splits"] = (
fivePinAttempts.length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Lone 5-pin</div>
                    {/* Conversion leads, consistent with the other spare
                        cards -- misses become the supporting figure. */}
                    <StatLead
                      value={fivePinAttempts.length?Math.round(((fivePinAttempts.length-fivePinMisses)/fivePinAttempts.length)*100):"—"}
                      unit={fivePinAttempts.length?"%":""}
                      caption="converted" color={C.strike}
                      detail={`${fivePinAttempts.length-fivePinMisses} of ${fivePinAttempts.length} made, ${fivePinMisses} missed. The 5-pin standing completely alone, nothing else in the way.`}/>
                  </div>
                )
                );
                byId["loneFivePin"] = (
<div style={S.card}>
                  <div style={S.label}>Splits</div>
                  {/* Conversion leads here too -- leaving a split is mostly
                      carry; making one is skill. */}
                  <StatLead
                    value={splitCount?splitConvR:"—"} unit={splitCount?"%":""}
                    caption="of splits converted" color={C.strike}
                    badge={showTeamCompare&&splitCount?<CompareBadge value={splitConvR} teamValue={teamSplitConvR} label={compareLabel}/>:null}
                    detail={`${splitCount} split${splitCount===1?"":"s"} left, ${splitR}% of your first balls.`}/>
                  {showTeamCompare&&(
                    <StatRows>
                      <StatRow label="Split rate" value={`${splitR}%`} color={C.textMuted} last
                        badge={<CompareBadge value={splitR} teamValue={teamSplitR} lowerIsBetter label={compareLabel}/>}/>
                    </StatRows>
                  )}
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
                );
                byId["nonSplitLeaves"] = (
!isTeamView&&nonSplitLeaveList.length>0&&(
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
                )
                );
                byId["strikeStreak"] = (
!isTeamView&&(
                  <div style={S.card}>
                    <div style={S.label}>Longest strike streak</div>
                    <StatLead
                      value={longestStrikeStreak(statsBowler)}
                      caption="in a row" color={C.strike}
                      badge={compareBowler?<CompareBadge value={longestStrikeStreak(statsBowler)} teamValue={longestStrikeStreak(compareBowler)} label={compareLabel}/>:null}
                      detail="Consecutive strikes, carrying across games within the same night."/>
                  </div>
                )
                );
                byId["byBall"] = (
!hideIndividualOnly&&(
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
                )
                );
                byId["missDistribution"] = (
!hideIndividualOnly&&preferences.trackedFields.miss&&mCounts.length>0&&(
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
                )
                );
                byId["releaseQuality"] = (
!hideIndividualOnly&&preferences.trackedFields.release&&(
                  <div style={S.card}>
                    <div style={S.label}>Release Quality</div>
                    {/* A distribution -- three parts of one whole -- so rows
                        with bars rather than three boxes that look like
                        three unrelated figures. */}
                    <StatRows>
                      {RELEASES.map((r,i)=>{
                        const count=statsShots.filter(s=>s.release===r).length;
                        const pct=tot?Math.round((count/tot)*100):0;
                        return(
                          <StatRow key={r} label={r} value={`${pct}%`} sub={`${count}`} fill={pct}
                            color={r==="Good"?C.strike:r==="Bad"?C.miss:C.spare}
                            last={i===RELEASES.length-1}/>
                        );
                      })}
                    </StatRows>
                  </div>
                )
                );
                byId["ballChangeTriggers"] = (
!hideIndividualOnly&&statsShots.filter(s=>s.ballChangeReason&&s.ballChangeReason.length>0).length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Ball Change Triggers</div>
                    {BALL_CHANGE_REASONS.map(r=>{
                      const count=statsShots.filter(s=>Array.isArray(s.ballChangeReason)?s.ballChangeReason.includes(r):s.ballChangeReason===r).length;
                      if(!count)return null;
                      return(<div key={r} style={{display:"flex",justifyContent:"space-between",marginBottom:"6px",fontSize:"12px"}}><span>{r}</span><span style={{color:C.spare}}>{count}</span></div>);
                    })}
                  </div>
                )
                );
                byId["strikeQuality"] = (
!hideIndividualOnly&&statsShots.filter(s=>s.strikeDescription).length>0&&(
                  <div style={S.card}>
                    <div style={S.label}>Strike Quality</div>
                    {/* "Trip 4" and "Kick 10" are stored canonically for
                        both hands (same convention as Weak 10/Weak 7) --
                        this view is scoped to one bowler (statsBowler,
                        falling back to whoever's active), so their real
                        hand's label is unambiguous here. A blended
                        team/combined view has no single hand to label
                        with, so it falls back to the canonical (righty)
                        wording rather than inventing a mixed label. */}
                    {strikeDescriptionsForHand(viewedLeftHanded).map(label=>{
                      const d=storedStrikeDescriptionFor(label);
                      const count=statsShots.filter(s=>s.strikeDescription===d).length;
                      if(!count)return null;
                      const pct=stk?Math.round((count/stk)*100):0;
                      return(
                        <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                          <span style={{fontSize:"12px"}}>{label}</span>
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
                )
                );
                byId["runningAverages"] = (
sessions.length>0&&(()=>{
                  const leagueAvgs=leagues.map(league=>({league,avg:rAvg(sessions,statsBowler,league)})).filter(x=>x.avg!=null);
                  const combined=cAvg(sessions,statsBowler);
                  if(!leagueAvgs.length&&!combined)return null;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>Running Averages</div>
                      {isTeamView&&<div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Top number is the average bowler's score. "Team" below it is what the whole team scores together that game.</div>}
                      {/* Rows, not boxes: this is a variable-length list of
                          peers -- one average per league -- with no natural
                          lead figure, and boxes wrapped raggedly once a
                          bowler had three or more leagues. The composite
                          gets the accent colour since it's the summary of
                          the rest. */}
                      <StatRows>
                        {leagueAvgs.map(({league,avg},i)=>(
                          <StatRow key={league}
                            label={league.replace(" House Shot","")}
                            value={avg}
                            sub={isTeamView&&teamGameTotalAvg(sessions,league)!=null?`team ${teamGameTotalAvg(sessions,league)}`:null}
                            last={i===leagueAvgs.length-1&&!(!statsLeague&&(!statsBowler||bowlerLeagueCount>1)&&combined)}
                            badge={showTeamCompare?<CompareBadge value={avg} teamValue={compareBowler?rAvg(sessions,compareBowler,league):(isTeamView?teamGameTotalAvg(sessions,league):rAvg(sessions,"",league))} label={compareLabel}/>:null}/>
                        ))}
                        {!statsLeague&&(!statsBowler||bowlerLeagueCount>1)&&combined&&(
                          <StatRow label="Composite" value={combined} color={C.accent} last
                            badge={showTeamCompare&&compareBowler?<CompareBadge value={combined} teamValue={cAvg(sessions,compareBowler)} label={compareLabel}/>:null}/>
                        )}
                      </StatRows>
                      {!statsLeague&&showTeamCompare&&!compareBowler&&<div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px"}}>Combined spans all leagues, so there's no single team to compare it against — pick a specific bowler under "Compare To", or select a specific league above.</div>}
                    </div>
                  );
                })()
                );
                byId["theoreticalAverage"] = (
(()=>{
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
                      <StatLead
                        value={Math.floor(theoreticalAvg)}
                        caption="if you'd made every makeable spare" color={C.spare}
                        detail={`Across ${theoreticalGameScores.length} games.`}/>
                    </div>
                  );
                })()
                );
                byId["progress"] = (
(()=>{
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

                      {(()=>{
                        const next=pinsForNextSession(sessions,statsBowler,statsLeague);
                        if(!next)return null;
                        return(
                          <>
                            <div style={S.divider}/>
                            <div style={S.label}>Next Session ({next.gamesPerSession} Games)</div>
                            <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                              You're averaging {next.exact!=null?next.exact.toFixed(2):next.current} across {next.games} games. Here's what the next set does to it.
                            </div>
                            {/* A gain/drop pair reads better as two rows than
                                two boxes -- the labels are sentences, and
                                they were being squeezed into box captions. */}
                            <StatRows>
                              <StatRow
                                label={`To reach ${next.current+1}`}
                                value={next.gainAchievable?next.toGain:"—"}
                                sub={next.gainAchievable?`${next.gainAvgNeeded}/game`:null}
                                color={next.gainAchievable?C.strike:C.textMuted}/>
                              <StatRow
                                label={`Drops to ${next.current-1} at or below`}
                                value={next.dropAchievable?next.maxToDrop:"—"}
                                sub={next.dropAchievable?`under ${next.dropAvgThreshold}/game`:null}
                                color={next.dropAchievable?C.miss:C.textMuted} last/>
                            </StatRows>
                            {!next.gainAchievable&&(
                              <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px",textAlign:"center"}}>
                                Gaining a full point isn't reachable in one set at this average.
                              </div>
                            )}
                            {!next.dropAchievable&&(
                              <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px",textAlign:"center"}}>
                                No set this session can drop the average a full point.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()
                );
                byId["consistency"] = (
(()=>{
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
                      <StatLead
                        value={`\u00b1${consistency.stdDev}`}
                        caption="pins either side of your average" color={C.accent}
                        badge={showTeamCompare&&compareConsistency?<CompareBadge value={consistency.stdDev} teamValue={compareConsistency.stdDev} lowerIsBetter label={compareLabel}/>:null}
                        detail={`Across ${consistency.games} ${statsBowler?"games":"team games"}, ranging ${consistency.min}\u2013${consistency.max}.`}/>
                    </div>
                  );
                })()
                );
                byId["scoreDistribution"] = (
(()=>{
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
                })()
                );
                byId["gameByGame"] = (
sessions.length>0&&(gameAvg(sessions,statsBowler,0,statsLeague)||gameAvg(sessions,statsBowler,1,statsLeague)||gameAvg(sessions,statsBowler,2,statsLeague))&&(
                  <div style={S.card}>
                    <div style={S.label}>Game-by-Game Averages</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      Composite average at each position in the night, across the whole season — shows whether {statsBowler?"they're":"the team is"} bowling better early, middle, or late.
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
                )
                );
                byId["money"] = (
preferences.showMoneyGames&&(()=>{
                  const relevantSessions=sessions.filter(s=>(statsBowler?s.bowler===statsBowler:true)&&(statsLeague?s.league===statsLeague:true));
                  if(!relevantSessions.length)return null;
                  const m=totalMoney(relevantSessions);
                  const rows=[
                    {label:"Poker",data:m.poker},
                    {label:"High Game Pot",data:m.highGame},
                    {label:"3-6-9",data:m.threeSixNine},
                  ].filter(r=>r.data.gross!==0||r.data.cost!==0);
                  const fmt=v=>`${v<0?"−":""}$${Math.abs(v).toFixed(2)}`;
                  return(
                    <div style={S.card}>
                      <div style={S.label}>{isTeamView?"Team Money Games":"Money Games"}</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Season totals across every side game — what came in, what it cost to play, and what actually stuck.
                      </div>
                      {/* Net leads: won and paid-in are its two components,
                          not three peer figures. Net is also the only one
                          anyone actually quotes. */}
                      <StatLead
                        value={fmt(m.net)}
                        caption={m.net>=0?"up on the season":"down on the season"}
                        color={m.net>=0?C.strike:C.miss}
                        detail={`$${m.gross.toFixed(2)} won against $${m.cost.toFixed(2)} paid in.`}/>
                      {rows.length>0&&(
                        <>
                          <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>By Game</div>
                          {rows.map(r=>(
                            <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px",fontSize:"12px"}}>
                              <span>{r.label}</span>
                              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                                <span style={{color:C.textMuted}}>${r.data.gross.toFixed(2)} − ${r.data.cost.toFixed(2)}</span>
                                <span style={{fontWeight:700,minWidth:"64px",textAlign:"right",color:r.data.net>=0?C.strike:C.miss}}>
                                  {fmt(r.data.net)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })()
                );
                byId["threeSixNine"] = (
preferences.showMoneyGames&&statsBowler&&(()=>{
                  // Every night this bowler has a logged session for,
                  // newest first. threeSixNineResults is a single,
                  // whole-session determination now (all 9 specific
                  // strikes across games 1, 2, AND 3), not per-game.
                  const nightSessions=sessions
                    .filter(s=>s.bowler===statsBowler&&(!statsLeague||s.league===statsLeague))
                    .sort((a,b)=>b.date.localeCompare(a.date));
                  if(!nightSessions.length)return null;

                  const nightResults=nightSessions.map(s=>({
                    session:s,
                    result:threeSixNineResults(shots,statsBowler,s.league,s.date),
                  }));

                  const totalWins=nightResults.filter(n=>n.result.qualifies).length;
                  const totalJackpots=nightResults.filter(n=>n.result.jackpotEligible).length;
                  const total369Money=nightSessions.reduce((a,s)=>a+(s.threeSixNineWinnings||0)+(s.jackpotWinnings||0),0);

                  return(
                    <div style={S.card}>
                      <div style={S.label}>3-6-9 Tracker</div>
                      <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                        Strike frames 3, 6, and 9 of every game (games 1, 2, and 3 -- all 9 strikes) to win the pot for the night. Also throw a full turkey in game 3's 10th frame to additionally earn the jackpot.
                      </div>
                      {/* Money leads -- same call as the Money Games card;
                          wins and jackpots are how it was won. */}
                      <StatLead
                        value={`$${total369Money}`} caption="won on 3-6-9" color={C.accent}
                        detail={`${totalWins} win${totalWins===1?"":"s"} and ${totalJackpots} jackpot${totalJackpots===1?"":"s"}.`}/>
                      {/* Night-by-night history removed: this card is about
                          the season total. The per-night detail is already
                          on each session in History, and repeating it here
                          made a summary card scroll for a whole season. */}
                    </div>
                  );
                })()
                );
                byId["byCenter"] = (
                  (centerStats||[]).length > 1 && (
                  <div style={S.card}>
                    <div style={S.label}>By Bowling Center</div>
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      How you score house to house. Only leagues with a center set are included — set them in Settings.
                    </div>
                    {(centerStats||[]).map(cs=>(
                      <div key={cs.centerId} style={{marginBottom:"10px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                          <span style={{fontSize:"13px",fontWeight:600}}>{cs.center.name}</span>
                          <span style={{fontSize:"13px",fontWeight:700,color:C.accent}}>{cs.average}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                          <span style={S.tag()}>{cs.games} games</span>
                          <span style={S.tag(C.textMuted)}>{cs.sessions} sessions</span>
                          {cs.high!=null&&<span style={S.tag(C.strike)}>High {cs.high}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  )
                );
                return (<>{renderOrder.map(id => <Fragment key={id}>{byId[id]}</Fragment>)}</>);
              })()
            )}
            <div style={{height:"32px"}}/>
          </>
  );
}
