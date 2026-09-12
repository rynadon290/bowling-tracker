import { useState } from "react";
import { C, S, Chip, PinDeck, CollapsibleCard, resultSym } from "./ui.jsx";
import { formatDate, RESULTS, localDateString, PRACTICE_SESSION_KEY } from "./constants.js";
import { convertExtractedGameToShots, normalizeExtraction, detailLevel, mergeColumnsByBowler } from "./domain/scorecardImport.js";
import { matchScorecard, rosterOrderCheck } from "./domain/nameMatching.js";
import { strictPartial } from "./domain/scoring.js";
import { findExistingShotSlot } from "./domain/sessions.js";
import { isValidGameScore, invalidScoreIndexes } from "./domain/importVerification.js";
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
            <input style={{...S.input,flex:1,
              ...(isValidGameScore(game.totalScore)?{}:{borderColor:C.miss,color:C.miss})}}
              type="number" inputMode="numeric" placeholder="Score"
              value={game.totalScore==null?"":String(game.totalScore)}
              onChange={e=>onUpdateScore(e.target.value===""?null:parseInt(e.target.value))}/>
          </div>
          {/* Same bound as the teammate rows: a garbled read is flagged
              where it can be fixed, not carried silently into history. */}
          {!isValidGameScore(game.totalScore)&&(
            <div style={{fontSize:"10px",color:C.miss,marginTop:"4px"}}>
              That isn't a possible game score — type the real one.
            </div>
          )}
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
  bowlers, activeBowler, leagues, teams, tournaments = [], profiles, shots, saveShots, updateManualScore, onSubmitTeammateScores,
  setSessionLeague, setSessionDate, selectBowler, setView, setSessionSaveMessage,
  // Practice and casual have a container league rather than one you pick,
  // and the bowler is already chosen on the Log tab. Passing those in
  // lets the import skip straight to what it actually needs -- the
  // screenshots -- instead of asking questions with one possible answer.
  presetLeague = null, presetBowler = null,
}){
  const[step,setStep]=useState("setup"); // setup | processing | review | saving
  // Which team's scorecard this is. The team, not the league: a league
  // can hold several teams, and it's the team's roster that the card's
  // columns get mapped to. The league comes along with it.
  // A null team row threw on t.league.
  const teamsForImport=(Array.isArray(teams)?teams:[]).filter(t=>t&&typeof t==="object"&&t.league);
  const initialTeam=(presetLeague
    ?teamsForImport.find(t=>t.league===presetLeague)
    :null)||teamsForImport[0]||null;
  // What kind of bowling this scorecard is from.
  //
  // Asked outright rather than inherited from whatever mode the Log tab
  // happened to be in. The import used to live on Log and take its
  // environment from there, so a tournament card couldn't be imported
  // while the app was in practice mode, and a league card needed a
  // league night set up first.
  const[importKind,setImportKind]=useState(
    presetLeague===PRACTICE_SESSION_KEY?"practice":"league");
  const[contextTournamentId,setContextTournamentId]=useState("");
  const[contextTeamId,setContextTeamId]=useState(initialTeam?.id||"");
  const contextTeam=teamsForImport.find(t=>t.id===contextTeamId)||initialTeam||null;
  const selectedTournament=(tournaments||[]).find(t=>t.id===contextTournamentId)||null;
  // Practice and tournament sessions are still filed against a league
  // name -- that's the key every score hangs off -- but the name comes
  // from the kind rather than from a team.
  const contextLeague=
    importKind==="practice"?(presetLeague||PRACTICE_SESSION_KEY)
    :importKind==="tournament"?(selectedTournament?.name||"")
    :(contextTeam?.league||presetLeague||(Array.isArray(leagues)?leagues[0]:"")||"");

  // Whose card this is is NOT asked up front. Every column gets mapped to
  // a bowler in the review step anyway, so asking first was asking the
  // same question twice -- and it broke down entirely for multiple
  // photos, where the answer is "several people".
  //
  // "Mine" is therefore derived: the signed-in bowler, used only to
  // decide which mapped column files to this account rather than being
  // sent to a teammate.
  const contextBowler=presetBowler||activeBowler||(Array.isArray(bowlers)?bowlers[0]:"")||"";
  const[contextDate,setContextDate]=useState(localDateString());
  const[images,setImages]=useState([]); // [{base64, mimeType, previewUrl}]
  const[error,setError]=useState(null);
  const[games,setGames]=useState([]); // [{gameNumber, ballUsed, shots, warnings}]
  const[expandedByGame,setExpandedByGame]=useState([]); // [Set(frameKey), ...] parallel to games
  // Team cards: one entry per bowler column, plus who each maps to.
  const[columns,setColumns]=useState([]);
  const[assignments,setAssignments]=useState({}); // columnIndex -> bowler name or "" (skip)
  const[orderCheck,setOrderCheck]=useState(null);
  // "Busy, try again" is not the same as "this is broken", and colouring
  // them the same is what makes people give up on a temporary problem.
  const[errorIsTemporary,setErrorIsTemporary]=useState(false);
  // Teammates' scores, editable before they're sent. Sending someone
  // else's numbers off a photo without letting the uploader check them
  // first puts the burden of catching a misread entirely on the person
  // who wasn't there when it was imported.
  const[teammateScores,setTeammateScores]=useState({}); // columnIndex -> [score strings]

  const teamId=contextTeam?.id||"";

  // Images are sent as-is. Nothing is resized or re-encoded.
  //
  // They used to be scaled to a 1600px long edge and re-encoded as JPEG
  // at 0.82. The reasoning was that a scorecard frame is only a few
  // pixels wide so sharpness matters more than pixel count -- which is
  // exactly backwards. Small digits and pin-deck graphics are the FIRST
  // thing lost to downscaling, and JPEG artifacts land hardest on the
  // fine lines OCR depends on. A phone screenshot arrives already sharp
  // and already compressed; running it through a second lossy pass threw
  // away the detail that made it readable, and three screenshots
  // reducing to 0.3MB total is the visible symptom of that.
  //
  // The size ceiling below still exists, because an oversized body is a
  // real transport failure -- but it now reports the problem instead of
  // silently degrading every image to avoid it.
  const MAX_TOTAL_MB = 18;

  async function downscale(file){
    // Kept as the single entry point so callers don't change, but it no
    // longer scales anything -- it just reads the file.
    return readRaw(file);
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

  function removeImage(idx){
    setImages(prev=>{
      const img=prev[idx];
      // createObjectURL holds the blob alive until it's revoked. Dropping
      // the reference alone would leak a full-size photo per mistake.
      if(img?.previewUrl){try{URL.revokeObjectURL(img.previewUrl);}catch{}}
      return prev.filter((_,i)=>i!==idx);
    });
    // A size error was about the set as a whole, so it stops applying the
    // moment the set changes.
    setError(null);
  }

  async function handleFilesSelected(fileList){
    const files=Array.from(fileList).slice(0,6);
    try{
      setError(null);
      const withData=await Promise.all(files.map(downscale));
      const totalMb=withData.reduce((n,i)=>n+i.base64.length,0)/1024/1024*0.75;
      // Still too big even after scaling -- say so now rather than after
      // a two-minute wait that ends in a transport error.
      if(totalMb>MAX_TOTAL_MB){
        setError(`These images come to about ${totalMb.toFixed(0)}MB, which is too much to send at once. Remove one and try again — images are sent at full quality, so fewer is better than smaller.`);
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
    // Seed the editable teammate scores from what was read, so the review
    // step shows their numbers rather than sending them unseen.
    const seeded={};
    columns.forEach((c,i)=>{
      const who=assignments[i];
      if(!who||who===contextBowler)return;
      seeded[i]=(c.games||[]).map(g=>g.totalScore==null?"":String(g.totalScore));
    });
    setTeammateScores(seeded);
    setStep("review");
  }

  const teammateEntries=columns
    .map((c,i)=>({column:c,index:i,bowler:assignments[i]}))
    .filter(x=>x.bowler&&x.bowler!==contextBowler);

  // Any teammate score that a game of bowling can't produce. Sending one
  // means the receiving end nulls it and the teammate gets a blank, so
  // this blocks the save rather than only colouring the box.
  const hasInvalidTeammateScores=teammateEntries
    .some(({index})=>invalidScoreIndexes(teammateScores[index]||[]).length>0);

  async function handleExtract(){
    if(!contextLeague||!images.length)return;
    setStep("processing");
    setError(null);
    setErrorIsTemporary(false);
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
        let retryable=false;
        try{
          const body=await fnError.context?.json?.();
          if(body?.error){
            // The function classifies failures into a `reason` so this
            // doesn't have to parse raw API JSON. Showing a bowler
            // `{"error":{"code":503,...}}` reads as "this app is broken"
            // when the honest answer is "the reader is busy, try again in
            // a minute" -- and people give up over the difference.
            switch(body.reason){
              case "busy": {
                retryable=true;
                // Only mention retries if any actually happened, and get
                // the plural right -- "retried 1 times" undermines the
                // reassurance the rest of the message is doing.
                const n=Number(body.retries)||0;
                const tried=n>0?` (Already retried ${n} time${n===1?"":"s"}.)`:"";
                detail=`The scorecard reader is busy right now — this happens at peak times and usually clears within a few minutes. `+
                       `Your images are still selected, so just tap Extract again in a minute.${tried}`;
                break;
              }
              case "rate_limited":
                retryable=true;
                detail="The scorecard reader has hit its usage limit for the moment. Give it a few minutes and try again — nothing is lost.";
                break;
              case "model_unavailable":
                detail="The scorecard reader is pointed at a model that's no longer available. This needs a fix in the app, not something you can work around.";
                break;
              default: {
                detail=body.error;
                // requestId first: the function no longer returns its
                // internals (raw Gemini output, the whole response object,
                // String(err)) on a public endpoint, so this short id is
                // the handle that ties what the bowler saw to the entry in
                // the function logs. Without showing it, removing the leak
                // would have left nothing diagnosable in its place.
                if(body.requestId) detail+=` (reference ${body.requestId})`;
                // Still shown when EXPOSE_UPSTREAM_ERRORS is on, which is
                // a deliberate development setting rather than the default.
                if(body.detail){
                  const extra=typeof body.detail==="string"?body.detail:JSON.stringify(body.detail);
                  detail+=` — ${extra.slice(0,400)}`;
                }
              }
            }
          }
        }catch{}
        if(retryable){
          // Keep the images and stay on setup so "try again" is one tap,
          // not a re-upload.
          setErrorIsTemporary(true);
          setError(detail);
          setStep("setup");
          return;
        }
        setErrorIsTemporary(false);
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
      // Cloud members carry displayName, not bowlerName -- reading only
      // bowlerName produced a roster of empty names, so every column
      // fell through to manual matching even when the team was known.
      const memberName=m=>(typeof m==="string"?m:(m?.displayName||m?.bowlerName||""));
      const roster=(team?.members||[]).map(m=>({
        bowler:memberName(m),
        aliases:(profiles?.[memberName(m)]?.aliases)||[],
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
      `Frames you already have will be skipped, so nothing gets double-counted. Anything new on this card still comes in. Continue?`
    ))return;

    setStep("saving");
    // Frames that already exist are SKIPPED, not appended.
    //
    // Every import minted fresh ids and appended, so re-importing a card
    // put twenty shots in local state for a ten-frame game. The database
    // rejected the second copy as a duplicate (shots_identity_uniq) and
    // the queue correctly dropped it -- so local held 20 and the cloud
    // held 10.
    //
    // The scoresheet was fine either way; it reads one shot per frame.
    // The stats were not: they aggregate every shot, so strike and spare
    // percentages double-counted the game until a fresh device synced
    // from the cloud and showed different numbers.
    //
    // Skipping rather than replacing, to match what the database does
    // with the same rows. findExistingShotSlot uses the same identity the
    // index does, COALESCEd ball_num included.
    const candidates=games.flatMap(g=>g.shots.map(s=>({...s,id:crypto.randomUUID()})));
    const newShots=[];
    let skipped=0;
    for(const s of candidates){
      // Checked against what is already saved AND what this import has
      // added so far, so a card listing the same frame twice cannot slip
      // through either.
      if(findExistingShotSlot([...shots,...newShots],s)){skipped++;continue;}
      newShots.push(s);
    }
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
      .map((c,i)=>({column:c,index:i,bowler:assignments[i]}))
      .filter(x=>x.bowler&&x.bowler!==contextBowler);
    if(teammateColumns.length&&onSubmitTeammateScores){
      await onSubmitTeammateScores(teammateColumns.map(({column,index,bowler})=>({
        bowler,
        league:contextLeague,
        date:contextDate,
        teamId,
        // The reviewed values, not the raw extraction -- anything
        // corrected on the previous screen is what gets sent.
        importedScores:(teammateScores[index]||[]).map(v=>{
          const n=Number(v);
          return v===""||!Number.isFinite(n)?null:Math.round(n);
        }),
        // Frame data rides along as a PROPOSAL. The photo contained every
        // bowler's frames all along -- convertColumn builds them for any
        // bowler -- and they used to be discarded here, so a teammate
        // could never get shot-level stats from an import even though the
        // data existed when it was scanned.
        //
        // Nothing is written to their history until they approve it, and
        // an approved shot is marked as imported rather than self-logged.
        // A card showing only totals sends no frames, which is a normal
        // case rather than a failure.
        importedShots:convertColumn(column,bowler)
          .filter(g=>!g.scoreOnly&&g.shots.length)
          .map(g=>({gameNumber:g.gameNumber,ballUsed:g.ballUsed,shots:g.shots})),
      })));
    }

    setSessionLeague(contextLeague);
    setSessionDate(contextDate);
    selectBowler(contextBowler);
    // Built in two halves: what landed for THIS bowler, and what was sent
    // to teammates. Mapping only teammates is a normal thing to do -- one
    // person imports the card for the whole team -- and the message has
    // to make sense when there's nothing of your own in it.
    const mineParts=[];
    if(newShots.length)mineParts.push(`${newShots.length} shots`);
    if(scoreOnlyGames.length)mineParts.push(`${scoreOnlyGames.length} game score${scoreOnlyGames.length>1?"s":""}`);
    const names=teammateColumns.map(t=>t.bowler);
    const sent=names.length
      ? `Sent ${names.length>1?names.slice(0,-1).join(", ")+" and "+names[names.length-1]:names[0]} their scores to confirm.`
      : "";

    setSessionSaveMessage(
      mineParts.length
        ? `Imported ${mineParts.join(" and ")}${sent?` · ${sent}`:""} -- tap "Save Session & View Summary" below to finalize.`
        : sent||"Nothing was mapped to you on this card."
    );
    setTimeout(()=>setSessionSaveMessage(null),6000);
    setView("log");
  }

  return(
    <div>
      {step==="setup"&&(
        <>
          <div style={S.card}>
            {/* What kind of bowling, then which one. Asked here rather
                than inherited from the Log tab's current mode, so any
                card can be imported from anywhere. */}
            <div style={S.label}>What are you importing?</div>
            <div style={S.chips}>
              <Chip label="Practice" selected={importKind==="practice"} onToggle={()=>setImportKind("practice")}/>
              <Chip label="League" selected={importKind==="league"} onToggle={()=>setImportKind("league")}/>
              <Chip label="Tournament" selected={importKind==="tournament"} onToggle={()=>setImportKind("tournament")}/>
            </div>

            {importKind==="league"&&(
              <>
                {/* Team, not league: every column gets mapped to a bowler
                    in the review step, and the team is the roster it's
                    mapped against. Its league comes with it. */}
                <div style={S.label}>Which team?</div>
                {teamsForImport.length===0?(
                  <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                    No teams yet — add one under a league in Vault, then import.
                  </div>
                ):(
                  <div style={S.chips}>
                    {teamsForImport.map(t=>(
                      <Chip key={t.id} label={t.name} selected={contextTeamId===t.id}
                        onToggle={()=>setContextTeamId(t.id)}/>
                    ))}
                  </div>
                )}
                {contextTeam&&(
                  <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                    {String(contextTeam.league||"").replace(" House Shot","")}
                  </div>
                )}
              </>
            )}

            {importKind==="tournament"&&(
              <>
                <div style={S.label}>Which tournament?</div>
                {(tournaments||[]).length===0?(
                  <div style={{fontSize:"12px",color:C.textMuted,marginBottom:"10px"}}>
                    No tournaments yet — start one on the Bowl tab first.
                  </div>
                ):(
                  <div style={S.chips}>
                    {(tournaments||[]).map(t=>(
                      <Chip key={t.id} label={t.name} selected={contextTournamentId===t.id}
                        onToggle={()=>setContextTournamentId(t.id)}/>
                    ))}
                  </div>
                )}
              </>
            )}

            {importKind==="practice"&&(
              <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                Filed as practice — no league or team needed.
              </div>
            )}

            {/* Always visible, whatever the kind. */}
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
                  <div key={i} style={{position:"relative"}}>
                    <img src={img.previewUrl} alt={`Scorecard ${i+1}`}
                      style={{width:"72px",height:"72px",objectFit:"cover",borderRadius:"8px",border:`1px solid ${C.border}`}}/>
                    {/* Picking the wrong photo from a camera roll is easy
                        and used to mean starting the whole selection over. */}
                    <button aria-label={`Remove scorecard ${i+1}`}
                      onClick={()=>removeImage(i)}
                      style={{position:"absolute",top:"-6px",right:"-6px",width:"22px",height:"22px",
                        borderRadius:"50%",border:`1px solid ${C.border}`,background:C.surface,
                        color:C.text,fontSize:"13px",lineHeight:"20px",padding:0,cursor:"pointer"}}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {images.length>0&&(
              <button style={{...S.btn(),width:"100%",marginBottom:"12px",fontSize:"12px",padding:"8px"}}
                onClick={()=>{images.forEach(i=>{if(i.previewUrl){try{URL.revokeObjectURL(i.previewUrl);}catch{}}});setImages([]);setError(null);}}>
                Clear all {images.length} image{images.length>1?"s":""}
              </button>
            )}
            {error&&(
              <div style={{
                fontSize:"13px",
                color:errorIsTemporary?C.spare:C.miss,
                backgroundColor:errorIsTemporary?C.spare+"11":"transparent",
                border:errorIsTemporary?`1px solid ${C.spare}44`:"none",
                borderRadius:errorIsTemporary?"8px":0,
                padding:errorIsTemporary?"10px":0,
                marginBottom:"12px",
                lineHeight:1.5,
              }}>
                {errorIsTemporary&&<div style={{fontWeight:600,marginBottom:"4px"}}>Nothing's broken — just busy</div>}
                {error}
              </div>
            )}
            {/* Set the expectation before the wait, not during it. */}
            {images.length>0&&(()=>{
              const mb=images.reduce((n,i)=>n+i.base64.length,0)/1024/1024*0.75;
              return(
                <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                  {images.length>1
                    ? `${images.length} images (${mb.toFixed(1)}MB, full quality) — reading these can take a few minutes.`
                    : `Reading a scorecard can take a minute or two. (${mb.toFixed(1)}MB, full quality.)`}
                </div>
              );
            })()}
            <button style={S.btn("primary")} disabled={!contextLeague||!images.length} onClick={handleExtract}>
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
                      {c.games.length} game{c.games.length===1?"":"s"} · {detail==="shots"?"frame tracking":detail==="scores"?"scores only":detail==="mixed"?"mixed":"no detail"}
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
            {contextTeam?.name||contextLeague.replace(" House Shot","")} · {formatDate(contextDate)} — {
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
          {/* Teammates' scores, before they're sent. Two reasons this is
              here and not silent: the uploader is the only person who saw
              the card, so they're the only one who can catch a misread;
              and sending someone's scores off with no acknowledgement
              looks like nothing happened. */}
          {teammateEntries.length>0&&(
            <div style={{...S.card,border:`1px solid ${C.spare}44`}}>
              <div style={{...S.label,color:C.spare}}>Also sending to teammates</div>
              <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
                These go to {teammateEntries.length===1?"this bowler":"these bowlers"} to confirm. They count straight away —
                confirming just marks them checked. Fix anything that was misread before sending.
              </div>
              {teammateEntries.map(({index,bowler,column})=>(
                <div key={index} style={{padding:"10px",marginBottom:"8px",backgroundColor:C.surface,borderRadius:"8px",border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"6px"}}>
                    <div style={{fontSize:"13px",fontWeight:600,color:C.text}}>{bowler}</div>
                    <div style={{fontSize:"10px",color:C.textMuted}}>read as "{column.scorecardName||"unnamed"}"</div>
                  </div>
                  <div style={{display:"flex",gap:"6px"}}>
                    {(teammateScores[index]||[]).map((v,gi)=>{
                      // A misread is flagged at the box it came from.
                      // Without an upper bound a garbled OCR value like
                      // 1.95e+127 passed review as a valid series, then
                      // got silently nulled on the receiving end -- so
                      // the teammate got a blank and nobody knew why.
                      const bad=!isValidGameScore(v);
                      return(
                        <input key={gi} style={{...S.input,flex:1,textAlign:"center",fontSize:"14px",
                          ...(bad?{borderColor:C.miss,color:C.miss}:{})}}
                          type="number" inputMode="numeric" placeholder={`G${gi+1}`}
                          value={v}
                          onChange={e=>setTeammateScores(prev=>({
                            ...prev,
                            [index]:(prev[index]||[]).map((x,j)=>j===gi?e.target.value:x),
                          }))}/>
                      );
                    })}
                  </div>
                  {(()=>{
                    const raw=teammateScores[index]||[];
                    const badIdx=invalidScoreIndexes(raw);
                    if(badIdx.length){
                      return(
                        <div style={{fontSize:"10px",color:C.miss,marginTop:"4px"}}>
                          Game{badIdx.length>1?"s":""} {badIdx.map(i=>i+1).join(", ")} couldn't be read — type the real score, or clear the box if they didn't bowl it.
                        </div>
                      );
                    }
                    const nums=raw.map(Number).filter(n=>Number.isFinite(n)&&n>0);
                    return nums.length?(
                      <div style={{fontSize:"10px",color:C.textMuted,marginTop:"4px"}}>
                        Series {nums.reduce((a,b)=>a+b,0)}
                        {column.series!=null&&column.series!==nums.reduce((a,b)=>a+b,0)&&
                          <span style={{color:C.spare}}> · card printed {column.series}</span>}
                      </div>
                    ):null;
                  })()}
                </div>
              ))}
            </div>
          )}

          {/* Blocked while any teammate score is unreadable. Flagging it
              without blocking would just be decoration: the value passes
              review, then cleanScores nulls it on arrival and the
              teammate gets a blank with no explanation. */}
          <button style={S.btn("primary")}
            disabled={step==="saving"||hasInvalidTeammateScores}
            onClick={handleSave}>
            {step==="saving"?"Saving…":hasInvalidTeammateScores?"Fix the flagged scores first":teammateEntries.length?`Save & Send To ${teammateEntries.length} Teammate${teammateEntries.length>1?"s":""}`:"Looks Good — Save"}
          </button>
          <button style={{...S.btn(),marginTop:"8px"}} onClick={()=>setStep("setup")}>Start Over</button>
        </>
      )}
    </div>
  );
}
