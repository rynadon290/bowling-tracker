// Season summary and export.
//
// Both exist because a season's worth of logging deserves to leave the app:
// the summary as a shareable card, the CSV as the bowler's own data in a
// form any spreadsheet opens. Neither is complicated; both were asked for.

// Every session as one CSV row. Column set is fixed rather than derived
// from the data so the output is stable across seasons and tools.
const SESSION_COLUMNS = [
  "date", "bowler", "league", "game1", "game2", "game3", "series", "average",
  "strikes", "spares_made", "spare_attempts", "ten_pins", "splits",
  "poker_won", "high_game_won", "net_money",
];

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote anything that could break a row: commas, quotes, newlines.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCsv(sessions, bowler) {
  const rows = (sessions || [])
    .filter(s => !bowler || s.bowler === bowler)
    .map(s => {
      const scores = s.scores || [];
      const poker = (s.pokerWinnings || []).reduce((a, b) => a + (Number(b) || 0), 0);
      const highGame = (s.highGameWinnings || []).reduce((a, b) => a + (Number(b) || 0), 0);
      const costs = [
        ...(s.pokerQuarterCost || []), ...(s.pokerDollarCost || []),
        ...(s.highGameCost || []), s.threeSixNineCost,
      ].reduce((a, b) => a + (Number(b) || 0), 0);
      return [
        s.date, s.bowler, s.league,
        scores[0] ?? "", scores[1] ?? "", scores[2] ?? "",
        s.total ?? "", s.average ?? "",
        s.strikes ?? "", s.sparesMade ?? "", s.spareAttempts ?? "",
        s.tenPinLeaves ?? ((s.weakTens ?? 0) + (s.ringingTens ?? 0)), s.splits ?? "",
        poker, highGame, poker + highGame - costs,
      ];
    });
  return [SESSION_COLUMNS, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
}

// Every shot as one CSV row -- the full detail for someone who wants to
// analyse in their own tools.
const SHOT_COLUMNS = [
  "date", "bowler", "league", "game", "frame", "ball_num", "lane", "ball",
  "result", "leave", "spare_made", "pin_count", "strike_description",
  "surface", "starting_board", "target_arrows", "actual_board", "actual_arrows",
  "ball_speed", "release", "miss", "notes",
];

export function shotsToCsv(shots, bowler) {
  const rows = (shots || [])
    .filter(s => !bowler || s.bowler === bowler)
    .map(s => [
      s.date, s.bowler, s.league, s.game, s.frame, s.ballNum ?? "", s.lane, s.ball,
      s._displayResult || s.result,
      (Array.isArray(s._displayLeave) ? s._displayLeave : s.otherLeave || []).filter(p => p !== "9 Pin No-Tap").join("-"),
      s.spareMade, s.pinCount, s.strikeDescription,
      s.surface, s.startingBoard, s.targetArrows, s.actualBoard, s.actualArrows,
      s.ballSpeed, s.release, (Array.isArray(s.miss) ? s.miss : []).join("|"), s.notes,
    ]);
  return [SHOT_COLUMNS, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
}

// ── Season summary ──────────────────────────────────────────────────────
// The numbers a bowler would actually put on a card and show someone.
export function seasonSummary(sessions, shots, bowler, league) {
  const mine = (sessions || []).filter(s =>
    (!bowler || s.bowler === bowler) && (!league || s.league === league)
  );
  const games = mine.flatMap(s => s.scores || []).filter(v => typeof v === "number");
  if (!games.length) return null;

  const series = mine.map(s => s.total).filter(v => typeof v === "number");
  const myShots = (shots || []).filter(s =>
    (!bowler || s.bowler === bowler) && (!league || s.league === league)
  );
  const firstBalls = myShots.filter(s => !s.ballNum || s.ballNum === 1);
  const strikes = firstBalls.filter(s => s.result === "Strike").length;
  const spareAtt = myShots.filter(s => s.result !== "Strike" && s.spareMade !== "");
  const spareMade = spareAtt.filter(s => s.spareMade === "Yes").length;

  const won = mine.reduce((a, s) =>
    a + (s.pokerWinnings || []).reduce((x, y) => x + (Number(y) || 0), 0)
      + (s.highGameWinnings || []).reduce((x, y) => x + (Number(y) || 0), 0), 0);
  const paid = mine.reduce((a, s) =>
    a + [...(s.pokerQuarterCost || []), ...(s.pokerDollarCost || []), ...(s.highGameCost || []), s.threeSixNineCost]
      .reduce((x, y) => x + (Number(y) || 0), 0), 0);

  const dates = mine.map(s => s.date).filter(Boolean).sort();

  return {
    bowler: bowler || "",
    league: league || "",
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
    sessions: mine.length,
    games: games.length,
    average: Math.round((games.reduce((a, b) => a + b, 0) / games.length) * 10) / 10,
    highGame: Math.max(...games),
    highSeries: series.length ? Math.max(...series) : null,
    lowGame: Math.min(...games),
    gamesOver200: games.filter(g => g >= 200).length,
    // Null rather than 0 when there's no shot detail -- a scores-only
    // bowler has no strike rate to report, and "0%" would be a lie.
    strikeRate: firstBalls.length ? Math.round((strikes / firstBalls.length) * 100) : null,
    spareRate: spareAtt.length ? Math.round((spareMade / spareAtt.length) * 100) : null,
    won, paid, net: won - paid,
  };
}

// Plain-text version for sharing where an image isn't practical.
export function summaryToText(sum) {
  if (!sum) return "";
  const lines = [
    `${sum.bowler}${sum.league ? ` · ${sum.league.replace(" House Shot", "")}` : ""}`,
    `${sum.sessions} night${sum.sessions === 1 ? "" : "s"} · ${sum.games} game${sum.games === 1 ? "" : "s"}`,
    `Average ${sum.average}`,
    `High game ${sum.highGame}${sum.highSeries ? ` · High series ${sum.highSeries}` : ""}`,
  ];
  if (sum.gamesOver200) lines.push(`${sum.gamesOver200} game${sum.gamesOver200 === 1 ? "" : "s"} over 200`);
  if (sum.strikeRate !== null) lines.push(`${sum.strikeRate}% strikes · ${sum.spareRate}% spares`);
  if (sum.won || sum.paid) lines.push(`${sum.net >= 0 ? "+" : "−"}$${Math.abs(sum.net).toFixed(0)} on the season`);
  return lines.join("\n");
}
