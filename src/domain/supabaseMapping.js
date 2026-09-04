// team_id is validated defensively here even though shots never currently
// use the form.teamId||sessionLeague fallback that caused this exact bug
// in matches and lane_patterns — this same bug pattern has now shown up
// twice, so trusting every caller forever isn't a great bet.
export function shotToSupabaseRow(shot,userId,leagueIdsMap){
  const validTeamId=(typeof shot.teamId==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shot.teamId))?shot.teamId:null;
  return{
    id:shot.id,
    user_id:userId,
    team_id:validTeamId,
    league_id:leagueIdsMap[shot.league]||null,
    bowler_name:shot.bowler||"",
    date:shot.date,
    game:parseInt(shot.game)||1,
    frame:parseInt(shot.frame)||1,
    ball_num:shot.ballNum??null,
    lane:shot.lane||"",
    ball:shot.ball||"",
    surface:shot.surface||"",
    starting_board:shot.startingBoard||"",
    target_arrows:shot.targetArrows||"",
    result:shot.result||"",
    other_leave:shot.otherLeave||[],
    spare_made:shot.spareMade||"",
    strike_description:shot.strikeDescription||"",
    release:shot.release||"",
    miss:shot.miss||[],
    ball_change_reason:shot.ballChangeReason||[],
    pin_count:shot.pinCount!=null?String(shot.pinCount):"",
    notes:shot.notes||"",
    display_result:shot._displayResult||shot.result||"",
    display_leave:shot._displayLeave||shot.otherLeave||[],
  };
}

export function shotFromSupabaseRow(row,leagueNameById){
  return{
    id:row.id,
    bowler:row.bowler_name||"",
    teamId:row.team_id||"",
    league:leagueNameById[row.league_id]||"",
    date:row.date,
    game:String(row.game),
    frame:String(row.frame),
    ballNum:row.ball_num,
    lane:row.lane||"",
    ball:row.ball||"",
    surface:row.surface||"",
    startingBoard:row.starting_board||"",
    targetArrows:row.target_arrows||"",
    result:row.result||"",
    otherLeave:row.other_leave||[],
    spareMade:row.spare_made||"",
    strikeDescription:row.strike_description||"",
    release:row.release||"",
    miss:row.miss||[],
    ballChangeReason:row.ball_change_reason||[],
    pinCount:row.pin_count||"",
    notes:row.notes||"",
    _displayResult:row.display_result||row.result||"",
    _displayLeave:row.display_leave||row.other_leave||[],
  };
}

export function sessionToSupabaseRow(session,userId,leagueIdsMap){
  const validTeamId=(typeof session.teamId==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.teamId))?session.teamId:null;
  return{
    id:session.id,
    user_id:userId,
    team_id:validTeamId,
    league_id:leagueIdsMap[session.league]||null,
    bowler_name:session.bowler||"",
    date:session.date,
    scores:session.scores||[],
    total:session.total??null,
    average:session.average??null,
    shot_count:session.shotCount||0,
    strikes:session.strikes||0,
    weak_tens:session.weakTens||0,
    ringing_tens:session.ringingTens||0,
    ten_pin_leaves:session.tenPinLeaves||0,
    single_pin_leaves:session.singlePinLeaves||0,
    single_pin_spares:session.singlePinSpares||0,
    spare_attempts:session.spareAttempts||0,
    spares_made:session.sparesMade||0,
    splits:session.splits||0,
    splits_converted:session.splitsConverted||0,
    balls_used:session.ballsUsed||[],
    misses:session.misses||[],
    releases:session.releases||[],
    poker_quarter:session.pokerQuarter||[0,0,0],
    poker_dollar:session.pokerDollar||[0,0,0],
    three_six_nine_winnings:session.threeSixNineWinnings||0,
    jackpot_winnings:session.jackpotWinnings||0,
  };
}

export function sessionFromSupabaseRow(row,leagueNameById){
  return{
    id:row.id,
    bowler:row.bowler_name||"",
    teamId:row.team_id||"",
    league:leagueNameById[row.league_id]||"",
    date:row.date,
    scores:row.scores||[],
    total:row.total,
    average:row.average,
    shotCount:row.shot_count||0,
    strikes:row.strikes||0,
    weakTens:row.weak_tens||0,
    ringingTens:row.ringing_tens||0,
    tenPinLeaves:row.ten_pin_leaves||0,
    singlePinLeaves:row.single_pin_leaves||0,
    singlePinSpares:row.single_pin_spares||0,
    spareAttempts:row.spare_attempts||0,
    sparesMade:row.spares_made||0,
    splits:row.splits||0,
    splitsConverted:row.splits_converted||0,
    ballsUsed:row.balls_used||[],
    misses:row.misses||[],
    releases:row.releases||[],
    pokerQuarter:row.poker_quarter||[0,0,0],
    pokerDollar:row.poker_dollar||[0,0,0],
    threeSixNineWinnings:row.three_six_nine_winnings||0,
    jackpotWinnings:row.jackpot_winnings||0,
  };
}

const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// match.teamId can legitimately be a league NAME string, not a real team
// id — the local matchKey fallback (form.teamId||sessionLeague) exists so
// opponent/handicap tracking still works before a bowler is set up as a
// team member, and that fallback value flows straight into this field.
// Never let a non-UUID value reach a uuid column.
export function matchToSupabaseRow(match,leagueIdsMap){
  const validTeamId=(typeof match.teamId==="string"&&UUID_PATTERN.test(match.teamId))?match.teamId:null;
  return{
    id:match.id,
    team_id:validTeamId,
    league_id:leagueIdsMap[match.league]||null,
    date:match.date,
    games:match.games||[null,null,null],
    series:match.series??null,
    opponent:match.opponent||"",
    handicap:match.handicap||"",
  };
}

export function matchFromSupabaseRow(row,leagueNameById){
  return{
    id:row.id,
    teamId:row.team_id||"",
    league:leagueNameById[row.league_id]||"",
    date:row.date,
    games:row.games||[null,null,null],
    series:row.series,
    opponent:row.opponent||"",
    handicap:row.handicap||"",
  };
}

// pattern.teamId can legitimately be a league NAME string, not a real team
// id — same reasoning as matchToSupabaseRow, via the same
// form.teamId||sessionLeague fallback used throughout Lane Conditions.
export function lanePatternToSupabaseRow(pattern,leagueIdsMap){
  const validTeamId=(typeof pattern.teamId==="string"&&UUID_PATTERN.test(pattern.teamId))?pattern.teamId:null;
  return{
    id:pattern.id,
    team_id:validTeamId,
    league_id:leagueIdsMap[pattern.league]||null,
    date:pattern.date,
    lane:String(pattern.lane),
    pattern_type:pattern.patternType||"house",
    pattern_name:pattern.patternName||"",
    length:pattern.length||"",
    volume:pattern.volume||"",
    ratio:pattern.ratio||"",
  };
}

export function lanePatternFromSupabaseRow(row,leagueNameById){
  return{
    id:row.id,
    teamId:row.team_id||"",
    league:leagueNameById[row.league_id]||"",
    date:row.date,
    lane:row.lane,
    patternType:row.pattern_type||"house",
    patternName:row.pattern_name||"",
    length:row.length||"",
    volume:row.volume||"",
    ratio:row.ratio||"",
  };
}
