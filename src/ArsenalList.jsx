import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  LAYOUT_SYSTEMS, LAYOUT_SYSTEM_LABELS, LAYOUT_FIELDS,
  emptyLayout, normalizeLayout, formatLayout, layoutFieldErrors,
  setLayoutSystem, setLayoutValue,
} from "./domain/layouts.js";
import BallCatalogPanel from "./BallCatalogPanel.jsx";
import { rejectedBallsFor, ballKey } from "./domain/ballCatalog.js";
import {
  COVERSTOCKS, CORE_TYPES, COVERSTOCK_LABELS, CORE_TYPE_LABELS,
  GROUP_MODES, GROUP_MODE_LABELS, normalizeBallSpecs,
  setSpecField, describeSpecs, groupBalls,
} from "./domain/ballSpecs.js";

function SpecEditor({ specs, groups, onChange }) {
  const s = normalizeBallSpecs(specs);
  const numField = (key, label, placeholder, step) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "3px" }}>{label}</div>
      <input style={{ ...S.input, fontSize: "13px", padding: "6px 8px" }}
        type="number" step={step} inputMode="decimal" placeholder={placeholder}
        value={s[key]} onChange={e => onChange(setSpecField(s, key, e.target.value))} />
    </div>
  );

  return (
    <div style={{ marginTop: "8px" }}>
      {groups.length > 0 && (
        <>
          <div style={{ ...S.label, marginBottom: "6px" }}>Group</div>
          <div style={S.chips}>
            <Chip label="Ungrouped" dense selected={!s.groupId}
              onToggle={() => onChange(setSpecField(s, "groupId", ""))} />
            {groups.map(g => (
              <Chip key={g.id} label={g.name} dense selected={s.groupId === g.id}
                onToggle={() => onChange(setSpecField(s, "groupId", g.id))} />
            ))}
          </div>
        </>
      )}

      <div style={{ ...S.label, marginTop: "10px", marginBottom: "6px" }}>Coverstock</div>
      <div style={S.chips}>
        {COVERSTOCKS.map(cs => (
          <Chip key={cs} label={COVERSTOCK_LABELS[cs]} dense selected={s.coverstock === cs}
            onToggle={() => onChange(setSpecField(s, "coverstock", s.coverstock === cs ? "" : cs))} />
        ))}
      </div>

      <div style={{ ...S.label, marginTop: "10px", marginBottom: "6px" }}>Core</div>
      <div style={S.chips}>
        {CORE_TYPES.map(ct => (
          <Chip key={ct} label={CORE_TYPE_LABELS[ct]} dense selected={s.coreType === ct}
            onToggle={() => onChange(setSpecField(s, "coreType", s.coreType === ct ? "" : ct))} />
        ))}
      </div>

      <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
        {numField("weight", "Weight (lb)", "15", "1")}
        {numField("rg", "RG", "2.50", "0.001")}
        {numField("diff", "Diff", "0.045", "0.001")}
      </div>

      {/* Intermediate differential exists only on asymmetric balls, so the
          field appears only when it is meaningful. Switching back to
          symmetric clears any value rather than leaving a stale one. */}
      {s.coreType === "asymmetric" && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
          {numField("intDiff", "Int. Diff (asymmetric only)", "0.020", "0.001")}
        </div>
      )}
    </div>
  );
}

