import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C, S, Chip, CompareBadge } from "./ui.jsx";
import { STRIKE_DESCRIPTIONS, RELEASES, BALL_CHANGE_REASONS } from "./constants.js";
import {
  bowlerHighGame, bowlerHighSeries, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData,
  gameAvg, teamGameTotalAvg, teamGameTotalAvgAt, rAvg, cAvg, avgProgress,
  hungCounts, beatHighBowlerStats, scoreValues, scoreConsistency, histogramBuckets,
} from "./domain/stats.js";
import { lineupSort } from "./domain/leagues.js";

export default function StatsView({
  view, shots, sessions, bowlers, teams, leagues, arsenals, saved,
  statsBowler, setStatsBowler, compareBowler, setCompareBowler,
  statsLeague, setStatsLeague, trendMetric, setTrendMetric, trendScope, setTrendScope,
  compareLeague, setCompareLeague, confirmClear, setConfirmClear, showBackup, setShowBackup,
  importText, setImportText, backupStatus, setBackupStatus, matches,
  FRAME_POSITION_RELIABILITY_THRESHOLD, SHOT_SAMPLE_THRESHOLD, allFirstBalls, bStats, bowlerLeagueCount,
  cleanFrameCount, cleanFrameR, compareLabel, firstBallAvg, fivePinAttempts, fivePinMisses,
  framePosition, framePositionGamesLogged, framePositionReliable, frameShots, hideIndividualOnly,
  isTeamView, leaveAvg, mCounts, nonSplitLeaveList, nonStrikeFirstBalls, rng, showTeamCompare,
  singlePinAttempts, singlePinMade, singlePinSpareR, spR, splitBreakdownList, splitConvR,
  splitCount, splitR, statsShots, stk, stkR, teamCleanFrameR, teamFirstBallAvg, teamLeaveAvg,
  teamSinglePinSpareR, teamSpR, teamSplitConvR, teamSplitR, teamStkR, teamTenPinRate,
  teamTenPinSpareR, tenPinAttempts, tenPinLeaveCount, tenPinMade, tenPinSpareR, tot, wk,
  clearAllData, exportData, handicapMatches, handicapSplit, importData, longestStrikeStreak,
  theoreticalScoreForGame, trendData,
}) {
  return (
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
  );
}
