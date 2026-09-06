import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import ArsenalList from "./ArsenalList.jsx";
import BagManager from "./BagManager.jsx";
import BallNameInput from "./BallNameInput.jsx";
import CenterPicker from "./CenterPicker.jsx";
import { centerLabel } from "./domain/centers.js";
import {
  emptyProfile, normalizeProfile, addHomeCenter, removeHomeCenter,
  setProfileField, membershipFor, resolveHomeCenters,
} from "./domain/profiles.js";

export default function Profile({
  bowlers, activeBowler, selectBowler,
  profiles, setProfile, teams,
  arsenals, ballLayouts, setBallLayout, removeBall,
  newBallName, setNewBallName, addBall,
  bags, ballBags, saveBag, deleteBag, toggleBallBag,
  centers, ensureCenter, searchCenters,
  ballSpecs, setBallSpec, ballGroups, saveBallGroup, deleteBallGroup, seedDefaultGroups,
  catalogEntries, catalogAck, userId, publishBallSpecs, voteOnEntry, acknowledgeRejection,
}) {
  const [addingCenter, setAddingCenter] = useState(false);

  if (!bowlers.length) {
    return (
      <div style={S.card}>
        <div style={S.label}>Profile</div>
        <div style={{ fontSize: "12px", color: C.textMuted }}>
          Add a bowler on the Log tab first — profiles are per bowler.
        </div>
      </div>
    );
  }

  const profile = normalizeProfile(profiles[activeBowler], activeBowler) || emptyProfile(activeBowler);
  const membership = membershipFor(activeBowler, teams);
  const balls = arsenals[activeBowler] || [];
  const resolvedHomeCenters = resolveHomeCenters(profile, centers || []);

  function update(next) {
    setProfile(activeBowler, next);
  }

  return (
    <div>
      {bowlers.length > 1 && (
        <div style={S.card}>
          <div style={S.label}>Whose Profile</div>
          <div style={S.chips}>
            {bowlers.map(b => (
              <Chip key={b} label={b} selected={activeBowler === b} onToggle={() => selectBowler(b)} />
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>{activeBowler}</div>

        <div style={{ ...S.label, marginTop: "10px" }}>Handedness</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          A lefty's corner pin is the 7, not the 10 — this flips the result chips on the Log tab to match.
        </div>
        <div style={S.chips}>
          <Chip label="Right-handed" selected={!profile.leftHanded}
            onToggle={() => update(setProfileField(profile, "leftHanded", false))} />
          <Chip label="Left-handed" selected={profile.leftHanded}
            onToggle={() => update(setProfileField(profile, "leftHanded", true))} />
        </div>

        <div style={{ ...S.label, marginTop: "10px" }}>Delivery</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Two-handed and no-thumb players are who the 2LS drilling layout system is built for.
        </div>
        <div style={S.chips}>
          <Chip label="One-handed" selected={!profile.twoHanded}
            onToggle={() => update(setProfileField(profile, "twoHanded", false))} />
          <Chip label="Two-handed / no thumb" selected={profile.twoHanded}
            onToggle={() => update(setProfileField(profile, "twoHanded", true))} />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Book Average</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Your official average from last season. Shown until enough games are
          logged here, then blended out — weighted by how many games sit
          behind each number.
        </div>
        <div style={S.row}>
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="decimal" placeholder="e.g. 213"
            value={profile.bookAverage} onChange={e => update(setProfileField(profile, "bookAverage", e.target.value))} />
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="numeric" placeholder="over how many games"
            value={profile.bookGames} onChange={e => update(setProfileField(profile, "bookGames", e.target.value))} />
        </div>
        <input style={{ ...S.input, marginTop: "6px" }} placeholder="Season (e.g. 2025-26 Winter)"
          value={profile.bookSeason} onChange={e => update(setProfileField(profile, "bookSeason", e.target.value))} />
      </div>

      <div style={S.card}>
        <div style={S.label}>Home Centers</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          The houses this bowler plays regularly. Looked up so they match the
          same centers your leagues use.
        </div>
        {resolvedHomeCenters.length > 0 && (
          <div style={{ ...S.chips, marginBottom: "8px" }}>
            {resolvedHomeCenters.map(center => (
              <Chip key={center.id} label={`${centerLabel(center)}  ×`} selected color={C.accent}
                onToggle={() => update(removeHomeCenter(profile, center.id))} />
            ))}
          </div>
        )}
        {addingCenter ? (
          <>
            <CenterPicker
              leagueName=""
              currentCenter={null}
              onSelect={candidate => {
                if (!candidate) { setAddingCenter(false); return; }
                // ensureCenter dedupes against the shared table, so picking
                // a house someone else already added reuses their row.
                const saved = ensureCenter(candidate);
                update(addHomeCenter(profile, saved.id));
                setAddingCenter(false);
              }}
              onSearch={searchCenters} />
            <button style={{ ...S.btn(), width: "100%", marginTop: "8px", fontSize: "12px" }}
              onClick={() => setAddingCenter(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button style={{ ...S.btn(), width: "100%" }} onClick={() => setAddingCenter(true)}>
            + Add a Center
          </button>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>Teams &amp; Leagues</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Taken from the roster on the Teams tab — change it there and it updates here.
        </div>
        {membership.teams.length === 0 ? (
          <div style={{ fontSize: "12px", color: C.textMuted }}>Not on any team yet.</div>
        ) : (
          membership.teams.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "13px" }}>
              <span>{t.name}</span>
              <span style={{ color: C.textMuted, fontSize: "11px" }}>{t.league.replace(" House Shot", "")}</span>
            </div>
          ))
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>Arsenal</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Balls and their drilling layouts.
        </div>
        <ArsenalList
          activeBowler={activeBowler}
          balls={balls}
          ballLayouts={ballLayouts || {}}
          setBallLayout={setBallLayout}
          removeBall={removeBall}
          ballSpecs={ballSpecs || {}}
          setBallSpec={setBallSpec}
          ballGroups={ballGroups || []}
          seedDefaultGroups={seedDefaultGroups}
          catalogEntries={catalogEntries || {}}
          catalogAck={catalogAck || []}
          userId={userId}
          publishBallSpecs={publishBallSpecs}
          voteOnEntry={voteOnEntry}
          acknowledgeRejection={acknowledgeRejection} />
        <BallNameInput
          value={newBallName}
          onChange={setNewBallName}
          onAdd={addBall}
          catalogEntries={catalogEntries || {}}
          existingBalls={balls} />
      </div>

      <BagManager
        activeBowler={activeBowler}
        bags={bags || []}
        balls={balls}
        ballBags={ballBags || {}}
        ballLayouts={ballLayouts || {}}
        saveBag={saveBag}
        deleteBag={deleteBag}
        toggleBallBag={toggleBallBag} />

      <div style={S.card}>
        <div style={S.label}>Notes</div>
        <textarea style={{ ...S.input, minHeight: "60px", resize: "vertical" }}
          placeholder="Anything worth remembering — grip changes, thumb tape, injuries…"
          value={profile.notes}
          onChange={e => update(setProfileField(profile, "notes", e.target.value))} />
      </div>

      <div style={{ height: "32px" }} />
    </div>
  );
}
