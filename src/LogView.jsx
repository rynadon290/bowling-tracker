import { C, S, Chip, PinDeck, CollapsibleCard } from "./ui.jsx";
import { RESULTS, SURFACES, STRIKE_DESCRIPTIONS, RELEASES, MISSES, BALL_CHANGE_REASONS, resultsForHandedness, storedResultFor } from "./constants.js";
import { rAvg, cAvg, threeSixNineResults } from "./domain/stats.js";
import { sessionMoney } from "./domain/money.js";
import TournamentSession from "./TournamentSession.jsx";
import SessionStart from "./SessionStart.jsx";
import DrillSession from "./DrillSession.jsx";
import { getManualScore, seriesTotal } from "./domain/manualScores.js";
import { formatLayout } from "./domain/layouts.js";
import { otherBowlerSource, scorekeepingHelp } from "./domain/scorekeeping.js";

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
  preferences, setSessionMoneyArray, setSessionMoneyValue, activeBowlerLeftHanded,
  ballLayouts, setBallLayout,
  activeTournament, updateTournament, saveTournament, tournamentSaved,
  manualScores, updateManualScore,
  sessionStartDismissed, dismissSessionStart, updatePreferences,
  practiceMode, setPracticeMode, activeDrill, setActiveDrill, startDrill, saveDrill, drillSaved, drills,
  ownerName, scoringForOthers, setScoringForOthers, scoreOptions, guests, newGuestName, setNewGuestName, addGuestBowler, removeGuestBowler,
  oilPatterns,
  envBags, selectedBagId, setSelectedBagId, logBalls,
  ballSpecs, setBallSpec, ballGroups, seedDefaultGroups,
  catalogEntries, catalogAck, userId, publishBallSpecs, voteOnEntry, acknowledgeRejection,
}) {
  return (
    <>
          <>
            {!editingId&&!sessionStartDismissed&&(
              <SessionStart
                preferences={preferences}
                onApply={updatePreferences}
                onDismiss={dismissSessionStart}/>
            )}

            {/* Edit banner */}
            {editingId&&(
              <div style={{backgroundColor:C.spare+"22",border:`1px solid ${C.spare}44`,borderRadius:"10px",padding:"12px 16px",marginBottom:"12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:"13px",color:C.spare,fontWeight:600}}>✏️ Editing Shot</div>
                <button style={{...S.btn(),padding:"6px 12px",fontSize:"12px"}} onClick={cancelEdit}>Cancel</button>
              </div>
            )}

            {/* Whose game is being recorded. Renamed from "Who's Bowling",
                which read as "who is here tonight" rather than "whose shot
                am I logging" -- and the answer differs by environment:
                league keeps the team book, practice partners are
                local-only guests. Tournaments don't get this card at all --
                a tournament bowler is always logging their own results, so
                a card that could only ever say "it's you" adds nothing. */}
            {!editingId&&preferences.environment!=="tournament"&&(
              <div style={S.card}>
                <div style={S.label}>Keeping Score For</div>

                <>
                    <div style={{...S.chips,gap:"4px"}}>
                      <Chip label={`${ownerName||"Me"} (me)`} selected={activeBowler===ownerName}
                        onToggle={()=>selectBowler(ownerName)} color={C.accent} dense/>
                      {scoringForOthers&&scoreOptions.filter(n=>n!==ownerName).map(b=>(
                        <Chip key={b} label={b} selected={activeBowler===b}
                          onToggle={()=>selectBowler(b)} color={C.accent} dense/>
                      ))}
                    </div>

                    <div style={{...S.chips,marginTop:"4px"}}>
                      <Chip label={scoringForOthers?"✓ Also scoring for others":"Also scoring for others"}
                        dense selected={scoringForOthers}
                        onToggle={()=>{
                          const next=!scoringForOthers;
                          setScoringForOthers(next);
                          // Turning it off must not leave the form pointed
                          // at someone who's no longer selectable.
                          if(!next&&activeBowler!==ownerName)selectBowler(ownerName);
                        }}/>
                    </div>

                    {scoringForOthers&&(
                      <>
                        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"6px"}}>
                          {scorekeepingHelp(preferences.environment)}
                        </div>

                        {otherBowlerSource(preferences.environment)==="freetext"&&(
                          <>
                            <div style={{...S.row,marginTop:"8px"}}>
                              <input style={{...S.input,flex:1}} placeholder="Add someone bowling with you"
                                value={newGuestName} onChange={e=>setNewGuestName(e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter")addGuestBowler();}}/>
                              <button style={S.btn("sm")} onClick={addGuestBowler}>+</button>
                            </div>
                            {(guests||[]).length>0&&(
                              <div style={{...S.chips,marginTop:"6px"}}>
                                {guests.map(g=>(
                                  <Chip key={g} label={`${g}  ×`} dense selected color={C.textMuted}
                                    onToggle={()=>removeGuestBowler(g)}/>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        {otherBowlerSource(preferences.environment)==="roster"&&scoreOptions.length<=1&&(
                          <div style={{fontSize:"11px",color:C.textMuted,marginTop:"6px"}}>
                            No teammates on this league's roster yet — add them on the Social tab.
                          </div>
                        )}
                      </>
                    )}
                  </>
              </div>
            )}

            {/* In Practice, a night can be games OR a drill. A drill is a
                focused repetition scored as a rate -- it's kept out of the
                game flow entirely so it can never touch an average. */}
            {!editingId&&activeBowler&&preferences.environment==="practice"&&(
              <div style={{...S.card,padding:"10px 12px"}}>
                <div style={S.chips}>
                  <Chip label="Games" selected={practiceMode==="games"} onToggle={()=>setPracticeMode("games")}/>
                  <Chip label="Drill" selected={practiceMode==="drill"} onToggle={()=>{setPracticeMode("drill");if(!activeDrill)startDrill();}}/>
                </div>
              </div>
            )}
            {!editingId&&activeBowler&&preferences.environment==="practice"&&practiceMode==="drill"&&activeDrill&&(
              <DrillSession
                drill={activeDrill}
                onChange={setActiveDrill}
                onSave={saveDrill}
                saved={drillSaved}
                balls={logBalls}
                drills={drills}
                bowler={activeBowler}/>
            )}

            {/* The arsenal lives on the Profile screen, not here. Managing
                equipment mid-session was a second place to do the same
                thing, and the Log tab is for logging. */}

            {/* Session card */}
            {/* Importing a scorecard has nothing to do with a drill -- a drill
                isn't a game and produces no scorecard. */}
            {!editingId&&activeBowler&&!(preferences.environment==="practice"&&practiceMode==="drill")&&(
              <button style={{...S.btn(),width:"100%",marginBottom:"12px"}} onClick={()=>setView("import")}>
                📷 Import Scorecard
              </button>
            )}
            {/* Enter game scores directly, without shot-by-shot logging.
                Two cases: a screenshot that only showed game totals, and
                bowlers who want score tracking without logging 30 shots a
                night. A score entered here overrides whatever the shots
                would have computed -- see domain/manualScores.js. */}
            {!editingId&&activeBowler&&sessionLeague&&preferences.environment!=="tournament"&&preferences.trackingMode==="game"&&!(preferences.environment==="practice"&&practiceMode==="drill")&&(()=>{
              const entered=[1,2,3].map(g=>getManualScore(manualScores,activeBowler,sessionLeague,sessionDate,g));
              const total=seriesTotal(entered);
              return(
                <CollapsibleCard
                  title="Enter Game Scores"
                  summary={total!=null?`${total} series`:""}
                  expanded={expandedSections.manualScores}
                  onToggle={()=>toggleSection("manualScores")}>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                    Just the final score for each game — the series total adds itself. Use this if you're not logging shot by shot; anything entered here takes precedence over shot data.
                  </div>
                  {[1,2,3].map(g=>(
                    <div key={g} style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                      <div style={{fontSize:"12px",color:C.textMuted,width:"28px"}}>G{g}</div>
                      <input style={{...S.input,flex:1}} type="number" inputMode="numeric" placeholder="Score"
                        value={entered[g-1]==null?"":String(entered[g-1])}
                        onChange={e=>updateManualScore(activeBowler,sessionLeague,sessionDate,g,e.target.value)}/>
                    </div>
                  ))}
                  {total!=null&&(
                    <div style={{display:"flex",gap:"6px",marginTop:"10px"}}>
                      <div style={{...S.statBox,border:`1px solid ${C.accent}44`}}>
                        <div style={{...S.statNum,fontSize:"20px",color:C.accent}}>{total}</div>
                        <div style={S.statLbl}>Series</div>
                      </div>
                      <div style={S.statBox}>
                        <div style={{...S.statNum,fontSize:"20px"}}>
                          {Math.round(total/entered.filter(v=>v!=null).length)}
                        </div>
                        <div style={S.statLbl}>Average</div>
                      </div>
                    </div>
                  )}
                </CollapsibleCard>
              );
            })()}

            {/* In a tournament, "Tonight's Session" doesn't fit: game count
                varies, lane pairs change per game, and there may be several
                days with their own cut lines. The tournament form replaces
                it entirely rather than trying to bend one into the other. */}
            {!editingId&&activeBowler&&preferences.environment==="tournament"&&(
              <TournamentSession
                tournament={activeTournament}
                onChange={updateTournament}
                onSave={saveTournament}
                saved={tournamentSaved}
                oilPatterns={oilPatterns}/>
            )}
            {/* "Tonight's Session" is league framing -- series, money games,
                match points. Practice has none of that, so it gets a plain
                date header instead of a card promising things that aren't
                there. */}
            {!editingId&&activeBowler&&(preferences.environment==="practice"||preferences.environment==="casual")&&practiceMode!=="drill"&&(
              <div style={{...S.card,padding:"10px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{...S.label,marginBottom:0}}>
                    {preferences.environment==="practice"?"Practice":"Bowling"}
                  </div>
                  <input style={{...S.input,width:"auto",fontSize:"12px",padding:"4px 8px"}} type="date"
                    value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/>
                </div>
              </div>
            )}

            {!editingId&&activeBowler&&preferences.environment!=="tournament"&&preferences.environment!=="practice"&&preferences.environment!=="casual"&&(
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

                    // Theory Total covers the WHOLE series so it lines up
                    // directly against the real series. A game with no
                    // theoretical value (nothing makeable was missed, or it
                    // isn't computable) contributes its real score, since
                    // that game genuinely couldn't have gone any better.
                    const played=cs.scores
                      .map((real,i)=>({real,theory:theoreticalScores[i]}))
                      .filter(x=>typeof x.real==="number");
                    const theoryTotal=played.reduce((a,x)=>a+(x.theory??x.real),0);
                    const realTotal=played.reduce((a,x)=>a+x.real,0);
                    const leftOnTable=theoryTotal-realTotal;

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
                          {played.length>0&&(
                            <div style={{...S.statBox,border:`1px solid ${C.spare}`}}>
                              <div style={{...S.statNum,fontSize:"18px",color:C.spare}}>{theoryTotal}</div>
                              <div style={S.statLbl}>Theory Series</div>
                            </div>
                          )}
                        </div>
                        {played.length>0&&(
                          <div style={{textAlign:"center",marginTop:"8px",fontSize:"12px"}}>
                            {leftOnTable>0?(
                              <span style={{color:C.miss,fontWeight:600}}>
                                ▼ {leftOnTable} pins left on the table
                              </span>
                            ):(
                              <span style={{color:C.strike,fontWeight:600}}>
                                ✓ Converted every makeable spare
                              </span>
                            )}
                            <span style={{color:C.textMuted,fontWeight:400,marginLeft:"6px"}}>
                              ({realTotal} actual vs {theoryTotal} possible)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {preferences.showMoneyGames&&(
                    <>
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

                      <div style={{marginBottom:"12px"}}>
                        <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px"}}>High Game Pot ($)</div>
                        <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"6px"}}>
                          Highest game in the league takes it — enter what you won, if anything.
                        </div>
                        {[0,1,2].map(gameIdx=>{
                          if(cs.scores[gameIdx]==null)return null;
                          const val=(cs.highGameWinnings||[0,0,0])[gameIdx]??0;
                          return(
                            <div key={gameIdx} style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                              <div style={{fontSize:"12px",color:C.textMuted,width:"64px"}}>G{gameIdx+1} · {cs.scores[gameIdx]}</div>
                              <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="1" placeholder="Won $"
                                value={val||""} onChange={e=>setSessionMoneyArray(cs.id,"highGameWinnings",gameIdx,e.target.value===""?0:parseFloat(e.target.value))}/>
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

                      <div style={{marginBottom:"12px"}}>
                        <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px"}}>Buy-ins ($)</div>
                        <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"6px"}}>
                          What it cost to enter — so the totals below show what you actually cleared.
                        </div>
                        {[0,1,2].map(gameIdx=>{
                          if(cs.scores[gameIdx]==null)return null;
                          const qc=(cs.pokerQuarterCost||[0,0,0])[gameIdx]??0;
                          const dc=(cs.pokerDollarCost||[0,0,0])[gameIdx]??0;
                          const hc=(cs.highGameCost||[0,0,0])[gameIdx]??0;
                          return(
                            <div key={gameIdx} style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"6px"}}>
                              <div style={{fontSize:"12px",color:C.textMuted,width:"28px"}}>G{gameIdx+1}</div>
                              <input style={{...S.input,flex:1,fontSize:"12px",padding:"6px 8px"}} type="number" step="0.25" placeholder="Qtr"
                                value={qc||""} onChange={e=>setSessionMoneyArray(cs.id,"pokerQuarterCost",gameIdx,e.target.value===""?0:parseFloat(e.target.value))}/>
                              <input style={{...S.input,flex:1,fontSize:"12px",padding:"6px 8px"}} type="number" step="1" placeholder="Dollar"
                                value={dc||""} onChange={e=>setSessionMoneyArray(cs.id,"pokerDollarCost",gameIdx,e.target.value===""?0:parseFloat(e.target.value))}/>
                              <input style={{...S.input,flex:1,fontSize:"12px",padding:"6px 8px"}} type="number" step="1" placeholder="High"
                                value={hc||""} onChange={e=>setSessionMoneyArray(cs.id,"highGameCost",gameIdx,e.target.value===""?0:parseFloat(e.target.value))}/>
                            </div>
                          );
                        })}
                        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                          <div style={{fontSize:"12px",color:C.textMuted,width:"56px"}}>3-6-9</div>
                          <input style={{...S.input,flex:1,fontSize:"13px",padding:"6px 10px"}} type="number" step="1" placeholder="Buy-in $"
                            value={cs.threeSixNineCost||""} onChange={e=>setSessionMoneyValue(cs.id,"threeSixNineCost",e.target.value===""?0:parseFloat(e.target.value))}/>
                        </div>
                      </div>

                      {(()=>{
                        const m=sessionMoney(cs);
                        if(!m)return null;
                        return(
                          <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                            <div style={S.statBox}>
                              <div style={{...S.statNum,fontSize:"18px",color:C.strike}}>${m.gross.toFixed(2)}</div>
                              <div style={S.statLbl}>Won</div>
                            </div>
                            <div style={S.statBox}>
                              <div style={{...S.statNum,fontSize:"18px",color:C.miss}}>${m.cost.toFixed(2)}</div>
                              <div style={S.statLbl}>Paid In</div>
                            </div>
                            <div style={{...S.statBox,border:`1px solid ${m.net>=0?C.strike:C.miss}44`}}>
                              <div style={{...S.statNum,fontSize:"18px",color:m.net>=0?C.strike:C.miss}}>
                                {m.net<0?"−":""}${Math.abs(m.net).toFixed(2)}
                              </div>
                              <div style={S.statLbl}>Net</div>
                            </div>
                          </div>
                        );
                      })()}

                      <button style={{...S.btn("primary"),marginBottom:"12px"}} onClick={confirmWinningsSaved}>
                        {winningsSaved?"✓ Winnings Saved":"Save Winnings"}
                      </button>
                    </>
                  )}

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

            {/* Ball — collapsible. Once a bowler settles on a ball they may
                throw it for a dozen frames, so a permanently-expanded grid
                of every ball in the bag is wasted screen. */}
            <CollapsibleCard
              title={form.ball?`Ball · ${form.ball}`:"Ball"}
              summary={form.ball?(formatLayout(ballLayouts?.[`${form.bowler}|${form.ball}`])||""):`${logBalls.length} available`}
              expanded={expandedSections.ballPick}
              onToggle={()=>toggleSection("ballPick")}>
              {/* League and tournament are bag-constrained: you only have
                  what you carried. Practice isn't, so it shows everything
                  and the selector is hidden entirely. */}
              {envBags.length>0&&(
                <>
                  <div style={S.label}>Bag</div>
                  <div style={S.chips}>
                    {envBags.map(bag=>(
                      <Chip key={bag.id} label={bag.name} selected={selectedBagId===bag.id}
                        onToggle={()=>setSelectedBagId(selectedBagId===bag.id?"":bag.id)}/>
                    ))}
                  </div>
                  {!selectedBagId&&(
                    <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                      Pick the bag you brought to see its balls.
                    </div>
                  )}
                </>
              )}
              <div style={S.label}>Ball</div>
              <div style={S.chips}>
                {/* Layout shown alongside the name -- picking a ball is
                    exactly when its drilling matters, and it saves a trip
                    to the profile screen to remember what's what. */}
                {logBalls.map(b=>{
                  const layout=formatLayout(ballLayouts?.[`${form.bowler}|${b}`]);
                  return(
                    <Chip key={b} label={layout?`${b} · ${layout}`:b} selected={form.ball===b}
                      onToggle={()=>editingId?set("ball",b):handleBallChange(b)}/>
                  );
                })}
              </div>
              {logBalls.length===0&&(
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"12px"}}>
                  {!form.bowler
                    ?"Select a bowler to see their arsenal."
                    :envBags.length>0&&selectedBagId
                      ?"That bag is empty — add balls to it on the Profile screen."
                      :`No balls in ${form.bowler}'s arsenal yet — add them on the Profile screen.`}
                </div>
              )}
            </CollapsibleCard>

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
            {preferences.trackedFields.surface&&(
              <CollapsibleCard
                title="Surface"
                summary={form.surface||""}
                expanded={editingId?true:expandedSections.surface}
                onToggle={()=>toggleSection("surface")}>
                <div style={S.chips}>
                  {SURFACES.map(s=><Chip key={s} label={s} selected={form.surface===s} onToggle={()=>toggle("surface",s)}/>)}
                </div>
              </CollapsibleCard>
            )}

            {/* The whole shot-logging form only appears in shot-by-shot
                mode. In game mode it's replaced by the score entry card
                above -- showing both would imply you need to do both.
                Editing an existing shot always shows the form, since
                that's how a logged shot gets corrected. */}
            {(editingId||(preferences.trackingMode==="shot"&&!(preferences.environment==="practice"&&practiceMode==="drill")))&&(<>
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
            {preferences.trackedFields.line&&(
              <div style={S.card}>
                <div style={S.label}>Line{!editingId&&currentLane?` · Lane ${currentLane}`:""}{!editingId&&form.startingBoard&&form.targetArrows?" (stored)":""}</div>
                <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"4px"}}>Target</div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Starting Board" type="number" inputMode="decimal"
                    value={form.startingBoard} onChange={e=>editingId?set("startingBoard",e.target.value):handleLineChange("startingBoard",e.target.value)}/>
                  <input style={{...S.input,flex:1}} placeholder="Arrow Target" type="number" inputMode="decimal"
                    value={form.targetArrows} onChange={e=>editingId?set("targetArrows",e.target.value):handleLineChange("targetArrows",e.target.value)}/>
                </div>
                <div style={{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"4px",marginTop:"8px"}}>Actual</div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Actual Board" type="number" inputMode="decimal"
                    value={form.actualBoard} onChange={e=>set("actualBoard",e.target.value)}/>
                  <input style={{...S.input,flex:1}} placeholder="Actual Arrow" type="number" inputMode="decimal"
                    value={form.actualArrows} onChange={e=>set("actualArrows",e.target.value)}/>
                </div>
                {(()=>{
                  // The gap between target and actual is the whole point of
                  // recording both: consistently missing the same direction
                  // is an execution problem, which is a different fix from
                  // having picked the wrong line to begin with.
                  const t=parseFloat(form.targetArrows), a=parseFloat(form.actualArrows);
                  if(Number.isNaN(t)||Number.isNaN(a))return null;
                  const diff=a-t;
                  if(diff===0)return(
                    <div style={{fontSize:"12px",color:C.strike,fontWeight:600,marginTop:"6px",textAlign:"center"}}>✓ Hit the target</div>
                  );
                  return(
                    <div style={{fontSize:"12px",color:C.spare,fontWeight:600,marginTop:"6px",textAlign:"center"}}>
                      {Math.abs(diff)} board{Math.abs(diff)===1?"":"s"} {diff>0?"right":"left"} of target
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Ball Speed — an accessory field like the others: on by
                default in Practice (where comparing speed against outcomes
                is the point), off elsewhere, but opt-in either way. */}
            {preferences.trackedFields.ballSpeed&&(
              <div style={S.card}>
                <div style={S.label}>Ball Speed</div>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <input style={{...S.input,flex:1}} placeholder="mph" type="number" step="0.1" inputMode="decimal"
                    value={form.ballSpeed} onChange={e=>set("ballSpeed",e.target.value)}/>
                  <span style={{fontSize:"13px",color:C.textMuted}}>mph</span>
                </div>
              </div>
            )}

            {/* Rev rate and axis rotation are self-reported estimates -- there's
                no way to measure them without a sensor -- so they're labelled
                as such rather than presented as data. Off by default. */}
            {(preferences.trackedFields.revRate||preferences.trackedFields.axisRotation)&&(
              <div style={S.card}>
                <div style={S.label}>Release Estimates</div>
                <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                  Your best guess — these can't be measured without a sensor.
                </div>
                <div style={S.row}>
                  {preferences.trackedFields.revRate&&(
                    <input style={{...S.input,flex:1}} placeholder="Rev rate (rpm)" type="number" inputMode="numeric"
                      value={form.revRate} onChange={e=>set("revRate",e.target.value)}/>
                  )}
                  {preferences.trackedFields.axisRotation&&(
                    <input style={{...S.input,flex:1}} placeholder="Axis rotation (°)" type="number" inputMode="numeric"
                      value={form.axisRotation} onChange={e=>set("axisRotation",e.target.value)}/>
                  )}
                </div>
              </div>
            )}

            {/* Shoes — heel and sole numbers. Interchangeable soles get
                swapped for approach conditions, so this isn't constant for
                a bowler the way shoe size would be. */}
            {preferences.trackedFields.shoes&&(
              <div style={S.card}>
                <div style={S.label}>Shoes</div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Heel #"
                    value={form.heelNumber} onChange={e=>set("heelNumber",e.target.value)}/>
                  <input style={{...S.input,flex:1}} placeholder="Sole #"
                    value={form.soleNumber} onChange={e=>set("soleNumber",e.target.value)}/>
                </div>
              </div>
            )}

            {/* Result */}
            <div style={S.card}>
              <div style={S.label}>Result</div>
              <div style={S.chips}>
                {resultsForHandedness(activeBowlerLeftHanded).map(label=>{
                  // `label` is what the bowler sees (e.g. "Weak 7" for a
                  // lefty); `stored` is what actually gets saved, which is
                  // always the canonical "Weak 10"/"Ringing 10" value.
                  const stored=storedResultFor(label);
                  return(
                    <Chip key={label} label={label} selected={form.result===stored}
                      onToggle={()=>{
                        const newResult=form.result===stored?"":stored;
                        setForm(f=>({
                          ...f,
                          result:newResult,
                          otherLeave:newResult==="Other Leave"?f.otherLeave:[],
                          spareMade:"",
                          // Weak/Ringing always leave a single corner pin:
                          // first ball = 9, and if missed, adds 0 — so the frame total is
                          // deterministic and doesn't need a manual pin-count entry.
                          pinCount:(newResult==="Weak 10"||newResult==="Ringing 10")?"9":"",
                        }));
                      }}
                      color={stored==="Strike"?C.strike:stored.includes("10")?C.miss:C.spare}/>
                  );
                })}
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
            {(preferences.trackedFields.release||preferences.trackedFields.miss)&&(
              <CollapsibleCard
                title={preferences.trackedFields.release&&preferences.trackedFields.miss?"Release & Miss":preferences.trackedFields.release?"Release":"Miss"}
                summary={[preferences.trackedFields.release?form.release:"",preferences.trackedFields.miss&&form.miss.length?`${form.miss.length} miss`:""].filter(Boolean).join(", ")}
                expanded={editingId?true:expandedSections.releaseMiss}
                onToggle={()=>toggleSection("releaseMiss")}>
                {preferences.trackedFields.release&&(
                  <>
                    <div style={S.label}>Release</div>
                    <div style={S.chips}>
                      {RELEASES.map(r=>(
                        <Chip key={r} label={r} selected={form.release===r} onToggle={()=>toggle("release",r)}
                          color={r==="Good"?C.strike:r==="Bad"?C.miss:C.spare}/>
                      ))}
                    </div>
                  </>
                )}
                {preferences.trackedFields.release&&preferences.trackedFields.miss&&<div style={S.divider}/>}
                {preferences.trackedFields.miss&&(
                  <>
                    <div style={S.label}>Miss</div>
                    <div style={S.chips}>
                      {MISSES.map(m=>(
                        <Chip key={m} label={m} selected={form.miss.includes(m)} onToggle={()=>toggleMulti("miss",m)} color={C.miss}/>
                      ))}
                    </div>
                  </>
                )}
              </CollapsibleCard>
            )}

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
            </>)}
          </>
          {(editingId||(preferences.trackingMode==="shot"&&!(preferences.environment==="practice"&&practiceMode==="drill")))&&(
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
          )}
    </>
  );
}
