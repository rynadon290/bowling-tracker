import { C, S, Chip, resultSym } from "./ui.jsx";
import { RESULTS } from "./constants.js";
import { isSplit } from "./domain/splits.js";

export default function HistoryView({
  bowlers, leagues,
  filterBowler, setFilterBowler,
  filterBall, setFilterBall,
  filterResult, setFilterResult,
  filtered, ballUniverse,
  startEdit, deleteShot,
}) {
  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Filter</div>
        {bowlers.length>1&&(
          <div style={S.chips}>
            {bowlers.map(b=>(
              <Chip key={b} label={b} selected={filterBowler===b} onToggle={()=>setFilterBowler(filterBowler===b?"":b)}/>
            ))}
          </div>
        )}
        <div style={S.chips}>
          {leagues.map(l=>(
            <Chip key={l} label={l.replace(" House Shot","")}
              selected={filterBall==="__"+l} onToggle={()=>setFilterBall(filterBall==="__"+l?"":"__"+l)}/>
          ))}
        </div>
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

      {filtered.length===0&&<div style={{textAlign:"center",color:C.textMuted,padding:"40px 0"}}>No shots logged yet.</div>}

      {[...filtered].reverse().map(shot=>(
        <div key={shot.id} style={S.shotCard}>
          <div style={S.dot(shot.result)}>{resultSym(shot._displayResult||shot.result)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
              <div style={{fontSize:"12px",fontWeight:600}}>
                {bowlers.length>1&&shot.bowler&&<span style={{color:C.accent}}>{shot.bowler} · </span>}
                {shot.ball||"—"}
                {shot.surface&&<span style={{color:C.textMuted,fontWeight:400}}> · {shot.surface}</span>}
              </div>
              <div style={{fontSize:"10px",color:C.textMuted,textAlign:"right"}}>
                {shot.date}<br/>
                G{shot.game} F{shot.frame}{shot.ballNum?` B${shot.ballNum}`:""} L{shot.lane}
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
              {shot.strikeDescription&&<span style={S.tag(C.strike)}>{shot.strikeDescription}</span>}
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
