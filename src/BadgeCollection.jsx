import { C, S } from "./ui.jsx";
import { useState, useEffect } from "react";
import { CASUAL_BADGES, badgesFor, casualStatsFor, badgeHistory } from "./domain/casualBadges.js";
import { decodeShare, nightsFromPayload, mergeSharedNights, describeImport } from "./domain/badgeShare.js";

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
export default function BadgeCollection({
  nights = [], me = "", onImportNights, pendingImport, onPendingImportDone,
  // Injected by competitive modes. Left undefined, the component works
  // out casual badges from nights itself -- so the casual tab is
  // unchanged and the competitive one supplies its own pool.
  badges: injectedBadges, history: injectedHistory, lockedNote,
}) {
  const usingInjected = Array.isArray(injectedBadges) && !!injectedHistory;
  const allBadges = usingInjected ? injectedBadges : CASUAL_BADGES;

  const stats = usingInjected ? null : casualStatsFor(me, nights);
  const earnedIds = usingInjected
    ? new Set(Object.values(injectedHistory).filter(r => r && r.count).map(r => r.id))
    : new Set(badgesFor(stats).map(b => b.id));
  // How many times, and when last -- worked out by replaying the nights
  // in order. A chip saying "Two hundred" is a fact; "3 times, most
  // recently 18 Sept" is a record.
  const history = usingInjected ? injectedHistory : badgeHistory(me, nights);

  // All / earned / still to get.
  //
  // "All" stays the default because the unearned ones are the point --
  // a collection you can see the gaps in. The filter is for the two
  // other questions people actually ask: what have I got, and what is
  // left.
  const [filter, setFilter] = useState("all");
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");

  // A link that was tapped rather than a code that was pasted. Same
  // merge, so the same guarantees -- twice changes nothing.
  useEffect(() => {
    if (!pendingImport || !onImportNights) return;
    const incoming = nightsFromPayload(pendingImport, me);
    const merged = mergeSharedNights(nights, incoming, me);
    onImportNights(merged.nights);
    setResult(describeImport(merged));
    onPendingImportDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport]);

  function loadCode() {

    const payload = decodeShare(code);
    if (!payload) { setResult("That code did not work. Check it came through in one piece."); return; }
    // Filed under the name THIS app uses, not the name the sender typed.
    const incoming = nightsFromPayload(payload, me);
    const merged = mergeSharedNights(nights, incoming, me);
    onImportNights?.(merged.nights);
    setResult(describeImport(merged));
    setCode("");
  }

  const total = allBadges.length;
  const got = earnedIds.size;

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
            ? (usingInjected
                ? "Bowl a league night, a tournament or a practice session to start."
                : "Bowl a night with the group and the first one is yours.")
            : got === total
              ? (usingInjected
                  ? "Every one of them."
                  : "Every one of them. Including the ones nobody wants.")
              : (usingInjected
                  /* The competitive set has no self-deprecating badges --
                     no wooden spoon, no gutter night. Against people you
                     are seriously competing with those read as mockery,
                     so the line that sells them casually would be wrong
                     here. */
                  ? "Some come from one good night, some take a season."
                  : "Not all of them are about bowling well — some are about showing up, and one or two you'd rather not have.")}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={S.label}>The collection</div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[["all", "All"], ["earned", `Earned ${got}`], ["locked", `Left ${total - got}`]].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                style={{
                  background: filter === key ? C.accent + "22" : "none",
                  border: `1px solid ${filter === key ? C.accent + "55" : C.border}`,
                  borderRadius: "999px", padding: "3px 10px", cursor: "pointer",
                  fontSize: "11px", fontWeight: filter === key ? 600 : 500,
                  color: filter === key ? C.accent : C.textMuted,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "8px" }}>
          {CASUAL_BADGES.filter(b => filter === "all"
            || (filter === "earned") === earnedIds.has(b.id)).map(b => {
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
                  {/* Where a locked badge CAN be earned. Without this a
                      practice-only badge is just a grey square to a league
                      bowler, with no way to find out why. */}
                  {!have && lockedNote && lockedNote(b.id) && (
                    <div style={{ fontSize: "10.5px", color: C.textMuted, marginTop: "2px", opacity: 0.8 }}>
                      {lockedNote(b.id)}
                    </div>
                  )}
                  {have && (history[b.id]?.lastDate || history[b.id]?.count > 1) && (
                    <div style={{ fontSize: "11px", color: C.accent, marginTop: "2px" }}>
                      {history[b.id].count > 1 ? `${history[b.id].count} times` : "Earned"}
                      {history[b.id].lastDate ? ` · ${prettyDate(history[b.id].lastDate)}` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {filter === "earned" && got === 0 && (
            <div style={{ fontSize: "12px", color: C.textMuted, padding: "12px 10px" }}>
              {usingInjected ? "None yet." : "None yet. Bowl a night with the group and the first one is yours."}
            </div>
          )}
          {filter === "locked" && got === total && (
            <div style={{ fontSize: "12px", color: C.textMuted, padding: "12px 10px" }}>
              Nothing left. You have all of them.
            </div>
          )}
        </div>
      </div>

      {onImportNights && (
        <div style={S.card}>
          <div style={S.label}>Someone sent you your badges?</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px", lineHeight: 1.5 }}>
            Paste the code from their message and your nights come across. Doing it twice is
            harmless — nothing doubles up.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: "12px" }}
              value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadCode(); }}
              placeholder="Paste the code" />
            <button style={{ ...S.btn("primary"), width: "auto", flexShrink: 0, padding: "9px 16px", fontSize: "13px" }}
              disabled={!code.trim()} onClick={loadCode}>Load</button>
          </div>
          {result && (
            <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "10px" }}>{result}</div>
          )}
        </div>
      )}
    </>
  );
}

// "18 Sept" rather than "2026-09-18". Nobody thinks of their bowling
// night as an ISO string.
function prettyDate(iso) {
  const d = new Date(String(iso) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
