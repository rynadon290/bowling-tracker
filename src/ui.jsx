// Shared color palette, style helpers, and small presentational components
// used throughout the app. Pulled into its own module (rather than living
// in BowlingTracker.jsx, where they originated) specifically so that split-
// out view files (HistoryView.jsx, StatsView.jsx, etc.) can import them
// without creating a circular import — BowlingTracker.jsx imports those
// view components to render them, so those files can't in turn import
// shared utilities back from BowlingTracker.jsx itself.

import { themeFor, DEFAULT_THEME, normalizeThemeId } from "./domain/themes.js";

// C is a LIVE object, not a constant. Every component reads C.x inside
// its render, and every S style is rebuilt from C when the theme
// changes -- so switching theme is: mutate C in place, rebuild S in
// place, re-render the root. Nothing else in the app has to know a theme
// exists, and the 60-odd `${C.accent}22` alpha blends across 23 files
// keep working unchanged because C.accent is still a plain hex string.
//
// Mutating rather than reassigning matters: importers hold a reference
// to THIS object. A new object would leave every earlier import pointing
// at the old colours.
export const C = { ...themeFor(DEFAULT_THEME).colors };

// Type. Two families with clearly different jobs -- see styles.css.
export const F = {
  body: "'Archivo', system-ui, -apple-system, sans-serif",
  display: "'Archivo Expanded', 'Archivo', system-ui, sans-serif",
  // Every score, average and percentage. Condensed so a three-digit
  // series sits big on a phone without wrapping.
  num: "'Roboto Condensed', 'Archivo', system-ui, sans-serif",
};

let activeThemeId = DEFAULT_THEME;
export function currentThemeId() { return activeThemeId; }

// Applies a theme in place. Returns true when the theme actually changed
// so the caller knows whether a re-render is needed.
export function applyTheme(id) {
  const next = normalizeThemeId(id);
  if (next === activeThemeId && C.bg === themeFor(next).colors.bg) return false;
  activeThemeId = next;
  Object.assign(C, themeFor(next).colors);
  Object.assign(S, buildStyles());
  // The page body sits outside React; without this the area behind a
  // short screen keeps the previous theme's colour.
  if (typeof document !== "undefined" && document.body) {
    document.body.style.backgroundColor = C.bg;
    // styles.css reads this for :focus-visible rings, which inline
    // styles can't express.
    document.documentElement.style.setProperty("--ba-accent", C.accent);
    // The browser chrome -- mobile address bar, task-switcher preview --
    // should match whichever theme is active, not the static default
    // baked into index.html for the moment before React mounts.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
  }
  return true;
}

