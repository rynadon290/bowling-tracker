import { C, S, F } from "./ui.jsx";
import { casualLeaderboard } from "./domain/casualBadges.js";
import { buildSharePayload, encodeShare } from "./domain/badgeShare.js";
import ShareButton from "./ShareButton.jsx";

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
  // The link that carries a bowler\u2019s own nights to their own phone.
  //
  // One phone keeps score for everyone, so everyone else\u2019s badges
  // exist here and nowhere else. This is how they leave: their nights,
  // encoded, in something you can text. See domain/badgeShare.js.
  const linkFor = (bowler) => {
    const code = encodeShare(buildSharePayload(bowler, nights));
    if (!code) return "";
    try {
      const base = window.location.origin + window.location.pathname;
      return `${base}#badges=${code}`;
    } catch { return code; }
  };
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

        {/* Focus group Finding 4: 9 of 50 looked for a way to share the
            running table. The night's recap had a share and this did not
            -- and the standings are the part people said they would
            install the app for, to settle arguments in a group chat.
            Only shown once there is something to argue about. */}
        {rows.length > 1 && (
          <div style={{ marginBottom: "10px" }}>
            <ShareButton summary={{ standings: true, rows, me }} label="Share standings" compact />
          </div>
        )}

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

              {/* Their badges, to them. Everyone who is not holding this
                  phone has no record of their own night, and the picture
                  works even for someone who will never install anything. */}
              {!isMe && r.badges.length > 0 && (
                <div style={{ marginTop: "8px", paddingLeft: "26px" }}>
                  <ShareButton compact label={`Send ${r.bowler} their badges`}
                    summary={{ badges: r.badges, bowler: r.bowler, total: r.badges.length, link: linkFor(r.bowler) }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The teaser card that said "there are 22 to collect" and showed
          none is gone -- the Badges tab shows all of them. Naming a
          number with no way to see the list was the worst of both. */}
    </>
  );
}
