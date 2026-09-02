import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { cloudRead, cloudWrite, cloudDelete } from "./syncQueue.js";

const C = {
  bg:"#0f1117",
  surface:"#1a1d27",
  card:"#22263a",
  accent:"#4a9eff",
  accentDim:"#1e3a5f",
  text:"#e8eaf0",
  textMuted:"#8892a4",
  border:"#2e3347",
  danger:"#ef4444",
};

const S = {
  card:{
    backgroundColor:C.card,
    borderRadius:"12px",
    padding:"16px",
    marginBottom:"12px",
    border:`1px solid ${C.border}`,
  },
  label:{
    fontSize:"10px",
    fontWeight:700,
    letterSpacing:"0.1em",
    textTransform:"uppercase",
    color:C.textMuted,
    marginBottom:"8px",
  },
  input:{
    width:"100%",
    backgroundColor:C.surface,
    border:`1px solid ${C.border}`,
    borderRadius:"8px",
    padding:"10px 12px",
    color:C.text,
    fontSize:"14px",
    boxSizing:"border-box",
    outline:"none",
  },
  button:{
    backgroundColor:C.surface,
    color:C.text,
    border:`1px solid ${C.border}`,
    borderRadius:"8px",
    padding:"9px 12px",
    fontSize:"13px",
    fontWeight:600,
    cursor:"pointer",
  },
  primary:{
    backgroundColor:C.accent,
    color:"#fff",
    border:"none",
    borderRadius:"8px",
    padding:"10px 14px",
    fontSize:"13px",
    fontWeight:700,
    cursor:"pointer",
  },
};

