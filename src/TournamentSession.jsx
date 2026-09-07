import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  addGame, removeGame, setGameField, addDay, removeDay, setDayField, updateDay,
  dayTotal, dayAverage, dayGamesEntered, cutMargin,
  tournamentTotal, tournamentAverage, tournamentMoney,
} from "./domain/tournaments.js";
import { searchPatterns, describePattern, patternStats } from "./domain/oilPatterns.js";

function fieldLabel(text) {
  return (
    <div style={{ fontSize: "10px", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
      {text}
    </div>
  );
}

// How the bowler has actually scored on this pattern before, across every
// tournament day that named it. Only appears once there's something real
// to show -- a pattern logged for the first time gets nothing rather than
// a row of dashes, and the current tournament's own in-progress day is
// excluded so it isn't comparing today against itself.
function PatternHistory({ patternName, tournaments, excludeTournamentId }) {
  const [open, setOpen] = useState(false);
  const scoped = (tournaments || []).filter(t => !excludeTournamentId || t.id !== excludeTournamentId);
  const stats = patternStats(scoped, patternName);
  if (!stats || !stats.games) return null;

  const cutText = stats.cutsTracked
    ? `${stats.cutsMade}/${stats.cutsTracked} cuts`
    : null;

  return (
    <div style={{ marginTop: "6px" }}>
      <button
        style={{ background: "none", border: "none", padding: 0, fontSize: "11px", color: C.accent, cursor: "pointer", textAlign: "left" }}
        onClick={() => setOpen(o => !o)}>
        {open ? "▾" : "▸"} Your history: {stats.average} avg over {stats.games} game{stats.games === 1 ? "" : "s"}
        {cutText ? ` · ${cutText}` : ""}
      </button>
      {open && (
        <div style={{ marginTop: "6px", padding: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <div style={{ ...S.statBox, padding: "6px" }}>
              <div style={{ ...S.statNum, fontSize: "16px" }}>{stats.average}</div>
              <div style={S.statLbl}>Average</div>
            </div>
            <div style={{ ...S.statBox, padding: "6px" }}>
              <div style={{ ...S.statNum, fontSize: "16px", color: C.strike }}>{stats.high}</div>
              <div style={S.statLbl}>High</div>
            </div>
            <div style={{ ...S.statBox, padding: "6px" }}>
              <div style={{ ...S.statNum, fontSize: "16px", color: C.textMuted }}>{stats.low}</div>
              <div style={S.statLbl}>Low</div>
            </div>
          </div>
          {stats.days.map((d, i) => (
            <div key={`${d.tournamentId}-${d.dayNumber}-${i}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", fontSize: "11px", paddingBottom: "4px", marginBottom: "4px", borderBottom: i < stats.days.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.tournamentName || "Untitled"}
                </div>
                <div style={{ color: C.textMuted, fontSize: "10px" }}>
                  {d.date || "no date"}{d.center ? ` · ${d.center}` : ""}
                  {d.madeCut === true ? " · made cut" : d.madeCut === false ? " · missed cut" : ""}
                </div>
              </div>
              <div style={{ color: C.textMuted, flexShrink: 0 }}>
                {d.scores.length ? d.scores.join(" · ") : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Search-as-you-type over the seeded pattern library, falling back to
// plain free text -- a PBA tournament pattern or a house shot won't be in
// the seed set, and that's expected, not an error state. If it's genuinely
// new, "Save this pattern" adds it to the shared table so it's searchable
// next time, for this bowler or anyone else.
function OilPatternField({ value, onChange, patterns, onSubmitPattern, tournaments, currentTournamentId }) {
  const [focused, setFocused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLength, setNewLength] = useState("");
  const [newRatio, setNewRatio] = useState("");
  const [newVolume, setNewVolume] = useState("");
  const [saved, setSaved] = useState(false);

  const matches = focused ? searchPatterns(value, patterns) : [];
  // An exact match (typed in full, or just selected) shows its specs
  // instead of a dropdown -- no point suggesting alternatives to a pattern
  // already fully identified.
  const trimmed = (value || "").trim();
  const exact = (patterns || []).find(p => p.name.toLowerCase() === trimmed.toLowerCase());
  // Worth offering to save once there's a plausible name and it isn't
  // already in the table -- 3 characters keeps this from popping up on
  // every single keystroke of a short partial name.
  const offerToAdd = trimmed.length >= 3 && !exact && !focused;

  function save() {
    onSubmitPattern?.({
      name: trimmed,
      lengthFeet: newLength ? Number(newLength) : null,
      ratio: newRatio.trim(),
      volumeMl: newVolume ? Number(newVolume) : null,
    });
    setAdding(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={{ position: "relative" }}>
      {fieldLabel("Oil Pattern")}
      <input style={S.input} placeholder="e.g. Krypton, or type your own"
        value={value}
        onChange={e => { onChange(e.target.value); setAdding(false); setSaved(false); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)} />
      {exact && describePattern(exact) && (
        <div style={{ fontSize: "11px", color: exact.verified ? C.accent : C.textMuted, marginTop: "4px" }}>
          {describePattern(exact)}
        </div>
      )}
      {!focused && (
        <PatternHistory patternName={value} tournaments={tournaments} excludeTournamentId={currentTournamentId} />
      )}
      {focused && !exact && matches.length > 0 && (
        <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, marginTop: "2px", backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" }}>
          {matches.map(p => (
            <button key={p.id || p.name}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 10px", cursor: "pointer", color: C.text, borderBottom: `1px solid ${C.border}` }}
              onMouseDown={() => onChange(p.name)}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{p.name}</div>
              {describePattern(p) && <div style={{ fontSize: "11px", color: C.textMuted }}>{describePattern(p)}</div>}
            </button>
          ))}
        </div>
      )}

      {offerToAdd && !adding && !saved && onSubmitPattern && (
        <button style={{ background: "none", border: "none", padding: 0, marginTop: "4px", fontSize: "11px", color: C.accent, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => setAdding(true)}>
          + Save "{trimmed}" for next time
        </button>
      )}
      {saved && (
        <div style={{ fontSize: "11px", color: C.strike, marginTop: "4px" }}>✓ Saved</div>
      )}
      {adding && (
        <div style={{ marginTop: "6px", padding: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "6px" }}>
            Length, ratio, and volume are optional — fill in whatever you know.
          </div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
            <input style={{ ...S.input, flex: 1, fontSize: "12px" }} type="number" placeholder="Feet"
              value={newLength} onChange={e => setNewLength(e.target.value)} />
            <input style={{ ...S.input, flex: 1, fontSize: "12px" }} placeholder="Ratio e.g. 3:1"
              value={newRatio} onChange={e => setNewRatio(e.target.value)} />
            <input style={{ ...S.input, flex: 1, fontSize: "12px" }} type="number" placeholder="mL"
              value={newVolume} onChange={e => setNewVolume(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button style={{ ...S.btn("primary"), flex: 1, padding: "6px", fontSize: "12px" }} onClick={save}>Save</button>
            <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DayBlock({ tournament, day, onChange, canRemoveDay, onRemoveDay, multiDay, oilPatterns, submitOilPattern, tournaments }) {
  const total = dayTotal(day);
  const avg = dayAverage(day);
  const entered = dayGamesEntered(day);
  const margin = cutMargin(day);

  function update(next) { onChange(next); }

  return (
    <div style={{ ...S.card, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={S.label}>{multiDay ? `Day ${day.dayNumber}` : "Block Details"}</div>
        {canRemoveDay && (
          <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px" }} onClick={onRemoveDay}>
            Remove Day
          </button>
        )}
      </div>

      <div style={S.row}>
        <div style={{ flex: 1 }}>
          {fieldLabel("Date")}
          <input style={S.input} type="date" value={day.date}
            onChange={e => update({ ...day, date: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          {fieldLabel("Start Time")}
          <input style={S.input} type="time" value={day.startTime}
            onChange={e => update({ ...day, startTime: e.target.value })} />
        </div>
      </div>

      <div style={{ ...S.row, marginTop: "8px" }}>
        <div style={{ flex: 1 }}>
          {fieldLabel("Squad")}
          <input style={S.input} placeholder="e.g. A, 2, Sat AM" value={day.squad}
            onChange={e => update({ ...day, squad: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          {fieldLabel("Starting Lanes")}
          <input style={S.input} placeholder="e.g. 13-14" value={day.startingLanes}
            onChange={e => update({ ...day, startingLanes: e.target.value })} />
        </div>
      </div>

      <div style={{ ...S.row, marginTop: "8px" }}>
        <div style={{ flex: 1 }}>
          {fieldLabel("Block #")}
          <input style={S.input} placeholder="e.g. 2" value={day.blockNumber}
            onChange={e => update({ ...day, blockNumber: e.target.value })} />
        </div>
        <div style={{ flex: 2 }}>
          <OilPatternField
            value={day.oilPattern}
            onChange={v => update({ ...day, oilPattern: v })}
            patterns={oilPatterns}
            onSubmitPattern={submitOilPattern}
            tournaments={tournaments}
            currentTournamentId={tournament?.id} />
        </div>
      </div>

      <div style={S.divider} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={S.label}>Games</div>
        <button style={{ ...S.btn(), padding: "4px 12px", fontSize: "12px" }} onClick={() => update(addGame(day))}>
          + Game
        </button>
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
        Tournaments usually move pairs after every game, so each game gets its own.
      </div>

      {(day.games || []).map(g => (
        <div key={g.gameNumber} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
          <div style={{ fontSize: "12px", color: C.textMuted, width: "28px" }}>G{g.gameNumber}</div>
          <input style={{ ...S.input, flex: 1, fontSize: "13px", padding: "6px 10px" }}
            type="number" inputMode="numeric" placeholder="Score"
            value={g.score} onChange={e => update(setGameField(day, g.gameNumber, "score", e.target.value))} />
          <input style={{ ...S.input, flex: 1, fontSize: "13px", padding: "6px 10px" }}
            placeholder="Pair" value={g.lanePair}
            onChange={e => update(setGameField(day, g.gameNumber, "lanePair", e.target.value))} />
          {(day.games || []).length > 1 && (
            <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "16px", padding: "0 4px" }}
              onClick={() => update(removeGame(day, g.gameNumber))} aria-label={`Remove game ${g.gameNumber}`}>×</button>
          )}
        </div>
      ))}

      {total !== null && (
        <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
          <div style={S.statBox}>
            <div style={{ ...S.statNum, fontSize: "18px", color: C.accent }}>{total}</div>
            <div style={S.statLbl}>Total ({entered}g)</div>
          </div>
          <div style={S.statBox}>
            <div style={{ ...S.statNum, fontSize: "18px" }}>{avg === null ? "—" : avg.toFixed(1)}</div>
            <div style={S.statLbl}>Average</div>
          </div>
        </div>
      )}

      <div style={S.divider} />

      <div style={S.label}>Cut Line</div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
        The total to beat. Above the line is good.
      </div>
      <input style={S.input} type="number" inputMode="numeric" placeholder="Posted cut total"
        value={day.cutLine} onChange={e => update({ ...day, cutLine: e.target.value })} />

      {margin !== null && (
        <div style={{ textAlign: "center", marginTop: "8px", fontSize: "13px", fontWeight: 700, color: margin >= 0 ? C.strike : C.miss }}>
          {margin >= 0 ? `▲ +${margin} above the cut` : `▼ ${margin} below the cut`}
        </div>
      )}

      <div style={{ ...S.label, marginTop: "10px" }}>Made the Cut?</div>
      <div style={S.chips}>
        <Chip label="Yes" selected={day.madeCut === true} color={C.strike}
          onToggle={() => update({ ...day, madeCut: day.madeCut === true ? null : true })} />
        <Chip label="No" selected={day.madeCut === false} color={C.miss}
          onToggle={() => update({ ...day, madeCut: day.madeCut === false ? null : false })} />
      </div>
      {day.madeCut === null && (
        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px" }}>
          Usually not known until the squad finishes — leave blank until then.
        </div>
      )}

      <div style={{ ...S.label, marginTop: "10px" }}>Day Notes</div>
      <textarea style={{ ...S.input, minHeight: "50px", resize: "vertical" }}
        placeholder="Transition, ball reaction, what worked…"
        value={day.notes} onChange={e => update({ ...day, notes: e.target.value })} />
    </div>
  );
}

export default function TournamentSession({ tournament, onChange, onSave, saved, oilPatterns, submitOilPattern, tournaments }) {
  const total = tournamentTotal(tournament);
  const avg = tournamentAverage(tournament);
  const money = tournamentMoney(tournament);
  const multiDay = (tournament.days || []).length > 1;

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Tournament</div>
        <div style={{ marginBottom: "8px" }}>
          {fieldLabel("Name")}
          <input style={S.input} placeholder="e.g. Spring Masters"
            value={tournament.name} onChange={e => onChange({ ...tournament, name: e.target.value })} />
        </div>
        <div>
          {fieldLabel("Center")}
          <input style={S.input} placeholder="e.g. Bowlero Pittsburgh"
            value={tournament.center} onChange={e => onChange({ ...tournament, center: e.target.value })} />
        </div>
      </div>

      {(tournament.days || []).map(day => (
        <DayBlock key={day.dayNumber}
          tournament={tournament}
          day={day}
          multiDay={multiDay}
          canRemoveDay={(tournament.days || []).length > 1}
          onRemoveDay={() => onChange(removeDay(tournament, day.dayNumber))}
          onChange={next => onChange(updateDay(tournament, day.dayNumber, () => next))}
          oilPatterns={oilPatterns}
          submitOilPattern={submitOilPattern}
          tournaments={tournaments} />
      ))}

      <button style={{ ...S.btn(), width: "100%", marginBottom: "12px" }} onClick={() => onChange(addDay(tournament))}>
        + Add Another Day
      </button>

      {multiDay && total !== null && (
        <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
          <div style={{ ...S.label, color: C.accent }}>Tournament Total</div>
          <div style={{ display: "flex", gap: "6px" }}>
            <div style={{ ...S.statBox, border: `1px solid ${C.accent}44` }}>
              <div style={{ ...S.statNum, fontSize: "20px", color: C.accent }}>{total}</div>
              <div style={S.statLbl}>All Days</div>
            </div>
            <div style={S.statBox}>
              <div style={{ ...S.statNum, fontSize: "20px" }}>{avg === null ? "—" : avg.toFixed(1)}</div>
              <div style={S.statLbl}>Average</div>
            </div>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Entry &amp; Winnings</div>
        <div style={S.row}>
          <div style={{ flex: 1 }}>
            {fieldLabel("Buy-in $")}
            <input style={S.input} type="number" inputMode="decimal" placeholder="0"
              value={tournament.buyIn} onChange={e => onChange({ ...tournament, buyIn: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            {fieldLabel("Winnings $")}
            <input style={S.input} type="number" inputMode="decimal" placeholder="0"
              value={tournament.winnings} onChange={e => onChange({ ...tournament, winnings: e.target.value })} />
          </div>
        </div>
        {(money.buyIn !== 0 || money.winnings !== 0) && (
          <div style={{ textAlign: "center", marginTop: "8px", fontSize: "13px", fontWeight: 700, color: money.net >= 0 ? C.strike : C.miss }}>
            {money.net < 0 ? "−" : ""}${Math.abs(money.net).toFixed(2)} net
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>Tournament Notes</div>
        <textarea style={{ ...S.input, minHeight: "60px", resize: "vertical" }}
          placeholder="Overall takeaways…"
          value={tournament.notes} onChange={e => onChange({ ...tournament, notes: e.target.value })} />
      </div>

      <button style={S.btn("primary")} onClick={onSave}>
        {saved ? "✓ Tournament Saved" : "Save Tournament"}
      </button>
      <div style={{ height: "24px" }} />
    </div>
  );
}
