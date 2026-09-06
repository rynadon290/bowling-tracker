import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import { useAuth } from "./AuthProvider.jsx";
import HistoryView from "./HistoryView.jsx";
import SessionHistory from "./SessionHistory.jsx";
import CenterPicker from "./CenterPicker.jsx";
import { isLeagueHidden, teamsInLeague } from "./domain/leagueMembership.js";
import { localDateString } from "./constants.js";
import {
  ENVIRONMENTS, TRACKED_FIELD_KEYS, MOVABLE_STATS_CARDS, TRACKING_MODES,
  TRACKING_MODE_LABELS, TRACKING_MODE_DESCRIPTIONS, setTrackingMode, applyEnvironment,
  resetToEnvironmentDefaults, setTrackedField, setShowMoneyGames,
  moveStatsCard, toggleStatsCardHidden, reconcileCardOrder,
} from "./domain/preferences.js";

const ENVIRONMENT_LABELS = { practice: "Practice", league: "League", tournament: "Tournament" };
const ENVIRONMENT_DESCRIPTIONS = {
  practice: "More detail, no scoring pressure. Every accessory field is on by default.",
  league: "Fast, simple logging. Accessory fields off, money games front and center.",
  tournament: "Same simple logging as League, but money-game tracking is hidden.",
};
const FIELD_LABELS = { surface: "Ball Surface", line: "Line (Board & Arrows)", release: "Release", miss: "Miss Direction", ballSpeed: "Ball Speed", shoes: "Shoes (Heel & Sole)" };
const CARD_LABEL_BY_ID = Object.fromEntries(MOVABLE_STATS_CARDS.map(c => [c.id, c.label]));