export default function TeamManagement({
  leagues = [],
  onTeamsChange,
  onLeagueAdd,
  onLeagueRename,
}) {
  const{user}=useAuth();
  // Maps league name -> its Supabase row id, built from its own small fetch
  // on mount. Teams are stored client-side keyed by league NAME (matching
  // how the rest of the app already works with leagues as plain strings) —
  // this ref is only consulted at the moment of talking to Supabase, so a
  // team row always gets the correct league_id foreign key.
  const leagueIdsRef = useRef({});
  const[teams, setTeams] = useState([]);
  const[loading, setLoading] = useState(true);
  const[selectedLeague, setSelectedLeague] = useState(leagues[0] || "Tuesday House Shot");
  const[newTeamName, setNewTeamName] = useState("");
  const[editingTeamId, setEditingTeamId] = useState(null);
  const[editingName, setEditingName] = useState("");
  const[newLeagueName, setNewLeagueName] = useState("");
  const[editingLeagueName, setEditingLeagueName] = useState("");
  // Per-team "add a teammate" search state: {[teamId]: {term, results, searching}}
  const[searchState, setSearchState] = useState({});
  const searchTimers = useRef({});

  async function loadAll() {
    setLoading(true);
    const leaguesRes = await cloudRead("leagues", q => q.select("id,name"));
    const leagueNameById = {};
    if (leaguesRes.online && leaguesRes.data) {
      leaguesRes.data.forEach(l => {
        leagueNameById[l.id] = l.name;
        leagueIdsRef.current[l.name] = l.id;
      });
    }

    const teamsRes = await cloudRead("teams", q => q.select("id,name,league_id"));
    const membersRes = await cloudRead("team_members", q => q.select("team_id,user_id,lineup_position,profiles(display_name)"));

    if (teamsRes.online && teamsRes.data) {
      const membersByTeam = {};
      (membersRes.data || []).forEach(m => {
        if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
        membersByTeam[m.team_id].push({
          userId: m.user_id,
          displayName: m.profiles?.display_name || "Unknown",
          lineupPosition: m.lineup_position ?? 0,
        });
      });
      Object.values(membersByTeam).forEach(list => list.sort((a, b) => a.lineupPosition - b.lineupPosition));

      setTeams(teamsRes.data.map(t => ({
        id: t.id,
        name: t.name,
        league: leagueNameById[t.league_id] || "",
        members: membersByTeam[t.id] || [],
      })));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tells the parent about the current teams whenever they change, in the
  // SAME shape it always used (members as plain display-name strings) —
  // BowlingTracker.jsx's existing team-membership checks (e.g.
  // t.members.includes(activeBowler)) keep working unchanged. Internally
  // this component tracks richer per-member data (userId, lineup position)
  // that the parent doesn't need to know about.
  useEffect(() => {
    const simplified = teams.map(t => ({
      id: t.id, name: t.name, league: t.league,
      members: t.members.map(m => m.displayName),
    }));
    onTeamsChange?.(simplified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const leagueList = leagues.length ? leagues : ["Tuesday House Shot", "Thursday House Shot"];
  const leagueTeams = teams.filter(team => team.league === selectedLeague);

  function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    const duplicate = leagueTeams.some(team => team.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { alert("A team with that name already exists in this league."); return; }

    const id = crypto.randomUUID();
    const leagueId = leagueIdsRef.current[selectedLeague];
    setTeams(prev => [...prev, { id, name, league: selectedLeague, members: [] }]);
    setNewTeamName("");
    if (leagueId) {
      cloudWrite("teams", { id, name, league_id: leagueId, created_by: user?.id || null });
    }
  }

  function startRename(team) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
  }

  function saveRename(teamId) {
    const name = editingName.trim();
    if (!name) return;
    const duplicate = leagueTeams.some(team => team.id !== teamId && team.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { alert("A team with that name already exists in this league."); return; }

    setTeams(prev => prev.map(team => team.id === teamId ? { ...team, name } : team));
    cloudWrite("teams", { id: teamId, name });
    setEditingTeamId(null);
    setEditingName("");
  }

  function deleteTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    if (!window.confirm(`Delete "${team.name}"? This removes the team and its roster, but does not delete any bowler accounts.`)) return;

    setTeams(prev => prev.filter(t => t.id !== teamId));
    cloudDelete("teams", teamId); // cascades team_members server-side
  }

  // Debounced search against real signed-up accounts. Note: this can only
  // ever find people who have actually signed in at least once — it's not
  // a directory of everyone you intend to bowl with, just everyone who's
  // shown up so far.
  function handleSearchChange(teamId, term) {
    setSearchState(prev => ({ ...prev, [teamId]: { term, results: prev[teamId]?.results || [], searching: !!term.trim() } }));
    clearTimeout(searchTimers.current[teamId]);
    if (!term.trim()) {
      setSearchState(prev => ({ ...prev, [teamId]: { term: "", results: [], searching: false } }));
      return;
    }
    searchTimers.current[teamId] = setTimeout(async () => {
      const { data, online } = await cloudRead("profiles", q =>
        q.select("id,display_name").ilike("display_name", `%${term.trim()}%`).limit(8)
      );
      setSearchState(prev => ({ ...prev, [teamId]: { term, results: online && data ? data : [], searching: false } }));
    }, 300);
  }

  function addMember(teamId, profile) {
    const team = teams.find(t => t.id === teamId);
    if (!team || team.members.some(m => m.userId === profile.id)) return;
    const lineupPosition = team.members.length;
    setTeams(prev => prev.map(t => t.id === teamId
      ? { ...t, members: [...t.members, { userId: profile.id, displayName: profile.display_name, lineupPosition }] }
      : t
    ));
    setSearchState(prev => ({ ...prev, [teamId]: { term: "", results: [], searching: false } }));
    cloudWrite("team_members", { team_id: teamId, user_id: profile.id, lineup_position: lineupPosition });
  }

  function removeMember(teamId, userId) {
    setTeams(prev => prev.map(t => t.id === teamId
      ? { ...t, members: t.members.filter(m => m.userId !== userId) }
      : t
    ));
    cloudDelete("team_members", { team_id: teamId, user_id: userId });
  }

  function moveMember(teamId, index, direction) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= team.members.length) return;

    const members = [...team.members];
    [members[index], members[newIndex]] = [members[newIndex], members[index]];
    const renumbered = members.map((m, i) => ({ ...m, lineupPosition: i }));

    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: renumbered } : t));
    cloudWrite("team_members", { team_id: teamId, user_id: renumbered[index].userId, lineup_position: renumbered[index].lineupPosition });
    cloudWrite("team_members", { team_id: teamId, user_id: renumbered[newIndex].userId, lineup_position: renumbered[newIndex].lineupPosition });
  }

  function createLeague() {
    const name = newLeagueName.trim();
    if (!name) return;
    if (leagueList.some(league => league.toLowerCase() === name.toLowerCase())) { alert("A league with that name already exists."); return; }
    onLeagueAdd?.(name);
    setSelectedLeague(name);
    setNewLeagueName("");
  }

  function startRenameLeague() {
    setEditingLeagueName(selectedLeague);
  }

  function saveLeagueRename() {
    const name = editingLeagueName.trim();
    if (!name || name === selectedLeague) { setEditingLeagueName(""); return; }
    if (leagueList.some(league => league !== selectedLeague && league.toLowerCase() === name.toLowerCase())) { alert("A league with that name already exists."); return; }
    const oldName = selectedLeague;
    onLeagueRename?.(oldName, name);
    setSelectedLeague(name);
    setEditingLeagueName("");
  }

  return (
    <div>
      {loading && (
        <div style={S.card}>
          <div style={{ color:C.textMuted, textAlign:"center", padding:"12px 0" }}>Loading teams…</div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>League</div>
        <select value={selectedLeague} onChange={e=>setSelectedLeague(e.target.value)} style={{...S.input,appearance:"auto"}}>
          {leagueList.map(league=><option key={league} value={league}>{league}</option>)}
        </select>
        {!editingLeagueName ? (
          <button style={{...S.button,width:"100%",marginTop:"8px"}} onClick={startRenameLeague} disabled={!selectedLeague}>Rename League</button>
        ) : (
          <div style={{marginTop:"10px"}}>
            <div style={S.label}>New League Name</div>
            <div style={{display:"flex",gap:"8px"}}>
              <input value={editingLeagueName} onChange={e=>setEditingLeagueName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveLeagueRename();}} autoFocus style={{...S.input,flex:1}}/>
              <button style={S.primary} onClick={saveLeagueRename}>Save</button>
              <button style={S.button} onClick={()=>setEditingLeagueName("")}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{marginTop:"14px",paddingTop:"14px",borderTop:`1px solid ${C.border}`}}>
          <div style={S.label}>Add League</div>
          <div style={{display:"flex",gap:"8px"}}>
            <input value={newLeagueName} onChange={e=>setNewLeagueName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")createLeague();}} placeholder="League name" style={{...S.input,flex:1}}/>
            <button style={S.primary} onClick={createLeague}>Add</button>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Create Team</div>
        <div style={{display:"flex",gap:"8px"}}>
          <input
            value={newTeamName}
            onChange={e=>setNewTeamName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")createTeam();}}
            placeholder="Team name"
            style={{...S.input,flex:1}}
          />
          <button style={S.primary} onClick={createTeam}>Add</button>
        </div>
      </div>

      {!loading && leagueTeams.length===0 && (
        <div style={S.card}>
          <div style={{color:C.textMuted,textAlign:"center",padding:"12px 0"}}>No teams have been created for this league yet.</div>
        </div>
      )}

      {leagueTeams.map(team => (
        <div key={team.id} style={S.card}>
          {editingTeamId===team.id ? (
            <div>
              <div style={S.label}>Team Name</div>
              <div style={{display:"flex",gap:"8px"}}>
                <input value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveRename(team.id);}} autoFocus style={{...S.input,flex:1}}/>
                <button style={S.primary} onClick={()=>saveRename(team.id)}>Save</button>
                <button style={S.button} onClick={()=>{setEditingTeamId(null);setEditingName("");}}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div>
                <div style={{fontSize:"18px",fontWeight:700,color:C.text}}>{team.name}</div>
                <div style={{fontSize:"11px",color:C.textMuted,marginTop:"3px"}}>
                  {team.members.length} {team.members.length===1?"bowler":"bowlers"}
                </div>
              </div>
              <div style={{display:"flex",gap:"6px"}}>
                <button style={S.button} onClick={()=>startRename(team)}>Rename</button>
                <button style={{...S.button,color:C.danger}} onClick={()=>deleteTeam(team.id)}>Delete</button>
              </div>
            </div>
          )}

          <div style={S.label}>Roster / Bowling Order</div>
          {team.members.length===0 && (
            <div style={{color:C.textMuted,fontSize:"12px",padding:"6px 0 12px"}}>No bowlers assigned.</div>
          )}
          {team.members.map((member, index) => (
            <div key={member.userId} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
              <div style={{width:"24px",color:C.textMuted,fontWeight:700}}>{index+1}.</div>
              <div style={{flex:1,color:C.text}}>{member.displayName}</div>
              <button style={S.button} disabled={index===0} onClick={()=>moveMember(team.id,index,-1)}>↑</button>
              <button style={S.button} disabled={index===team.members.length-1} onClick={()=>moveMember(team.id,index,1)}>↓</button>
              <button style={{...S.button,color:C.danger}} onClick={()=>removeMember(team.id,member.userId)}>×</button>
            </div>
          ))}

          <div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${C.border}`}}>
            <div style={S.label}>Add a Teammate</div>
            <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
              Search only finds people who've actually signed in at least once — have them sign in first if they're not showing up.
            </div>
            <input
              value={searchState[team.id]?.term || ""}
              onChange={e=>handleSearchChange(team.id, e.target.value)}
              placeholder="Search by name…"
              style={S.input}
            />
            {searchState[team.id]?.searching && (
              <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>Searching…</div>
            )}
            {!searchState[team.id]?.searching && (searchState[team.id]?.results?.length > 0) && (
              <div style={{marginTop:"8px"}}>
                {searchState[team.id].results
                  .filter(p => !team.members.some(m => m.userId === p.id))
                  .map(p => (
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                      <span style={{color:C.text}}>{p.display_name}</span>
                      <button style={S.button} onClick={()=>addMember(team.id, p)}>Add</button>
                    </div>
                  ))}
              </div>
            )}
            {!searchState[team.id]?.searching && searchState[team.id]?.term && searchState[team.id]?.results?.length===0 && (
              <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>No one found with that name.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
