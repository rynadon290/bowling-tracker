import { C } from "./ui.jsx";

// Full-size renderings of real screens, with the relevant part lit up.
//
// Drawn rather than spotlighting the live app: highlighting a real
// element means measuring its position at runtime, which breaks on any
// layout change and fails outright when the thing being described isn't
// on screen -- you can't point at a Vault card from the Bowl tab.
//
// Drawing also lets a step show a screen a NEW bowler could never
// produce: a scoresheet mid-game, a spare being entered, money games with
// pots already chosen. That's the point -- they need to see what it will
// look like, not what their empty app looks like now.

const W = 320;
const H = 470;

const t = {
  h1: { fontSize: 13, fontWeight: 700, fill: C.text },
  label: { fontSize: 8.5, fill: C.textMuted, fontWeight: 700, letterSpacing: 0.5 },
  body: { fontSize: 10, fill: C.textMuted },
  chip: { fontSize: 10, fontWeight: 600 },
};

// The lit region. Two rings so it reads as a spotlight rather than just
// another selected control.
function Spot({ x, y, w, h, r = 8 }) {
  return (
    <>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={r + 3}
        fill="none" stroke={C.accent} strokeWidth="1" opacity="0.35" />
      <rect x={x} y={y} width={w} height={h} rx={r}
        fill={C.accent} fillOpacity="0.13" stroke={C.accent} strokeWidth="2" />
    </>
  );
}

// A pointing arrow with a short caption, for "tap this".
function Arrow({ x, y, dir = "up", text: label }) {
  const path = dir === "up"
    ? `M${x},${y} l-5,7 h10 z`
    : `M${x},${y} l-5,-7 h10 z`;
  return (
    <>
      <path d={path} fill={C.accent} />
      {label && (
        <text x={x} y={dir === "up" ? y + 19 : y - 12} textAnchor="middle"
          fontSize="9.5" fontWeight="700" fill={C.accent}>{label}</text>
      )}
    </>
  );
}

function Chip({ x, y, w = 62, h = 22, label, on, tone }) {
  const col = tone || (on ? C.accent : C.border);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="11"
        fill={on ? col + "22" : "transparent"} stroke={col} strokeWidth={on ? 1.6 : 1} />
      <text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle"
        style={t.chip} fill={on ? col : C.textMuted}>{label}</text>
    </>
  );
}

function Card({ x = 10, y, w = W - 20, h, title }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="10"
        fill={C.card} stroke={C.border} strokeWidth="1" />
      {title && <text x={x + 12} y={y + 17} style={t.label}>{title}</text>}
    </>
  );
}

function Line({ x = 22, y, w = 160, h = 7, c }) {
  return <rect x={x} y={y} width={w} height={h} rx="3" fill={c || C.border} />;
}

function Header({ title, lit }) {
  return (
    <>
      <rect x="0" y="0" width={W} height="34" fill={C.surface} />
      <line x1="0" y1="34" x2={W} y2="34" stroke={C.border} strokeWidth="1" />
      <text x="14" y="22" style={t.h1}>{title}</text>
      <text x={W - 78} y="22" fontSize="13">🔍</text>
      <text x={W - 56} y="22" fontSize="13">📷</text>
      <text x={W - 34} y="22" fontSize="13">👤</text>
      {lit === "import" && <Spot x={W - 62} y="7" w="22" h="20" r="6" />}
      {lit === "help" && <Spot x={W - 84} y="7" w="22" h="20" r="6" />}
    </>
  );
}

function Nav({ active }) {
  const tabs = [["🎳", "Bowl"], ["📖", "History"], ["📈", "Stats"], ["🎯", "Improve"], ["🔒", "Vault"]];
  const w = W / 5;
  return (
    <>
      <rect x="0" y={H - 46} width={W} height="46" fill={C.surface} />
      <line x1="0" y1={H - 46} x2={W} y2={H - 46} stroke={C.border} strokeWidth="1" />
      {tabs.map(([icon, name], i) => (
        <g key={name}>
          <text x={i * w + w / 2} y={H - 26} textAnchor="middle" fontSize="15">{icon}</text>
          <text x={i * w + w / 2} y={H - 11} textAnchor="middle" fontSize="8"
            fill={active === i ? C.accent : C.textMuted} fontWeight={active === i ? 700 : 400}>{name}</text>
        </g>
      ))}
      {active != null && <Spot x={active * w + 6} y={H - 42} w={w - 12} h="38" r="8" />}
    </>
  );
}

