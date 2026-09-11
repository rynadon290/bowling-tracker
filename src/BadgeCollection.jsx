import { C, S } from "./ui.jsx";
import { CASUAL_BADGES, badgesFor, casualStatsFor } from "./domain/casualBadges.js";

// The badge collection.
//
// Casual mode used to be two tabs: log a score, see who won. Both are
// about tonight, and nothing in the app showed that it was keeping
// anything. Round 7's Finding 1 was exactly this -- casual bowlers never
// learned it tracked anything, because nothing accumulated in front of
// them.
//
// A leaderboard answers "who won". A collection answers "what have I
// done" -- which is the only reason a group that bowls four times a year
// opens the app again in March.
//
// EVERY badge is shown, earned or not, with its condition readable.
//
// A trophy cabinet of things you already have is a record. A board
// showing the fifteen you haven't is a list of things to go and do --
// "beat someone averaging 30 more than you" is a plan for Friday. Hiding
// them would make each one a surprise, which sounds nicer and gives a
// casual bowler nothing to aim at.
export default function BadgeCollection({ nights = [], me = "" }) {
  const stats = casualStatsFor(me, nights);
  const earned = badgesFor(stats);
  const earnedIds = new Set(earned.map(b => b.id));

  const total = CASUAL_BADGES.length;
  const got = earned.length;

  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Your badges</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px" }}>
          <div style={{ fontSize: "28px", fontWeight: 700, color: C.text, lineHeight: 1 }}>{got}</div>
          <div style={{ fontSize: "13px", color: C.textMuted }}>of {total}</div>
        </div>

        {/* A bar rather than a percentage. "32%" invites a comparison with
            other people; a bar that fills is just yours. */}
        <div style={{ height: "8px", backgroundColor: C.surface, borderRadius: "4px", overflow: "hidden" }}>
          <div style={{
            width: `${total ? Math.round((got / total) * 100) : 0}%`,
            height: "100%", backgroundColor: C.accent, borderRadius: "4px",
          }} />
        </div>

        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "10px", lineHeight: 1.5 }}>
          {got === 0
            ? "Bowl a night with the group and the first one is yours."
            : got === total
              ? "Every one of them. Including the ones nobody wants."
              : "Not all of them are about bowling well — some are about showing up, and one or two you'd rather not have."}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>The collection</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "8px" }}>
          {CASUAL_BADGES.map(b => {
            const have = earnedIds.has(b.id);
            return (
              <div key={b.id} style={{
                display: "flex", alignItems: "flex-start", gap: "10px",
                padding: "9px 10px", borderRadius: "8px",
                backgroundColor: have ? C.accent + "11" : "transparent",
                border: `1px solid ${have ? C.accent + "33" : "transparent"}`,
              }}>
                {/* Unearned badges keep their emoji, dimmed, rather than
                    showing a lock. You can see what you are missing, which
                    is the point of a collection. */}
                <div style={{ fontSize: "20px", lineHeight: 1.2, opacity: have ? 1 : 0.3, flexShrink: 0 }}
                  aria-hidden="true">{b.emoji}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: "13px", fontWeight: have ? 600 : 500,
                    color: have ? C.text : C.textMuted,
                  }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: "11px", color: C.textMuted, lineHeight: 1.45 }}>
                    {b.blurb}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
