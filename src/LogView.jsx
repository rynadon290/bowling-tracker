import { useState } from "react";
import { C, S, F, Chip, PinDeck, CollapsibleCard, StatLead } from "./ui.jsx";
import { PLASTIC_BALL, formatDate, localDateString, RESULTS, SURFACES, RELEASES, MISSES, BALL_CHANGE_REASONS, resultsForHandedness, storedResultFor, strikeDescriptionsForHand, storedStrikeDescriptionFor } from "./constants.js";
import { rAvg, cAvg, threeSixNineResults } from "./domain/stats.js";
import { buyInsForLeague, costArraysFor, sessionMoney } from "./domain/money.js";
import { visibleMoneyGames } from "./domain/preferences.js";
import { nextLeagueDate, prebowlConflict } from "./domain/sessions.js";
import { inferLeagueDay } from "./domain/reminders.js";
import Scoresheet from "./Scoresheet.jsx";
import TournamentSession from "./TournamentSession.jsx";
import SessionStart from "./SessionStart.jsx";
import DrillSession from "./DrillSession.jsx";
import SessionRecap from "./SessionRecap.jsx";
import ShareButton from "./ShareButton.jsx";
import { sessionHighlights } from "./domain/shareCard.js";
import { getManualScore, seriesTotal, getGameEquipment, defaultPracticeBall } from "./domain/manualScores.js";
import { formatLayout } from "./domain/layouts.js";
import { otherBowlerSource, scorekeepingHelp } from "./domain/scorekeeping.js";