export default function Settings({
  showBackup, setShowBackup, backupStatus, setBackupStatus,
  importText, setImportText, exportData, importData,
  confirmClear, setConfirmClear, clearAllData, hasData,
  sessions, bowlers, leagues,
  statsBowler, setStatsBowler, statsLeague, setStatsLeague,
  filterBowler, setFilterBowler, filterBall, setFilterBall,
  filterResult, setFilterResult, filtered, ballUniverse,
  startEdit, deleteShot,
  centers, leagueCenters, setLeagueCenter, searchCenters,
  hiddenLeagues, leagueIds, toggleLeagueHidden, teams, activeBowler, leaveTeam,
}) {
  const { preferences, updatePreferences, displayName } = useAuth();
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState(null);
  // Settings has two distinct jobs now: configuring the app, and browsing
  // history. History is long reference data, so it lives behind its own
  // section rather than padding out the settings scroll.
  const [section, setSection] = useState("settings");
  const [historyTab, setHistoryTab] = useState("sessions");

  async function apply(next) {
    setError(null);
    const result = await updatePreferences(next);
    if (result.error) { setError(result.error.message); return; }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  const cardOrder = reconcileCardOrder(preferences.statsCardOrder);
  const hidden = new Set(preferences.hiddenStatsCards || []);

  return (
    <div>
      <div style={{ ...S.card, padding: "10px 12px" }}>
        <div style={S.chips}>
          <Chip label="Settings" selected={section === "settings"} onToggle={() => setSection("settings")} />
          <Chip label="History" selected={section === "history"} onToggle={() => setSection("history")} />
        </div>
      </div>

      {section === "history" && (
        <>
          <div style={{ ...S.card, padding: "10px 12px" }}>
            <div style={S.chips}>
              <Chip label="Sessions" selected={historyTab === "sessions"} onToggle={() => setHistoryTab("sessions")} />
              <Chip label="Shots" selected={historyTab === "shots"} onToggle={() => setHistoryTab("shots")} />
            </div>
          </div>
          {historyTab === "sessions" && (
            <SessionHistory
              sessions={sessions || []} bowlers={bowlers || []} leagues={leagues || []}
              statsBowler={statsBowler} setStatsBowler={setStatsBowler}
              statsLeague={statsLeague} setStatsLeague={setStatsLeague} />
          )}
          {historyTab === "shots" && (
            <HistoryView
              bowlers={bowlers || []} leagues={leagues || []}
              filterBowler={filterBowler} setFilterBowler={setFilterBowler}
              filterBall={filterBall} setFilterBall={setFilterBall}
              filterResult={filterResult} setFilterResult={setFilterResult}
              filtered={filtered || []} ballUniverse={ballUniverse}
              startEdit={startEdit} deleteShot={deleteShot} />
          )}
        </>
      )}

      {section === "settings" && (<>
      <div style={S.card}>
        <div style={S.label}>Environment</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Sets sensible defaults for the toggles below — you can still adjust any of them afterward.
        </div>
        <div style={S.chips}>
          {ENVIRONMENTS.map(env => (
            <Chip key={env} label={ENVIRONMENT_LABELS[env]} selected={preferences.environment === env}
              onToggle={() => apply(prev => applyEnvironment(prev, env))} />
          ))}
        </div>
        {preferences.environment && (
          <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "8px" }}>
            {ENVIRONMENT_DESCRIPTIONS[preferences.environment]}
          </div>
        )}
      </div>

      {/* Centers attach to LEAGUES, not sessions -- a league bowls at one
          house for a season, so this is one entry per season instead of a
          tap every night. */}
      {(leagues || []).length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Where You Bowl</div>
          <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
            Set each league's center once and the app can compare how you score house to house.
          </div>
          {(leagues || []).map((league, i) => {
            const centerId = leagueCenters?.[league];
            const center = (centers || []).find(c => c.id === centerId) || null;
            return (
              <div key={league} style={{ paddingBottom: "10px", marginBottom: "10px", borderBottom: i < leagues.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  {league.replace(" House Shot", "")}
                </div>
                <CenterPicker
                  leagueName={league.replace(" House Shot", "")}
                  currentCenter={center}
                  onSelect={candidate => setLeagueCenter(league, candidate)}
                  onSearch={searchCenters} />

                {/* Hiding is personal and reversible: the league leaves
                    YOUR pickers, but teammates, rosters, and every past
                    score are untouched. */}
                <div style={{ ...S.chips, marginTop: "8px" }}>
                  <Chip
                    label={isLeagueHidden(league, hiddenLeagues || [], leagueIds || {}) ? "Hidden — show again" : "Hide this league"}
                    dense
                    selected={isLeagueHidden(league, hiddenLeagues || [], leagueIds || {})}
                    onToggle={() => toggleLeagueHidden(league)} />
                </div>
                {isLeagueHidden(league, hiddenLeagues || [], leagueIds || {}) && (
                  <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px" }}>
                    Won't appear when logging. Past scores still count toward your averages.
                  </div>
                )}

                {/* Leaving a team is different -- other people see it. This
                    is scoped to the SIGNED-IN user, not the active bowler,
                    since the active bowler may be a proxy-logged teammate
                    whose membership isn't yours to change. */}
                {teamsInLeague(league, teams || [], displayName).map(team => (
                  <div key={team.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "11px", color: C.textMuted }}>On {team.name}</span>
                    <button style={{ ...S.btn(), padding: "3px 8px", fontSize: "10px" }}
                      onClick={() => leaveTeam(team, league)}>
                      Leave team
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Tracking Detail</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Independent of environment — you can bowl league by-game and practice shot-by-shot.
        </div>
        <div style={S.chips}>
          {TRACKING_MODES.map(mode => (
            <Chip key={mode} label={TRACKING_MODE_LABELS[mode]}
              selected={preferences.trackingMode === mode}
              onToggle={() => apply(prev => setTrackingMode(prev, mode))} />
          ))}
        </div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "8px" }}>
          {TRACKING_MODE_DESCRIPTIONS[preferences.trackingMode]}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Accessory Fields</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Extra detail per shot. Off by default outside Practice — turn on whichever you actually want to track.
        </div>
        <div style={S.chips}>
          {TRACKED_FIELD_KEYS.map(key => (
            <Chip key={key} label={FIELD_LABELS[key]} selected={!!preferences.trackedFields[key]}
              onToggle={() => apply(prev => setTrackedField(prev, key, !prev.trackedFields[key]))}
              color={C.spare} />
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Money Games</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Poker, 3-6-9, and High Game Pot tracking cards on the Log and Stats tabs.
        </div>
        <div style={S.chips}>
          <Chip label="Shown" selected={preferences.showMoneyGames} onToggle={() => apply(prev => setShowMoneyGames(prev, true))} color={C.strike} />
          <Chip label="Hidden" selected={!preferences.showMoneyGames} onToggle={() => apply(prev => setShowMoneyGames(prev, false))} color={C.miss} />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Stats Card Layout</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Reorder or hide whole cards on the Stats tab. Each card moves as one unit — the stats grouped inside it stay together.
        </div>
        {cardOrder.map((id, idx) => {
          const isHidden = hidden.has(id);
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <div style={{ flex: 1, fontSize: "13px", color: isHidden ? C.textMuted : C.text, textDecoration: isHidden ? "line-through" : "none" }}>
                {CARD_LABEL_BY_ID[id] || id}
              </div>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "13px", opacity: idx === 0 ? 0.3 : 1 }}
                disabled={idx === 0}
                onClick={() => apply(prev => moveStatsCard(prev, id, "up"))} aria-label="Move up">↑</button>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "13px", opacity: idx === cardOrder.length - 1 ? 0.3 : 1 }}
                disabled={idx === cardOrder.length - 1}
                onClick={() => apply(prev => moveStatsCard(prev, id, "down"))} aria-label="Move down">↓</button>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px", minWidth: "54px" }}
                onClick={() => apply(prev => toggleStatsCardHidden(prev, id))}>
                {isHidden ? "Show" : "Hide"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
        <div style={{ ...S.label, color: C.accent }}>Backup &amp; Restore</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Save a copy of everything — shots, sessions, bowlers, arsenals, and match results — so your season is safe no matter what. If you ever open this app and your history looks empty, restore it here.
        </div>
        {!showBackup ? (
          <button style={S.btn()} onClick={() => { setShowBackup(true); setBackupStatus(""); }}>Open Backup &amp; Restore</button>
        ) : (
          <>
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <button style={{ ...S.btn("primary"), flex: 1 }} onClick={() => {
                const json = exportData();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bowling-backup-${localDateString()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setBackupStatus("Backup downloaded.");
              }}>Download Backup</button>
              <button style={{ ...S.btn(), flex: 1 }} onClick={() => setShowBackup(false)}>Close</button>
            </div>
            <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "6px" }}>
              If the download doesn't work in this environment, copy the text below instead and save it somewhere safe.
            </div>
            <textarea readOnly value={exportData()} onClick={e => e.target.select()}
              style={{ ...S.input, minHeight: "90px", fontFamily: "monospace", fontSize: "11px", marginBottom: "12px" }} />
            <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "6px" }}>
              To restore, paste a backup below and tap Restore. This adds anything missing — it won't erase what's already here.
            </div>
            <textarea value={importText} onChange={e => setImportText(e.target.value)}
              placeholder="Paste backup JSON here…"
              style={{ ...S.input, minHeight: "70px", fontFamily: "monospace", fontSize: "11px", marginBottom: "8px" }} />
            <button style={{ ...S.btn("primary"), width: "100%" }} onClick={() => importData()}>Restore This Backup</button>
            {backupStatus && (
              <div style={{ fontSize: "12px", color: backupStatus.startsWith("Couldn't") ? C.miss : C.strike, marginTop: "8px" }}>{backupStatus}</div>
            )}
          </>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>Reset</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Made a mess of your own toggles or card order? Restore {ENVIRONMENT_LABELS[preferences.environment] || "this environment"}'s defaults — including the Stats card layout — without picking through everything by hand.
        </div>
        <button style={{ ...S.btn(), width: "100%" }} onClick={() => apply(prev => resetToEnvironmentDefaults(prev))}>
          Reset to {ENVIRONMENT_LABELS[preferences.environment] || "Default"} Defaults
        </button>
      </div>

      {savedFlash && <div style={{ fontSize: "13px", color: C.strike, textAlign: "center", marginBottom: "12px" }}>✓ Saved</div>}
      {error && <div style={{ fontSize: "13px", color: C.miss, textAlign: "center", marginBottom: "12px" }}>{error}</div>}

      {/* Danger Zone lives here, at the bottom of Settings, rather than on
          the Stats tab -- it's irreversible, so it should take deliberate
          effort to reach rather than sitting where someone scrolls daily. */}
      {hasData && (
        <div style={{ ...S.card, border: `1px solid ${C.miss}44` }}>
          <div style={{ ...S.label, color: C.miss }}>Danger Zone</div>
          {!confirmClear ? (
            <button style={S.btn("warn")} onClick={() => setConfirmClear(true)}>Clear All Data</button>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
                This deletes every logged shot, session, match result (opponents, handicaps, win/loss), and lane condition note. This can't be undone. Consider downloading a backup above first.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={{ ...S.btn("warn"), flex: 1 }} onClick={async () => { await clearAllData(); setConfirmClear(false); }}>
                  Yes, Delete Everything
                </button>
                <button style={{ ...S.btn(), flex: 1 }} onClick={() => setConfirmClear(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}