// Ten frames with a game in progress.
function Scoresheet({ y, spot }) {
  const marks = [["X"], ["X"], ["9", "/"], ["8", "-"], [], [], [], [], [], []];
  const totals = ["29", "49", "67", "75", "", "", "", "", "", ""];
  const fw = (W - 28) / 10;
  return (
    <>
      {marks.map((mk, i) => (
        <g key={i}>
          <rect x={14 + i * fw} y={y} width={fw - 1.5} height="34" rx="3"
            fill="none" stroke={C.border} strokeWidth="0.8" />
          <text x={14 + i * fw + 3} y={y + 8} fontSize="6" fill={C.textMuted}>{i + 1}</text>
          {mk.map((m, j) => (
            <text key={j} x={14 + i * fw + fw / 2 - 5 + j * 10} y={y + 19}
              textAnchor="middle" fontSize="9" fontWeight="700"
              fill={m === "X" || m === "/" ? C.strike : C.text}>{m}</text>
          ))}
          <text x={14 + i * fw + fw / 2} y={y + 30} textAnchor="middle"
            fontSize="8" fontWeight="700" fill={C.text}>{totals[i]}</text>
        </g>
      ))}
      {spot && <Spot x="11" y={y - 3} w={W - 22} h="40" r="6" />}
    </>
  );
}

// The Result card, in whichever state a scoring lesson needs.
function ResultCard({ y, stage }) {
  const strike = stage === "strike";
  const leave = stage === "spare" || stage === "miss";
  return (
    <>
      <Card y={y} h={leave ? 176 : 74} title="RESULT" />
      <Chip x="22" y={y + 26} label="Strike" on={strike} tone={C.strike} />
      <Chip x="90" y={y + 26} w="60" label="Weak 10" on={false} />
      <Chip x="156" y={y + 26} w="66" label="Ringing 10" on={false} />
      <Chip x="22" y={y + 54} w="86" label="Other Leave" on={leave} tone={C.spare} />

      {strike && <Spot x="18" y={y + 22} w="70" h="30" r="15" />}
      {leave && <Spot x="18" y={y + 50} w="94" h="30" r="15" />}

      {leave && (
        <>
          <text x="22" y={y + 100} style={t.label}>PINS STANDING</text>
          {[3, 10].map((pin, i) => (
            <Chip key={pin} x={22 + i * 34} y={y + 108} w="28" h="22" label={String(pin)} on tone={C.spare} />
          ))}
          <text x="98" y={y + 123} style={t.body}>← tap what's left</text>

          <text x="22" y={y + 150} style={t.label}>SPARE MADE?</text>
          <Chip x="118" y={y + 138} w="42" h="20" label="Yes" on={stage === "spare"} tone={C.strike} />
          <Chip x="166" y={y + 138} w="42" h="20" label="No" on={stage === "miss"} tone={C.miss} />
          <Spot x={stage === "spare" ? 114 : 162} y={y + 134} w="50" h="28" r="14" />
        </>
      )}
    </>
  );
}

