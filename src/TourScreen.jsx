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
          <span style={lit(headerIcon === "settings")}>⚙️</span>
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
  // Mirrors SessionStart's real card: same heading, same four options in
  // the same order, and NOTHING selected -- this is the screen as it
  // looks before the bowler has answered.
  bowl: () => (
    <Phone title="Bowl">
      <Spot>
        <div style={card}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: C.text, marginBottom: "3px" }}>
            Bowling today?
          </div>
          <div style={{ ...muted, marginBottom: "8px" }}>
            Two quick questions and the app sets itself up for tonight.
          </div>
          <div style={label}>Where are you bowling?</div>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            <span style={chip(false)}>Practice</span>
            <span style={chip(false)}>League</span>
            <span style={chip(false)}>Tournament</span>
            <span style={chip(false)}>Just Bowling</span>
          </div>
        </div>
      </Spot>
      <Note>Answer this and everything else falls into place</Note>
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

  // The import screen shows whichever kind the tour is for -- showing a
  // tournament bowler "League" selected teaches the wrong tap.
  import: ({ track } = {}) => (
    <Phone title="Bowl" headerIcon="import">
      <Note up={false}>Tap Import in the header</Note>
      <div style={card}>
        <div style={label}>What are you importing?</div>
        <div style={{ display: "flex", gap: "5px" }}>
          <span style={chip(track === "practice")}>Practice</span>
          <span style={chip(track !== "practice" && track !== "tournament")}>League</span>
          <span style={chip(track === "tournament")}>Tournament</span>
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
        <div style={{ ...muted, marginTop: "6px" }}>
          Reads your games and frames{track === "tournament" ? ", and your squad's if the card has them" : ", and your teammates'"}.
        </div>
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
      {/* The app's deepest screen, so the mock-up shows depth: headline
          numbers, a trend, per-ball breakdown and spare detail all at
          once. A single bar chart undersold it. */}
      <div style={{ ...card, marginBottom: "6px", display: "flex", gap: "5px" }}>
        {[["204", "average"], ["58%", "strikes"], ["81%", "spares"]].map(([v, l]) => (
          <div key={l} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: C.accent }}>{v}</div>
            <div style={{ ...muted, fontSize: "8px" }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Average over time</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "34px" }}>
          {[24, 30, 26, 33, 29, 34, 31, 34].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}px`, borderRadius: "2px 2px 0 0",
              background: C.accent, opacity: 0.4 + i * 0.07 }} />
          ))}
        </div>
      </div>
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>By ball</div>
        {[["Phaze II", "62%", 62], ["Ion Max", "54%", 54]].map(([n, v, pct]) => (
          <div key={n} style={{ marginBottom: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "9px", color: C.text }}>{n}</span>
              <span style={{ fontSize: "9px", fontWeight: 700, color: C.strike }}>{v}</span>
            </div>
            <div style={{ height: "4px", borderRadius: "2px", background: C.border }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: "2px", background: C.strike }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={label}>Spares by split</div>
        {[["Baby split", "75%"], ["7-10", "0%"], ["Single pin", "92%"]].map(([n, v]) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span style={{ fontSize: "9px", color: C.textMuted }}>{n}</span>
            <span style={{ fontSize: "9px", fontWeight: 600, color: C.text }}>{v}</span>
          </div>
        ))}
      </div>
      <Note>And a lot more besides</Note>
      <Nav active={2} />
    </Phone>
  ),

  insights: () => (
    <Phone title="Improve">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>What's costing you pins</div>
          {/* Written the way the real analysis reads: specific, about
              this bowler's last few nights, not generic advice. */}
          {[
            ["🎯", "Ten pin conversion is 71% over your last four nights — down from 84%. That's your biggest leak right now."],
            ["🎳", "The Ion Max carries better in game one than game three. Worth a surface change or a ball switch for the transition."],
            ["📈", "Your third-game average is 11 pins below your first. Fatigue or lane change — worth watching."],
          ].map(([icon, line]) => (
            <div key={line} style={{ display: "flex", gap: "6px", padding: "5px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "11px" }}>{icon}</span>
              <span style={{ fontSize: "10px", color: C.text, lineHeight: 1.4 }}>{line}</span>
            </div>
          ))}
          <div style={{ ...muted, marginTop: "6px" }}>Updated after every night — nothing to press.</div>
        </div>
      </Spot>
      <Nav active={3} />
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

  arsenal: () => (
    <Phone title="Vault">
      <div style={card}>
        <div style={label}>Arsenal</div>
        {/* Real-sounding balls with the specs a bowler actually tracks:
            surface grit and the layout the driller used. */}
        {[
          ["Phaze II", "Solid · 2000 · 60×4×40"],
          ["Ion Max Pearl", "Pearl · Polish · 55×5×35"],
          ["Bionic", "Solid · 1500 · 45×4×30"],
          ["White Dot", "Plastic · spare ball"],
        ].map(([name, spec]) => (
          <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>{name}</span>
            <span style={muted}>{spec}</span>
          </div>
        ))}
        <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted, marginTop: "6px" }}>
          + Add a ball
        </div>
      </div>

      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Bags</div>
          <div style={{ display: "flex", gap: "5px", marginBottom: "8px" }}>
            <span style={chip(true)}>League bag</span>
            <span style={chip(false)}>Tournament bag</span>
          </div>
          {/* The league bag holds three; a tournament bag might be capped
              at four, or two, depending on the event. */}
          {["Phaze II", "Ion Max Pearl", "White Dot"].map(b => (
            <div key={b} style={{ fontSize: "10px", color: C.text, padding: "2px 0" }}>✓ {b}</div>
          ))}
          <div style={{ ...muted, marginTop: "4px" }}>3 balls · what you bring on Tuesday</div>
        </div>
      </Spot>
      <Note>Different bags for league and tournament</Note>
      <Nav active={4} />
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
            {/* The way out when you don't have someone's address. */}
            <div style={{
              marginTop: "5px", padding: "5px 8px", borderRadius: "7px", fontSize: "9px",
              border: `1px solid ${C.accent}`, background: C.accent + "11", color: C.text,
            }}>
              ✓ I don't have their email
            </div>
            <div style={{
              marginTop: "4px", padding: "5px 8px", borderRadius: "7px",
              background: C.surface, border: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700,
                letterSpacing: "1px", color: C.accent }}>MX57-D6W7</span>
              <span style={{ ...muted, fontSize: "8px" }}>text this</span>
            </div>
          </div>
        </Spot>
      </div>
      <Note>Log their scores today — they connect when they sign up</Note>
      <Nav active={4} />
    </Phone>
  ),

  "shot-detail": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Result</div>
        <span style={chip(false, C.strike)}>Strike</span>{" "}
        <span style={chip(true, C.spare)}>Other Leave</span>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Pins standing</div>
          <PinRack standing={["10"]} />
          <div style={{ ...label, marginTop: "6px" }}>Spare made?</div>
          <div style={{ display: "flex", gap: "6px" }}>
            <span style={chip(true, C.strike)}>Yes</span>
            <span style={chip(false, C.miss)}>No</span>
          </div>
          <div style={{ ...muted, marginTop: "8px" }}>
            Ball: Phaze II · every shot splits your stats by equipment
          </div>
        </div>
      </Spot>
      <Note>Which pins, and whether you made it</Note>
      <Nav active={0} />
    </Phone>
  ),

  "import-verify": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Map each column</div>
        {[["Column 1", "You"], ["Column 2", "Brooklyn Barry"], ["Column 3", "skip"]].map(([c, who]) => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 0" }}>
            <span style={{ ...muted, flex: 1 }}>{c}</span>
            <div style={{ ...S.input, width: "110px", padding: "4px 7px", fontSize: "10px", color: C.text }}>
              {who}
            </div>
          </div>
        ))}
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Check what it read</div>
          <div style={{ display: "flex", gap: "5px" }}>
            {["213", "196", "203"].map((v, i) => (
              <div key={i} style={{ ...S.input, flex: 1, padding: "6px 4px", textAlign: "center",
                fontSize: "13px", fontWeight: 700, color: C.text }}>{v}</div>
            ))}
          </div>
          <div style={{ ...muted, marginTop: "6px" }}>Fix anything misread before it saves.</div>
        </div>
      </Spot>
      <Note>A proposal, not a fact</Note>
      <Nav active={0} />
    </Phone>
  ),

  "practice-goals": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Goal</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", color: C.text }}>Ten pin conversion</span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: C.strike }}>84%</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: C.border, marginBottom: "8px" }}>
            <div style={{ width: "84%", height: "100%", borderRadius: "3px", background: C.strike }} />
          </div>
          <div style={{ fontSize: "11px", color: C.text, lineHeight: 1.4 }}>
            Make 9 of your next 10 ten pins — 1 more than you are now.
          </div>
        </div>
      </Spot>
      <Note>In bowling terms, not percentages</Note>
      <Nav active={0} />
    </Phone>
  ),

  "practice-fields": () => (
    <Phone title="Bowl" headerIcon="settings">
      {/* Points UP at the gear in the header, so "in Settings" isn't an
          instruction to go hunting. */}
      <Note up={false}>Switch them on here</Note>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>This shot</div>
          {[["Ball speed", "16.2 mph"], ["Rev rate", "340"], ["Axis rotation", "45°"], ["Board at arrows", "10"]].map(([n, v]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.textMuted }}>{n}</span>
              <span style={{ fontSize: "10px", fontWeight: 600, color: C.text }}>{v}</span>
            </div>
          ))}
          {/* Four rows plus an ellipsis: showing a closed list made it
              look like that was all of them. */}
          <div style={{ ...muted, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
            …and more in Settings
          </div>
        </div>
      </Spot>
      <Note>Turn on only what you're working on</Note>
      <Nav active={0} />
    </Phone>
  ),

  // ── Just bowling ──────────────────────────────────────────────────

  "casual-scores": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Tonight</div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "11px", marginBottom: "8px" }}>Fri 12 Sep</div>
          <div style={{ display: "flex", gap: "5px" }}>
            {["142", "168", ""].map((v, i) => (
              <div key={i} style={{
                ...S.input, flex: 1, padding: "8px 4px", textAlign: "center",
                fontSize: "15px", fontWeight: 700,
                color: v ? C.text : C.textMuted,
                borderColor: v ? C.border : C.accent,
              }}>{v || "—"}</div>
            ))}
          </div>
          <div style={{ ...muted, marginTop: "5px", textAlign: "center" }}>Game 1 · 2 · 3</div>
        </div>
      </Spot>
      <Note>Type the score, nothing else</Note>
      <Nav active={0} />
    </Phone>
  ),

  "casual-people": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Keeping score for</div>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" }}>
            <span style={chip(true)}>You</span>
            <span style={chip(false)}>Sam</span>
            <span style={chip(false)}>Jess</span>
            <span style={chip(false)}>Marcus</span>
          </div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted }}>
            + Add someone bowling with you
          </div>
        </div>
      </Spot>
      <Note>They don't need the app at all</Note>
      <Nav active={0} />
    </Phone>
  ),

  "casual-winner": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "22px" }}>👑</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: C.text }}>Jess</div>
            <div style={muted}>486 · won by 31</div>
          </div>
          {[["Sam", "455"], ["You", "441"], ["Marcus", "398"]].map(([n, sc]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "11px", color: C.text }}>{n}</span>
              <span style={muted}>{sc}</span>
            </div>
          ))}
        </div>
      </Spot>
      <Note>Worked out for you</Note>
      <Nav active={0} />
    </Phone>
  ),

  "casual-share": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "8px", textAlign: "center" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: C.accent, letterSpacing: "1px" }}>
          FRIDAY NIGHT
        </div>
        <div style={{ fontSize: "18px" }}>👑</div>
        <div style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>Jess · 486</div>
        <div style={{ ...muted, marginTop: "3px" }}>Sam 455 · You 441 · Marcus 398</div>
      </div>
      <Spot>
        <div style={{ ...S.btn("primary"), padding: "9px", fontSize: "11px", textAlign: "center", borderRadius: "8px" }}>
          Share
        </div>
      </Spot>
      <Note>Straight to the group chat</Note>
      <Nav active={0} />
    </Phone>
  ),

  // ── Practice ──────────────────────────────────────────────────────

  "practice-modes": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Practice</div>
          <div style={{ display: "flex", gap: "5px" }}>
            <span style={chip(true)}>Games</span>
            <span style={chip(false)}>Drill</span>
          </div>
          <div style={{ ...muted, marginTop: "8px" }}>Tracking tonight</div>
          <div style={{ display: "flex", gap: "5px", marginTop: "4px" }}>
            <span style={chip(true)}>Shot by shot</span>
            <span style={chip(false)}>Scores only</span>
          </div>
        </div>
      </Spot>
      <Note>A normal night, or targeted work</Note>
      <Nav active={0} />
    </Phone>
  ),

  "practice-drill": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Drill</div>
        <div style={{ display: "flex", gap: "5px" }}>
          <span style={chip(false)}>Games</span>
          <span style={chip(true)}>Drill</span>
        </div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.text, marginBottom: "6px" }}>
            10 pin
          </div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <div style={{ flex: 1, padding: "8px", borderRadius: "8px", textAlign: "center",
              border: `1px solid ${C.strike}66`, background: C.strike + "12" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: C.strike }}>14</div>
              <div style={muted}>made</div>
            </div>
            <div style={{ flex: 1, padding: "8px", borderRadius: "8px", textAlign: "center",
              border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: C.miss }}>6</div>
              <div style={muted}>missed</div>
            </div>
          </div>
          <div style={{ ...muted, textAlign: "center" }}>70% tonight · 61% last week</div>
        </div>
      </Spot>
      <Note>No frames, no score — just the count</Note>
      <Nav active={0} />
    </Phone>
  ),

  "practice-depth": () => (
    <Phone title="Bowl">
      <div style={card}>
        <div style={label}>Tracking tonight</div>
        <div style={{ display: "flex", gap: "5px", marginBottom: "8px" }}>
          <span style={chip(false)}>Shot by shot</span>
          <span style={chip(true)}>Scores only</span>
        </div>
        <div style={{ ...muted, lineHeight: 1.4 }}>
          Applies to this practice only.
        </div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Your league nights</div>
          <div style={{ display: "flex", gap: "5px" }}>
            <span style={chip(true)}>Shot by shot</span>
            <span style={chip(false)}>Scores only</span>
          </div>
          <div style={{ ...muted, marginTop: "6px" }}>Unchanged</div>
        </div>
      </Spot>
      <Note>Remembered separately</Note>
      <Nav active={0} />
    </Phone>
  ),

  // ── Tournament ────────────────────────────────────────────────────

  "tourney-setup": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Tournament</div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>Spring Open · Sunset Lanes</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Blocks</div>
          {[["Day 1 · Squad A", "8 games · lanes 11-12"],
            ["Day 2 · Squad B", "8 games · lanes 3-4"]].map(([n, d]) => (
            <div key={n} style={{ padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>{n}</div>
              <div style={muted}>{d}</div>
            </div>
          ))}
        </div>
      </Spot>
      <Note>A block per day, games underneath</Note>
      <Nav active={0} />
    </Phone>
  ),

  "tourney-cut": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Cut line</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
            <span style={{ fontSize: "22px", fontWeight: 700, color: C.strike }}>+47</span>
            <span style={muted}>through 5 of 8</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: C.border, marginBottom: "6px" }}>
            <div style={{ width: "64%", height: "100%", borderRadius: "3px", background: C.strike }} />
          </div>
          <div style={{ ...muted, lineHeight: 1.4 }}>
            Cut at 1680 · you're on 1727. Need 199 average over the last three to stay above it.
          </div>
        </div>
      </Spot>
      <Note>The number you're actually bowling to</Note>
      <Nav active={0} />
    </Phone>
  ),

  "tourney-pots": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Brackets & side pots</div>
          {[["Brackets ×4", "$20 in", "$60 won", C.strike],
            ["Eliminator", "$10 in", "—", C.textMuted],
            ["High game", "$5 in", "$25 won", C.strike]].map(([n, inn, out, col]) => (
            <div key={n} style={{ display: "flex", alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.text, flex: 1 }}>{n}</span>
              <span style={{ ...muted, width: "48px", textAlign: "right" }}>{inn}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: col, width: "58px", textAlign: "right" }}>{out}</span>
            </div>
          ))}
          <div style={{ ...muted, marginTop: "6px", textAlign: "right" }}>$85 won · $35 in · up $50</div>
        </div>
      </Spot>
      <Note>What the weekend actually cost</Note>
      <Nav active={0} />
    </Phone>
  ),

  "tourney-match": () => (
    <Phone title="Bowl">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Match play · round of 16</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          {[["R1 vs J. Carver", "224-198", "W +30", C.strike],
            ["R2 vs M. Boone", "191-217", "L", C.miss],
            ["R3 vs T. Willis", "236-205", "W +30", C.strike]].map(([m, sc, res, col]) => (
            <div key={m} style={{ display: "flex", alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.text, flex: 1 }}>{m}</span>
              <span style={{ ...muted, width: "54px", textAlign: "right" }}>{sc}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: col, width: "42px", textAlign: "right" }}>{res}</span>
            </div>
          ))}
          <div style={{ ...muted, marginTop: "6px", textAlign: "right" }}>2-1 · bonus pins included</div>
        </div>
      </Spot>
      <Nav active={0} />
    </Phone>
  ),

  "practice-recap": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Practice summary</div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.text, marginBottom: "6px" }}>
            Sun 14 Sep · 2 games + drill
          </div>
          {[["Ten pin drill", "14 of 20 · was 11 of 20", C.strike],
            ["Spare conversion", "81% · up 4", C.strike],
            ["Goal: ten pins", "84% → 90%", C.spare]].map(([n, v, col]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.textMuted }}>{n}</span>
              <span style={{ fontSize: "10px", fontWeight: 600, color: col }}>{v}</span>
            </div>
          ))}
        </div>
      </Spot>
      <Note>Next week starts with a comparison</Note>
      <Nav active={0} />
    </Phone>
  ),

  "league-recap": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Tonight</div>
          <div style={{ display: "flex", gap: "5px", marginBottom: "8px" }}>
            {["213", "196", "203"].map(v => (
              <div key={v} style={{ flex: 1, textAlign: "center", padding: "5px 0",
                borderRadius: "6px", background: C.surface }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: C.text }}>{v}</div>
              </div>
            ))}
            <div style={{ flex: 1, textAlign: "center", padding: "5px 0", borderRadius: "6px",
              background: C.accent + "18", border: `1px solid ${C.accent}66` }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: C.accent }}>612</div>
            </div>
          </div>
          {[["Team", "won 3 of 4"], ["Strikes", "22 · 58%"], ["Spares", "17 of 21"], ["Money games", "up $12.75"], ["Average", "201 → 204"]].map(([n, v]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.textMuted }}>{n}</span>
              <span style={{ fontSize: "10px", fontWeight: 600, color: C.text }}>{v}</span>
            </div>
          ))}
        </div>
      </Spot>
      <Note>One tap to the team chat</Note>
      <Nav active={0} />
    </Phone>
  ),

  "tourney-recap": () => (
    <Phone title="Bowl">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Spring Open</div>
          {[["Block 1", "1727 · 8 games"],
            ["Block 2", "1689 · 8 games"],
            ["Cut", "made it · +47"],
            ["Match play", "2-1"],
            ["Entries & pots", "$35 in · $85 won"]].map(([n, v]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "10px", color: C.textMuted }}>{n}</span>
              <span style={{ fontSize: "10px", fontWeight: 600, color: C.text }}>{v}</span>
            </div>
          ))}
          <div style={{ ...muted, marginTop: "6px", textAlign: "right" }}>Saved as one tournament</div>
        </div>
      </Spot>
      <Nav active={0} />
    </Phone>
  ),

  // ── Coach track ───────────────────────────────────────────────────
  //
  // These had no mock-ups at all -- I checked every bowler step had one
  // and never checked the coach track, so all six showed text over blank
  // space. Same invented names as the roster screen: never a real one.

  "coach-roster": () => (
    <Phone title="Coach">
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Your bowlers</div>
          {[
            ["Leadoff Larry", "Ten pin conversion", "72%", "Tue 22nd", C.strike],
            ["Brooklyn Barry", "Ball speed control", "45%", "Thu 24th", C.spare],
            ["Tessa Tenpin", "Spare shooting", "88%", "Tue 22nd", C.strike],
            ["Anchor Annie", "Nothing set", "—", "not booked", C.textMuted],
          ].map(([name, task, pct, next, col]) => (
            <div key={name} style={{ padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>{name}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: col }}>{pct}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={muted}>{task}</span>
                <span style={muted}>{next}</span>
              </div>
            </div>
          ))}
        </div>
      </Spot>
      <Note>Everyone, and where they are, on one screen</Note>
      <Nav active={3} />
    </Phone>
  ),

  "coach-open": () => (
    <Phone title="Coach">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>Leadoff Larry</div>
        <div style={muted}>Tuesday House Shot · 14 nights logged</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Spare conversion by split</div>
          {[["Baby split", "3-10", "75%", C.strike],
            ["7-10", "", "0%", C.miss],
            ["Big four", "4-6-7-10", "20%", C.miss]].map(([n, pins, r, col]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ fontSize: "10px", color: C.text }}>
                {n} {pins && <span style={{ color: C.textMuted }}>{pins}</span>}
              </span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: col }}>{r}</span>
            </div>
          ))}
        </div>
      </Spot>
      <Note>Their logged data, not a summary they typed</Note>
      <Nav active={3} />
    </Phone>
  ),

  "coach-tasks": () => (
    <Phone title="Coach">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={muted}>Task for Leadoff Larry</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>What to work on</div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "11px", color: C.text, marginBottom: "5px" }}>
            Ten pin conversion
          </div>
          <div style={{ display: "flex", gap: "5px" }}>
            <div style={{ ...S.input, flex: 1, padding: "6px 9px", fontSize: "11px", color: C.text }}>90%</div>
            <div style={{ ...S.input, flex: 1, padding: "6px 9px", fontSize: "11px", color: C.text }}>by the 15th</div>
          </div>
          <div style={{ ...muted, marginTop: "8px", lineHeight: 1.4 }}>
            They'll see: <span style={{ color: C.text }}>"Make 9 of your next 10 ten pins"</span>
          </div>
        </div>
      </Spot>
      <Note>Set in numbers, shown to them in bowling terms</Note>
      <Nav active={3} />
    </Phone>
  ),

  "coach-goals": () => (
    <Phone title="Coach">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={muted}>Goal for Tessa Tenpin</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>Their goals</div>
          {[["Spare conversion", "88%", 88], ["Average", "184 / 190", 72]].map(([n, v, pct]) => (
            <div key={n} style={{ marginBottom: "7px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontSize: "10px", color: C.text }}>{n}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: C.strike }}>{v}</span>
              </div>
              <div style={{ height: "5px", borderRadius: "3px", background: C.border }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: "3px", background: C.strike }} />
              </div>
            </div>
          ))}
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted, marginTop: "6px" }}>
            + Set another goal
          </div>
        </div>
      </Spot>
      <Note>The same number you both watch between sessions</Note>
      <Nav active={3} />
    </Phone>
  ),

  "coach-session": () => (
    <Phone title="Coach">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={muted}>Next session with Brooklyn Barry</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={label}>When</div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "11px", color: C.text, marginBottom: "6px" }}>
            Thu 24 Sep
          </div>
          <div style={label}>What you'll cover</div>
          <div style={{ ...S.input, padding: "6px 9px", fontSize: "10px", color: C.textMuted }}>
            Speed control off the 4th arrow
          </div>
        </div>
      </Spot>
      <Nav active={3} />
    </Phone>
  ),

  "coach-between": () => (
    <Phone title="Coach">
      <div style={{ ...card, marginBottom: "6px" }}>
        <div style={label}>Since you last saw them</div>
      </div>
      <Spot>
        <div style={{ ...card, marginBottom: 0 }}>
          {[["Leadoff Larry", "3 nights · ten pins 64% → 72%", C.strike],
            ["Tessa Tenpin", "2 nights · average up 6 pins", C.strike],
            ["Anchor Annie", "1 night · spares slipped to 61%", C.miss]].map(([n, change, col]) => (
            <div key={n} style={{ padding: "5px 0", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>{n}</div>
              <div style={{ fontSize: "10px", color: col }}>{change}</div>
            </div>
          ))}
        </div>
      </Spot>
      <Note>Already there when you arrive</Note>
      <Nav active={3} />
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

export default function TourScreen({ stepId, track }) {
  const Screen = SCREENS[stepId];
  if (!Screen) return null;
  return <Screen track={track} />;
}
