import { C, S, Chip } from "./ui.jsx";
import {
  addGame, removeGame, setGameField, addDay, removeDay, setDayField, updateDay,
  dayTotal, dayAverage, dayGamesEntered, cutMargin,
  tournamentTotal, tournamentAverage, tournamentMoney,
} from "./domain/tournaments.js";

function fieldLabel(text) {
  return (
    <div style={{ fontSize: "10px", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
      {text}
    </div>
  );
}

function DayBlock({ tournament, day, onChange, canRemoveDay, onRemoveDay, multiDay }) {
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
          {fieldLabel("Oil Pattern")}
          <input style={S.input} placeholder="e.g. Chameleon 39" value={day.oilPattern}
            onChange={e => update({ ...day, oilPattern: e.target.value })} />
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

export default function TournamentSession({ tournament, onChange, onSave, saved }) {
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
          onChange={next => onChange(updateDay(tournament, day.dayNumber, () => next))} />
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
