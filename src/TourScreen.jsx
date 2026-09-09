import { C } from "./ui.jsx";

// Pre-rendered mock-ups of each screen, with the relevant area lit up.
//
// Drawn rather than spotlighting the live app on purpose. Highlighting a
// real element means measuring its position at runtime, which breaks
// whenever the layout shifts, and fails outright when the thing being
// described isn't on screen yet — the Vault step can't point at a Vault
// card while the bowler is looking at Bowl.
//
// A drawn phone always shows the right thing in the right place, and it
// can show a FULL screen — a scoresheet mid-game, money games with pots
// selected — that a new bowler with no data would never see live.

const W = 150;   // mock phone width
const H = 250;

// One tinted, outlined region: the "spotlight".
function Spot({ x, y, w, h, label }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill={C.accent} fillOpacity="0.18"
        stroke={C.accent} strokeWidth="1.5" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle"
          fontSize="7" fill={C.accent} fontWeight="700">{label}</text>
      )}
    </g>
  );
}

// A dimmed placeholder row — the parts of the screen NOT being discussed.
function Row({ x, y, w, h = 8 }) {
  return <rect x={x} y={y} width={w} height={h} rx="2" fill={C.border} />;
}

// The five-tab bar, with one tab optionally lit.
function NavBar({ active }) {
  const tabs = ["🎳", "📖", "📈", "🎯", "🔒"];
  const tabW = W / 5;
  return (
    <g>
      <rect x="0" y={H - 26} width={W} height="26" fill={C.surface} />
      <line x1="0" y1={H - 26} x2={W} y2={H - 26} stroke={C.border} strokeWidth="1" />
      {tabs.map((t, i) => (
        <g key={i}>
          {active === i && (
            <rect x={i * tabW + 2} y={H - 24} width={tabW - 4} height="22" rx="4"
              fill={C.accent} fillOpacity="0.2" stroke={C.accent} strokeWidth="1.5" />
          )}
          <text x={i * tabW + tabW / 2} y={H - 9} textAnchor="middle" fontSize="11">{t}</text>
        </g>
      ))}
    </g>
  );
}

// The header strip, with an optional lit icon.
function Header({ title, litIcon }) {
  return (
    <g>
      <rect x="0" y="0" width={W} height="20" fill={C.surface} />
      <line x1="0" y1="20" x2={W} y2="20" stroke={C.border} strokeWidth="1" />
      <text x="6" y="14" fontSize="8" fill={C.text} fontWeight="700">{title}</text>
      {litIcon && (
        <>
          <rect x={W - 44} y="3" width="30" height="14" rx="4"
            fill={C.accent} fillOpacity="0.25" stroke={C.accent} strokeWidth="1.5" />
          <text x={W - 29} y="13" textAnchor="middle" fontSize="7" fill={C.accent} fontWeight="700">
            {litIcon}
          </text>
        </>
      )}
    </g>
  );
}

// A scoresheet strip: ten frames, some filled.
function Frames({ y }) {
  const n = 10, fw = (W - 12) / n;
  const marks = ["X", "X", "9/", "8-", "", "", "", "", "", ""];
  const totals = ["29", "49", "67", "75", "", "", "", "", "", ""];
  return (
    <g>
      {marks.map((mk, i) => (
        <g key={i}>
          <rect x={6 + i * fw} y={y} width={fw - 1} height="22" rx="2"
            fill="none" stroke={C.border} strokeWidth="0.7" />
          <text x={6 + i * fw + fw / 2} y={y + 9} textAnchor="middle" fontSize="6"
            fill={mk === "X" || mk.includes("/") ? C.strike : C.text}>{mk}</text>
          <text x={6 + i * fw + fw / 2} y={y + 19} textAnchor="middle" fontSize="6"
            fill={C.text} fontWeight="700">{totals[i]}</text>
        </g>
      ))}
    </g>
  );
}

