import { useState } from "react";
// Only the recharts exports already proven in StatsView.jsx. A dashed
// average reference line would have been nice here, but ReferenceLine
// isn't used anywhere else in this app and there's no way to verify it
// against the installed package from the build environment -- the average
// is shown in the stat boxes below the chart instead.
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C, S, Chip } from "./ui.jsx";
import ShareButton from "./ShareButton.jsx";
import { allGamesSeries, allGamesSummary,
  trendMetricsFor, trendMetricFor, seriesFor, trendDirection, describeTrend, seriesReliability,
} from "./domain/trends.js";

export default function TrendsView({
  sessions, shots, bowlers, leagues,
  statsBowler, setStatsBowler, statsLeague, setStatsLeague, teams, arsenals, gameEquipment,
  friends = [], displayName = "",
  isSplit, isCornerPinLeave, leftHanded = false,
}) {
  const [metricId, setMetricId] = useState("average");
  const [ballFilter, setBallFilter] = useState("");
  // Balls this bowler has actually used, from both shot logs and
  // per-game equipment -- offering their whole arsenal would list balls
  // with no data behind them.
  const ballOptions = (() => {
    const seen = new Set();
    (shots || []).forEach(s => { if (s?.ball && (!statsBowler || s.bowler === statsBowler)) seen.add(s.ball); });
    Object.entries(gameEquipment || {}).forEach(([k, v]) => {
      if (v?.ball && (!statsBowler || k.startsWith(`${statsBowler}|`))) seen.add(v.ball);
    });
    return [...seen].sort();
  })();
  // "Every game" plots one point per game instead of one per night.
  // Nightly averages hide the spread: 190/190/190 and 140/240/190 are the
  // same point. Off by default because the averaged view is the better
  // read for a TREND; this is for looking at the scatter.
  const [everyGame, setEveryGame] = useState(false);
  const metrics = trendMetricsFor(leftHanded);
  const metric = trendMetricFor(metricId, leftHanded);

  // The league filter still applies in every-game mode, so "all my games
  // in this league" and "all my games" are both reachable.
  // Real team names, same source as the Stats tab -- a team called
  // "Split Happens" shouldn't show up as "Tuesday Team".
  // Match on the normalised name -- team.league is the raw cloud league
  // name, which may or may not carry the " House Shot" suffix.
  const normLeague = (v) => String(v || "").replace(" House Shot", "").trim().toLowerCase();
  const teamNameForLeague = (l) => {
    const t = (teams || []).find(t => t.name && normLeague(t.league) === normLeague(l));
    return t ? t.name : String(l || "").replace(" House Shot", "");
  };

  const teamChips = (leagues || [])
    .filter(l => (teams || []).some(t => normLeague(t.league) === normLeague(l)))
    .map(l => ({
      league: l,
      label: (teams || []).find(t => t.name && normLeague(t.league) === normLeague(l))?.name
        || `${String(l).replace(" House Shot", "")} Team`,
    }));

  const gamePoints = allGamesSeries(sessions, statsBowler, statsLeague);
  const gameSummary = allGamesSummary(gamePoints);
  const showEveryGame = everyGame && metricId === "average";

  const points = showEveryGame
    ? gamePoints
    : seriesFor(metricId, { sessions, shots, bowler: statsBowler, league: statsLeague, isSplit, isCornerPinLeave, ball: ballFilter, gameEquipment });
  const direction = trendDirection(points);
  const reliability = seriesReliability(metricId, points);
  const summary = describeTrend(metricId, points);

  // Shot-sourced metrics need shot-by-shot data. A bowler tracking game
  // scores only has none, and saying so beats an empty chart that looks
  // broken.
  const noShotData = metric?.source === "shots" && shots.length === 0 && !showEveryGame;

  const dirColor = direction.direction === "up" ? C.strike
    : direction.direction === "down" ? C.miss
    : C.textMuted;

  const avgValue = points.length
    ? points.reduce((a, p) => a + p.value, 0) / points.length
    : null;

  return (
    <>
      {/* A grouped dropdown, matching the Stats tab.
      
          `bowlers` is the local roster -- guests, anyone ever logged for,
          every name off an imported scorecard -- so a chip row listed
          people who aren't yours to look at and grew with every guest.
          Friends and teams are the set that means something, and
          teammates are auto-added as friends so they show up here without
          anyone having to send a request. */}
      {(friends.length > 0 || teamChips.length > 0) && (
        <div style={S.card}>
          <div style={S.label}>Viewing</div>
          <select style={S.sel} value={
              statsBowler ? `bowler:${statsBowler}`
              : statsLeague ? `team:${statsLeague}`
              : ""
            }
            onChange={e => {
              const v = e.target.value;
              if (!v) { setStatsBowler(""); setStatsLeague(""); return; }
              const [kind, id] = v.split(/:(.*)/s);
              if (kind === "bowler") { setStatsBowler(id); setStatsLeague(""); }
              else {
                // A team trend blended across two leagues is meaningless,
                // so choosing a team sets its league too.
                setStatsBowler(""); setStatsLeague(id);
              }
            }}>
            <option value="">Everything</option>
            {displayName && (
              <option value={`bowler:${displayName}`}>{displayName}</option>
            )}
            {friends.length > 0 && (
              <optgroup label="Friends">
                {friends.map(f => (
                  <option key={f.userId} value={`bowler:${f.displayName}`}>{f.displayName}</option>
                ))}
              </optgroup>
            )}
            {teamChips.length > 0 && (
              <optgroup label="Teams">
                {teamChips.map(({ league, label }) => (
                  <option key={league} value={`team:${league}`}>{label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Metric</div>
        <div style={S.chips}>
          {metrics.map(m => (
            <Chip key={m.id} label={m.label} selected={metricId === m.id}
              onToggle={() => setMetricId(m.id)} />
          ))}
        </div>
        {/* Ball filter. Works on SCORE metrics too: a scores-only game can
            still name its ball, and a ball that averages 210 in game one
            and 190 in game three is exactly what a bowler wants to see. */}
        {ballOptions.length > 0 && (
          <>
            <div style={{ ...S.label, marginTop: "12px" }}>Ball</div>
            <div style={S.chips}>
              <Chip label="All balls" selected={!ballFilter} onToggle={() => setBallFilter("")} />
              {ballOptions.map(b => (
                <Chip key={b} label={b} selected={ballFilter === b}
                  onToggle={() => setBallFilter(ballFilter === b ? "" : b)} />
              ))}
            </div>
            {ballFilter && (
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px" }}>
                Only games and shots recorded with this ball. Games with no ball noted are left out.
              </div>
            )}
          </>
        )}
        {metric && !showEveryGame && (
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>{metric.help}</div>
        )}

        {/* Only offered on Average: every-game plots raw scores, which is
            meaningless for a rate like strike %. */}
        {metricId === "average" && (
          <>
            <div style={{ ...S.chips, marginTop: "10px" }}>
              <Chip label="Every game" selected={everyGame} onToggle={() => setEveryGame(v => !v)} />
            </div>
            {showEveryGame && gameSummary && (
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px", lineHeight: 1.5 }}>
                {gameSummary.games} games{statsLeague ? ` in ${!statsBowler ? teamNameForLeague(statsLeague) : statsLeague.replace(" House Shot", "")}` : " across every league"} ·
                {" "}averaging {gameSummary.average} · high {gameSummary.high}, low {gameSummary.low}.
                The spread is {gameSummary.spread} pins — that's what a nightly average hides.
              </div>
            )}
          </>
        )}

        {leagues.length > 0 && (
          <>
            <div style={{ ...S.label, marginTop: "12px" }}>League</div>
            <div style={S.chips}>
              <Chip label="All" selected={!statsLeague} onToggle={() => setStatsLeague("")} color={C.accent} />
              {leagues.map(l => (
                <Chip key={l} label={!statsBowler ? teamNameForLeague(l) : l.replace(" House Shot", "")} selected={statsLeague === l}
                  onToggle={() => setStatsLeague(statsLeague === l ? "" : l)} color={C.accent} />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
          <div style={S.label}>{metric?.label}</div>
          <div style={{ fontSize: "11px", color: C.textMuted }}>
            {points.length} night{points.length === 1 ? "" : "s"}
          </div>
        </div>

        {noShotData ? (
          <div style={{ fontSize: "12px", color: C.textMuted, textAlign: "center", padding: "24px 0" }}>
            This one needs shot-by-shot data. You're tracking game scores only, so there's nothing to plot here yet.
          </div>
        ) : points.length < 2 ? (
          <div style={{ fontSize: "12px", color: C.textMuted, textAlign: "center", padding: "24px 0" }}>
            Need at least 2 nights logged before there's a line to draw.
          </div>
        ) : (
          <>
            <div style={{ height: "220px", marginBottom: "10px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis dataKey={showEveryGame ? "x" : "date"} tick={{ fill: C.textMuted, fontSize: 10 }}
                    tickFormatter={v => showEveryGame ? "" : String(v).slice(5)} />
                  <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: C.text }} />
                  {/* Straight segments and smaller dots for every-game:
                      a smoothed curve through raw game scores implies a
                      continuity that isn't there between two games. */}
                  <Line type={showEveryGame ? "linear" : "monotone"} dataKey="value" stroke={C.accent}
                    strokeWidth={showEveryGame ? 1.5 : 2} dot={{ r: showEveryGame ? 2 : 3, fill: C.accent }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Any trend is shareable -- a bowler who sees their spare
                percentage climbing wants to send that to someone. */}
            {points.length > 1 && (
              <div style={{ marginBottom: "12px" }}>
                {/* trend: true routes this to the graph card. Passing the
                    points as `scores` made the card sum them into a
                    meaningless "9825 series" and draw 50 games side by
                    side at 220px apart -- ~11,000px on a 1080px card,
                    which is the black bar. */}
                <ShareButton compact label="Share this trend" summary={{
                  trend: true,
                  bowler: statsBowler,
                  label: metric?.label || "Trend",
                  points: points.map(p => p.value),
                  league: statsLeague,
                }} />
              </div>
            )}

            {/* The claim, kept separate from the chart on purpose: the line
                can always be drawn, but saying it means something is a
                different statement and gets its own hedging. */}
            <div style={{ fontSize: "12px", color: dirColor, fontWeight: direction.confident ? 600 : 400 }}>
              {summary}
            </div>

            {reliability.thin && (
              <div style={{ fontSize: "11px", color: C.spare, marginTop: "6px" }}>
                Nights here average {reliability.medianSample} attempts, which is thin — individual points will
                swing a lot even when nothing about your game has changed.
              </div>
            )}

            <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
              <div style={S.statBox}>
                <div style={{ ...S.statNum, fontSize: "18px" }}>
                  {Math.round(points[points.length - 1].value)}{metric.unit === "percent" ? "%" : ""}
                </div>
                <div style={S.statLbl}>Latest</div>
              </div>
              <div style={S.statBox}>
                <div style={{ ...S.statNum, fontSize: "18px", color: C.textMuted }}>
                  {Math.round(avgValue)}{metric.unit === "percent" ? "%" : ""}
                </div>
                <div style={S.statLbl}>Average</div>
              </div>
              <div style={S.statBox}>
                <div style={{ ...S.statNum, fontSize: "18px", color: C.strike }}>
                  {Math.round(Math.max(...points.map(p => p.value)))}{metric.unit === "percent" ? "%" : ""}
                </div>
                <div style={S.statLbl}>Best</div>
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ height: "32px" }} />
    </>
  );
}
