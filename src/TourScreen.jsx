import { C, S, F } from "./ui.jsx";

// Mock-ups built from the app's OWN style tokens.
//
// These were SVG schematics, which looked like a wireframe of the app
// rather than the app. Now they're real DOM using S.card, S.chip,
// S.label and the live theme colours -- so a card here has the same
// radius, padding and border as a card on the Bowl tab, and a theme
// change carries through automatically.
//
// Populated with realistic data on purpose. A new bowler's real app is
// empty, so showing their actual screen would teach nothing: the point
// is to show what it looks like once there's a game in it.

// A phone-shaped frame, so it reads as "this is a screen" rather than
// as more of the tour's own UI.
function Phone({ children, title, headerIcon }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: "18px", overflow: "hidden",
      background: C.bg, maxWidth: "300px", margin: "0 auto",
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: C.text, fontFamily: F.body }}>{title}</span>
        <span style={{ display: "flex", gap: "8px", fontSize: "13px" }}>
          <span style={lit(headerIcon === "help")}>🔍</span>
          <span style={lit(headerIcon === "import")}>📷</span>
          <span style={{ opacity: 0.55 }}>👤</span>
        </span>
      </div>
      <div style={{ padding: "10px", minHeight: "230px" }}>{children}</div>
    </div>
  );
}

// The spotlight: a ring around whatever the step is about.
function lit(on) {
  return on
    ? {
        outline: `2px solid ${C.accent}`, outlineOffset: "3px",
        borderRadius: "6px", background: C.accent + "22",
      }
    : { opacity: 0.55 };
}

