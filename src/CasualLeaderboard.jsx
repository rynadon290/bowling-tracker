import { C, S, F } from "./ui.jsx";
import { casualLeaderboard, CASUAL_BADGES } from "./domain/casualBadges.js";

// Everyone who's been on a Just Bowling scoresheet, ranked.
//
// Ranked by AVERAGE rather than total, because people bowl different
// numbers of games — the games count sits next to it so a three-game
// average isn't mistaken for a thirty-game one.
//
// Badges do most of the work here. A leaderboard alone rewards one
// person and tells everyone else they're losing; the badges give the
// bowler who shot 95 something to have earned too.
export default function CasualLeaderboard({ nights = [], me = "" }) {
  const rows = casualLeaderboard(nights);

  if (!rows.length) {
    return (
      <div style={S.card}>
        <div style={S.label}>Standings</div>
        <div style={{ fontSize: "13px", color: C.textMuted, lineHeight: 1.5 }}>
          Nobody here yet. Add people to your scoresheet on the Bowl tab and they'll
          show up once you've bowled a night together.
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Standings</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
          Everyone you've bowled with, by average. {rows.length === 1 ? "Add someone to compare against." : ""}
        </div>

        {rows.map((r, i) => {
          const isMe = r.bowler === me;
          return (
            <div key={r.bowler} style={{
              padding: "10px 0",
              borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{
                  fontSize: "13px", fontWeight: 700, width: "18px",
                  color: i === 0 ? C.accent : C.textMuted,
                }}>
                  {i === 0 ? "\u{1F451}" : i + 1}
                </span>
                <span style={{
                  flex: 1, fontSize: "14px", fontWeight: isMe ? 700 : 600,
                  color: isMe ? C.accent : C.text,
                }}>
                  {r.bowler}{isMe ? " (you)" : ""}
                </span>
                <span style={{ fontSize: "17px", fontWeight: 700, color: C.text, fontFamily: F.num }}>
                  {r.average}
                </span>
              </div>

              {/* Games bowled sits right next to the average on purpose:
                  a 180 average over 3 games and over 60 games are very
                  different claims. */}
              <div style={{ display: "flex", gap: "12px", marginTop: "3px", paddingLeft: "26px" }}>
                <span style={{ fontSize: "11px", color: C.textMuted }}>
                  {r.games} game{r.games === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: "11px", color: C.textMuted }}>
                  {r.nights} night{r.nights === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: "11px", color: C.textMuted }}>
                  best <strong style={{ color: C.text }}>{r.highGame}</strong>
                </span>
                {r.nightsWon > 0 && (
                  <span style={{ fontSize: "11px", color: C.strike }}>
                    {r.nightsWon} win{r.nightsWon === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {r.badges.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", paddingLeft: "26px" }}>
                  {r.badges.map(b => (
                    <span key={b.id} title={b.blurb} style={{
                      fontSize: "10px", padding: "2px 7px", borderRadius: "10px",
                      backgroundColor: C.surface, border: `1px solid ${C.border}`,
                      color: C.textMuted, whiteSpace: "nowrap",
                    }}>
                      {b.emoji} {b.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={S.card}>
        <div style={S.label}>Badges</div>
        <div style={{ fontSize: "11px", color: C.textMuted, lineHeight: 1.5 }}>
          There are {CASUAL_BADGES.length} to collect, and they're not all about bowling well —
          some are about showing up, and one or two you'd rather not have.
        </div>
      </div>
    </>
  );
}
