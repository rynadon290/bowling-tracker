import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import { formatDate } from "./constants.js";

const PAGE_SIZE = 15;

// Every saved session, newest first. Lives under Settings → History rather
// than on the Stats tab: it's a long reference list that grows without
// bound, and it was pushing the actual analysis off the bottom of a phone
// screen. Looking up "what did I shoot three weeks ago" is a deliberate
// act, not something you want between you and your averages.
export default function SessionHistory({ sessions, bowlers, leagues, teams = [], displayName = "", statsBowler, setStatsBowler, statsLeague, setStatsLeague }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Your own sessions only. The sessions array also holds nights logged
  // on behalf of teammates, which aren't yours to browse or act on from
  // your own history screen -- hiding the bowler filter without scoping
  // the data would have left theirs mixed into the list.
  const mine = sessions.filter(s => !displayName || s.bowler === displayName);
  const filtered = mine
    .filter(s => (!statsLeague || s.league === statsLeague));
  const ordered = [...filtered].reverse();
  const visible = ordered.slice(0, visibleCount);

  // Filters change which sessions match, so a stale expanded count from a
  // previous bowler/league would either hide sessions that should now be
  // visible or keep showing "Load More" past the end of a smaller list.
  function updateFilter(setter, value) {
    setVisibleCount(PAGE_SIZE);
    setter(value);
  }

  // One option per league the bowler has sessions in, labelled with the
  // team's name when a team exists for it. Falls back to the league name
  // so a league without a team is still filterable rather than vanishing.
  const teamOptions = (leagues || []).map(l => {
    const team = (teams || []).find(t => t.league === l);
    return { league: l, name: team?.name || String(l).replace(" House Shot", "") };
  });

  return (
    <div>
      {/* Two separate filters, each with its own heading.
      
          They used to be two chip rows stacked under a single "Filter"
          label, so nothing said they were different dimensions -- a row
          of names above a row of teams reads as one long list of things
          to pick between, not two independent choices. */}
      {teamOptions.length > 1 && (
        <div style={S.card}>
          {/* No bowler filter: this is your own session history. The local
              roster also holds teammates you log for, and their nights
              aren't yours to browse from here. */}
          {/* Team rather than league: a league can hold several teams,
              and the team is the group a session actually belongs to.
              statsLeague still carries the value, since that's the key
              sessions are filed under -- the team just supplies it. */}
          {teamOptions.length > 1 && (
            <>
              <div style={S.label}>Filter</div>
              <div style={S.chips}>
                <Chip label="All teams" selected={!statsLeague} onToggle={() => updateFilter(setStatsLeague, "")} />
                {teamOptions.map(t => (
                  <Chip key={t.league} label={t.name} selected={statsLeague === t.league}
                    onToggle={() => updateFilter(setStatsLeague, t.league)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Session History</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
          {filtered.length === 0
            ? "0 sessions"
            : `Showing ${visible.length} of ${filtered.length}, newest first.`}
        </div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: 1.5 }}>Nothing saved yet. Finish a night with "End session" on the Log tab and it lands here.</div>
        ) : (
          <>
            {visible.map(s => (
              <div key={s.id} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "10px", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>
                    {!statsBowler && s.bowler ? `${s.bowler} · ` : ""}{s.league.replace(" House Shot", "")}
                  </span>
                  <span style={{ fontSize: "11px", color: C.textMuted }}>{formatDate(s.date)}</span>
                </div>
                <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
                  {s.scores.map((sc, i) => <span key={i} style={{ fontSize: "13px", fontWeight: 600 }}>{sc}</span>)}
                  <span style={{ fontSize: "13px", color: C.textMuted }}>·</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: C.accent }}>{s.total}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  <span style={S.tag(C.strike)}>{s.shotCount ? Math.round((s.strikes / s.shotCount) * 100) : 0}% strikes</span>
                  <span style={S.tag(C.miss)}>{s.tenPinLeaves ?? (s.weakTens + s.ringingTens)} ten pins</span>
                  {s.spareAttempts > 0 && <span style={S.tag(C.spare)}>{Math.round((s.sparesMade / s.spareAttempts) * 100)}% spares</span>}
                  {s.splits > 0 && <span style={S.tag(C.miss)}>{s.splits} splits</span>}
                </div>
              </div>
            ))}
            {visible.length < filtered.length && (
              <button style={{ ...S.btn(), width: "100%" }} onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} More
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