const SCREENS = {
  bowl: () => (
    <>
      <Header title="Bowl" />
      <Card y="46" h="96" title="TONIGHT'S SESSION" />
      <Chip x="22" y="70" label="Tuesday" on />
      <Chip x="90" y="70" label="Thursday" />
      <rect x="22" y="102" width="120" height="24" rx="6" fill={C.surface} stroke={C.border} />
      <text x="30" y="118" style={t.body}>Tue 15 Sep</text>
      <Spot x="11" y="47" w={W - 22} h="94" />
      <Arrow x="160" y="146" dir="up" text="Start here" />
      <Nav active={0} />
    </>
  ),

  tracking: () => (
    <>
      <Header title="Bowl" />
      <Card y="46" h="104" title="HOW MUCH DETAIL?" />
      <rect x="22" y="70" width={W - 44} height="32" rx="8" fill={C.accent + "18"} stroke={C.accent} strokeWidth="1.6" />
      <text x="34" y="90" fontSize="11" fontWeight="700" fill={C.accent}>Shot by shot</text>
      <text x="140" y="90" style={t.body}>every ball</text>
      <rect x="22" y="108" width={W - 44} height="32" rx="8" fill="none" stroke={C.border} />
      <text x="34" y="128" fontSize="11" fontWeight="600" fill={C.textMuted}>Scores only</text>
      <text x="140" y="128" style={t.body}>3 numbers</text>
      <text x="22" y="170" style={t.body}>Switch any time — even mid-game.</text>
      <Nav active={0} />
    </>
  ),

  scoresheet: () => (
    <>
      <Header title="Bowl" />
      <Card y="46" h="34" title="" />
      <text x="22" y="68" style={t.body}>Game 1 · Frame 5 · Lane 8</text>
      <Scoresheet y="94" spot />
      <Arrow x="60" y="140" dir="up" text="Tap a frame to fix it" />
      <Card y="176" h="60" title="RESULT" />
      <Chip x="22" y="200" label="Strike" tone={C.strike} />
      <Chip x="90" y="200" w="86" label="Other Leave" />
      <Nav active={0} />
    </>
  ),

  "score-strike": () => (
    <>
      <Header title="Bowl" />
      <Scoresheet y="46" />
      <ResultCard y="96" stage="strike" />
      <Arrow x="53" y="176" dir="up" text="One tap. Done." />
      <Nav active={0} />
    </>
  ),

  "score-spare": () => (
    <>
      <Header title="Bowl" />
      <Scoresheet y="46" />
      <ResultCard y="96" stage="spare" />
      <text x="22" y="300" style={t.body}>First ball worked out from the pins left.</text>
      <Nav active={0} />
    </>
  ),

  "score-miss": () => (
    <>
      <Header title="Bowl" />
      <Scoresheet y="46" />
      <ResultCard y="96" stage="miss" />
      <text x="22" y="300" style={t.label}>TOTAL PINS THIS FRAME</text>
      <rect x="22" y="308" width="80" height="30" rx="8" fill={C.surface} stroke={C.accent} strokeWidth="1.6" />
      <text x="62" y="328" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>9</text>
      <Spot x="18" y="304" w="88" h="38" />
      <text x="118" y="328" style={t.body}>both balls added</text>
      <Nav active={0} />
    </>
  ),

  import: () => (
    <>
      <Header title="Bowl" lit="import" />
      <Arrow x={W - 51} y="40" dir="down" text="" />
      <text x={W - 51} y="60" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={C.accent}>Import</text>
      <Card y="76" h="70" title="WHAT ARE YOU IMPORTING?" />
      <Chip x="22" y="100" label="Practice" />
      <Chip x="90" y="100" label="League" on />
      <Chip x="158" y="100" w="76" label="Tournament" />
      <text x="22" y="164" style={t.body}>Photograph the monitor — it reads</text>
      <text x="22" y="180" style={t.body}>every bowler's games and frames.</text>
      <Nav active={0} />
    </>
  ),

  history: () => (
    <>
      <Header title="History" />
      <Card y="46" h="44" title="" />
      <Chip x="22" y="58" label="Sessions" on />
      <Chip x="90" y="58" label="Shots" />
      <Card y="100" h="52" title="" />
      <text x="22" y="122" fontSize="11" fontWeight="700" fill={C.text}>Tue 15 Sep · 612</text>
      <Line y="132" w="140" />
      <Card y="162" h="52" title="" />
      <text x="22" y="184" fontSize="11" fontWeight="700" fill={C.text}>Tue 8 Sep · 587</text>
      <Line y="194" w="120" />
      <Nav active={1} />
    </>
  ),

  stats: () => (
    <>
      <Header title="Stats" />
      <Card y="46" h="60" title="VIEWING" />
      <rect x="22" y="68" width={W - 44} height="26" rx="6" fill={C.surface} stroke={C.accent} strokeWidth="1.6" />
      <text x="32" y="85" fontSize="10" fill={C.text}>You · Friends · Teams ▾</text>
      <Spot x="18" y="64" w={W - 36} h="34" r="8" />
      <Card y="120" h="110" title="AVERAGE" />
      {[44, 58, 50, 68, 62, 74].map((h, i) => (
        <rect key={i} x={26 + i * 46} y={216 - h} width="30" height={h} rx="3"
          fill={C.accent} fillOpacity="0.55" />
      ))}
      <Nav active={2} />
    </>
  ),

  improve: () => (
    <>
      <Header title="Improve" />
      <Card y="46" h="74" title="GOALS" />
      <text x="22" y="80" fontSize="11" fill={C.text}>Spare conversion</text>
      <rect x="22" y="90" width={W - 44} height="8" rx="4" fill={C.border} />
      <rect x="22" y="90" width={(W - 44) * 0.72} height="8" rx="4" fill={C.strike} />
      <text x={W - 40} y="82" fontSize="10" fontWeight="700" fill={C.strike}>72%</text>
      <Spot x="11" y="47" w={W - 22} h="72" />
      <Card y="134" h="56" title="DRILLS" />
      <Chip x="22" y="158" w="90" label="Start a drill" on />
      <Nav active={3} />
    </>
  ),

  vault: () => (
    <>
      <Header title="Vault" />
      <Card y="46" h="106" title="LEAGUES" />
      <text x="22" y="80" fontSize="11" fontWeight="600" fill={C.text}>Tuesday House Shot</text>
      <text x="22" y="96" style={t.body}>Sunset Lanes · 1 team</text>
      <rect x="22" y="108" width={W - 44} height="26" rx="6" fill={C.surface} stroke={C.border} />
      <text x="32" y="125" style={t.body}>Add a team to this league</text>
      <Spot x="18" y="104" w={W - 36} h="34" r="8" />
      <Arrow x="160" y="146" dir="up" text="Teams live under their league" />
      <Nav active={4} />
    </>
  ),

  money: () => (
    <>
      <Header title="Bowl" />
      <Card y="46" h="150" title="MONEY GAMES TONIGHT" />
      <text x="22" y="72" style={t.body}>Tap the ones you're in.</text>
      {[["Quarter game", true, "0.25"], ["Dollar game", true, "1.00"], ["High game", false, "2.00"]]
        .map(([name, on, amt], i) => (
          <g key={name}>
            <rect x="22" y={84 + i * 34} width="180" height="26" rx="8"
              fill={on ? C.strike + "12" : "transparent"}
              stroke={on ? C.strike : C.border} strokeWidth={on ? 1.5 : 1} />
            <text x="32" y={101 + i * 34} fontSize="10" fill={on ? C.text : C.textMuted}>
              {on ? "✓ " : ""}{name}
            </text>
            <rect x="212" y={84 + i * 34} width="60" height="26" rx="6" fill={C.surface} stroke={C.border} />
            <text x="242" y={101 + i * 34} textAnchor="middle" fontSize="10" fill={C.text}>${amt}</text>
          </g>
        ))}
      <text x="22" y="212" style={t.body}>Buy-ins saved per league — enter once.</text>
      <Nav active={0} />
    </>
  ),
};

export default function TourScreen({ stepId }) {
  const Screen = SCREENS[stepId];
  if (!Screen) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: "320px", display: "block", margin: "0 auto" }}
      role="img" aria-label={`Illustration of the ${stepId} screen`}>
      <rect x="0" y="0" width={W} height={H} fill={C.bg} />
      <Screen />
    </svg>
  );
}
