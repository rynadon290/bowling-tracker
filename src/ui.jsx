// Shared color palette, style helpers, and small presentational components
// used throughout the app. Pulled into its own module (rather than living
// in BowlingTracker.jsx, where they originated) specifically so that split-
// out view files (HistoryView.jsx, StatsView.jsx, etc.) can import them
// without creating a circular import — BowlingTracker.jsx imports those
// view components to render them, so those files can't in turn import
// shared utilities back from BowlingTracker.jsx itself.

export const C = {
  bg:"#0f1117",surface:"#1a1d27",card:"#22263a",
  accent:"#4a9eff",accentDim:"#1e3a5f",
  strike:"#22c55e",spare:"#f59e0b",miss:"#ef4444",
  text:"#e8eaf0",textMuted:"#8892a4",border:"#2e3347",
};

export const S = {
  app:{minHeight:"100vh",backgroundColor:C.bg,color:C.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:"14px"},
  header:{backgroundColor:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100},
  title:{fontSize:"16px",fontWeight:700,letterSpacing:"0.05em",color:C.accent,textTransform:"uppercase"},
  nav:{display:"flex",gap:"4px"},
  navBtn:(a)=>({padding:"6px 12px",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:600,backgroundColor:a?C.accent:"transparent",color:a?"#fff":C.textMuted}),
  content:{padding:"16px",maxWidth:"480px",margin:"0 auto"},
  card:{backgroundColor:C.card,borderRadius:"12px",padding:"16px",marginBottom:"12px",border:`1px solid ${C.border}`},
  label:{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textMuted,marginBottom:"8px"},
  chips:{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"12px"},
  chip:(sel,col)=>({padding:"6px 12px",borderRadius:"20px",border:`1px solid ${sel?(col||C.accent):C.border}`,backgroundColor:sel?(col?col+"22":C.accentDim):"transparent",color:sel?(col||C.accent):C.textMuted,cursor:"pointer",fontSize:"12px",fontWeight:sel?600:400,WebkitTapHighlightColor:"transparent"}),
  row:{display:"flex",gap:"8px",marginBottom:"8px"},
  input:{width:"100%",backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",color:C.text,fontSize:"14px",boxSizing:"border-box",outline:"none"},
  sel:{flex:1,backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",color:C.text,fontSize:"14px",outline:"none",appearance:"none"},
  btn:(v)=>({padding:"12px 20px",borderRadius:"10px",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:700,WebkitTapHighlightColor:"transparent",...(v==="primary"?{backgroundColor:C.accent,color:"#fff",width:"100%"}:v==="sm"?{backgroundColor:C.surface,color:C.textMuted,border:`1px solid ${C.border}`,padding:"8px 14px",fontSize:"18px"}:v==="warn"?{backgroundColor:"#ef444422",color:"#ef4444",border:`1px solid #ef444444`,width:"100%"}:{backgroundColor:C.surface,color:C.textMuted,border:`1px solid ${C.border}`})}),
  divider:{height:"1px",backgroundColor:C.border,margin:"12px 0"},
  shotCard:{backgroundColor:C.card,borderRadius:"10px",padding:"12px",marginBottom:"8px",border:`1px solid ${C.border}`,display:"flex",gap:"12px",alignItems:"flex-start"},
  dot:(r)=>({width:"32px",height:"32px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,flexShrink:0,backgroundColor:r==="Strike"?C.strike+"22":r?.includes("10")?C.miss+"22":C.spare+"22",color:r==="Strike"?C.strike:r?.includes("10")?C.miss:C.spare}),
  tag:(c)=>({display:"inline-block",padding:"2px 8px",borderRadius:"10px",fontSize:"11px",backgroundColor:(c||C.accent)+"22",color:c||C.accent,marginRight:"4px",marginBottom:"4px"}),
  statBox:{backgroundColor:C.surface,borderRadius:"10px",padding:"12px",textAlign:"center",flex:1,border:`1px solid ${C.border}`},
  statNum:{fontSize:"24px",fontWeight:700,color:C.accent,lineHeight:1,marginBottom:"4px"},
  statLbl:{fontSize:"10px",color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"},
};

export function Chip({label,selected,onToggle,color,dense}){
  const style=dense?{...S.chip(selected,color),padding:"5px 9px"}:S.chip(selected,color);
  return <button style={style} onClick={onToggle}>{label}</button>;
}

// Renders the ten pins in their actual rack positions — back row (7-10) at
// top, headpin (1) at bottom — so tapping matches where the pin physically
// stood, rather than a linear row of numbered chips a bowler has to
// translate from memory.
export function PinDeck({selected,onToggle}){
  const rows=[
    [{n:"7",x:14},{n:"8",x:38},{n:"9",x:62},{n:"10",x:86}],
    [{n:"4",x:26},{n:"5",x:50},{n:"6",x:74}],
    [{n:"2",x:38},{n:"3",x:62}],
    [{n:"1",x:50}],
  ];
  const pinSize=52,rowGap=58,topPad=8;
  return (
    <div style={{position:"relative",height:`${topPad*2+rowGap*3+pinSize}px`,margin:"12px 0"}}>
      {rows.map((row,rowIdx)=>row.map(pin=>{
        const isSelected=Array.isArray(selected)&&selected.includes(pin.n);
        return (
          <button key={pin.n} onClick={()=>onToggle(pin.n)}
            style={{
              position:"absolute",left:`${pin.x}%`,top:`${rowIdx*rowGap+topPad}px`,
              transform:"translateX(-50%)",width:`${pinSize}px`,height:`${pinSize}px`,
              borderRadius:"50%",border:`2px solid ${isSelected?C.spare:C.border}`,
              backgroundColor:isSelected?C.spare+"33":C.surface,color:isSelected?C.spare:C.textMuted,
              fontSize:"16px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",
              WebkitTapHighlightColor:"transparent",cursor:"pointer",
            }}>{pin.n}</button>
        );
      }))}
    </div>
  );
}

export function CollapsibleCard({title,summary,expanded,onToggle,children}){
  return (
    <div style={S.card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",WebkitTapHighlightColor:"transparent"}} onClick={onToggle}>
        <div style={{...S.label,marginBottom:0}}>
          {title}
          {summary&&<span style={{color:C.textMuted,fontWeight:400,textTransform:"none",letterSpacing:"normal"}}> · {summary}</span>}
        </div>
        <span style={{color:C.textMuted,fontSize:"12px",transform:expanded?"rotate(180deg)":"none",transition:"transform 0.15s",flexShrink:0,marginLeft:"8px"}}>▾</span>
      </div>
      {expanded&&<div style={{marginTop:"12px"}}>{children}</div>}
    </div>
  );
}

export function CompareBadge({value,teamValue,lowerIsBetter,label}){
  if(value==null||teamValue==null||isNaN(value)||isNaN(teamValue))return null;
  const who=label||"team";
  const diff=Math.round(value-teamValue);
  if(diff===0)return <div style={{fontSize:"10px",color:C.textMuted,marginTop:"2px"}}>≈ {who}</div>;
  const better=lowerIsBetter?diff<0:diff>0;
  return (
    <div style={{fontSize:"10px",color:better?C.strike:C.miss,marginTop:"2px",fontWeight:600}}>
      {diff>0?"▲":"▼"} {Math.abs(diff)} vs {who}
    </div>
  );
}

export function resultSym(r){
  if(r==="Strike")return"X";
  if(r==="Weak 10")return"W";
  if(r==="Ringing 10")return"R";
  return"L";
}