// Editor for one ball's drilling layout. The three systems each get their
// own labeled fields, because their numbers measure different reference
// points -- a generic "three numbers" form would silently let someone
// record a VLS layout under Dual Angle labels and never notice.
function LayoutEditor({ layout, onChange }) {
  const current = normalizeLayout(layout) || emptyLayout();
  const errors = layoutFieldErrors(current);

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ ...S.label, marginBottom: "6px" }}>Layout System</div>
      <div style={S.chips}>
        {LAYOUT_SYSTEMS.map(sys => (
          <Chip key={sys} label={LAYOUT_SYSTEM_LABELS[sys]} dense
            selected={current.system === sys}
            onToggle={() => onChange(setLayoutSystem(current, sys))} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        {LAYOUT_FIELDS[current.system].map(f => (
          <div key={f.key} style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "3px" }}>
              {f.label} ({f.unit})
            </div>
            <input
              style={{
                ...S.input, fontSize: "13px", padding: "6px 8px",
                border: `1px solid ${errors[f.key] ? C.miss : C.border}`,
              }}
              type="number" step={f.step} inputMode="decimal"
              placeholder={f.unit}
              value={current.values[f.key]}
              onChange={e => onChange(setLayoutValue(current, f.key, e.target.value))} />
            {errors[f.key] && (
              <div style={{ fontSize: "10px", color: C.miss, marginTop: "2px" }}>{errors[f.key]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The arsenal list. Each ball is its own row rather than a bare chip,
// because a ball now carries a layout worth showing at a glance -- and
// because removal deserves an explicit button rather than "tapping the
// ball itself deletes it", which is easy to do by accident on a phone.
export default function ArsenalList({
  activeBowler, balls, ballLayouts, setBallLayout, removeBall,
  ballSpecs, setBallSpec, ballGroups, seedDefaultGroups, saveBallGroup, deleteBallGroup,
  catalogEntries, catalogAck, userId, publishBallSpecs, voteOnEntry, acknowledgeRejection,
}) {
  // Normalised once, here, rather than at each of the four read sites.
  // An arsenal that has not loaded yet is an empty one.
  balls = Array.isArray(balls) ? balls : [];
  const [openBall, setOpenBall] = useState(null);
  const [openTab, setOpenTab] = useState("specs");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [groupMode, setGroupMode] = useState("none");
  const [newGroupName, setNewGroupName] = useState("");

  const groups = (ballGroups || []).filter(g => g.bowlerName === activeBowler);
  const specsByBall = {};
  // An arsenal that has not loaded is an empty one, not a crash.
  balls.forEach(b => { specsByBall[b] = normalizeBallSpecs(ballSpecs?.[`${activeBowler}|${b}`]); });

  if (!balls.length) {
    return (
      <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "8px" }}>
        Add {activeBowler}'s balls to start logging shots.
      </div>
    );
  }

  const sections = groupBalls(groupMode, balls, specsByBall, groups);

  function renderBall(ball) {
    const key = `${activeBowler}|${ball}`;
    const layout = formatLayout(ballLayouts?.[key]);
    const specText = describeSpecs(specsByBall[ball]);
    const isOpen = openBall === ball;
    return (
      <div key={ball} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "8px", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{ball}</div>
            {specText && (
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>{specText}</div>
            )}
            <div style={{ fontSize: "11px", color: layout ? C.accent : C.textMuted, marginTop: "2px" }}>
              {layout || "No layout recorded"}
            </div>
          </div>
          <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px" }}
            onClick={() => setOpenBall(isOpen ? null : ball)}>
            {isOpen ? "Done" : "Details"}
          </button>
          {confirmRemove === ball ? (
            <>
              <button style={{ ...S.btn("warn"), padding: "4px 10px", fontSize: "11px", width: "auto" }}
                onClick={() => { removeBall(activeBowler, ball); setConfirmRemove(null); }}>Remove</button>
              <button style={{ ...S.btn(), padding: "4px 8px", fontSize: "11px" }}
                onClick={() => setConfirmRemove(null)}>Cancel</button>
            </>
          ) : (
            <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "16px", padding: "0 4px" }}
              onClick={() => setConfirmRemove(ball)} aria-label={`Remove ${ball}`}>×</button>
          )}
        </div>

        {isOpen && (
          <>
            <div style={{ ...S.chips, marginTop: "8px" }}>
              <Chip label="Specs" dense selected={openTab === "specs"} onToggle={() => setOpenTab("specs")} />
              <Chip label="Layout" dense selected={openTab === "layout"} onToggle={() => setOpenTab("layout")} />
            </div>
            {openTab === "specs" ? (
              <>
                <SpecEditor specs={specsByBall[ball]} groups={groups}
                  onChange={next => setBallSpec(activeBowler, ball, next)} />
                {publishBallSpecs && (
                  <BallCatalogPanel
                    ballName={ball}
                    userId={userId}
                    entries={catalogEntries?.[ballKey(ball)] || []}
                    myOwnSpecs={specsByBall[ball]}
                    onApply={specs => setBallSpec(activeBowler, ball, specs)}
                    onPublish={publishBallSpecs}
                    onVote={voteOnEntry} />
                )}
              </>
            ) : (
              <LayoutEditor layout={ballLayouts?.[key]}
                onChange={next => setBallLayout(activeBowler, ball, next)} />
            )}
          </>
        )}
      </div>
    );
  }

  const rejected = rejectedBallsFor(balls, catalogEntries || {}, catalogAck || []);

  return (
    <div style={{ marginBottom: "10px" }}>
      {/* Community specs for a ball this bowler owns were disputed and
          removed. The ball itself stays -- they know they own it; only the
          numbers were in question. */}
      {rejected.map(ball => (
        <div key={ball} style={{ ...S.card, border: `1px solid ${C.miss}44`, marginBottom: "10px" }}>
          <div style={{ ...S.label, color: C.miss }}>Specs Removed</div>
          <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "8px" }}>
            Other bowlers reported the shared specs for <strong style={{ color: C.text }}>{ball}</strong> as incorrect, so they've been removed. You still have the ball — just re-enter its details when you get a chance.
          </div>
          <button style={{ ...S.btn(), width: "100%" }} onClick={() => acknowledgeRejection?.(ball)}>
            Got it
          </button>
        </div>
      ))}

      {/* Grouping only appears once the list is long enough to need it --
          sorting four balls into buckets is more work than scanning them. */}
      {balls.length > 4 && (
        <>
          <div style={{ ...S.label, marginBottom: "6px" }}>Group by</div>
          <div style={{ ...S.chips, marginBottom: "10px" }}>
            {GROUP_MODES.map(mode => (
              <Chip key={mode} label={GROUP_MODE_LABELS[mode]} dense selected={groupMode === mode}
                onToggle={() => {
                  if (mode === "group" && groups.length === 0) seedDefaultGroups?.(activeBowler);
                  setGroupMode(mode);
                }} />
            ))}
          </div>
        </>
      )}

      {/* The groups themselves.

          "My groups" seeded six defaults and then offered no way to see
          them, rename one, add one or delete one -- the handlers were
          passed all the way down and never rendered. And the only place a
          ball's group could be set was inside that ball's spec editor,
          which nothing pointed at. So the mode looked like a feature with
          the middle missing. */}
      {groupMode === "group" && saveBallGroup && (
        <div style={{ ...S.card, backgroundColor: C.surface, padding: "10px 12px", marginBottom: "12px" }}>
          <div style={{ ...S.label, marginBottom: "6px" }}>Your groups</div>
          {groups.map(g => (
            <div key={g.id} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
              <input style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: "12px", padding: "6px 8px" }}
                value={g.name}
                onChange={e => saveBallGroup({ ...g, name: e.target.value })} />
              <button style={{ ...S.btn(), width: "auto", padding: "6px 10px", fontSize: "11px" }}
                onClick={() => { if (window.confirm(`Delete "${g.name}"? Its balls become ungrouped.`)) deleteBallGroup?.(g.id); }}>
                Delete
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
            <input style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: "12px", padding: "6px 8px" }}
              value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newGroupName.trim()) { saveBallGroup({ name: newGroupName.trim(), sortOrder: groups.length }); setNewGroupName(""); } }}
              placeholder="New group, e.g. Dry lanes" />
            <button style={{ ...S.btn("primary"), width: "auto", padding: "6px 12px", fontSize: "11px" }}
              disabled={!newGroupName.trim()}
              onClick={() => { saveBallGroup({ name: newGroupName.trim(), sortOrder: groups.length }); setNewGroupName(""); }}>
              Add
            </button>
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "8px", lineHeight: 1.5 }}>
            To put a ball in a group, open the ball and pick the group under its specs.
          </div>
        </div>
      )}

      {sections.map(section => (
        <div key={section.key} style={{ marginBottom: groupMode === "none" ? 0 : "14px" }}>
          {groupMode !== "none" && (
            <div style={{ fontSize: "13px", fontWeight: 600, color: C.text, marginBottom: "6px" }}>
              {section.label} · {section.balls.length}
            </div>
          )}
          {section.balls.map(renderBall)}
        </div>
      ))}
    </div>
  );
}