export default function LogView({
  shots, sessions, bowlers, footerHeight, footerRef, teams, leagues, startEdit, deleteShot,
  activeBowler, newBowlerName, setNewBowlerName, arsenals, newBallName, setNewBallName,
  form, setForm, editingId, saved, sessionSaved, sessionSaveMessage,
  sessionLeague, setSessionLeague, effectiveSessionLeague, sessionDate, setSessionDate,
  startingLane, setStartingLane, setShowSummary, expandedSections,
  ballNumLabel, curSession, currentLane, firstBallPins, g1score, g2score, g3score,
  hasLeave, inTenth, isNoTap, isStrike, needsSpareMade, sessionTotal, showPinCount,
  standingPins, tenthOptions,
  addBall, addBowler, autoFillLine, calcLane, cancelEdit, cycleGameResult, cycleSeriesResult,
  getLanePattern, getMatch, handleBallChange, handleLeaveToggle, handleLineChange,
  handleSpareMadeToggle, matchHandicap, previousShotBall, removeBall, removeBowler,
  selectBowler, set, setLanePattern, setMatchHandicap, setMatchOpponent, setPokerWinnings, setThreeSixNineWinnings, winningsSaved, confirmWinningsSaved, setView,
  leagueBuyIns, onSaveLeagueBuyIns,
  stepPinCount, submitSession, submitShot, theoreticalScoreForGame, maxScoreThisGame, toggle, toggleMulti, toggleSection,
  preferences, setSessionMoneyArray, setSessionMoneyValue, activeBowlerLeftHanded,
  ballLayouts, setBallLayout,
  activeTournament, updateTournament, saveTournament, tournamentSaved,
  manualScores, updateManualScore,
  showSessionStart, dismissSessionStart, updatePreferences, sessionEnvChosen, onSessionEnvChosen, routineNote,
  goalsPanel, practiceMode, setPracticeMode, gameEquipment, updateGameEquipment, practiceTracking, setPracticeTracking, activeDrill, setActiveDrill, startDrill, startAnotherDrill, saveDrill, drillSaved, drills, leftHandedForBowler,
  ownerName, scoringForOthers, setScoringForOthers, scoreOptions, guests, newGuestName, setNewGuestName, addGuestBowler, removeGuestBowler,
  oilPatterns, submitOilPattern, tournaments, practicePriorAverage,
  envBags, selectedBagId, setSelectedBagId, logBalls,
  ballSpecs, setBallSpec, ballGroups, seedDefaultGroups,
  catalogEntries, catalogAck, userId, publishBallSpecs, voteOnEntry, acknowledgeRejection,
}) {
  // What each environment shows on the Log tab. Kept in one place so the
  // rules read as rules rather than being scattered through 1,100 lines
  // of JSX:
  //   - Tournament and casual never show goals or the ball/surface cards:
  //     a tournament bowler is working from the tournament card, and a
  //     casual night is scores only.
  //   - Drills keep their own ball chips inside the drill card and don't
  //     need the separate ball and surface cards under them.
  const env=preferences.environment;
  const isDrill=env==="practice"&&practiceMode==="drill";
  // Extra game rows the bowler asked for beyond what's been entered.
  // Session-local: a practice where you added a 4th game shouldn't make
  // every future session start with four empty boxes.
  const [extraGames,setExtraGames]=useState(0);

  // Score fields are locked while logging shot by shot.
  //
  // With shots being recorded, a score is already derived from them. An
  // accidental keystroke in a score box would silently override that
  // derived score -- manual entry takes precedence -- and the bowler
  // would have no idea their real score had been replaced.
  //
  // One lock for all games, not one per game: a bowler switching to
  // manual entry mid-night is switching for the rest of the night, and
  // three separate padlocks is three times the friction for no benefit.
  const [scoresUnlocked,setScoresUnlocked]=useState(false);

  // League needs a league picked before anything else is worth showing.
  //
  // Not just tidiness -- it's a data-integrity gate. Shots and scores are
  // filed against (bowler, league, date), so anything logged before a
  // league is chosen has nowhere to go: it wouldn't sync, wouldn't appear
  // once a league WAS picked, and would still skew any average that
  // doesn't filter by league. Waiting for one tap prevents all of it.
  const leagueReady=env!=="league"||!!effectiveSessionLeague;

  const showGoals=leagueReady&&(env==="league"||(env==="practice"&&!isDrill));
  // Bug fix: showEquipment checked environment but never trackingMode, so
  // switching League from shot-by-shot to game-scores-only left the Ball/
  // Surface/Line cards showing -- there was nothing gating them on HOW
  // the bowler is tracking, only WHERE they're bowling.
  // Tournament CAN track shot by shot now. Most tournament bowlers won't
  // -- there's no time between games -- but excluding the environment
  // meant the option in Settings did nothing there, which is worse than
  // not offering it. Casual stays excluded: scores-only is the entire
  // point of that mode, so it doesn't get the choice at all.
  const showEquipment=leagueReady&&env!=="casual"&&!isDrill&&preferences.trackingMode==="shot";
  // Shot Context (game/frame/lane) is meaningless without shots -- a
  // scores-only night has games, not frames. It had no gate at all.
  const showShotContext=leagueReady&&env!=="casual"&&!isDrill&&preferences.trackingMode==="shot";

  return (
    <>
          <>
            {/* While the guided prompt is up it's the ONLY thing on the
                tab, vertically centred between header and nav. Showing
                eleven cards behind a question nobody has answered yet is
                what made this screen overwhelming. */}
            {!editingId&&showSessionStart&&(
              <div style={{minHeight:"calc(100vh - 210px)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                <SessionStart
                  preferences={preferences}
                  onApply={updatePreferences}
                  onDismiss={dismissSessionStart}
                  envChosen={sessionEnvChosen}
                  onEnvChosen={onSessionEnvChosen}/>
              </div>
            )}

            {/* Once answered the card COLLAPSES rather than disappearing.
                Removing it entirely meant changing your mind -- wrong
                environment, or you decided to log shot by shot after all
                -- meant a trip to Settings. Collapsed, the answers stay
                visible and one tap re-opens them. */}
            {!editingId&&!showSessionStart&&(
              <SessionStart
                collapsed
                routineNote={routineNote}
                preferences={preferences}
                onApply={updatePreferences}
                onDismiss={dismissSessionStart}
                envChosen
                onEnvChosen={onSessionEnvChosen}/>
            )}

            {/* Everything below waits for the prompt to be answered. */}
            {!(!editingId&&showSessionStart)&&(<>

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
            {!editingId&&activeBowler&&(preferences.environment==="practice"||preferences.environment==="casual")&&(
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

            {!editingId&&activeBowler&&preferences.environment==="practice"&&(
              <div style={{...S.card,padding:"10px 12px"}}>
                <div style={S.chips}>
                  <Chip label="Games" selected={practiceMode==="games"} onToggle={()=>setPracticeMode("games")}/>
                  <Chip label="Drill" selected={practiceMode==="drill"} onToggle={()=>{setPracticeMode("drill");if(!activeDrill)startDrill();}}/>
                </div>
                {/* Tracking depth for THIS practice only. It changes what the
                    Log tab shows tonight and nothing in Settings, so a
                    scores-only practice can't quietly turn a league night
                    into scores-only too. */}
                {practiceMode==="games"&&(
                  <>
                    <div style={{fontSize:"12px",color:C.textMuted,margin:"10px 0 6px"}}>Tracking tonight</div>
                    <div style={S.chips}>
                      <Chip label="Shot by shot" selected={preferences.trackingMode==="shot"}
                        onToggle={()=>setPracticeTracking("shot")}/>
                      <Chip label="Scores only" selected={preferences.trackingMode==="game"}
                        onToggle={()=>setPracticeTracking("game")}/>
                    </div>
                    {practiceTracking&&(
                      <div style={{fontSize:"10px",color:C.textMuted,marginTop:"4px"}}>
                        Just for this practice — your Settings are unchanged.
                      </div>
                    )}
                  </>
                )}
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
                bowler={activeBowler}
                sessionDate={sessionDate}
                onStartAnother={startAnotherDrill}
                leftHanded={leftHandedForBowler ? leftHandedForBowler(activeBowler) : false}/>
            )}

            {/* The arsenal lives on the Profile screen, not here. Managing
                equipment mid-session was a second place to do the same
                thing, and the Log tab is for logging. */}

            {/* Session card */}

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
                oilPatterns={oilPatterns} submitOilPattern={submitOilPattern} tournaments={tournaments}/>
            )}

            {/* "Tonight's Session" is league framing -- series, money games,
                match points. Practice has none of that, so it gets a plain
                date header instead of a card promising things that aren't
                there. */}
            {!editingId&&activeBowler&&preferences.environment!=="tournament"&&preferences.environment!=="practice"&&preferences.environment!=="casual"&&(
              <CollapsibleCard
                title="Tonight's Session"
                summary={sessionLeague?`${sessionLeague.replace(" House Shot","")} · ${formatDate(sessionDate)}`:""}
                expanded={expandedSections.tonightSession}
                onToggle={()=>toggleSection("tonightSession")}>
                <div style={S.chips}>
                  {leagues.map(l=>(
                    <Chip key={l} label={l.replace(" House Shot","")} selected={sessionLeague===l}
                      onToggle={()=>{const team=teams.find(t=>t.league===l&&(t.members||[]).includes(activeBowler));setSessionLeague(l);setForm(f=>({...f,league:l,teamId:team?.id||"",date:sessionDate}));setShowSummary(false);}}/>
                  ))}
                </div>
                <div style={{marginBottom:"10px"}}>
                  <input style={S.input} type="date" value={sessionDate}
                    onChange={e=>{setSessionDate(e.target.value);set("date",e.target.value);setShowSummary(false);}}/>
                </div>

                {/* Prebowling: games thrown early that count for a future
                    week -- often on the same night as the current week's
                    session, before or after it.
                    
                    Filed under the date they COUNT FOR, not the date
                    thrown. That's correct for standings, and it's what
                    keeps them from colliding: sessions are keyed on
                    (bowler, league, date), so a prebowl filed under today
                    would share a key with tonight's real session and one
                    would silently overwrite the other. */}
                {preferences.environment==="league"&&sessionLeague&&(()=>{
                  const bowledOn=localDateString();
                  const isPrebowl=sessionDate>bowledOn;
                  const conflict=isPrebowl
                    ?prebowlConflict(sessions,activeBowler,effectiveSessionLeague,sessionDate,bowledOn)
                    :"";
                  const leagueDay=inferLeagueDay(
                    (sessions||[]).filter(s=>s.bowler===activeBowler),effectiveSessionLeague);
                  return(
                    <div style={{marginBottom:"10px"}}>
                      <button
                        onClick={()=>{
                          if(isPrebowl){
                            setSessionDate(bowledOn);set("date",bowledOn);
                          }else{
                            const next=nextLeagueDate(bowledOn,leagueDay)
                              ||nextLeagueDate(bowledOn,new Date(`${bowledOn}T00:00:00`).getDay());
                            setSessionDate(next);set("date",next);
                          }
                          setShowSummary(false);
                        }}
                        style={{width:"100%",textAlign:"left",cursor:"pointer",
                          padding:"8px 10px",borderRadius:"8px",fontSize:"12px",
                          border:`1px solid ${isPrebowl?C.accent:C.border}`,
                          background:isPrebowl?C.accent+"11":"transparent",
                          color:isPrebowl?C.text:C.textMuted}}>
                        {isPrebowl?"✓ Prebowling":"Prebowling for a future week?"}
                      </button>
                      {isPrebowl&&(
                        <div style={{fontSize:"11px",color:conflict?C.miss:C.textMuted,marginTop:"4px",lineHeight:1.4}}>
                          {conflict||`Counts for ${formatDate(sessionDate)}. Bowled today — change the date above if that's the wrong week.`}
                        </div>
                      )}
                    </div>
                  );
                })()}

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

            {/* Import moved to the header. It was here, gated on the
                current environment and on a league already being chosen --
                which meant importing a league card required setting up a
                league night first, and importing a tournament card while
                in practice mode was impossible.
                
                It's now reachable from anywhere and asks what's being
                imported, so the import no longer inherits whatever mode
                the Log tab happens to be in. */}

            {/* Says what's missing rather than showing nothing. The card
                itself stays gated on a league because a score is keyed by
                (bowler, league, date, game): one entered with an empty
                league lands under a key the real league never reads, so
                it wouldn't sync, wouldn't appear once a league WAS picked,
                and would still be counted by any average that doesn't
                filter by league. Silent loss plus a polluted composite --
                worse than asking for one tap first. */}
            {/* LEAGUE ONLY. Practice and casual have no league to pick --
                their container league is created for them -- so telling a
                practice bowler to "pick tonight's league" is asking for
                something that doesn't exist in that mode. */}
            {!editingId&&activeBowler&&!effectiveSessionLeague
              &&preferences.environment==="league"
              &&preferences.trackingMode==="game"&&(
              <div style={{...S.card,backgroundColor:C.surface}}>
                <div style={S.label}>Enter Game Scores</div>
                <div style={{fontSize:"12px",color:C.textMuted,lineHeight:1.5}}>
                  Pick tonight's league above and this opens up — scores are filed against a league, so there's nowhere to put them yet.
                </div>
              </div>
            )}

            {/* Shot-form order, top to bottom:
                  context (game, frame, lane) -> result -> ball -> surface
                  -> line -> release & miss -> shoes -> notes.
                Context first because it's what changes every shot; result
                right under it because "frame 5: strike" is one thought;
                equipment after because it changes rarely; shoes above
                notes because both are things you set once and leave. */}
            {showShotContext&&(
            <div style={S.card}>
              <div style={S.label}>
                Shot Context
                {inTenth&&<span style={{color:C.spare,marginLeft:"8px"}}>10th Frame{ballNumLabel}</span>}
              </div>
              {!editingId&&(
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                  {/* effectiveSessionLeague, not sessionLeague: practice and
                      casual have a container league rather than one you
                      pick, so keying off sessionLeague told a practice
                      bowler to "pick a league above" -- something that
                      doesn't exist in that mode. */}
                  {activeBowler||"No bowler selected"}
                  {effectiveSessionLeague
                    ? ` — ${effectiveSessionLeague.replace(" House Shot","")}, ${formatDate(sessionDate)}`
                    : preferences.environment==="league" ? " — pick a league above" : ` — ${formatDate(sessionDate)}`}
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
              {/* The series is the one loud thing on this screen. Four
                  equal boxes made the total the same size as game 1 --
                  which is the size of everything else -- so nothing on
                  the page ever read as the thing you came for. */}
              {!editingId&&sessionLeague&&(
                <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:"12px",marginBottom:"14px"}}>
                  <div>
                    <div className="num" style={{fontSize:"56px",lineHeight:0.9,fontWeight:700,fontFamily:F.num,letterSpacing:"-0.02em",color:sessionTotal!=null?C.text:C.textMuted}}>
                      {sessionTotal!=null?sessionTotal:"—"}
                    </div>
                    <div style={{fontSize:"12px",color:C.textMuted,marginTop:"6px"}}>Series so far</div>
                  </div>
                  <div style={{display:"flex",gap:"14px",paddingBottom:"4px"}}>
                    {[g1score,g2score,g3score].map((score,i)=>(
                      <div key={i} style={{textAlign:"center"}}>
                        <div className="num" style={{fontSize:"22px",lineHeight:1,fontWeight:700,fontFamily:F.num,color:score!=null?C.text:C.textMuted}}>
                          {score!=null?score:"—"}
                        </div>
                        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"4px"}}>G{i+1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game stepper */}
              <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>Game</div>
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
                  <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>Frame</div>
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
                  <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>Ball in 10th</div>
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
                  <span style={{fontSize:"12px",color:C.textMuted}}>Lane </span>
                  <span style={{fontSize:"22px",fontWeight:700,color:C.accent}}>{currentLane||"—"}</span>
                </div>
              )}
              {editingId&&(
                <input style={S.input} placeholder="Lane" type="number" value={form.lane} onChange={e=>set("lane",e.target.value)}/>
              )}
            </div>
            )}

            {/* The ten frames, between the frame picker above and the
                result being entered below -- which is where a bowler
                looks to check what they just did. Rebuilt from `shots`
                every render, so a mark appears as soon as a shot saves. */}
            {showShotContext&&(
              <Scoresheet
                shots={(shots||[]).filter(sh=>{
                  // Matched loosely on purpose.
                  //
                  // A shot is saved by spreading ...form, and a blank
                  // form starts with bowler:"" and league:"" -- so a shot
                  // logged before those fields are populated is stored
                  // with empty strings. Comparing them strictly against
                  // activeBowler / effectiveSessionLeague matched nothing,
                  // which is why frames stayed blank and no frame ever
                  // had a shot to open for editing.
                  //
                  // An empty field on either side means "unset", not
                  // "different", so it doesn't exclude the shot.
                  const same=(a,b)=>!a||!b||a===b;
                  return same(sh.bowler,form.bowler||activeBowler)
                    &&same(sh.league,form.league||effectiveSessionLeague)
                    &&same(sh.date,form.date||sessionDate)
                    &&String(sh.game)===String(form.game);
                })}
                currentFrame={form.frame}
                currentBall={form.ballNum}
                onSelectFrame={(frame,shot)=>{
                  const goTo=()=>setForm(f=>({...f,frame:String(frame),
                    ballNum:Number(frame)===10?1:null}));

                  // A bowled frame opens for editing.
                  if(shot&&startEdit){startEdit(shot);return;}

                  // An EMPTY frame while editing means "never mind" --
                  // tapping away from an edit is the natural way to
                  // abandon it, and leaving Update/Cancel as the only
                  // exits made the scoresheet feel stuck.
                  if(editingId){cancelEdit?.();goTo();return;}

                  // An empty frame with a finished shot in hand saves it
                  // first, so tapping the next frame is a second path to
                  // Save Shot rather than silently discarding what was
                  // entered. Same condition the Save button uses -- if it
                  // wouldn't save on tap, it doesn't save here either.
                  const canSave=form.result&&form.bowler&&!needsSpareMade;
                  if(canSave&&submitShot){submitShot();return;}

                  goTo();
                }}/>
            )}

            {showShotContext&&(
            <div style={S.card}>
              {/* The ceiling on the game in progress: strike out from here
                  and this is what you finish with.
                  
                  Lives on the Result card, not in the session header. The
                  header sits inside "Tonight's Session", which collapses
                  once setup is answered -- so it was hidden for the entire
                  time a bowler is actually throwing, which is exactly when
                  this number matters. It was also gated on sessionLeague,
                  so practice never saw it at all. */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"8px"}}>
                <div style={{...S.label,marginBottom:0}}>Result</div>
                {maxScoreThisGame!=null&&(
                  <span style={{fontSize:"11.5px",color:C.accent}}>
                    {maxScoreThisGame} max
                  </span>
                )}
              </div>
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

                        // Deselecting the result of a SAVED shot deletes
                        // it. The result is what a frame is -- a shot with
                        // no result isn't an empty frame, it's a row that
                        // can't be scored and would sit in the scoresheet
                        // as a permanent blank.
                        //
                        // Confirmed, because it can't be undone, and
                        // cancelled by putting the result back rather than
                        // leaving the frame in a broken state.
                        if(!newResult&&editingId&&deleteShot){
                          const which=`frame ${form.frame}${form.ballNum?`, ball ${form.ballNum}`:""} of game ${form.game}`;
                          if(!window.confirm(`Clearing the result deletes ${which}. Delete it?`))return;
                          deleteShot(editingId);
                          cancelEdit?.();
                          return;
                        }

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
                    {strikeDescriptionsForHand(activeBowlerLeftHanded).map(label=>(
                      <Chip key={label} label={label}
                        selected={storedStrikeDescriptionFor(label)===form.strikeDescription}
                        onToggle={()=>{
                          const stored=storedStrikeDescriptionFor(label);
                          set("strikeDescription",form.strikeDescription===stored?"":stored);
                        }} color={C.strike}/>
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
            )}

            {/* Enter game scores directly, without shot-by-shot logging.
                Two cases: a screenshot that only showed game totals, and
                bowlers who want score tracking without logging 30 shots a
                night. A score entered here overrides whatever the shots
                would have computed -- see domain/manualScores.js. */}
            {/* Score entry is available in BOTH tracking modes.
                
                Shot by shot is a choice made at the start of a night, not
                a commitment for all three games -- bowlers get tired of
                logging 30 shots and want to finish on scores without
                abandoning the shot data they already have. Gating this on
                trackingMode forced an all-or-nothing switch.
                
                In shot mode the fields are LOCKED by default: with shots
                being logged, a derived score is already showing, and an
                accidental keystroke silently overriding it would be worse
                than the inconvenience of one extra tap. */}
            {!editingId&&activeBowler&&effectiveSessionLeague&&!(preferences.environment==="practice"&&practiceMode==="drill")&&(()=>{
              // How many game rows to show.
              //
              // Was hardcoded to 3, which is right for a league night and
              // wrong for practice -- people bowl one game, or five, or
              // stop after two. Derived from what's actually been entered
              // so it grows with real data, with a floor of 1 rather than
              // three empty boxes on a fresh session.
              //
              // League and tournament keep a floor of 3, because a
              // standard night IS three games and pre-showing them saves
              // two taps.
              const standardGames=preferences.environment==="practice"||preferences.environment==="casual"?1:3;
              const highestEntered=[1,2,3,4,5,6,7,8,9,10].reduce((hi,g)=>
                getManualScore(manualScores,activeBowler,effectiveSessionLeague,sessionDate,g)!=null?g:hi,0);
              const gameCount=Math.max(standardGames,highestEntered,extraGames);
              const gameNums=Array.from({length:gameCount},(_,i)=>i+1);
              const entered=gameNums.map(g=>getManualScore(manualScores,activeBowler,effectiveSessionLeague,sessionDate,g));
              const total=seriesTotal(entered);
              return(
                <CollapsibleCard
                  title="Enter Game Scores"
                  summary={total!=null?`${total} series`:""}
                  expanded={expandedSections.manualScores}
                  onToggle={()=>toggleSection("manualScores")}>
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px",lineHeight:1.5}}>
                    Just the final score for each game — the series total adds itself. Use this if you're not logging shot by shot; anything entered here takes precedence over shot data.
                    {/* `arsenal` is defined further down, INSIDE the
                        per-game loop -- referencing it here threw
                        "arsenal is not defined" and crashed the whole
                        card. Read from the prop directly instead. */}
                    {preferences.environment!=="casual"&&(arsenals?.[activeBowler]||[]).length>0&&(
                      <> Noting a ball for a game attributes that whole game to it, so you can see how each ball held up as the lanes transitioned.</>
                    )}
                  </div>
                  {/* Only shown in shot mode -- in scores-only mode there is
                      no derived score to protect, so a lock would be pure
                      friction. */}
                  {preferences.trackingMode==="shot"&&(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                                 padding:"8px 10px",marginBottom:"10px",borderRadius:"8px",
                                 backgroundColor:C.surface,border:`1px solid ${C.border}`}}>
                      <span style={{fontSize:"12px",color:C.textMuted,flex:1,lineHeight:1.4}}>
                        {scoresUnlocked
                          ?"Typing a score here replaces the one calculated from your shots."
                          :"Scores are coming from your shots. Unlock to enter them by hand."}
                      </span>
                      <button style={{...S.btn(),padding:"6px 12px",fontSize:"12px",flexShrink:0}}
                        onClick={()=>setScoresUnlocked(v=>!v)}>
                        {scoresUnlocked?"🔓 Lock":"🔒 Unlock"}
                      </button>
                    </div>
                  )}
                  {gameNums.map(g=>{
                    // Per-game ball is offered EVERYWHERE now, not only in
                    // practice. Lane transition is exactly as real on a
                    // league night: the same ball can average 210 in game
                    // one and 190 in game three, and recording which ball
                    // bowled which game is what makes that visible in
                    // Trends without shot-by-shot logging.
                    const isPracticeGames=preferences.environment!=="casual";
                    const arsenal=(arsenals?.[activeBowler]||[]);
                    const equip=isPracticeGames?getGameEquipment(gameEquipment,activeBowler,effectiveSessionLeague,sessionDate,g):null;
                    // One real ball means no choice to make -- it's pre-filled.
                    // Plastic never defaults but is always offered.
                    const defaultBall=defaultPracticeBall(arsenal,PLASTIC_BALL);
                    const shownBall=equip?(equip.ball||defaultBall):"";
                    return(
                    <div key={g} style={{marginBottom:isPracticeGames?"12px":"6px"}}>
                      <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                        <div style={{fontSize:"12px",color:C.textMuted,width:"28px"}}>G{g}</div>
                        {(()=>{
                          const locked=preferences.trackingMode==="shot"&&!scoresUnlocked;
                          return(
                            <input style={{...S.input,flex:1,opacity:locked?0.5:1}}
                              type="number" inputMode="numeric" placeholder="Score"
                              disabled={locked}
                              value={entered[g-1]==null?"":String(entered[g-1])}
                              onChange={e=>updateManualScore(activeBowler,effectiveSessionLeague,sessionDate,g,e.target.value)}/>
                          );
                        })()}
                      </div>
                      {/* Ball and surface per game, because that's what a
                          practice is for: which ball, which surface, what
                          did it average -- and how it held up as the lanes
                          transitioned across the block. */}
                      {isPracticeGames&&arsenal.length>0&&(
                        <div style={{paddingLeft:"36px"}}>
                          <div style={{...S.chips,marginBottom:"4px"}}>
                            {arsenal.map(b=>(
                              <Chip key={b} label={b} selected={shownBall===b} color={b===PLASTIC_BALL?C.strike:undefined}
                                onToggle={()=>updateGameEquipment(activeBowler,effectiveSessionLeague,sessionDate,g,{ball:shownBall===b?"":b})}/>
                            ))}
                          </div>
                          {shownBall&&shownBall!==PLASTIC_BALL&&(
                            <div style={S.chips}>
                              {SURFACES.map(sf=>(
                                <Chip key={sf} label={sf} selected={equip.surface===sf}
                                  onToggle={()=>updateGameEquipment(activeBowler,effectiveSessionLeague,sessionDate,g,{surface:equip.surface===sf?"":sf})}/>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Add and remove game rows. Practice especially isn't
                      always three games -- people bowl one, or five, or
                      stop after two. Removing clears that game's score so
                      the row and its data go together; without that a
                      "deleted" game would still count toward the series. */}
                  <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
                    <button style={{...S.btn(),flex:1,fontSize:"13px",padding:"9px"}}
                      onClick={()=>setExtraGames(gameCount+1)}>
                      + Add game
                    </button>
                    {gameCount>1&&(
                      <button style={{...S.btn(),flex:1,fontSize:"13px",padding:"9px"}}
                        onClick={()=>{
                          updateManualScore(activeBowler,effectiveSessionLeague,sessionDate,gameCount,"");
                          setExtraGames(gameCount-1);
                        }}>
                        − Remove game {gameCount}
                      </button>
                    )}
                  </div>
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

            {/* Casual and practice get their own recap instead of the
                league summary below: both are scores-only, and the league
                block leans on theoretical scores, releases and misses that
                neither environment records. */}
            {/* Ending a session is explicit in every environment, not just
                league. Without it practice and casual had no "I'm done"
                moment at all: scores accumulated, no session row was
                written, and no summary ever appeared -- so nothing marked
                the night as finished and averages never picked it up.
                Drills and tournaments save from their own cards, so this
                covers the game-score environments. */}
            {!editingId&&activeBowler&&effectiveSessionLeague
              &&preferences.environment!=="league"
              &&preferences.environment!=="tournament"
              &&practiceMode!=="drill"&&(
              <button style={{...S.btn("primary"),marginBottom:"12px"}} onClick={submitSession}>
                {sessionSaveMessage?sessionSaveMessage:sessionSaved
                  ?"✓ Session Saved"
                  :preferences.environment==="practice"?"End Practice & View Summary":"Finish & View Summary"}
              </button>
            )}

            {!editingId&&(preferences.environment==="casual"||preferences.environment==="practice")&&effectiveSessionLeague&&(
              <SessionRecap
                environment={preferences.environment}
                manualScores={manualScores}
                bowler={activeBowler}
                allBowlers={scoreOptions}
                league={effectiveSessionLeague}
                date={sessionDate}
                priorAverage={practicePriorAverage}
                drills={drills}
                leftHandedForBowler={leftHandedForBowler}/>
            )}

            {/* Goals, for the bowler actually at the line. Only rendered
                when they have some -- an empty goals card while logging
                is noise. Deliberately collapsed by default so it doesn't
                push the shot form down the screen. */}
            {!editingId&&showGoals&&goalsPanel&&(
              <CollapsibleCard title="Goals"
                expanded={expandedSections.logGoals}
                onToggle={()=>toggleSection("logGoals")}>
                {goalsPanel}
              </CollapsibleCard>
            )}

            {/* Summary */}
            {!editingId&&preferences.environment!=="casual"&&curSession&&(()=>{
              const cs=curSession;
              const sr=cs.shotCount?Math.round((cs.strikes/cs.shotCount)*100):0;
              const spr=cs.spareAttempts?Math.round((cs.sparesMade/cs.spareAttempts)*100):0;
              const leagueAs=leagues.map(league=>({league,avg:rAvg(sessions,activeBowler,league)})).filter(x=>x.avg!=null),cA=cAvg(sessions,activeBowler);
              // Defaulted, not assumed. A session saved by an older version
              // of the app -- or a draft created mid-night -- may not carry
              // these arrays, and calling .filter() on undefined throws
              // during render, which blanks the entire screen. A missing
              // array should cost a chart, not the app.
              const csMisses=Array.isArray(cs.misses)?cs.misses:[];
              const csReleases=Array.isArray(cs.releases)?cs.releases:[];
              const mDist=MISSES.map(m=>({m,c:csMisses.filter(x=>x===m).length})).filter(x=>x.c>0);
              const gR=csReleases.filter(r=>r==="Good").length,bR=csReleases.filter(r=>r==="Bad").length,rT=csReleases.length;
              return(
                <div style={{...S.card,border:`1px solid ${C.accent}44`}}>
                  <div style={{...S.label}}>
                    {cs.bowler?`${cs.bowler}'s night`:"Tonight"}
                    <span style={{fontWeight:400,color:C.textMuted}}> — {cs.league.replace(" House Shot","")}, {formatDate(cs.date)}</span>
                  </div>
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
                    const leftOnLane=theoryTotal-realTotal;

                    return(
                      <div style={{marginBottom:"12px"}}>
                        <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>If every makeable spare had been made</div>
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
                            {leftOnLane>0?(
                              <span style={{color:C.miss,fontWeight:600}}>
                                ▼ {leftOnLane} pins left on the lane
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
                        <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>Poker Winnings ($)</div>
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
                        <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>High Game Pot ($)</div>
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
                            <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>3-6-9 Winnings ($)</div>
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

                      {/* Buy-ins are per LEAGUE, not per game and not per
                          week: the quarter game costs a quarter every game
                          all season. This used to be nine boxes re-typed
                          every week, which is repetition whose most likely
                          outcome is getting one of them wrong.
                          
                          Editing here updates the rate for this league and
                          applies it to tonight. Past nights keep whatever
                          they actually cost. */}
                      {(()=>{
                        const rates=buyInsForLeague(leagueBuyIns,cs.league);
                        const games=(cs.scores||[]).filter(v=>v!=null).length;
                        const pots=visibleMoneyGames(preferences);

                        // Whether the bowler is IN each pot tonight,
                        // derived from what the session already records
                        // rather than stored twice: a non-zero cost means
                        // they entered it.
                        //
                        // Saving a buy-in rate used to mean paying it
                        // every week forever -- the app assumed you were
                        // in every pot every night, so a week you sat one
                        // out silently charged you for it and net
                        // winnings drifted from reality with nothing on
                        // screen to explain why.
                        const costField={pokerQuarter:"pokerQuarterCost",pokerDollar:"pokerDollarCost",
                                         highGame:"highGameCost",threeSixNine:"threeSixNineCost"};
                        const isIn=key=>key==="threeSixNine"
                          ?Number(cs.threeSixNineCost||0)>0
                          :((cs[costField[key]]||[]).some(v=>Number(v)>0));

                        const applyCosts=(nextRates,playing)=>{
                          const arrays=costArraysFor(nextRates,games,playing);
                          Object.entries(arrays).forEach(([field,value])=>{
                            if(Array.isArray(value)){
                              value.forEach((v,i)=>setSessionMoneyArray(cs.id,field,i,v));
                            } else {
                              setSessionMoneyValue(cs.id,field,value);
                            }
                          });
                        };
                        const playingNow=()=>Object.fromEntries(pots.map(k=>[k,isIn(k)]));

                        const setRate=(key,val)=>{
                          const next={...rates,[key]:val===""?0:parseFloat(val)||0};
                          onSaveLeagueBuyIns?.(cs.league,next);
                          // Entering a rate means you're in that pot --
                          // otherwise typing a number would do nothing
                          // visible, which reads as broken.
                          applyCosts(next,{...playingNow(),[key]:true});
                        };
                        const togglePot=key=>applyCosts(rates,{...playingNow(),[key]:!isIn(key)});

                        const label={pokerQuarter:"Quarter game",pokerDollar:"Dollar game",
                                     highGame:"High game",threeSixNine:"3-6-9 (whole night)"};
                        const step={pokerQuarter:"0.25",pokerDollar:"1",highGame:"1",threeSixNine:"1"};

                        const owed=pots.reduce((sum,k)=>{
                          if(!isIn(k))return sum;
                          return sum+(k==="threeSixNine"?rates[k]:rates[k]*games);
                        },0);

                        if(!pots.length)return null;
                        return(
                          <div style={{marginBottom:"12px"}}>
                            <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"6px"}}>Money games tonight</div>
                            <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                              Tap the ones you're in. Buy-ins are saved for {String(cs.league||"this league").replace(" House Shot","")} — you won't need to enter them again.
                            </div>
                            {pots.map(key=>{
                              const inIt=isIn(key);
                              return(
                                <div key={key} style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
                                  <button onClick={()=>togglePot(key)}
                                    aria-label={`${label[key]}: ${inIt?"playing":"not playing"}`}
                                    style={{flex:1,textAlign:"left",cursor:"pointer",padding:"6px 8px",borderRadius:"8px",
                                      border:`1px solid ${inIt?C.strike+"66":C.border}`,
                                      background:inIt?C.strike+"11":"transparent",
                                      color:inIt?C.text:C.textMuted,fontSize:"12px"}}>
                                    {inIt?"✓ ":""}{label[key]}
                                  </button>
                                  <input style={{...S.input,width:"90px",fontSize:"13px",padding:"6px 10px",textAlign:"right",
                                    opacity:inIt?1:0.45}}
                                    type="number" step={step[key]} placeholder="$"
                                    value={rates[key]===0?"":rates[key]}
                                    onChange={e=>setRate(key,e.target.value)}/>
                                </div>
                              );
                            })}
                            <div style={{fontSize:"11px",color:C.textMuted,marginTop:"6px"}}>
                              {games} game{games===1?"":"s"} tonight · ${owed.toFixed(2)} paid in
                            </div>
                          </div>
                        );
                      })()}

                      {(()=>{
                        const m=sessionMoney(cs);
                        if(!m)return null;
                        // Net leads, matching the Money Games card in
                        // Stats. Won and paid-in are its components, not
                        // three peer figures -- and net is the only one
                        // anyone quotes on the drive home.
                        return(
                          <div style={{marginBottom:"12px"}}>
                            <StatLead
                              value={`$${m.gross.toFixed(2)}`}
                              caption="won tonight" color={C.strike}
                              detail={`$${m.cost.toFixed(2)} paid in — ${m.net>=0?"up":"down"} $${Math.abs(m.net).toFixed(2)} on the night.`}/>
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
                  {(cs.ballsUsed||[]).length>0&&(<div style={{marginBottom:"10px"}}><div style={S.label}>Balls used</div><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{(cs.ballsUsed||[]).map(b=><span key={b} style={S.tag()}>{b}</span>)}</div></div>)}
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
                    {cA&&<div style={{...S.statBox,border:`1px solid ${C.accent}44`}}><div style={{...S.statNum,fontSize:"18px",color:C.accent}}>{cA}</div><div style={S.statLbl}>Composite</div></div>}
                  </div>
                  {/* Share sits with the summary because that's the moment
                      someone wants to send it -- not buried in a menu. */}
                  <div style={{marginTop:"14px"}}>
                    <ShareButton label="Share tonight" summary={{
                      bowler:cs.bowler||activeBowler,
                      scores:cs.scores,
                      league:cs.league,
                      date:formatDate(cs.date),
                      environment:"league",
                      // Real achievements, not raw rates -- see
                      // sessionHighlights. A goal you hit or money you won
                      // is what someone actually wants to post; "48%
                      // strikes" helps nobody.
                      // These are DERIVED at share time from data that
                      // exists, not read from fields on the session -- an
                      // earlier version read cs.moneyWon, cs.goalsHit and
                      // cs.priorBest, none of which were ever written, so
                      // the card silently never showed money or goals.
                      highlights:sessionHighlights({
                        scores:cs.scores,
                        strikes:cs.strikes,shotCount:cs.shotCount,
                        sparesMade:cs.sparesMade,spareAttempts:cs.spareAttempts,
                        // Money: net winnings on the night, from the same
                        // calculation the Money Games card uses.
                        moneyWon:Math.max(0,sessionMoney(cs)?.net||0),
                        // Personal best: the best series BEFORE tonight, so
                        // tonight can be compared against it.
                        priorBest:(()=>{
                          const others=sessions.filter(s=>s.bowler===cs.bowler&&s.id!==cs.id&&Array.isArray(s.scores)&&s.scores.length>1);
                          return others.length?Math.max(...others.map(s=>s.total||s.scores.reduce((a,b)=>a+b,0))):null;
                        })(),
                        // Average before tonight, competitive only.
                        priorAverage:cAvg(sessions.filter(s=>s.id!==cs.id),cs.bowler,null),
                        environment:"league",
                      }),
                    }}/>
                  </div>
                </div>
              );
            })()}

            {!editingId&&<div style={S.divider}/>}


            {/* Result. Regression fix: the earlier card reorder moved this
                block above its old wrapper without carrying the guard
                with it, so Result rendered unconditionally in every
                tracking mode -- including scores-only, where there is no
                per-shot result to record. */}

            {showEquipment&&(<>
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
                      onToggle={()=>editingId?toggle("ball",b):handleBallChange(b)}/>
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
            {(editingId||(leagueReady&&preferences.trackingMode==="shot"&&!(preferences.environment==="practice"&&practiceMode==="drill")))&&(<>
            </>)}

            {/* Line */}
            {preferences.trackedFields.line&&(
              <div style={S.card}>
                <div style={S.label}>Line{!editingId&&currentLane?` · Lane ${currentLane}`:""}{!editingId&&form.startingBoard&&form.targetArrows?" (stored)":""}</div>
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px"}}>Target</div>
                <div style={S.row}>
                  <input style={{...S.input,flex:1}} placeholder="Starting Board" type="number" inputMode="decimal"
                    value={form.startingBoard} onChange={e=>editingId?set("startingBoard",e.target.value):handleLineChange("startingBoard",e.target.value)}/>
                  <input style={{...S.input,flex:1}} placeholder="Arrow Target" type="number" inputMode="decimal"
                    value={form.targetArrows} onChange={e=>editingId?set("targetArrows",e.target.value):handleLineChange("targetArrows",e.target.value)}/>
                </div>
                <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"4px",marginTop:"8px"}}>Actual</div>
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
            </>)}
          </>
          {/* Sits ABOVE the bottom nav, not under it. The nav is fixed at
              bottom:0 with zIndex 100, so this bar -- also fixed at
              bottom:0, zIndex 50 -- was rendering behind it and looked
              like the Save Shot button had vanished, which stopped
              shot-by-shot logging from advancing at all.
              64px clears the nav; the safe-area inset clears the iOS
              home indicator underneath it. */}
          {(editingId||(leagueReady&&preferences.trackingMode==="shot"&&!(preferences.environment==="practice"&&practiceMode==="drill")))&&(
          <div ref={footerRef} style={{position:"fixed",bottom:"calc(64px + env(safe-area-inset-bottom, 0px))",left:0,right:0,backgroundColor:C.surface,borderTop:`1px solid ${C.border}`,padding:"12px 16px",zIndex:90,maxWidth:"480px",margin:"0 auto"}}>
            <button style={S.btn("primary")} onClick={submitShot} disabled={!form.result||!form.bowler||needsSpareMade}>
              {saved?(editingId?"✓ Shot Updated":"✓ Shot Saved"):(editingId?"Update Shot":"Save Shot")}
            </button>
            {needsSpareMade&&(
              <div style={{fontSize:"12px",color:C.spare,marginTop:"8px",textAlign:"center"}}>Answer "Spare Made" above before saving — it directly affects the score.</div>
            )}
            {editingId&&(
              <button style={{...S.btn("warn"),marginTop:"8px"}} onClick={cancelEdit}>Cancel Edit</button>
            )}
            {/* Delete the shot being edited.
            
                Editing was reachable from the Bowl tab -- tap a frame on
                the scoresheet -- but deleting was not, so a frame logged
                by mistake meant going to History > Shots to find and
                remove it. That's the hunt the scoresheet exists to avoid.
                
                Confirmed because it can't be undone, and named so the
                dialog says WHICH frame rather than "are you sure?". */}
            {editingId&&deleteShot&&(
              <button style={{...S.btn(),marginTop:"8px",width:"100%",color:C.miss,borderColor:C.miss+"55"}}
                onClick={()=>{
                  const which=`frame ${form.frame}${form.ballNum?`, ball ${form.ballNum}`:""} of game ${form.game}`;
                  if(!window.confirm(`Delete ${which}? This can't be undone.`))return;
                  deleteShot(editingId);
                  cancelEdit?.();
                }}>
                Delete this shot
              </button>
            )}
          </div>
          )}
    </>
  );
}
