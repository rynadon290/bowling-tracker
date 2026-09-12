import { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { C, S, Chip, CollapsibleCard } from "./ui.jsx";
import { PLASTIC_BALL } from "./constants.js";
import ArsenalList from "./ArsenalList.jsx";
import BagManager from "./BagManager.jsx";
import BallNameInput from "./BallNameInput.jsx";
import CenterPicker from "./CenterPicker.jsx";
import { centerLabel } from "./domain/centers.js";
import {
  emptyProfile, normalizeProfile, addHomeCenter, removeHomeCenter,
  setProfileField, membershipFor, resolveHomeCenters,
  normalizeAliases,
} from "./domain/profiles.js";

function BookAverageUpdatePrompt({ currentAverage, suggestion, onSave, onDismiss }) {
  const [value, setValue] = useState(String(suggestion.suggested));
  return (
    <div>
      <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
        Suggested new book average: <strong style={{ color: C.text }}>{suggestion.suggested}</strong> — {suggestion.basis}.
        {currentAverage && ` Your current book average is ${currentAverage}.`}
        {" "}Change the number below if this doesn't match your full season.
      </div>
      <input style={{ ...S.input, marginBottom: "10px" }} type="number" inputMode="decimal"
        value={value} onChange={e => setValue(e.target.value)} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={{ ...S.btn("primary"), flex: 1 }} onClick={() => onSave(value)}>
          Update to {value || suggestion.suggested}
        </button>
        <button style={{ ...S.btn(), flex: 1 }} onClick={onDismiss}>Not Now</button>
      </div>
    </div>
  );
}

export default function Profile({
  only = null,
  bowlers, activeBowler, selectBowler,
  profiles, setProfile, teams,
  arsenals, ballLayouts, setBallLayout, removeBall,
  newBallName, setNewBallName, addBall,
  bags, ballBags, saveBag, deleteBag, toggleBallBag,
  centers, ensureCenter, searchCenters,
  ballSpecs, setBallSpec, ballGroups, saveBallGroup, deleteBallGroup, seedDefaultGroups,
  catalogEntries, catalogAck, userId, publishBallSpecs, voteOnEntry, acknowledgeRejection,
  bookAverageDue, bookAverageTriggerLeague, bookAverageSuggestion, acknowledgeBookAverageUpdate,
}) {
  const [addingCenter, setAddingCenter] = useState(false);
  // Must sit with the other hooks, ABOVE the early return below. A hook
  // after a conditional return runs on some renders and not others, which
  // React treats as a fatal error -- the app goes blank, not degraded.
  const [aliasDraft, setAliasDraft] = useState("");

  // Every card on this screen is collapsible, keyed by section id. The
  // bowler switcher and identity card default open since they're the
  // first thing worth seeing; everything else defaults closed so the
  // screen reads as a list of headings rather than a wall of forms --
  // each one still shows a useful summary while closed.
  const [expanded, setExpanded] = useState({
    whoseProfile: true, identity: true,
    aliases: false, coaching: true, bookAverage: false, homeCenters: false, teamsLeagues: false,
    // Arsenal and bags open by default: on the Gear tab they ARE the
    // tab, and a screen whose only two cards are both shut looks empty.
    // Elsewhere in Profile they do not render at all, so this costs
    // nothing there.
    arsenal: true, bags: true, notes: false,
  });
  function toggle(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }
  // `only` lets the same component serve two tabs: Gear renders just the
  // equipment and league cards, the profile icon renders the identity
  // cards. Same code both places, no copy to drift.
  const show = id => !only || only.includes(id);

  const { displayName, updateDisplayName } = useAuth();
  const [editingMyName, setEditingMyName] = useState(false);
  const [myNameInput, setMyNameInput] = useState("");
  async function saveMyName() {
    const name = myNameInput.trim();
    if (!name) return;
    setEditingMyName(false);
    const { error } = await updateDisplayName(name);
    if (error) window.alert(error.message);
  }

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

  // Your own profile, not whoever the Bowl tab happens to have selected.
  //
  // These cards used to follow activeBowler, with a "Whose Profile"
  // switcher on top -- so logging a night for a teammate left the
  // profile screen editing THEIR handedness, aliases and book average.
  // The switcher made that visible but didn't make it right: a
  // teammate's profile isn't yours to edit from your own profile screen.
  const profileBowler = displayName || activeBowler;
  const profile = normalizeProfile(profiles[profileBowler], profileBowler) || emptyProfile(profileBowler);
  const membership = membershipFor(profileBowler, teams);
  const balls = arsenals[profileBowler] || [];
  const resolvedHomeCenters = resolveHomeCenters(profile, centers || []);
  const bowlerBagCount = (bags || []).filter(b => b.bowlerName === profileBowler).length;

  function addAlias() {
    const clean = aliasDraft.trim();
    if (!clean) return;
    update(setProfileField(profile, "aliases", normalizeAliases([...(profile.aliases || []), clean])));
    setAliasDraft("");
  }

  function update(next) {
    setProfile(profileBowler, next);
  }

  return (
    <div>
      {/* Your ACCOUNT name -- what other people see when they search for
          you or view a roster. Distinct from the bowler profiles below,
          which are per-bowler and can include proxy-logged teammates.
          
          Lived in Teams until now, which made it feel like roster
          configuration rather than "this is who I am in the app". */}
      {show("identity") && (
      <div style={S.card}>
        <div style={S.label}>Your Name</div>
        {!editingMyName ? (
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.text,fontSize:"15px",fontWeight:600}}>{displayName || "(not set)"}</span>
            <button style={S.btn()} onClick={()=>{setMyNameInput(displayName||"");setEditingMyName(true);}}>Edit</button>
          </div>
        ) : (
          <div style={{display:"flex",gap:"8px"}}>
            <input value={myNameInput} onChange={e=>setMyNameInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")saveMyName();}} autoFocus style={{...S.input,flex:1}}/>
            <button style={S.btn("primary")} onClick={saveMyName}>Save</button>
            <button style={S.btn()} onClick={()=>setEditingMyName(false)}>Cancel</button>
          </div>
        )}

      {show("aliases") && (
      <CollapsibleCard title="Scorecard Names"
        summary={profile.aliases?.length ? `${profile.aliases.length} alias${profile.aliases.length === 1 ? "" : "es"}` : "None"}
        expanded={expanded.aliases} onToggle={() => toggle("aliases")}>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          How your name shows up on the screens at your center — "R. Nadon", "RYAN N", a nickname.
          Adding these lets a scorecard photo find you instead of asking every time.
        </div>
        {(profile.aliases || []).map((alias, i) => (
          <div key={`${alias}-${i}`} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: "13px", color: C.text }}>{alias}</div>
            <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "11px", textDecoration: "underline", padding: 0 }}
              onClick={() => update(setProfileField(profile, "aliases",
                normalizeAliases((profile.aliases || []).filter((_, j) => j !== i))))}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px" }}>
          <input style={{ ...S.input, flex: 1, fontSize: "12px" }}
            placeholder="e.g. R. Nadon"
            value={aliasDraft} onChange={e => setAliasDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addAlias(); }} />
          <button style={{ ...S.btn(), padding: "8px 12px", fontSize: "12px" }}
            disabled={!aliasDraft.trim()} onClick={addAlias}>Add</button>
        </div>
      </CollapsibleCard>
      )}
        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px"}}>
          This is what teammates see when they search for you or view the roster — it defaults to your email prefix until you set it.
        </div>
      </div>
      )}

      {show("identity") && (
      <CollapsibleCard title={profileBowler}
        summary={`${profile.leftHanded ? "Left" : "Right"}-handed · ${profile.twoHanded ? "Two-handed" : "One-handed"}`}
        expanded={expanded.identity} onToggle={() => toggle("identity")}>
        <div style={S.label}>Handedness</div>
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
      </CollapsibleCard>
      )}

      {/* Aliases: how this bowler's name appears on the house scoring
          display, which is often not how it appears in the app. Used
          only to match a scorecard photo back to the right person -- a
          wrong match writes someone else's game into your record, and
          that is far worse than an import that stops to ask. */}

      {/* Coaching is opt-in and off by default. Someone who doesn't coach
          never sees coaching UI at all, rather than an empty version of
          it. Turning this on only unlocks the coach VIEW -- it doesn't
          connect you to anyone, and a bowler being coached doesn't need
          it, since the Coach tab appears for anyone in a relationship. */}
      {show("coaching") && (
      <CollapsibleCard title="Coaching" summary={profile.isCoach ? "Coach" : "Not coaching"}
        expanded={expanded.coaching} onToggle={() => toggle("coaching")}>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Turn this on if you coach other bowlers. It adds a view that shows their tasks and notes instead of your own game.
        </div>
        <div style={S.chips}>
          <Chip label="I bowl" selected={!profile.isCoach}
            onToggle={() => update(setProfileField(profile, "isCoach", false))} />
          <Chip label="I coach" selected={profile.isCoach}
            onToggle={() => update(setProfileField(profile, "isCoach", true))} color={C.spare} />
        </div>
      </CollapsibleCard>
      )}

      {/* Fires when a league this bowler is in has an end date that's
          passed and they haven't been asked about it yet -- see
          domain/leagueSeasons.js for the anti-nag guarantee that stops
          this from firing twice for the same season. Sits above the
          regular Book Average card, always visible when due, regardless
          of whether that card is collapsed. */}
      {bookAverageDue && (
        <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
          <div style={{ ...S.label, color: C.accent }}>
            {bookAverageTriggerLeague?.name || "Your league"} season wrapped up
          </div>
          {bookAverageSuggestion?.eligible ? (
            <BookAverageUpdatePrompt
              currentAverage={profile.bookAverage}
              suggestion={bookAverageSuggestion}
              onSave={value => acknowledgeBookAverageUpdate(profileBowler, bookAverageTriggerLeague.endDate, value)}
              onDismiss={() => acknowledgeBookAverageUpdate(profileBowler, bookAverageTriggerLeague.endDate)} />
          ) : (
            <>
              <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
                Not enough games logged here yet to suggest a new number
                {bookAverageSuggestion?.basis ? ` (${bookAverageSuggestion.basis})` : ""}.
                You can still update it yourself below, or skip for now.
              </div>
              <button style={{ ...S.btn(), width: "100%" }}
                onClick={() => acknowledgeBookAverageUpdate(profileBowler, bookAverageTriggerLeague.endDate)}>
                Skip — I'll update it myself
              </button>
            </>
          )}
        </div>
      )}

      {show("bookAverage") && (
      <CollapsibleCard title="Book Average"
        summary={profile.bookAverage ? `${profile.bookAverage}${profile.bookGames ? ` (${profile.bookGames}g)` : ""}` : "Not set"}
        expanded={expanded.bookAverage} onToggle={() => toggle("bookAverage")}>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          A static number from last season — the app never changes this on
          its own. When a league's season ends, you'll be prompted here to
          update it, with a suggested number you can accept or override.
        </div>
        <div style={S.row}>
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="decimal" placeholder="e.g. 213"
            value={profile.bookAverage} onChange={e => update(setProfileField(profile, "bookAverage", e.target.value))} />
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="numeric" placeholder="over how many games"
            value={profile.bookGames} onChange={e => update(setProfileField(profile, "bookGames", e.target.value))} />
        </div>
        <input style={{ ...S.input, marginTop: "6px" }} placeholder="Season (e.g. 2025-26 Winter)"
          value={profile.bookSeason} onChange={e => update(setProfileField(profile, "bookSeason", e.target.value))} />

        {/* All-time bests, so a personal-best achievement has something to
            beat from day one.
            
            Without a starting figure the app can only compare against
            what it has seen -- so a bowler's first logged night either
            fires a meaningless "best ever" or nothing fires until they've
            logged most of a season. Asking once here solves both. */}
        <div style={{ ...S.divider, margin: "12px 0" }} />
        <div style={{ ...S.label, marginBottom: "4px" }}>Your best ever</div>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Including before you started using the app. We'll tell you when you beat them.
        </div>
        <div style={S.row}>
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="numeric" placeholder="High game"
            value={profile.allTimeHighGame}
            onChange={e => update(setProfileField(profile, "allTimeHighGame", e.target.value))} />
          <input style={{ ...S.input, flex: 1 }} type="number" inputMode="numeric" placeholder="High series"
            value={profile.allTimeHighSeries}
            onChange={e => update(setProfileField(profile, "allTimeHighSeries", e.target.value))} />
        </div>
      </CollapsibleCard>
      )}

      {show("homeCenters") && (
      <CollapsibleCard title="Home Centers"
        summary={resolvedHomeCenters.length ? `${resolvedHomeCenters.length} set` : "None yet"}
        expanded={expanded.homeCenters} onToggle={() => toggle("homeCenters")}>
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
      </CollapsibleCard>
      )}

      {show("teamsLeagues") && (
      <CollapsibleCard title="Teams &amp; Leagues"
        summary={membership.teams.length ? `${membership.teams.length} team${membership.teams.length === 1 ? "" : "s"}` : "Not on a team"}
        expanded={expanded.teamsLeagues} onToggle={() => toggle("teamsLeagues")}>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Taken from the roster on the Social tab — change it there and it updates here.
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
      </CollapsibleCard>
      )}

      {show("arsenal") && (
      <CollapsibleCard title="Arsenal"
        summary={`${balls.length} ball${balls.length === 1 ? "" : "s"}`}
        expanded={expanded.arsenal} onToggle={() => toggle("arsenal")}>
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Balls and their drilling layouts.
        </div>
        {/* Plastic is a yes/no, not a ball you name. Adding it as a reserved

            entry keeps it in every ball list without a second concept. */}

        {activeBowler && (

          <div style={{ marginBottom: "10px" }}>

            <Chip label={(arsenals?.[activeBowler] || []).includes(PLASTIC_BALL) ? "Has a plastic ball ✓" : "Add a plastic ball"}

              selected={(arsenals?.[activeBowler] || []).includes(PLASTIC_BALL)} color={C.strike}

              onToggle={() => (arsenals?.[activeBowler] || []).includes(PLASTIC_BALL) ? removeBall(PLASTIC_BALL) : addBall(PLASTIC_BALL)} />

          </div>

        )}

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
      </CollapsibleCard>
      )}

      {show("bags") && (
      <CollapsibleCard title="Bags"
        summary={`${bowlerBagCount} bag${bowlerBagCount === 1 ? "" : "s"}`}
        expanded={expanded.bags} onToggle={() => toggle("bags")}>
        <BagManager
          activeBowler={activeBowler}
          bags={bags || []}
          balls={balls}
          ballBags={ballBags || {}}
          ballLayouts={ballLayouts || {}}
          saveBag={saveBag}
          deleteBag={deleteBag}
          toggleBallBag={toggleBallBag} />
      </CollapsibleCard>
      )}

      {show("notes") && (
      <CollapsibleCard title="Notes"
        summary={profile.notes ? (profile.notes.length > 28 ? profile.notes.slice(0, 28) + "…" : profile.notes) : ""}
        expanded={expanded.notes} onToggle={() => toggle("notes")}>
        <textarea style={{ ...S.input, minHeight: "60px", resize: "vertical" }}
          placeholder="Anything worth remembering — grip changes, thumb tape, injuries…"
          value={profile.notes}
          onChange={e => update(setProfileField(profile, "notes", e.target.value))} />
      </CollapsibleCard>
      )}

      <div style={{ height: "32px" }} />
    </div>
  );
}
