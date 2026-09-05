import { useState } from "react";
import { C, S, Chip, PinDeck, CollapsibleCard, resultSym } from "./ui.jsx";
import { RESULTS, localDateString } from "./constants.js";
import { convertExtractedGameToShots } from "./domain/scorecardImport.js";
import { strictPartial } from "./domain/scoring.js";
import { supabase } from "./supabaseClient.js";

// A short, human-readable summary of a single shot, for the collapsed row
// -- e.g. "Strike", "9-spare", "7-2 open". Mirrors how a bowler would say
// it out loud, not the raw field names.
function shotSummary(s){
  if(s.result==="Strike")return"Strike";
  if(s.result==="Weak 10")return"Weak 10";
  if(s.result==="Ringing 10")return"Ringing 10";
  const standing=(s.otherLeave||[]).length;
  const firstBall=10-standing;
  if(s.spareMade==="Yes")return`${firstBall}-spare`;
  if(s.spareMade==="No")return`${firstBall}-${s.pinCount!==""&&s.pinCount!=null?Math.max(0,parseInt(s.pinCount)-firstBall):"?"} open`;
  return`${firstBall} left ${standing}`;
}

function frameKey(s){return`${s.frame}-${s.ballNum??1}`;}

// Compact, inline editor for one extracted shot -- reuses the same Chip/
// PinDeck components as the main Log form for visual consistency, but
// condensed since up to 30 of these can appear across 3 games.
function ShotEditor({shot,onChange}){
  const standing=Array.isArray(shot.otherLeave)?shot.otherLeave:[];
  const firstBallCount=10-standing.length;
  const isStrike=shot.result==="Strike";
  const hasLeave=shot.result&&!isStrike;

  function setField(field,value){onChange({...shot,[field]:value});}
  function toggleResult(r){
    if(r==="Strike")setField("result","Strike");
    else onChange({...shot,result:r,otherLeave:r==="Other Leave"?shot.otherLeave:[]});
  }
  function togglePin(pin){
    const next=standing.includes(pin)?standing.filter(p=>p!==pin):[...standing,pin];
    const nextFirstBall=10-next.length;
    onChange({...shot,otherLeave:next,spareMade:"",pinCount:String(nextFirstBall)});
  }
  function setSpareMade(val){
    if(val==="Yes")onChange({...shot,spareMade:"Yes",pinCount:String(firstBallCount)});
    else onChange({...shot,spareMade:"No",pinCount:String(firstBallCount)});
  }
  function setPinCount(delta){
    const cur=shot.pinCount!==""?parseInt(shot.pinCount):firstBallCount;
    const max=firstBallCount+Math.max(0,standing.length-1);
    setField("pinCount",String(Math.max(firstBallCount,Math.min(max,cur+delta))));
  }

  return(
    <div>
      <div style={S.chips}>
        {RESULTS.map(r=>(
          <Chip key={r} label={r} dense selected={shot.result===r} onToggle={()=>toggleResult(r)}
            color={r==="Strike"?C.strike:r.includes("10")?C.miss:C.spare}/>
        ))}
      </div>
      {shot.result==="Other Leave"&&(
        <>
          <PinDeck selected={standing} onToggle={togglePin}/>
          {standing.length>0&&(
            <div style={S.chips}>
              {["Yes","No"].map(v=>(
                <Chip key={v} label={`Spare: ${v}`} dense selected={shot.spareMade===v} onToggle={()=>setSpareMade(v)}
                  color={v==="Yes"?C.strike:C.miss}/>
              ))}
            </div>
          )}
          {shot.spareMade==="No"&&standing.length>1&&(
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"8px"}}>
              <button style={{...S.btn("sm")}} onClick={()=>setPinCount(-1)}>−</button>
              <div style={{flex:1,textAlign:"center",fontSize:"14px",color:C.textMuted}}>
                Total this frame: <strong style={{color:C.text}}>{shot.pinCount||firstBallCount}</strong>
              </div>
              <button style={{...S.btn("sm")}} onClick={()=>setPinCount(1)}>+</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// One game's worth of extracted frames, each collapsible. Warning-flagged
// frames start expanded and visually distinct -- they're the one scenario
// confirmed unreliable to extract from a scorecard image, so they need
// eyes-on before saving, not just an easy-to-miss footnote.
function GameReview({game,onUpdateShot,expandedFrames,onToggleExpanded}){
  const score=strictPartial(game.shots);
  return(
    <div style={S.card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{...S.label,marginBottom:0}}>Game {game.gameNumber}{game.ballUsed?` · ${game.ballUsed}`:""}</div>
        <div style={{fontSize:"18px",fontWeight:700,color:score!=null?C.accent:C.textMuted}}>{score??"—"}</div>
      </div>
      {game.warnings.length>0&&(
        <div style={{backgroundColor:C.spare+"22",border:`1px solid ${C.spare}44`,borderRadius:"8px",padding:"10px 12px",marginBottom:"10px",fontSize:"12px",color:C.spare}}>
          ⚠️ {game.warnings.length} fill ball{game.warnings.length>1?"s":""} below couldn't be reliably read from the image -- please double-check the pin count.
        </div>
      )}
      {game.shots.map((s,idx)=>{
        const key=frameKey(s);
        const warned=game.warnings.some(w=>w.frame===s.frame&&(w.ballNum??1)===(s.ballNum??1));
        const expanded=expandedFrames.has(key);
        const label=`Frame ${s.frame}${s.ballNum?` · Ball ${s.ballNum}`:""}`;
        return(
          <div key={key} style={warned?{border:`1px solid ${C.spare}`,borderRadius:"10px",padding:"2px",marginBottom:"8px"}:{marginBottom:"8px"}}>
            <CollapsibleCard
              title={warned?`⚠️ ${label}`:label}
              summary={shotSummary(s)}
              expanded={expanded}
              onToggle={()=>onToggleExpanded(key)}
            >
              <ShotEditor shot={s} onChange={updated=>onUpdateShot(idx,updated)}/>
            </CollapsibleCard>
          </div>
        );
      })}
    </div>
  );
}

export default function ImportScorecard({
  bowlers, leagues, teams, shots, saveShots,
  setSessionLeague, setSessionDate, selectBowler, setView, setSessionSaveMessage,
}){
  const[step,setStep]=useState("setup"); // setup | processing | review | saving
  const[contextBowler,setContextBowler]=useState(bowlers[0]||"");
  const[contextLeague,setContextLeague]=useState(leagues[0]||"");
  const[contextDate,setContextDate]=useState(localDateString());
  const[images,setImages]=useState([]); // [{base64, mimeType, previewUrl}]
  const[error,setError]=useState(null);
  const[games,setGames]=useState([]); // [{gameNumber, ballUsed, shots, warnings}]
  const[expandedByGame,setExpandedByGame]=useState([]); // [Set(frameKey), ...] parallel to games

  const teamId=teams.find(t=>t.league===contextLeague&&(t.members||[]).includes(contextBowler))?.id||"";

  async function handleFilesSelected(fileList){
    const files=Array.from(fileList).slice(0,6);
    try{
      const withData=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>{
          const dataUrl=reader.result;
          resolve({base64:dataUrl.split(",")[1],mimeType:file.type||"image/jpeg",previewUrl:dataUrl});
        };
        reader.onerror=()=>reject(new Error("Couldn't read one of the selected images."));
        reader.readAsDataURL(file);
      })));
      setImages(withData);
      setError(null);
    }catch(e){
      setError(e.message||"Couldn't read the selected images.");
    }
  }

  async function handleExtract(){
    if(!contextBowler||!contextLeague||!images.length)return;
    setStep("processing");
    setError(null);
    try{
      const{data,error:fnError}=await supabase.functions.invoke("import-scorecard",{
        body:{images:images.map(img=>({base64:img.base64,mimeType:img.mimeType}))},
      });
      if(fnError)throw new Error(fnError.message||"Extraction failed.");
      if(data?.error)throw new Error(data.error);

      const context={bowler:contextBowler,league:contextLeague,date:contextDate,teamId};
      const converted=(data.games||[]).map(g=>{
        const{shots:gameShots,warnings}=convertExtractedGameToShots(g,{...context,game:g.gameNumber});
        return{gameNumber:g.gameNumber,ballUsed:g.ballUsed,shots:gameShots,warnings};
      });
      if(!converted.length)throw new Error("No games could be read from the image(s). Try a clearer screenshot.");

      setGames(converted);
      setExpandedByGame(converted.map(g=>new Set(g.warnings.map(w=>`${w.frame}-${w.ballNum??1}`))));
      setStep("review");
    }catch(e){
      setError(e.message||"Something went wrong during extraction.");
      setStep("setup");
    }
  }

  function updateShot(gameIdx,shotIdx,updatedShot){
    setGames(prev=>prev.map((g,i)=>i!==gameIdx?g:{...g,shots:g.shots.map((s,j)=>j!==shotIdx?s:updatedShot)}));
  }

  function toggleExpanded(gameIdx,key){
    setExpandedByGame(prev=>prev.map((set,i)=>{
      if(i!==gameIdx)return set;
      const next=new Set(set);
      next.has(key)?next.delete(key):next.add(key);
      return next;
    }));
  }

  async function handleSave(){
    const conflictGames=games.filter(g=>
      shots.some(s=>s.bowler===contextBowler&&s.league===contextLeague&&s.date===contextDate&&s.game===String(g.gameNumber))
    );
    if(conflictGames.length&&!window.confirm(
      `Shots already exist for Game ${conflictGames.map(c=>c.gameNumber).join(", ")} on ${contextDate}. `+
      `Importing will ADD to what's already there, not replace it -- which could double-count that game. Continue anyway?`
    ))return;

    setStep("saving");
    const newShots=games.flatMap(g=>g.shots.map(s=>({...s,id:crypto.randomUUID()})));
    await saveShots([...shots,...newShots]);

    // Hand off to the existing, already-correct Save Session flow rather
    // than re-deriving scores/stats here -- pre-fill its context and let
    // the user's own tap run it, so there's no risk of reading stale
    // React state from a same-tick programmatic call.
    setSessionLeague(contextLeague);
    setSessionDate(contextDate);
    selectBowler(contextBowler);
    setSessionSaveMessage(`Imported ${newShots.length} shots across ${games.length} game${games.length>1?"s":""} -- tap "Save Session & View Summary" below to finalize.`);
    setTimeout(()=>setSessionSaveMessage(null),6000);
    setView("log");
  }

  return(
    <div>
      {step==="setup"&&(
        <>
          <div style={S.card}>
            <div style={S.label}>Whose scorecard is this?</div>
            <div style={S.chips}>
              {bowlers.map(b=><Chip key={b} label={b} selected={contextBowler===b} onToggle={()=>setContextBowler(b)}/>)}
            </div>
            <div style={S.label}>League</div>
            <div style={S.chips}>
              {leagues.map(l=><Chip key={l} label={l.replace(" House Shot","")} selected={contextLeague===l} onToggle={()=>setContextLeague(l)}/>)}
            </div>
            <div style={S.label}>Date</div>
            <input style={S.input} type="date" value={contextDate} onChange={e=>setContextDate(e.target.value)}/>
          </div>

          <div style={S.card}>
            <div style={S.label}>Scorecard Screenshot{images.length!==1?"s":""}</div>
            <input type="file" accept="image/*" multiple
              onChange={e=>e.target.files?.length&&handleFilesSelected(e.target.files)}
              style={{marginBottom:"12px"}}/>
            {images.length>0&&(
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"12px"}}>
                {images.map((img,i)=>(
                  <img key={i} src={img.previewUrl} alt={`Scorecard ${i+1}`}
                    style={{width:"72px",height:"72px",objectFit:"cover",borderRadius:"8px",border:`1px solid ${C.border}`}}/>
                ))}
              </div>
            )}
            {error&&<div style={{fontSize:"13px",color:C.miss,marginBottom:"12px"}}>{error}</div>}
            <button style={S.btn("primary")} disabled={!contextBowler||!contextLeague||!images.length} onClick={handleExtract}>
              Extract Shots
            </button>
          </div>
        </>
      )}

      {step==="processing"&&(
        <div style={{...S.card,textAlign:"center",padding:"32px 16px"}}>
          <div style={{fontSize:"14px",color:C.textMuted}}>Reading the scorecard…</div>
        </div>
      )}

      {(step==="review"||step==="saving")&&(
        <>
          <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"12px"}}>
            {contextBowler} · {contextLeague.replace(" House Shot","")} · {contextDate} — review each frame below, tap any of them to correct it, then save.
          </div>
          {games.map((g,idx)=>(
            <GameReview key={g.gameNumber} game={g}
              onUpdateShot={(shotIdx,updated)=>updateShot(idx,shotIdx,updated)}
              expandedFrames={expandedByGame[idx]||new Set()}
              onToggleExpanded={key=>toggleExpanded(idx,key)}/>
          ))}
          <button style={S.btn("primary")} disabled={step==="saving"} onClick={handleSave}>
            {step==="saving"?"Saving…":"Looks Good — Save"}
          </button>
          <button style={{...S.btn(),marginTop:"8px"}} onClick={()=>setStep("setup")}>Start Over</button>
        </>
      )}
    </div>
  );
}
