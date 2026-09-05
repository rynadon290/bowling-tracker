import { C, S, Chip, PinDeck, CollapsibleCard } from "./ui.jsx";
import { RESULTS, SURFACES, STRIKE_DESCRIPTIONS, RELEASES, MISSES, BALL_CHANGE_REASONS } from "./constants.js";
import { rAvg, cAvg, threeSixNineResults } from "./domain/stats.js";

export default function LogView({
  shots, sessions, bowlers, footerHeight, footerRef, teams, leagues,
  activeBowler, newBowlerName, setNewBowlerName, arsenals, newBallName, setNewBallName,
  form, setForm, editingId, saved, sessionSaved, sessionSaveMessage,
  sessionLeague, setSessionLeague, sessionDate, setSessionDate,
  startingLane, setStartingLane, setShowSummary, expandedSections,
  ballNumLabel, curSession, currentLane, firstBallPins, g1score, g2score, g3score,
  hasLeave, inTenth, isNoTap, isStrike, needsSpareMade, sessionTotal, showPinCount,
  standingPins, tenthOptions,
  addBall, addBowler, autoFillLine, calcLane, cancelEdit, cycleGameResult, cycleSeriesResult,
  getLanePattern, getMatch, handleBallChange, handleLeaveToggle, handleLineChange,
  handleSpareMadeToggle, matchHandicap, previousShotBall, removeBall, removeBowler,
  selectBowler, set, setLanePattern, setMatchHandicap, setMatchOpponent, setPokerWinnings, setThreeSixNineWinnings, winningsSaved, confirmWinningsSaved, setView,
  stepPinCount, submitSession, submitShot, theoreticalScoreForGame, toggle, toggleMulti, toggleSection,
}) {
  return (
    <>
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
                <div style={{...S.chips,gap:"4px"}}>
                  {bowlers.map(b=>(
                    <Chip key={b} label={b} selected={activeBowler===b} onToggle={()=>selectBowler(b)} color={C.accent} dense/>
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
              <CollapsibleCard
                title={`${activeBowler}'s Arsenal`}
                summary={`${(arsenals[activeBowler]||[]).length} ball${(arsenals[activeBowler]||[]).length===1?"":"s"}`}
                expanded={expandedSections.arsenal}
                onToggle={()=>toggleSection("arsenal")}>
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
              </CollapsibleCard>
            )}

            {/* Session card */}
            {!editingId&&activeBowler&&(
              <button style={{...S.btn(),width:"100%",marginBottom:"12px"}} onClick={()=>setView("import")}>
                📷 Import Scorecard
              </button>
            )}
            {!editingId&&activeBowler&&(
              <CollapsibleCard
                title="Tonight's Session"
                summary={sessionLeague?`${sessionLeague.replace(" House Shot","")} · ${sessionDate}`:""}
                expanded={expandedSections.tonightSession}
                onToggle={()=>toggleSection("tonightSession")}>
                <div style={S.chips}>
                  {leagues.map(l=>(
                    <Chip key={l} label={l.replace(" House Shot","")} selected={sessionLeague===l}
                      onToggle={()=>{const team=teams.find(t=>t.league===l&&t.members.includes(activeBowler));setSessionLeague(l);setForm(f=>({...f,league:l,teamId:team?.id||"",date:sessionDate}));setShowSummary(false);}}/>
                  ))}
                </div>
                <div style={{marginBottom:"10px"}}>
                  <input style={S.input} type="date" value={sessionDate}
                    onChange={e=>{setSessionDate(e.target.value);set("date",e.target.value);setShowSummary(false);}}/>
                </div>

                {/* Opponent & handicap — moved here from Stats, since this is
                    known before bowling starts and belongs with the rest of
                    tonight's setup. Keyed by team when one resolves (so two
                    teams sharing a league on the same night get separate
                    records); falls back to the league name itself when the
                    active bowler isn't yet set up as a team member, so this
                    still works before Teams is fully configured. */}
                {sessionLeague&&(()=>{
                  const matchKey=form.teamId||sessionLeague;
                  const m=getMatch(matchKey,sessionDate,sessionLeague)||{opponent:"",handicap:""};
                  const handicap=matchHandicap(m);
                  return(
                    <div style={{marginBottom:"12px"}}>
                      <div style={S.label}>Opponent</div>
                      <div style={S.row}>
                        <input style={{...S.input,flex:2}} placeholder="Opponent (e.g. Team Name)"
                          value={m.opponent||""} onChange={e=>setMatchOpponent(matchKey,sessionLeague,sessionDate,e.target.value)}/>
                        <input style={{...S.input,flex:1,textAlign:"center"}} type="number" placeholder="Handicap"
                          value={handicap} onChange={e=>setMatchHandicap(matchKey,sessionLeague,sessionDate,e.target.value)}/>
                      </div>
                    </div>
                  );
                })()}

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
                          <Chip label="House Shot" selected={!isOfficial} onToggle={()=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{patternType:"house"})}/>
                          <Chip label="Official Pattern" selected={isOfficial} onToggle={()=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{patternType:"official"})} color={C.spare}/>
                        </div>
                        {isOfficial&&(
                          <div style={{marginTop:"6px"}}>
                            <input style={{...S.input,marginBottom:"6px"}} placeholder="Pattern name (e.g. Kegel Main Street)"
                              value={rec.patternName} onChange={e=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{patternName:e.target.value})}/>
                            <div style={S.row}>
                              <input style={{...S.input,flex:1}} type="number" placeholder="Length (ft)"
                                value={rec.length} onChange={e=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{length:e.target.value})}/>
                              <input style={{...S.input,flex:1}} type="number" placeholder="Volume (mL)"
                                value={rec.volume} onChange={e=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{volume:e.target.value})}/>
                              <input style={{...S.input,flex:1}} placeholder="Ratio (e.g. 3:1)"
                                value={rec.ratio} onChange={e=>setLanePattern(form.teamId||sessionLeague,sessionLeague,sessionDate,lane,{ratio:e.target.value})}/>
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

                {sessionLeague&&(
                  <>
                    {/* Points won — moved here from Stats' Log Match Results,
                        since you naturally mark these as the night wraps up. */}
                    {sessionLeague&&(()=>{
                      const matchKey=form.teamId||sessionLeague;
                      const m=getMatch(matchKey,sessionDate,sessionLeague)||{games:[null,null,null],series:null};
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
                        <div style={{marginBottom:"10px"}}>
                          <div style={S.label}>Points Won</div>
                          <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>4 points per night — 1 per game, 1 for total pinfall. Tap to cycle: not marked → won → lost.</div>
                          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"6px"}}>
                            {[0,1,2].map(idx=>resultChip(m.games[idx]??null,()=>cycleGameResult(matchKey,sessionLeague,sessionDate,idx),`G${idx+1}`))}
                            {resultChip(m.series??null,()=>cycleSeriesResult(matchKey,sessionLeague,sessionDate),"Pinfall")}
                          </div>
                          {pointsMarked>0&&(
                            <div style={{fontSize:"12px",fontWeight:600,color:C.accent}}>{pointsWon} of 4 points</div>
                          )}
                        </div>
                      );
                    })()}

                    <button style={S.btn("primary")} onClick={submitSession}>
                      {sessionSaveMessage?sessionSaveMessage:sessionSaved?"✓ Session Saved":"Save Session & View Summary"}
                    </button>
                  </>
                )}
              </CollapsibleCard>
            )}

            {/* Summary */}
            {!editingId&&curSession&&(()=>{
              const cs=curSession;
              const sr=cs.shotCount?Math.round((cs.strikes/cs.shotCount)*100):0;
              const spr=cs.spareAttempts?Math.round((cs.sparesMade/cs.spareAttempts)*100):0;
              const leagueAs=leagues.map(league=>({league,avg:rAvg(sessions,activeBowler,league)})).filter(x=>x.avg!=null),cA=cAvg(sessions,activeBowler);
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
                  {(()=>{
                    const theoreticalScores=[1,2,3].map(g=>theoreticalScoreForGame(cs.bowler,cs.league,cs.date,g));
                    const anyTheoretical=theoreticalScores.some(v=>v!=null);
                    if(!anyTheoretical)return null;
                    return(
                      <div style={{marginBottom:"12px"}}>
                        <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px"}}>If every makeable spare had been made</div>
                        <div style={{display:"flex",gap:"6px"}}>
                          {theoreticalScores.map((v,i)=>(
                            <div key={i} style={{...S.statBox,border:`1px solid ${C.spare}44`}}>
                              <div style={{...S.statNum,fontSize:"18px",color:v!=null?C.spare:C.textMuted}}>{v??"—"}</div>
                              <div style={S.statLbl}>G{i+1} Theory</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{marginBottom:"12px"}}>
                    <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px"}}>Poker Winnings ($)</div>
                    {[0,1,2].map(gameIdx=>{
                      if(cs.scores[gameIdx]==null)return null;
                      const quarterVal=(cs.pokerQuarter||[0,0,0])[gameIdx]??0;
                      const dollarVal=(cs.pokerDollar||[0,0,0])[gameIdx]??0;
                      return(
                        <div key={gameIdx} style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                          <div style={{fontSize:"12px",color:C.textMuted,width:"28px"}}>G{gameIdx+1}</div>
                          <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="0.25" placeholder="Quarter $"
                            value={quarterVal||""} onChange={e=>setPokerWinnings(cs.id,gameIdx,"quarter",e.target.value===""?0:parseFloat(e.target.value))}/>
                          <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="1" placeholder="Dollar $"
                            value={dollarVal||""} onChange={e=>setPokerWinnings(cs.id,gameIdx,"dollar",e.target.value===""?0:parseFloat(e.target.value))}/>
                        </div>
                      );
                    })}
                  </div>

                  {(()=>{
                    // 3-6-9: a single, whole-session win (all 9 specific
                    // strikes across games 1, 2, AND 3) -- not per-game
                    // like poker, so this only shows once per session, and
                    // only when actually qualified. The jackpot input is
                    // additionally gated on game 3's 10th being a full
                    // turkey, on top of the win itself.
                    const r369=threeSixNineResults(shots,cs.bowler,cs.league,cs.date);
                    if(!r369.qualifies)return null;
                    return(
                      <div style={{marginBottom:"12px"}}>
                        <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px"}}>3-6-9 Winnings ($)</div>
                        <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                          <div style={{fontSize:"12px",color:C.strike,width:"56px"}}>Pot</div>
                          <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="1" placeholder="$"
                            value={cs.threeSixNineWinnings||""} onChange={e=>setThreeSixNineWinnings(cs.id,"pot",e.target.value===""?0:parseFloat(e.target.value))}/>
                        </div>
                        {r369.jackpotEligible&&(
                          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                            <div style={{fontSize:"12px",color:C.spare,width:"56px"}}>Jackpot</div>
                            <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="1" placeholder="$"
                              value={cs.jackpotWinnings||""} onChange={e=>setThreeSixNineWinnings(cs.id,"jackpot",e.target.value===""?0:parseFloat(e.target.value))}/>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <button style={{...S.btn("primary"),marginBottom:"12px"}} onClick={confirmWinningsSaved}>
                    {winningsSaved?"✓ Winnings Saved":"Save Winnings"}
                  </button>

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
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {leagueAs.map(({league,avg})=><div key={league} style={S.statBox}><div style={{...S.statNum,fontSize:"18px"}}>{avg}</div><div style={S.statLbl}>{league.replace(" House Shot","")}</div></div>)}
                    {cA&&<div style={{...S.statBox,border:`1px solid ${C.accent}44`}}><div style={{...S.statNum,fontSize:"18px",color:C.accent}}>{cA}</div><div style={S.statLbl}>Combined</div></div>}
                  </div>
                </div>
              );
            })()}

            {!editingId&&<div style={S.divider}/>}

            {/* Ball */}
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
            </div>

            {/* Ball Change Reason — only relevant when the ball actually
                changed from the previous shot; collapsed by default. */}
            {(()=>{
              const lastBall=previousShotBall();
              const ballJustChanged=!!lastBall&&!!form.ball&&lastBall!==form.ball;
              if(!ballJustChanged)return null;
              return(
                <CollapsibleCard
                  title="Ball Change Reason"
                  summary={form.ballChangeReason.length?`${form.ballChangeReason.length} selected`:""}
                  expanded={editingId?true:expandedSections.ballChange}
                  onToggle={()=>toggleSection("ballChange")}>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>Switched from {lastBall} to {form.ball} — why?</div>
                  <div style={S.chips}>
                    {BALL_CHANGE_REASONS.map(r=>(
                      <Chip key={r} label={r} selected={form.ballChangeReason.includes(r)} onToggle={()=>toggleMulti("ballChangeReason",r)}/>
                    ))}
                  </div>
                </CollapsibleCard>
              );
            })()}

            {/* Surface */}
            <CollapsibleCard
              title="Surface"
              summary={form.surface||""}
              expanded={editingId?true:expandedSections.surface}
              onToggle={()=>toggleSection("surface")}>
              <div style={S.chips}>
                {SURFACES.map(s=><Chip key={s} label={s} selected={form.surface===s} onToggle={()=>toggle("surface",s)}/>)}
              </div>
            </CollapsibleCard>

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

              {/* Live scores — moved here from Tonight's Session, so they're
                  visible right alongside where you're actively logging. */}
              {!editingId&&sessionLeague&&(
                <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
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
                    {/* Gutter — a one-tap shortcut for all 10 pins standing,
                        rather than tapping each pin chip individually. Not a
                        separate stored result value; it produces the exact
                        same underlying state (otherLeave=all 10,
                        pinCount="0") that manually tapping every pin would,
                        so the scoring engine needs no changes and this
                        chip's "selected" state just reflects whether that
                        state currently holds. */}
                    <Chip label="Gutter"
                      selected={form.otherLeave.length===10}
                      onToggle={()=>{
                        const isGutter=form.otherLeave.length===10;
                        setForm(f=>(isGutter
                          ?{...f,otherLeave:[],pinCount:"",spareMade:""}
                          :{...f,otherLeave:["1","2","3","4","5","6","7","8","9","10"],pinCount:"0",spareMade:""}
                        ));
                      }}
                      color={C.miss}/>
                    <Chip label="9 Pin No-Tap"
                      selected={Array.isArray(form.otherLeave)&&form.otherLeave.includes("9 Pin No-Tap")}
                      onToggle={()=>handleLeaveToggle("9 Pin No-Tap")}
                      color={C.strike}/>
                  </div>
                  <PinDeck
                    selected={Array.isArray(form.otherLeave)?form.otherLeave:[]}
                    onToggle={p=>handleLeaveToggle(p)}/>
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

            {/* Notes */}
            <CollapsibleCard
              title="Notes"
              summary={form.notes?"✓":""}
              expanded={editingId?true:expandedSections.notes}
              onToggle={()=>toggleSection("notes")}>
              <textarea style={{...S.input,minHeight:"60px",resize:"vertical"}}
                placeholder="Optional notes..." value={form.notes} onChange={e=>set("notes",e.target.value)}/>
            </CollapsibleCard>


            <div style={{height:`${footerHeight}px`}}/>
          </>
          <div ref={footerRef} style={{position:"fixed",bottom:0,left:0,right:0,backgroundColor:C.surface,borderTop:`1px solid ${C.border}`,padding:"12px 16px",zIndex:50,maxWidth:"480px",margin:"0 auto"}}>
            <button style={S.btn("primary")} onClick={submitShot} disabled={!form.result||!form.bowler||needsSpareMade}>
              {saved?(editingId?"✓ Shot Updated":"✓ Shot Saved"):(editingId?"Update Shot":"Save Shot")}
            </button>
            {needsSpareMade&&(
              <div style={{fontSize:"12px",color:C.spare,marginTop:"8px",textAlign:"center"}}>Answer "Spare Made" above before saving — it directly affects the score.</div>
            )}
            {editingId&&(
              <button style={{...S.btn("warn"),marginTop:"8px"}} onClick={cancelEdit}>Cancel Edit</button>
            )}
          </div>
    </>
  );
}
