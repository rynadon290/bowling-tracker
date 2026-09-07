import { useState } from "react";
import { C, S, Chip, PinDeck, CollapsibleCard, resultSym } from "./ui.jsx";
import { RESULTS, localDateString } from "./constants.js";
import { convertExtractedGameToShots, normalizeExtraction, detailLevel, mergeColumnsByBowler } from "./domain/scorecardImport.js";
import { matchScorecard, rosterOrderCheck } from "./domain/nameMatching.js";
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
function GameReview({game,onUpdateShot,onUpdateScore,expandedFrames,onToggleExpanded}){
  const score=game.scoreOnly?game.totalScore:strictPartial(game.shots);
  return(
    <div style={S.card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{...S.label,marginBottom:0}}>Game {game.gameNumber}{game.ballUsed?` · ${game.ballUsed}`:""}</div>
        <div style={{fontSize:"18px",fontWeight:700,color:score!=null?C.accent:C.textMuted}}>{score??"—"}</div>
      </div>

      {/* This screenshot showed only a total for this game, so there are no
          shots to review -- just the score, editable in case it was misread. */}
      {game.scoreOnly&&(
        <>
          <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
            No frame-by-frame detail on this scorecard — importing the game score only.
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <div style={{fontSize:"12px",color:C.textMuted,width:"52px"}}>Score</div>
            <input style={{...S.input,flex:1}} type="number" inputMode="numeric" placeholder="Score"
              value={game.totalScore==null?"":String(game.totalScore)}
              onChange={e=>onUpdateScore(e.target.value===""?null:parseInt(e.target.value))}/>
          </div>
        </>
      )}
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
  bowlers, leagues, teams, profiles, shots, saveShots, updateManualScore, onSubmitTeammateScores,
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
  // Team cards: one entry per bowler column, plus who each maps to.
  const[columns,setColumns]=useState([]);
  const[assignments,setAssignments]=useState({}); // columnIndex -> bowler name or "" (skip)
  const[orderCheck,setOrderCheck]=useState(null);

  const teamId=teams.find(t=>t.league===contextLeague&&(t.members||[]).includes(contextBowler))?.id||"";

  // Longest edge, in pixels, that an image is scaled down to before
  // upload.
  //
  // A modern phone camera produces 4-12MB per photo, and base64 inflates
  // that by a third. Six of those is a request body far past what the
  // function will accept -- which arrives as a bare transport failure
  // after a long wait, with nothing to say it was a size problem.
  //
  // 1600px is comfortably enough to read pin-deck graphics (a scorecard
  // frame is a handful of pixels wide at phone resolution, and the
  // limiting factor is the photo's sharpness, not its pixel count) while
  // cutting a typical upload by an order of magnitude.
  const MAX_IMAGE_EDGE = 1600;
  const JPEG_QUALITY = 0.82;

  async function downscale(file){
    // No canvas (older browser, or a test environment) -- fall back to
    // sending the original rather than failing the import outright.
    if(typeof document==="undefined"||!document.createElement("canvas").getContext){
      return readRaw(file);
    }
    try{
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(bitmap.width,bitmap.height));
      if(scale>=1)return readRaw(file);
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(bitmap.width*scale);
      canvas.height=Math.round(bitmap.height*scale);
      canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
      const dataUrl=canvas.toDataURL("image/jpeg",JPEG_QUALITY);
      bitmap.close?.();
      return{base64:dataUrl.split(",")[1],mimeType:"image/jpeg",previewUrl:dataUrl};
    }catch{
      return readRaw(file);
    }
  }

  function readRaw(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const dataUrl=reader.result;
        resolve({base64:dataUrl.split(",")[1],mimeType:file.type||"image/jpeg",previewUrl:dataUrl});
      };
      reader.onerror=()=>reject(new Error("Couldn't read one of the selected images."));
      reader.readAsDataURL(file);
    });
  }

  async function handleFilesSelected(fileList){
    const files=Array.from(fileList).slice(0,6);
    try{
      setError(null);
      const withData=await Promise.all(files.map(downscale));
      const totalMb=withData.reduce((n,i)=>n+i.base64.length,0)/1024/1024*0.75;
      // Still too big even after scaling -- say so now rather than after
      // a two-minute wait that ends in a transport error.
      if(totalMb>15){
        setError(`These images come to about ${totalMb.toFixed(0)}MB even after resizing, which is too much to send at once. Try fewer images.`);
        setImages([]);
        return;
      }
      setImages(withData);
    }catch(e){
      setError(e.message||"Couldn't read the selected images.");
    }
  }

  // Converts ONE bowler's column into this app's shot/score records.
  //
  // Deliberately runs after the who's-who mapping, not during extraction.
  // A team card returns every bowler's games in one flat list -- four
  // bowlers x three games is twelve entries with the game numbers
  // repeating -- so converting up front handed the review screen all
  // twelve as though they belonged to the importer.
  function convertColumn(column,bowler){
    const context={bowler,league:contextLeague,date:contextDate,teamId};
    return (column?.games||[]).map(g=>{
      // A card showing only totals is a normal case, not a failure --
      // those import as scores rather than shots.
      const hasFrames=Array.isArray(g.frames)&&g.frames.length>0;
      if(!hasFrames){
        return{gameNumber:g.gameNumber,ballUsed:g.ballUsed,shots:[],warnings:[],
               scoreOnly:true,totalScore:g.totalScore??null};
      }
      const{shots:gameShots,warnings}=convertExtractedGameToShots(g,{...context,game:g.gameNumber});
      return{gameNumber:g.gameNumber,ballUsed:g.ballUsed,shots:gameShots,warnings,
             scoreOnly:false,totalScore:g.totalScore??null};
    });
  }

  // Confirming the mapping is what decides whose games get reviewed.
  function confirmColumns(){
    const mineIndex=columns.findIndex((c,i)=>assignments[i]===contextBowler);
    const mine=mineIndex>=0?columns[mineIndex]:null;
    const converted=mine?convertColumn(mine,contextBowler):[];
    setGames(converted);
    setExpandedByGame(converted.map(g=>new Set(g.warnings.map(w=>`${w.frame}-${w.ballNum??1}`))));
    setStep("review");
  }

  async function handleExtract(){
    if(!contextBowler||!contextLeague||!images.length)return;
    setStep("processing");
    setError(null);
    try{
      const{data,error:fnError}=await supabase.functions.invoke("import-scorecard",{
        body:{images:images.map(img=>({base64:img.base64,mimeType:img.mimeType}))},
      });
      if(fnError){
        // supabase-js reports any non-2xx or network failure as the same
        // opaque "Failed to send a request to the Edge Function", which
        // tells the bowler nothing about what to do. The function itself
        // returns a JSON { error } body for its own failures, so read
        // that first and only fall back to guessing at causes.
        let detail=fnError.message||"";
        try{
          const body=await fnError.context?.json?.();
          // The function returns { error, detail } -- error is a label
          // ("Gemini API error") and detail is the actual cause. Showing
          // only the label is how three rounds got spent guessing at a
          // problem the server had already named.
          if(body?.error){
            detail=body.error;
            if(body.detail){
              const extra=typeof body.detail==="string"?body.detail:JSON.stringify(body.detail);
              detail+=` — ${extra.slice(0,400)}`;
            }
          }
        }catch{}
        if(/failed to send a request/i.test(detail)){
          // Keep the underlying text -- without it there's no way to tell
          // a size problem from a timeout from a function that failed to
          // start, and every one of those needs a different fix.
          detail="Couldn't reach the scorecard reader. Most often the upload is too large or the read took too long — "+
                 "try one image at a time. If it keeps failing on a single image, the reader itself may be down. "+
                 `(${fnError.message||"no detail"})`;
        }
        throw new Error(detail||"Extraction failed.");
      }
      if(data?.error)throw new Error(data.error);

      // Column mapping. Runs for every card, not just team ones -- a
      // single-bowler card is just a one-column team card, and going
      // through the same path means one code path to get right.
      const cols=normalizeExtraction(data);
      if(!cols.length||cols.every(c=>!c.games.length)){
        throw new Error("No games could be read from the image(s). Try a clearer screenshot.");
      }
      if(cols.every(c=>c.games.every(g=>!(Array.isArray(g.frames)&&g.frames.length)&&g.totalScore==null))){
        throw new Error("Found games but couldn't read any scores or frame detail. Try a clearer screenshot.");
      }
      const team=teams.find(t=>t.id===teamId);
      const roster=(team?.members||[]).map(m=>({
        bowler:m.bowlerName||m,
        aliases:(profiles?.[m.bowlerName||m]?.aliases)||[],
        lineupPosition:m.lineupPosition??0,
      }));
      // With no team defined, the only person we can match against is
      // whoever is importing -- which is exactly the "my name and nobody
      // else's" case. Everything unmatched then falls to manual picking.
      const effectiveRoster=roster.length?roster:[{
        bowler:contextBowler,
        aliases:(profiles?.[contextBowler]?.aliases)||[],
        lineupPosition:0,
      }];
      const matched=matchScorecard(cols.map(c=>c.scorecardName),effectiveRoster);
      // Several images are one card, so the same bowler can come back as
      // two columns (games 1-3 and 4-6, or a wide card in halves).
      const withMatches=cols.map((c,i)=>({...c,...matched.columns[i]}));
      const finalCols=mergeColumnsByBowler(withMatches).map((c,i)=>({...c,columnIndex:i}));
      setColumns(finalCols);
      setAssignments(Object.fromEntries(finalCols.map((c,i)=>[i,c.assigned||""])));
      setOrderCheck(roster.length?rosterOrderCheck(matched.columns,roster):null);
      // Column count is post-merge, so a split card doesn't look like a
      // team of six.

      setStep("columns");
    }catch(e){
      setError(e.message||"Something went wrong during extraction.");
      setStep("setup");
    }
  }

  function updateScore(gameIdx,value){
    setGames(prev=>prev.map((g,i)=>i!==gameIdx?g:{...g,totalScore:value}));
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
    if(newShots.length)await saveShots([...shots,...newShots]);

    // Games that came in as totals only are saved as manual scores, which
    // take precedence over anything derived from shots -- see
    // domain/manualScores.js. This is what lets a totals-only screenshot,
    // or a bowler who doesn't log shot by shot, still get averages.
    const scoreOnlyGames=games.filter(g=>g.scoreOnly&&g.totalScore!=null);
    scoreOnlyGames.forEach(g=>{
      updateManualScore(contextBowler,contextLeague,contextDate,g.gameNumber,String(g.totalScore));
    });

    // Games that came in WITH frame detail replace any manual score for
    // that game. Manual scores take precedence over shots everywhere else,
    // so leaving one behind here would mean the newly imported frames are
    // silently ignored in favour of a number typed earlier.
    games.filter(g=>!g.scoreOnly&&g.shots.length>0).forEach(g=>{
      updateManualScore(contextBowler,contextLeague,contextDate,g.gameNumber,"");
    });

    // Hand off to the existing, already-correct Save Session flow rather
    // than re-deriving scores/stats here -- pre-fill its context and let
    // the user's own tap run it, so there's no risk of reading stale
    // React state from a same-tick programmatic call.
    // Teammates' columns never touch their real history. They become
    // pending records the bowler approves, rejects, or corrects -- and
    // which count in the meantime, so the team's numbers aren't held
    // hostage to whoever bowls and goes home. See
    // domain/importVerification.js for the full lifecycle.
    const teammateColumns=columns
      .map((c,i)=>({column:c,bowler:assignments[i]}))
      .filter(x=>x.bowler&&x.bowler!==contextBowler);
    if(teammateColumns.length&&onSubmitTeammateScores){
      await onSubmitTeammateScores(teammateColumns.map(({column,bowler})=>({
        bowler,
        league:contextLeague,
        date:contextDate,
        teamId,
        importedScores:(column.games||[]).map(g=>g.totalScore??null),
      })));
    }

    setSessionLeague(contextLeague);
    setSessionDate(contextDate);
    selectBowler(contextBowler);
    const parts=[];
    if(newShots.length)parts.push(`${newShots.length} shots`);
    if(scoreOnlyGames.length)parts.push(`${scoreOnlyGames.length} game score${scoreOnlyGames.length>1?"s":""}`);
    if(teammateColumns.length)parts.push(`${teammateColumns.length} teammate${teammateColumns.length>1?"s":""} sent for confirmation`);
    setSessionSaveMessage(`Imported ${parts.join(" and ")} -- tap "Save Session & View Summary" below to finalize.`);
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
            {/* Set the expectation before the wait, not during it. */}
            {images.length>0&&(()=>{
              const mb=images.reduce((n,i)=>n+i.base64.length,0)/1024/1024*0.75;
              return(
                <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                  {images.length>1
                    ? `${images.length} images (${mb.toFixed(1)}MB after resizing) — reading these can take a few minutes.`
                    : `Reading a scorecard can take a minute or two. (${mb.toFixed(1)}MB after resizing.)`}
                </div>
              );
            })()}
            <button style={S.btn("primary")} disabled={!contextBowler||!contextLeague||!images.length} onClick={handleExtract}>
              Extract Shots
            </button>
          </div>
        </>
      )}

      {step==="processing"&&(
        <div style={{...S.card,textAlign:"center",padding:"32px 16px"}}>
          <div style={{fontSize:"14px",color:C.text,marginBottom:"8px"}}>Reading the scorecard…</div>
          {/* Reading pin-deck graphics frame by frame is genuinely slow,
              and a spinner with no expectation set reads as "stuck". The
              wording scales with what was actually uploaded, because a
              single totals-only shot is fast and a six-image team card
              really is minutes. */}
          <div style={{fontSize:"12px",color:C.textMuted,lineHeight:1.5}}>
            {images.length>1
              ? `Working through ${images.length} images. This can take a few minutes — every frame is read individually.`
              : "This can take a minute or two — every frame is read individually."}
          </div>
          <div style={{fontSize:"11px",color:C.textMuted,marginTop:"10px"}}>
            Keep this screen open until it finishes.
          </div>
        </div>
      )}

      {step==="columns"&&(
        <>
          <div style={S.card}>
            <div style={S.label}>Who's who</div>
            <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
              {columns.length} bowler{columns.length===1?"":"s"} read off the card. Confirm each one before anything is saved —
              a wrong match writes someone else's game into their record.
            </div>
            {columns.map((c,i)=>{
              const detail=detailLevel(c);
              return(
                <div key={i} style={{padding:"10px",marginBottom:"8px",backgroundColor:C.surface,borderRadius:"8px",border:`1px solid ${assignments[i]?C.border:C.spare+"66"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"6px"}}>
                    <div style={{fontSize:"13px",fontWeight:600,color:C.text}}>
                      {c.scorecardName||`Column ${i+1}`}
                    </div>
                    <div style={{fontSize:"10px",color:C.textMuted}}>
                      {c.games.length} game{c.games.length===1?"":"s"} · {detail==="shots"?"shot by shot":detail==="scores"?"scores only":detail==="mixed"?"mixed":"no detail"}
                      {c.series!=null&&<> · {c.series} series</>}
                      {c.mergedFrom>1&&<> · combined from {c.mergedFrom} images</>}
                    </div>
                  </div>
                  {/* The printed total and the games disagreeing means
                      something was misread -- worth a look, not a silent
                      pick between them. */}
                  {c.disagrees&&(
                    <div style={{fontSize:"10px",color:C.spare,marginBottom:"6px"}}>
                      Printed series is {c.series} but the games add to {c.computed}. Check the card.
                    </div>
                  )}
                  <select style={{...S.sel,width:"100%",fontSize:"12px"}}
                    value={assignments[i]||""}
                    onChange={e=>setAssignments(a=>({...a,[i]:e.target.value}))}>
                    <option value="">Skip this bowler</option>
                    {bowlers.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                  {c.best&&!c.autoMatch&&(
                    <div style={{fontSize:"10px",color:C.textMuted,marginTop:"4px"}}>
                      {c.ambiguous?"More than one bowler matches this name equally — pick the right one.":`Closest match: ${c.best.bowler}`}
                    </div>
                  )}
                  {c.matchedVia&&c.autoMatch&&c.best?.matchedVia!==c.best?.bowler&&(
                    <div style={{fontSize:"10px",color:C.textMuted,marginTop:"4px"}}>
                      Matched on the alias "{c.best.matchedVia}".
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {orderCheck&&!orderCheck.agrees&&(
            <div style={{...S.card,border:`1px solid ${C.spare}44`}}>
              <div style={{...S.label,color:C.spare}}>Roster order</div>
              <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                The card's order doesn't match your team roster. Names still matched correctly — but if the roster
                is wrong, position hints will be wrong for every future import.
              </div>
              <div style={{fontSize:"11px",color:C.text}}>
                Card order: {orderCheck.suggestedOrder.join(" → ")}
              </div>
            </div>
          )}

          <button style={S.btn("primary")}
            disabled={!Object.values(assignments).some(Boolean)}
            onClick={confirmColumns}>
            Continue
          </button>
          <button style={{...S.btn(),marginTop:"8px"}} onClick={()=>setStep("setup")}>Start Over</button>
          <div style={{height:"32px"}}/>
        </>
      )}

      {(step==="review"||step==="saving")&&(
        <>
          <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"12px"}}>
            {contextBowler} · {contextLeague.replace(" House Shot","")} · {contextDate} — {
              // A totals-only card has no frames to review, so telling the
              // bowler to check frames sends them looking for something
              // that isn't on screen.
              games.length===0
                ? "nothing was mapped to you on this card."
                : games.every(g=>g.scoreOnly)
                  ? `check the ${games.length===1?"score":`${games.length} game scores`} below, correct anything that's wrong, then save.`
                  : games.some(g=>g.scoreOnly)
                    ? "check the games below — some came through frame by frame, some as scores only. Correct anything that's wrong, then save."
                    : "review each frame below, tap any of them to correct it, then save."
            }
          </div>
          {games.map((g,idx)=>(
            <GameReview key={g.gameNumber} game={g}
              onUpdateShot={(shotIdx,updated)=>updateShot(idx,shotIdx,updated)}
              onUpdateScore={value=>updateScore(idx,value)}
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
