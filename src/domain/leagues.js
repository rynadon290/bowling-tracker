// Sorts a list of bowler names into actual turn order for a shared night
// (e.g. Team Series), using the team's real roster order. If the team has
// no roster recorded yet, falls back to whatever order the bowlers were
// already in — no order info to sort by yet.
export function lineupSort(bowlers,league,teamList=[]){
  // Container only -- these hold strings or numbers, so filtering
  // for objects would empty a perfectly good list.
  teamList = Array.isArray(teamList) ? teamList : [];
  // Guarded for type, not just null: `{}` is truthy and not iterable.
  bowlers = Array.isArray(bowlers) ? bowlers : [];
  const team=teamList.find(t=>t.league===league);
  const order=team?.members||[];
  return [...bowlers].sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia===-1&&ib===-1)return 0;
    if(ia===-1)return 1;
    if(ib===-1)return -1;
    return ia-ib;
  });
}

export function renameLeagueInRecords(records,oldName,newName){
  // Null elements and non-list arguments: both arrive from the cloud.
  records = (Array.isArray(records) ? records : []).filter(x => x && typeof x === "object");
  records = Array.isArray(records) ? records : [];
  return records.map(item=>item.league===oldName?{...item,league:newName}:item);
}