export const S = {};
function buildStyles() { return {
  app:{minHeight:"100vh",backgroundColor:C.bg,color:C.text,fontFamily:F.body,fontSize:"14px",lineHeight:1.45},
  header:{backgroundColor:C.bg,padding:"14px 16px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100},
  // The wordmark. Weight and width carry it, not uppercase tracking --
  // ALL-CAPS-with-letterspacing was the single loudest "generated
  // dashboard" signal in the old header.
  title:{fontSize:"17px",fontWeight:700,fontFamily:F.display,letterSpacing:"-0.01em",color:C.text},
  // Five tabs, not four. Tighter gap and horizontal padding, plus
  // flexShrink:0 on the buttons so labels never wrap mid-word if a
  // narrow phone still runs short.
  nav:{display:"flex",gap:"2px",flexShrink:0},
  // Active tab is an underline in the accent, not a filled pill. A
  // filled pill competes with every button on the page for "the thing
  // to press"; an underline just says where you are.
  navBtn:(a)=>({padding:"8px 10px 9px",whiteSpace:"nowrap",flexShrink:0,border:"none",borderBottom:`2px solid ${a?C.accent:"transparent"}`,borderRadius:0,cursor:"pointer",fontSize:"13px",fontWeight:a?600:500,backgroundColor:"transparent",color:a?C.text:C.textMuted,fontFamily:F.body}),
  // Bottom padding clears the fixed nav (and the iOS home indicator via
  // safe-area). Without it the last card on every screen sits underneath
  // the tab bar and can't be reached.
  content:{padding:"16px",paddingBottom:"calc(84px + env(safe-area-inset-bottom, 0px))",maxWidth:"480px",margin:"0 auto"},
  // No hairline border. On a dark ground the card tone already separates
  // it; a border on every card is what made every screen read at the same
  // volume, because nothing was allowed to be quieter than anything else.
  card:{backgroundColor:C.card,borderRadius:"14px",padding:"16px",marginBottom:"12px"},
  // Section headings. Sentence case, normal tracking, readable size.
  // This one definition was 172 all-caps tracked-out eyebrows across the
  // app -- the visual language of a spreadsheet column header, and the
  // thing most responsible for it feeling like accounting software.
  label:{fontSize:"13px",fontWeight:600,letterSpacing:"0",textTransform:"none",color:C.text,marginBottom:"8px"},
  chips:{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"12px"},
  chip:(sel,col)=>({padding:"7px 13px",borderRadius:"20px",border:`1px solid ${sel?(col||C.accent):C.border}`,backgroundColor:sel?(col?col+"22":C.accentDim):C.surface,color:sel?(col||C.accent):C.textMuted,cursor:"pointer",fontSize:"13px",fontWeight:sel?600:500,fontFamily:F.body,WebkitTapHighlightColor:"transparent"}),
  row:{display:"flex",gap:"8px",marginBottom:"8px"},
  input:{width:"100%",backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"11px 12px",color:C.text,fontSize:"15px",fontFamily:F.body,boxSizing:"border-box",outline:"none"},
  sel:{flex:1,backgroundColor:C.surface,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"11px 12px",color:C.text,fontSize:"15px",fontFamily:F.body,outline:"none",appearance:"none"},
  btn:(v)=>({padding:"13px 20px",borderRadius:"12px",border:"none",cursor:"pointer",fontSize:"15px",fontWeight:600,fontFamily:F.body,WebkitTapHighlightColor:"transparent",...(v==="primary"?{backgroundColor:C.accent,color:C.onAccent,width:"100%"}:v==="sm"?{backgroundColor:C.surface,color:C.text,padding:"8px 14px",fontSize:"18px"}:v==="warn"?{backgroundColor:C.miss+"1A",color:C.miss,width:"100%"}:{backgroundColor:C.surface,color:C.text})}),
  divider:{height:"1px",backgroundColor:C.border,margin:"12px 0"},
  shotCard:{backgroundColor:C.card,borderRadius:"12px",padding:"12px",marginBottom:"8px",display:"flex",gap:"12px",alignItems:"flex-start"},
  dot:(r)=>({width:"32px",height:"32px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:700,flexShrink:0,backgroundColor:r==="Strike"?C.strike+"22":r?.includes("10")?C.miss+"22":C.spare+"22",color:r==="Strike"?C.strike:r?.includes("10")?C.miss:C.spare}),
  tag:(c)=>({display:"inline-block",padding:"3px 9px",borderRadius:"10px",fontSize:"12px",fontWeight:500,backgroundColor:(c||C.accent)+"22",color:c||C.accent,marginRight:"4px",marginBottom:"4px"}),
  statBox:{backgroundColor:C.surface,borderRadius:"12px",padding:"12px 10px",textAlign:"center",flex:1},
  // Numbers are the point. Condensed, big, in the text colour -- accent
  // is reserved for the one number on a screen that matters most, not
  // sprayed across every stat so that none of them stands out.
  statNum:{fontSize:"28px",fontWeight:700,fontFamily:F.num,fontVariantNumeric:"tabular-nums",color:C.text,lineHeight:1,marginBottom:"5px",letterSpacing:"-0.01em"},
  statLbl:{fontSize:"12px",color:C.textMuted,textTransform:"none",letterSpacing:"0"},
}; }
Object.assign(S, buildStyles());

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

export function CollapsibleCard({title,summary,expanded,onToggle,children,cardStyle}){
  return (
    <div style={cardStyle||S.card}>
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

// ── Stat card layout ────────────────────────────────────────────────────
//
// Every Stats card was a row of identical boxes -- 46 of them across the
// screen -- which gave the eye nowhere to land and made no number more
// important than any other. These two components express the shape the
// cards actually want: one figure that leads, then supporting rows.
//
// Built as components rather than hand-editing each card because there
// are ~20 of them; doing it by hand is how you end up with nineteen
// slightly different paddings and one card that throws because someone
// forgot an import.

// The headline figure of a card, plus optional context line and badge.
export function StatLead({ value, unit = "", caption, detail, badge, color }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "2px" }}>
        <div className="num" style={{ fontSize: "44px", fontWeight: 700, fontFamily: F.num, lineHeight: 0.9, color: color || C.text }}>
          {value}{unit}
        </div>
        {caption && <span style={{ fontSize: "13px", color: C.textMuted }}>{caption}</span>}
      </div>
      {badge}
      {detail && (
        <div style={{ fontSize: "12.5px", color: C.textMuted, margin: "6px 0 10px", lineHeight: 1.5 }}>{detail}</div>
      )}
    </>
  );
}

// A supporting row. `fill` (0-100) draws a proportional bar, which lets
// the eye compare before it reads.
export function StatRow({ label, value, sub, fill = null, color, badge, last = false }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 0", fontSize: "13.5px",
                    borderBottom: last ? "none" : `1px solid ${C.border}` }}>
        <span>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {fill != null && (
            <div style={{ height: "5px", width: "64px", background: C.border, borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, fill))}%`, background: color || C.accent, borderRadius: "3px" }} />
            </div>
          )}
          <b className="num" style={{ fontFamily: F.num, fontSize: "16px", color: color || C.text }}>{value}</b>
          {sub && <span style={{ fontSize: "12px", color: C.textMuted }}>{sub}</span>}
        </div>
      </div>
      {badge}
    </>
  );
}

// The divider between the lead figure and its supporting rows.
export function StatRows({ children }) {
  return <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>{children}</div>;
}
