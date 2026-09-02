// Bowling lineup order per league — used to display per-bowler breakdowns
// within a shared night (e.g. Team Series) in actual turn order rather than
// alphabetically. Anyone not listed here falls to the end, in whatever
// order they'd otherwise appear, so a new bowler doesn't break the sort.
//
// This is legacy scaffolding from before Team Management existed. lineupSort
// already prefers the team's real member order first and only falls back to
// this when a team has no members recorded — once every league's roster is
// reliably populated via Team Management, this fallback (and this whole
// file) can most likely be deleted.
const LINEUP_ORDER = {
  "Thursday House Shot": ["Tommy","Zack","Ryan","Rob","Aaron"],
  "Tuesday House Shot": ["Tommy","Zack","Ryan","Lee"],
};

export function lineupSort(bowlers,league,teamList=[]){
  const team=teamList.find(t=>t.league===league);
  const order=team?.members?.length?team.members:(LINEUP_ORDER[league]||[]);
  return [...bowlers].sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia===-1&&ib===-1)return 0;
    if(ia===-1)return 1;
    if(ib===-1)return -1;
    return ia-ib;
  });
}

export function renameLeagueInRecords(records,oldName,newName){
  return records.map(item=>item.league===oldName?{...item,league:newName}:item);
}