function Spot({ on = true, children, style }) {
  return (
    <div style={{
      ...(on ? { outline: `2px solid ${C.accent}`, outlineOffset: "2px", borderRadius: "12px" } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}

// Points at the thing above or below it.
function Note({ children, up = true }) {
  return (
    <div style={{
      fontSize: "11px", fontWeight: 700, color: C.accent,
      textAlign: "center", margin: up ? "8px 0 0" : "0 0 8px", fontFamily: F.body,
    }}>
      {up ? "▲ " : "▼ "}{children}
    </div>
  );
}

// Scaled-down versions of the real components' shapes.
const card = { ...S.card, padding: "10px", marginBottom: "8px" };
const label = { ...S.label, fontSize: "10px", marginBottom: "6px" };
const chip = (sel, col) => ({ ...S.chip(sel, col), fontSize: "10px", padding: "5px 9px" });
const muted = { fontSize: "10px", color: C.textMuted, fontFamily: F.body };

function Nav({ active }) {
  const tabs = [["🎳", "Bowl"], ["📖", "History"], ["📈", "Stats"], ["🎯", "Improve"], ["🔒", "Vault"]];
  return (
    <div style={{
      display: "flex", borderTop: `1px solid ${C.border}`,
      margin: "8px -10px -10px", background: C.surface, padding: "6px 0",
    }}>
      {tabs.map(([icon, name], i) => (
        <div key={name} style={{
          flex: 1, textAlign: "center",
          ...(i === active ? { outline: `2px solid ${C.accent}`, outlineOffset: "-3px", borderRadius: "8px" } : {}),
        }}>
          <div style={{ fontSize: "13px", opacity: i === active ? 1 : 0.6 }}>{icon}</div>
          <div style={{
            fontSize: "8px", fontFamily: F.body,
            color: i === active ? C.accent : C.textMuted,
            fontWeight: i === active ? 700 : 400,
          }}>{name}</div>
        </div>
      ))}
    </div>
  );
}

// Ten frames, mid-game, exactly as the real scoresheet lays them out.
function Frames({ highlight }) {
  const marks = [["X"], ["X"], ["9", "/"], ["8", "-"], [], [], [], [], [], []];
  const totals = ["29", "49", "67", "75", "", "", "", "", "", ""];
  return (
    <div style={{ display: "flex", gap: "1px" }}>
      {marks.map((mk, i) => (
        <div key={i} style={{
          flex: 1, border: `1px solid ${i === highlight ? C.accent : C.border}`,
          borderRadius: "3px", textAlign: "center", padding: "1px 0",
          background: i === highlight ? C.accent + "18" : "transparent",
        }}>
          <div style={{ fontSize: "6px", color: C.textMuted }}>{i + 1}</div>
          <div style={{ fontSize: "9px", fontWeight: 700, minHeight: "11px", color: C.strike }}>
            {mk.join(" ")}
          </div>
          <div style={{ fontSize: "8px", fontWeight: 700, color: C.text, minHeight: "10px" }}>
            {totals[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

// The pin rack, laid out like ui.jsx's PinDeck: 7-8-9-10 across the
// back, then 4-5-6, then 2-3, then the headpin. A row of number chips
// wouldn't teach anything -- the whole point is that it looks like a
// rack, so a bowler taps the pins they can actually see standing.
function PinRack({ standing = [] }) {
  const rows = [
    [["7", 14], ["8", 38], ["9", 62], ["10", 86]],
    [["4", 26], ["5", 50], ["6", 74]],
    [["2", 38], ["3", 62]],
    [["1", 50]],
  ];
  const size = 22, gap = 25;
  return (
    <div style={{ position: "relative", height: `${gap * 3 + size + 6}px`, margin: "4px 0" }}>
      {rows.map((row, r) => row.map(([n, x]) => {
        const on = standing.includes(n);
        return (
          <div key={n} style={{
            position: "absolute", left: `${x}%`, top: `${r * gap + 3}px`,
            transform: "translateX(-50%)", width: `${size}px`, height: `${size}px`,
            borderRadius: "50%", boxSizing: "border-box",
            border: `2px solid ${on ? C.spare : C.border}`,
            background: on ? C.spare + "33" : C.surface,
            color: on ? C.spare : C.textMuted,
            fontSize: "9px", fontWeight: 700, fontFamily: F.body,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{n}</div>
        );
      }))}
      <div style={{ ...muted, position: "absolute", right: 0, bottom: 0 }}>← still standing</div>
    </div>
  );
}

// The Result card, in the state each scoring lesson needs.
function ResultCard({ stage }) {
  const strike = stage === "strike";
  const leave = stage === "spare" || stage === "miss";
  return (
    <div style={card}>
      <div style={label}>Result</div>
      <Spot on={strike} style={{ display: "inline-block", marginBottom: "6px" }}>
        <span style={chip(strike, C.strike)}>Strike</span>
      </Spot>{" "}
      <span style={chip(false)}>Weak 10</span>{" "}
      <span style={chip(false)}>Ringing 10</span>
      <div style={{ marginTop: "6px" }}>
        <Spot on={leave} style={{ display: "inline-block" }}>
          <span style={chip(leave, C.spare)}>Other Leave</span>
        </Spot>
      </div>

      {leave && (
        <>
          <div style={{ ...label, marginTop: "10px" }}>Pins standing</div>
          <PinRack standing={["3", "10"]} />

          <div style={{ ...label, marginTop: "10px" }}>Spare made?</div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Spot on={stage === "spare"}>
              <span style={chip(stage === "spare", C.strike)}>Yes</span>
            </Spot>
            <Spot on={stage === "miss"}>
              <span style={chip(stage === "miss", C.miss)}>No</span>
            </Spot>
          </div>
        </>
      )}
    </div>
  );
}

const SCREENS = {
  bowl: () => (
    <Phone title="Bowl">
      <Spot>
        <div style={card}>
          <div style={label}>Tonight's session</div>
          <div style={{ display: "flex", gap: "5px", marginBottom: "8px" }}>
            <span style={chip(true)}>Tuesday</span>
            <span style={chip(false)}>Thursday</span>
          </div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "11px" }}>Tue 15 Sep</div>
        </div>
      </Spot>
      <Note>Pick your league and date to start</Note>
      <Nav active={0} />
    </Phone>
  ),

  tracking: () => (
    <Phone title="Bowl">
      <div style={card}>
        <div style={label}>How much detail?</div>
        <Spot style={{ marginBottom: "8px" }}>
          <div style={{ ...S.input, padding: "8px 9px", borderColor: C.accent }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: C.accent }}>Shot by shot</div>
            <div style={muted}>Every ball · pins, ball, release</div>
          </div>
        </Spot>
        <div style={{ ...S.input, padding: "8px 9px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: C.textMuted }}>Scores only</div>
          <div style={muted}>213 · 196 · 203</div>
        </div>
      </div>
      <div style={muted}>Switch any time — even mid-game.</div>
      <Nav active={0} />
    </Phone>
  ),

  scoresheet: () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={muted}>Game 1 · Frame 5 · Lane 8</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}><Frames highlight={2} /></div>
      </Spot>
      <Note>Tap any frame to fix it</Note>
      <div style={{ ...card, marginTop: "8px" }}>
        <div style={label}>Result</div>
        <span style={chip(false, C.strike)}>Strike</span>{" "}
        <span style={chip(false)}>Other Leave</span>
      </div>
      <Nav active={0} />
    </Phone>
  ),

  "score-strike": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}><Frames /></div>
      <ResultCard stage="strike" />
      <Note>One tap — the app scores it and moves on</Note>
      <Nav active={0} />
    </Phone>
  ),

  "score-spare": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}><Frames /></div>
      <ResultCard stage="spare" />
      <div style={muted}>Your first ball is worked out from the pins you left.</div>
      <Nav active={0} />
    </Phone>
  ),

  "score-miss": () => (
    <Phone title="Bowl">
      <ResultCard stage="miss" />
      <div style={card}>
        <div style={label}>Total pins this frame</div>
        <Spot>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px" }}>
            <div style={{
              ...S.btn("sm"), padding: "4px 12px", fontSize: "15px",
              borderRadius: "8px", lineHeight: 1,
            }}>−</div>
            <div style={{
              flex: 1, textAlign: "center", fontSize: "22px",
              fontWeight: 700, color: C.spare, fontFamily: F.num,
            }}>9</div>
            <div style={{
              ...S.btn("sm"), padding: "4px 12px", fontSize: "15px",
              borderRadius: "8px", lineHeight: 1,
            }}>+</div>
          </div>
        </Spot>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: "4px" }}>
          <span style={muted}>First ball: <b style={{ color: C.text }}>8</b></span>
          <span style={muted}>Second ball: <b style={{ color: C.text }}>1</b></span>
        </div>
      </div>
      <Note>Left a 3-10 and knocked one down? That's 9.</Note>
      <Nav active={0} />
    </Phone>
  ),

  import: () => (
    <Phone title="Bowl" headerIcon="import">
      <Note up={false}>Tap Import in the header</Note>
      <div style={card}>
        <div style={label}>What are you importing?</div>
        <div style={{ display: "flex", gap: "5px" }}>
          <span style={chip(false)}>Practice</span>
          <span style={chip(true)}>League</span>
          <span style={chip(false)}>Tournament</span>
        </div>
      </div>
      <div style={card}>
        <div style={label}>Scorecard photos</div>
        <div style={{ display: "flex", gap: "5px" }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              width: "40px", height: "40px", borderRadius: "6px",
              background: C.surface, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px",
            }}>🖼️</div>
          ))}
        </div>
        <div style={{ ...muted, marginTop: "6px" }}>Reads every bowler's games and frames.</div>
      </div>
      <Nav active={0} />
    </Phone>
  ),

  history: () => (
    <Phone title="History">
      <div style={{ ...card, marginBottom: "6px" }}>
        <span style={chip(true)}>Sessions</span>{" "}
        <span style={chip(false)}>Shots</span>
      </div>
      {[["Tue 15 Sep", "612", "213 · 196 · 203"], ["Tue 8 Sep", "587", "201 · 188 · 198"]].map(([d, tot, games]) => (
        <div key={d} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: C.text }}>{d}</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: C.accent }}>{tot}</span>
          </div>
          <div style={muted}>{games}</div>
        </div>
      ))}
      <Nav active={1} />
    </Phone>
  ),

  stats: () => (
    <Phone title="Stats">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Viewing</div>
          <div style={{ ...S.sel, padding: "6px 9px", fontSize: "11px" }}>You ▾</div>
        </div>
      </Spot>
      <Note>Compare to a friend or your team</Note>
      <div style={{ ...card, marginTop: "8px" }}>
        <div style={label}>Average</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "54px" }}>
          {[38, 50, 44, 60, 54, 66].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}px`, borderRadius: "3px 3px 0 0",
              background: C.accent, opacity: 0.45 + i * 0.08,
            }} />
          ))}
        </div>
        <div style={{ ...muted, marginTop: "5px" }}>196 → 204 over six weeks</div>
      </div>
      <Nav active={2} />
    </Phone>
  ),

  improve: () => (
    <Phone title="Improve">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Goals</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", color: C.text }}>Spare conversion</span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: C.strike }}>72%</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: C.border }}>
            <div style={{ width: "72%", height: "100%", borderRadius: "3px", background: C.strike }} />
          </div>
        </div>
      </Spot>
      <div style={{ ...card, marginTop: "8px" }}>
        <div style={label}>Drills</div>
        <span style={chip(true)}>Start a drill</span>
      </div>
      <Nav active={3} />
    </Phone>
  ),

  vault: () => (
    <Phone title="Vault">
      <div style={card}>
        <div style={label}>Leagues</div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>Tuesday House Shot</div>
        <div style={muted}>Sunset Lanes · Season ends 12 May</div>
        <div style={{ ...muted, marginTop: "6px", color: C.text }}>1 team in this league</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>Split Happens · yours</div>
        <Spot style={{ marginTop: "8px" }}>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "11px", color: C.textMuted }}>
            Add a team to this league
          </div>
        </Spot>
      </div>
      <Note>Teams live under their league</Note>
      <Nav active={4} />
    </Phone>
  ),

  roster: () => (
    <Phone title="Vault">
      <div style={card}>
        <div style={label}>Split Happens</div>
        <div style={{ ...muted, marginBottom: "8px" }}>Tuesday · roster in bowling order</div>

        {/* A mixed roster is the normal case, and the thing worth
            showing: real accounts and placeholders side by side, so a
            bowler can see that a teammate without the app isn't a
            blocker. */}
        {/* Invented names, not real ones. A shipped mock-up shouldn't
            carry anyone's actual name, and the lineup reads correctly:
            lead-off first, anchor last. */}
        {[
          ["1", "Leadoff Larry", "you", C.accent],
          ["2", "Brooklyn Barry", "joined", C.strike],
          ["3", "Tessa Tenpin", "invited · waiting", C.spare],
          ["4", "Anchor Annie", "invited · waiting", C.spare],
        ].map(([pos, name, state, col]) => (
          <div key={name} style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "5px 0", borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{ ...muted, width: "10px" }}>{pos}</span>
            <span style={{ fontSize: "11px", color: C.text, flex: 1 }}>{name}</span>
            <span style={{ fontSize: "9px", color: col, fontWeight: 600 }}>{state}</span>
          </div>
        ))}

        <Spot style={{ marginTop: "8px" }}>
          <div>
            <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted }}>
              Name
            </div>
            <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted, marginTop: "4px" }}>
              Email
            </div>
          </div>
        </Spot>
      </div>
      <Note>Log their scores today — they connect when they sign up</Note>
      <Nav active={4} />
    </Phone>
  ),

  money: () => (
    <Phone title="Bowl">
      <div style={card}>
        <div style={label}>Money games tonight</div>
        <div style={{ ...muted, marginBottom: "8px" }}>Tap the ones you're in.</div>
        {[["Quarter game", true, "0.25"], ["Dollar game", true, "1.00"], ["High game", false, "2.00"]]
          .map(([name, on, amt]) => (
            <div key={name} style={{ display: "flex", gap: "5px", marginBottom: "5px" }}>
              <div style={{
                flex: 1, padding: "5px 8px", borderRadius: "7px", fontSize: "10px",
                border: `1px solid ${on ? C.strike + "66" : C.border}`,
                background: on ? C.strike + "11" : "transparent",
                color: on ? C.text : C.textMuted,
              }}>{on ? "✓ " : ""}{name}</div>
              <div style={{
                width: "48px", padding: "5px", borderRadius: "7px", textAlign: "right",
                border: `1px solid ${C.border}`, background: C.surface,
                fontSize: "10px", color: C.text,
              }}>${amt}</div>
            </div>
          ))}
        <div style={{ ...muted, marginTop: "6px" }}>3 games tonight · $3.75 paid in</div>
      </div>
      <Nav active={0} />
    </Phone>
  ),
};

export default function TourScreen({ stepId }) {
  const Screen = SCREENS[stepId];
  if (!Screen) return null;
  return <Screen />;
}
