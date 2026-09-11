// Leaving and hiding leagues.
//
// League membership isn't stored directly -- it's derived from team
// membership via teams.league_id. That single fact drives everything here:
//
//   HIDE  is personal and reversible. It changes what YOU see and nothing
//         else. History, averages, teammates, and the roster are untouched.
//
//   LEAVE removes you from a team's roster, which other people can see.
//         Because league membership is derived, leaving your only team in a
//         league also ends your membership in it -- as a consequence, not
//         as the goal. Worth stating plainly before someone taps it.
//
// There is no DELETE. A league is shared, so one member shouldn't be able
// to remove it out from under the others.

// Leagues to show in pickers and filters. Hidden ones drop out of the UI
// but their sessions stay in history and keep counting toward averages --
// hiding is about decluttering, not erasing.
// Practice and Just Bowling are containers, not leagues.
//
// They exist so scores have somewhere to hang, but nobody joins them,
// they have no team, and they can't be renamed or deleted. Anywhere a
// bowler picks or manages a LEAGUE, they should be absent.
//
// Matched by NAME rather than by hidden id, because the id only exists
// once the cloud row is created -- so an offline bowler, or one on their
// very first practice session, would otherwise see "Practice" sitting in
// the Vault alongside their real leagues.
export function isContainerLeague(name) {
  // "Casual" is the container's OLD name and still appears in data
  // written before the rename. Leaving it out was harmless only
  // while needsLeagueSetup also required a team -- that check caught
  // the same case by accident. Removing the team requirement (Focus
  // group Finding 2) made it bite immediately: a bowler whose only
  // "league" was an old Casual container looked ready to log league
  // scores with nowhere to file them.
  //
  // The stored key stays "Just Bowling" -- see CASUAL_SESSION_KEY in
  // constants.js. This is about recognising both names, not renaming
  // anything.
  return name === "Practice" || name === "Just Bowling" || name === "Casual";
}

export function visibleLeagues(leagues, hiddenIds, leagueIdsByName) {
  const hidden = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
  return (Array.isArray(leagues) ? leagues : []).filter(name => {
    if (isContainerLeague(name)) return false;
    const id = leagueIdsByName?.[name];
    return !id || !hidden.has(id);
  });
}

export function isLeagueHidden(leagueName, hiddenIds, leagueIdsByName) {
  const id = leagueIdsByName?.[leagueName];
  return !!id && (hiddenIds || []).includes(id);
}

// Teams in a league that this bowler is actually on. Leaving is per-team,
// so someone on two teams in the same league leaves them independently.
export function teamsInLeague(leagueName, teams, bowlerName) {
  return (teams || []).filter(t =>
    t.league === leagueName && (t.members || []).includes(bowlerName)
  );
}

// What leaving this team actually costs, so the confirmation can say it
// rather than making the user find out afterwards.
export function describeLeaveImpact(team, leagueName, teams, bowlerName) {
  if (!team || typeof team !== "object" || Array.isArray(team)) return null;
  const others = teamsInLeague(leagueName, teams, bowlerName)
    .filter(t => t.id !== team.id);
  const remainingMembers = (team.members || []).filter(m => m !== bowlerName);

  return {
    teamName: team.name,
    leagueName,
    // Leaving your last team in a league ends your membership in it,
    // because membership is derived from the team.
    losesLeague: others.length === 0,
    otherTeamsInLeague: others.map(t => t.name),
    // An empty team is kept rather than deleted -- a captain rebuilding a
    // roster shouldn't lose the team record along with the last member.
    leavesTeamEmpty: remainingMembers.length === 0,
    remainingMembers,
  };
}

export function leaveConfirmationText(impact) {
  if (!impact || typeof impact !== "object" || Array.isArray(impact)) return "";
  const lines = [`Leave ${impact.teamName}?`];
  if (impact.losesLeague) {
    lines.push(`You'll no longer be part of ${impact.leagueName}.`);
  } else {
    lines.push(`You'll still be on ${impact.otherTeamsInLeague.join(", ")} in ${impact.leagueName}.`);
  }
  if (impact.leavesTeamEmpty) {
    lines.push("You're the last member, so the team will be left empty.");
  } else {
    lines.push(`Your teammates (${impact.remainingMembers.join(", ")}) will see you've left.`);
  }
  // The reassurance that matters most: nobody loses their scores.
  lines.push("Your past scores and averages stay.");
  return lines.join(" ");
}