// One mock-up per tour step id.
const SCREENS = {
  bowl: () => (
    <>
      <Header title="Bowl" />
      <Spot x="6" y="26" w={W - 12} h="34" label="Tonight's session" />
      <Row x="6" y="68" w={W - 12} />
      <Row x="6" y="82" w={W - 12} />
      <Row x="6" y="96" w={W - 40} />
      <NavBar active={0} />
    </>
  ),

  tracking: () => (
    <>
      <Header title="Bowl" />
      <Row x="6" y="26" w={W - 12} />
      <Spot x="6" y="42" w={(W - 16) / 2} h="26" label="Shot by shot" />
      <Spot x={W / 2 + 2} y="42" w={(W - 16) / 2} h="26" label="Scores only" />
      <Row x="6" y="78" w={W - 12} />
      <Row x="6" y="92" w={W - 40} />
      <NavBar active={0} />
    </>
  ),

  scoresheet: () => (
    <>
      <Header title="Bowl" />
      <Row x="6" y="26" w={W - 12} />
      <Frames y="42" />
      <Spot x="4" y="40" w={W - 8} h="26" />
      <Row x="6" y="76" w={W - 12} />
      <Row x="6" y="90" w={W - 40} />
      <NavBar active={0} />
    </>
  ),

  import: () => (
    <>
      <Header title="Bowl" litIcon="📷" />
      <Row x="6" y="30" w={W - 12} />
      <Row x="6" y="44" w={W - 12} />
      <Row x="6" y="58" w={W - 40} />
      <NavBar active={0} />
    </>
  ),

  history: () => (
    <>
      <Header title="History" />
      <Spot x="6" y="26" w={W - 12} h="20" label="Sessions · Shots" />
      <Row x="6" y="54" w={W - 12} />
      <Row x="6" y="68" w={W - 12} />
      <Row x="6" y="82" w={W - 30} />
      <NavBar active={1} />
    </>
  ),

  stats: () => (
    <>
      <Header title="Stats" />
      <Spot x="6" y="26" w={W - 12} h="24" label="Viewing / Compare" />
      {/* A little bar chart, so Stats looks like stats. */}
      {[14, 22, 18, 28, 24].map((h, i) => (
        <rect key={i} x={12 + i * 26} y={100 - h} width="16" height={h} rx="2" fill={C.accent} fillOpacity="0.5" />
      ))}
      <Row x="6" y="112" w={W - 12} />
      <NavBar active={2} />
    </>
  ),

  improve: () => (
    <>
      <Header title="Improve" />
      <Spot x="6" y="26" w={W - 12} h="26" label="Goals" />
      <Spot x="6" y="58" w={W - 12} h="26" label="Drills" />
      <Row x="6" y="92" w={W - 12} />
      <NavBar active={3} />
    </>
  ),

  vault: () => (
    <>
      <Header title="Vault" />
      <Spot x="6" y="26" w={W - 12} h="24" label="Leagues" />
      <Spot x="6" y="56" w={W - 12} h="24" label="Teams" />
      <Row x="6" y="88" w={W - 12} />
      <Row x="6" y="102" w={W - 40} />
      <NavBar active={4} />
    </>
  ),

  money: () => (
    <>
      <Header title="Bowl" />
      <Row x="6" y="26" w={W - 12} />
      <Spot x="6" y="42" w={W - 12} h="14" label="✓ Quarter game" />
      <Spot x="6" y="60" w={W - 12} h="14" label="Dollar game" />
      <Row x="6" y="82" w={W - 50} />
      <NavBar active={0} />
    </>
  ),
};

export default function TourScreen({ stepId }) {
  const Screen = SCREENS[stepId];
  if (!Screen) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="120" height="200"
      role="img" aria-label={`Illustration of the ${stepId} screen`}
      style={{ display: "block", borderRadius: "10px", border: `1px solid ${C.border}`, background: C.bg }}>
      <Screen />
    </svg>
  );
}
