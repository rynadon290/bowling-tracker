// When to ask a league bowler to set up a team.
//
// Focus group Finding 2, the largest single loss in the report: 62% of
// new league bowlers hit a wall between picking League and entering a
// score, and 11 of 31 abandoned during team setup -- most often at the
// roster screen, asked for teammates' email addresses they did not have.
// One of them: "I just wanted to put tonight's scores in."
//
// So the team stops being a precondition. A league with no team accepts
// scores, and the team is asked for AFTERWARDS -- once, after a night
// that actually happened, when there is something concrete to attach it
// to and the bowler has already got value from the app.
//
// The reminder is dismissible forever. A prompt people learn to swipe
// away is worse than no prompt: it trains them to ignore the one place
// the app asks for something.
//
// Pure: no storage, no React. The caller supplies the dismissal state.

// A team belongs to a league by NAME here, matching how BowlingTracker
// holds teams in memory (`{ id, name, league }`) rather than by
// league_id. Comparing the wrong one silently finds nothing, which
// presents as "you have no team" to someone looking straight at theirs.
export function hasTeamForLeague(teams, league) {
  if (!Array.isArray(teams) || !league) return false;
  return teams.some(t => t && t.league === league);
}

// Nights this bowler has logged in this league.
//
// The prompt waits for one, because asking before anything is logged is
// the wall again in a friendlier font. After a real session the request
// has a reason attached: these scores are not counting for your team yet.
export function leagueSessionCount(sessions, bowler, league) {
  if (!Array.isArray(sessions) || !bowler || !league) return 0;
  return sessions.filter(s => s && s.bowler === bowler && s.league === league).length;
}

export function shouldPromptForTeam(options) {
  const o = (options && typeof options === "object" && !Array.isArray(options)) ? options : {};
  const { environment, league, teams, sessions, bowler, dismissed } = o;

  if (dismissed) return false;
  // Only league bowling has teams. Practice, tournaments and open
  // bowling have nothing to attach scores to and must never see this.
  if (environment !== "league") return false;
  if (!league) return false;
  if (hasTeamForLeague(teams, league)) return false;

  return leagueSessionCount(sessions, bowler, league) >= 1;
}

// Scores logged before a team existed, which should become the team's
// once one does.
//
// Matched on league and bowler, and only where no team is set already --
// a score already filed against another team is not ours to move.
export function scoresToAdopt(records, bowler, league) {
  if (!Array.isArray(records) || !bowler || !league) return [];
  return records.filter(r =>
    r && typeof r === "object" &&
    r.bowler === bowler && r.league === league && !r.teamId);
}
