import { C, S, F, Chip, resultSym } from "./ui.jsx";
import { formatDateShort, RESULTS, storedStrikeDescriptionFor, strikeDescriptionsForHand } from "./constants.js";
import { isSplit } from "./domain/splits.js";

// The reverse lookup of storedStrikeDescriptionFor: given the canonical
// stored value and this shot's own bowler's hand, find the label that
// hand would actually see for it.
function strikeDescriptionLabel(stored,leftHanded){
  return strikeDescriptionsForHand(leftHanded).find(label=>storedStrikeDescriptionFor(label)===stored)||stored;
}

export default function HistoryView({
  bowlers, leagues, teams = [],
  filterBowler, setFilterBowler,
  filterBall, setFilterBall,
  filterResult, setFilterResult,
  filtered, ballUniverse,
  startEdit, deleteShot, leftHandedForBowler,
}) {
  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Filter</div>
        {/* Shots history shows only your own shots, so there's no bowler
            filter here -- the local array also holds proxy-logged
            teammates and imported scorecards, and every row has a delete
            button. Deleting a teammate's frames from your history screen
            isn't yours to do. */}
        {/* Team, not league: a league can hold several teams, and the
            team is what a shot is actually associated with. */}
        {(teams||[]).length>0&&(
          <>
            <div style={{...S.label,marginTop:"4px"}}>Team</div>
            <div style={S.chips}>
              {(teams||[]).map(t=>(
                <Chip key={t.id} label={t.name}
                  selected={filterBall==="__"+t.id} onToggle={()=>setFilterBall(filterBall==="__"+t.id?"":"__"+t.id)}/>
              ))}
            </div>
          </>
        )}
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

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 16px"}}>
          <div style={{fontSize:"15px",fontWeight:600,color:C.text,marginBottom:"6px"}}>
            {filterBall||filterResult?"Nothing matches that filter":"No shots yet"}
          </div>
          <div style={{fontSize:"13px",color:C.textMuted,lineHeight:1.5}}>
            {filterBall||filterResult
              ?"Clear a filter above to see the rest."
              :"Every shot you log on the Log tab shows up here, newest first — ball, line, leave and result."}
          </div>
        </div>
      )}

      {[...filtered].reverse().map(shot=>(
        <div key={shot.id} style={S.shotCard}>
          <div style={S.dot(shot.result)}>{resultSym(shot._displayResult||shot.result)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
              <div style={{fontSize:"13px",fontWeight:600,minWidth:0}}>
                {bowlers.length>1&&shot.bowler&&<span style={{color:C.textMuted,fontWeight:500}}>{shot.bowler} — </span>}
                {shot.ball||"No ball"}
                {shot.surface&&<span style={{color:C.textMuted,fontWeight:400}}> at {shot.surface}</span>}
              </div>
              {/* Frame position as a scoreboard would show it: the frame
                  number big, the game and lane small under it. "G2 F7 L8"
                  was a code that had to be decoded every time. */}
              <div style={{textAlign:"right",flexShrink:0,marginLeft:"8px"}}>
                <div className="num" style={{fontSize:"18px",fontWeight:700,fontFamily:F.num,lineHeight:1}}>
                  {shot.frame}{shot.ballNum?<span style={{fontSize:"11px",color:C.textMuted,fontWeight:500}}>·{shot.ballNum}</span>:null}
                </div>
                <div style={{fontSize:"10px",color:C.textMuted,marginTop:"3px"}}>
                  Game {shot.game}{shot.lane?` · Lane ${shot.lane}`:""}
                </div>
                <div style={{fontSize:"10px",color:C.textMuted}}>{formatDateShort(shot.date)}</div>
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
              {/* Each shot has its own bowler, so -- unlike an aggregate
                  stats card -- this can resolve the real hand per row
                  rather than for "the view" as a whole. */}
              {shot.strikeDescription&&<span style={S.tag(C.strike)}>
                {strikeDescriptionLabel(shot.strikeDescription,leftHandedForBowler?leftHandedForBowler(shot.bowler):false)}
              </span>}
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
  );
}
