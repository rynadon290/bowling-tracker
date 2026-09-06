import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  BAG_TYPES, BAG_TYPE_LABELS, emptyBag, describeCapacity, bagCapacity,
  bagHasRoom, unassignedBalls, isBallInBag, ballsByBagFor,
} from "./domain/bags.js";
import { formatLayout } from "./domain/layouts.js";

function BagEditor({ bag, onChange, onSave, onCancel }) {
  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
      <div style={{ ...S.label, color: C.accent }}>{bag.id ? "Edit Bag" : "New Bag"}</div>

      <div style={{ fontSize: "10px", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Name</div>
      <input style={{ ...S.input, marginBottom: "10px" }}
        placeholder="e.g. Short pattern 5 ball + plastic"
        value={bag.name} onChange={e => onChange({ ...bag, name: e.target.value })} />

      <div style={{ ...S.label, marginBottom: "6px" }}>Type</div>
      <div style={S.chips}>
        {BAG_TYPES.map(t => (
          <Chip key={t} label={BAG_TYPE_LABELS[t]} selected={bag.bagType === t}
            onToggle={() => onChange({ ...bag, bagType: t })} />
        ))}
      </div>

      {bag.bagType === "tournament" && (
        <>
          <div style={{ ...S.label, marginTop: "10px", marginBottom: "4px" }}>Ball Limit</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "6px" }}>
            Leave blank for no limit. A plastic allowance sits on top of this number, the way tournaments word it.
          </div>
          <input style={{ ...S.input, marginBottom: "8px" }} type="number" inputMode="numeric"
            placeholder="e.g. 5"
            value={bag.ballLimit} onChange={e => onChange({ ...bag, ballLimit: e.target.value })} />
          <div style={S.chips}>
            <Chip label="Plastic included" selected={bag.includesPlastic} color={C.strike}
              onToggle={() => onChange({ ...bag, includesPlastic: !bag.includesPlastic })} />
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
            Holds: {describeCapacity(bag)}
            {bagCapacity(bag) !== null && ` (${bagCapacity(bag)} total)`}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        <button style={{ ...S.btn("primary"), flex: 1 }} disabled={!bag.name.trim()} onClick={onSave}>
          {bag.id ? "Save Changes" : "Create Bag"}
        </button>
        <button style={{ ...S.btn(), flex: 1 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function BagManager({
  activeBowler, bags, balls, ballBags, ballLayouts,
  saveBag, deleteBag, toggleBallBag,
}) {
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const bowlerBags = bags.filter(b => b.bowlerName === activeBowler);
  const ballsByBag = ballsByBagFor(ballBags, activeBowler, balls);
  const loose = unassignedBalls(balls, ballsByBag);

  function startNew(type) {
    setEditing({ ...emptyBag(activeBowler, type) });
  }

  function commit() {
    saveBag(editing);
    setEditing(null);
  }

  return (
    <div>
      {editing && (
        <BagEditor bag={editing} onChange={setEditing} onSave={commit} onCancel={() => setEditing(null)} />
      )}

      {!editing && (
        <div style={S.card}>
          <div style={S.label}>Bags</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            What you carry to league differs from what you carry to a tournament — and tournaments often cap how many balls you may bring, so you can keep several.
          </div>
          <div style={S.chips}>
            <Chip label="+ League Bag" onToggle={() => startNew("league")} />
            <Chip label="+ Tournament Bag" onToggle={() => startNew("tournament")} />
          </div>
        </div>
      )}

      {bowlerBags.map(bag => {
        const inBag = ballsByBag[bag.id] || [];
        const capacity = bagCapacity(bag);
        const full = capacity !== null && inBag.length >= capacity;
        return (
          <div key={bag.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{bag.name}</div>
                <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>
                  {BAG_TYPE_LABELS[bag.bagType]} · {inBag.length} ball{inBag.length === 1 ? "" : "s"}
                  {capacity !== null && ` of ${describeCapacity(bag)}`}
                </div>
              </div>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px" }}
                onClick={() => setEditing({ ...bag })}>Edit</button>
              {confirmDelete === bag.id ? (
                <>
                  <button style={{ ...S.btn("warn"), padding: "4px 10px", fontSize: "11px", width: "auto" }}
                    onClick={() => { deleteBag(bag.id); setConfirmDelete(null); }}>Delete</button>
                  <button style={{ ...S.btn(), padding: "4px 8px", fontSize: "11px" }}
                    onClick={() => setConfirmDelete(null)}>Keep</button>
                </>
              ) : (
                <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "16px", padding: "0 4px" }}
                  onClick={() => setConfirmDelete(bag.id)} aria-label={`Delete ${bag.name}`}>×</button>
              )}
            </div>

            {full && (
              <div style={{ fontSize: "11px", color: C.spare, marginBottom: "6px" }}>
                Full — remove a ball before adding another.
              </div>
            )}

            {inBag.length === 0 ? (
              <div style={{ fontSize: "12px", color: C.textMuted }}>Empty. Add balls from below.</div>
            ) : (
              <div style={S.chips}>
                {inBag.map(ball => {
                  const layout = formatLayout(ballLayouts?.[`${activeBowler}|${ball}`]);
                  return (
                    <Chip key={ball} label={layout ? `${ball} · ${layout}  ×` : `${ball}  ×`}
                      selected color={C.accent}
                      onToggle={() => toggleBallBag(activeBowler, ball, bag.id)} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {balls.length > 0 && bowlerBags.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Add Balls to a Bag</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            {loose.length > 0
              ? `${loose.length} ball${loose.length === 1 ? "" : "s"} not packed in any bag. Practice always shows every ball regardless.`
              : "Every ball is packed. Practice always shows every ball regardless."}
          </div>
          {balls.map(ball => {
            const layout = formatLayout(ballLayouts?.[`${activeBowler}|${ball}`]);
            const inAny = bowlerBags.some(bag => isBallInBag(ballBags, activeBowler, ball, bag.id));
            return (
              <div key={ball} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600 }}>{ball}</div>
                <div style={{ fontSize: "11px", color: layout ? C.accent : C.textMuted, marginBottom: "4px" }}>
                  {layout || "No layout recorded"}
                  {!inAny && <span style={{ color: C.textMuted }}> · not in any bag</span>}
                </div>
                <div style={S.chips}>
                  {/* A ball can be in several bags at once -- these are
                      independent toggles, not a single choice. */}
                  {bowlerBags.map(bag => {
                    const isIn = isBallInBag(ballBags, activeBowler, ball, bag.id);
                    const noRoom = !isIn && !bagHasRoom(bag, ballsByBag);
                    return (
                      <Chip key={bag.id} label={noRoom ? `${bag.name} (full)` : bag.name} dense
                        selected={isIn}
                        onToggle={() => { if (!noRoom || isIn) toggleBallBag(activeBowler, ball, bag.id); }}
                        color={noRoom ? C.textMuted : C.accent} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
