import { useEffect, useState } from "react";

const TEAMS_KEY = "bowling-teams-v1";

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

function loadTeams() {
  try {
    const raw = window.localStorage.getItem(TEAMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTeams(teams) {
  window.localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}

function makeId(prefix="id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

export default function TeamManagement({
  bowlers = [],
  leagues = [],
  lineupOrder = {},
  onTeamsChange,
  onLeagueAdd,
  onLeagueRename,
}) {
  const [teams, setTeams] = useState(() => {
  const existing = loadTeams();
  if (existing.length) return existing;

  return leagues.map((league, index) => ({
    id: makeId("team"),
    name: `${league.replace(" House Shot", "")} Team`,
    league,
    members: Array.isArray(lineupOrder[league])
      ? [...lineupOrder[league]]
      : [],
  }));
});
  const [selectedLeague, setSelectedLeague] = useState(
    leagues[0] || "Tuesday House Shot"
  );
  const [newTeamName, setNewTeamName] = useState("");
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [editingLeagueName, setEditingLeagueName] = useState("");

  useEffect(() => {
  saveTeams(teams);
  onTeamsChange?.(teams);
}, [teams, onTeamsChange]);

  const leagueList = leagues.length
    ? leagues
    : ["Tuesday House Shot", "Thursday House Shot"];

  const leagueTeams = teams.filter(
    team => team.league === selectedLeague
  );

  function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;

    const duplicate = leagueTeams.some(
      team => team.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      alert("A team with that name already exists in this league.");
      return;
    }

    const team = {
      id: makeId("team"),
      name,
      league: selectedLeague,
      members: [],
    };

    setTeams(prev => [...prev, team]);
    setNewTeamName("");
  }

  function startRename(team) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
  }

  function saveRename(teamId) {
    const name = editingName.trim();
    if (!name) return;

    const duplicate = leagueTeams.some(
      team =>
        team.id !== teamId &&
        team.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      alert("A team with that name already exists in this league.");
      return;
    }

    setTeams(prev =>
      prev.map(team =>
        team.id === teamId ? { ...team, name } : team
      )
    );

    setEditingTeamId(null);
    setEditingName("");
  }

  function deleteTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (
      !window.confirm(
        `Delete "${team.name}"? This removes the team and its roster, but does not delete any bowlers.`
      )
    ) {
      return;
    }

    setTeams(prev => prev.filter(t => t.id !== teamId));
  }

  function addBowler(teamId, bowlerName) {
    if (!bowlerName) return;

    setTeams(prev =>
      prev.map(team => {
        if (team.id !== teamId) return team;
        if (team.members.includes(bowlerName)) return team;

        return {
          ...team,
          members: [...team.members, bowlerName],
        };
      })
    );
  }

  function removeBowler(teamId, bowlerName) {
    setTeams(prev =>
      prev.map(team =>
        team.id === teamId
          ? {
              ...team,
              members: team.members.filter(
                name => name !== bowlerName
              ),
            }
          : team
      )
    );
  }

  function moveBowler(teamId, index, direction) {
    setTeams(prev =>
      prev.map(team => {
        if (team.id !== teamId) return team;

        const members = [...team.members];
        const newIndex = index + direction;

        if (newIndex < 0 || newIndex >= members.length) {
          return team;
        }

        [members[index], members[newIndex]] = [
          members[newIndex],
          members[index],
        ];

        return {
          ...team,
          members,
        };
      })
    );
  }

  function createLeague() {
    const name=newLeagueName.trim();
    if(!name)return;
    if(leagueList.some(league=>league.toLowerCase()===name.toLowerCase())){alert("A league with that name already exists.");return;}
    onLeagueAdd?.(name);
    setSelectedLeague(name);
    setNewLeagueName("");
  }

  function startRenameLeague() {
    setEditingLeagueName(selectedLeague);
  }

  function saveLeagueRename() {
    const name=editingLeagueName.trim();
    if(!name||name===selectedLeague){setEditingLeagueName("");return;}
    if(leagueList.some(league=>league!==selectedLeague&&league.toLowerCase()===name.toLowerCase())){alert("A league with that name already exists.");return;}
    const oldName=selectedLeague;
    setTeams(prev=>prev.map(team=>team.league===oldName?{...team,league:name}:team));
    onLeagueRename?.(oldName,name);
    setSelectedLeague(name);
    setEditingLeagueName("");
  }

  return (
    <div>
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

        <div
          style={{
            display:"flex",
            gap:"8px",
          }}
        >
          <input
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") createTeam();
            }}
            placeholder="Team name"
            style={{
              ...S.input,
              flex:1,
            }}
          />

          <button
            style={S.primary}
            onClick={createTeam}
          >
            Add
          </button>
        </div>
      </div>

      {leagueTeams.length === 0 && (
        <div style={S.card}>
          <div
            style={{
              color:C.textMuted,
              textAlign:"center",
              padding:"12px 0",
            }}
          >
            No teams have been created for this league yet.
          </div>
        </div>
      )}

      {leagueTeams.map(team => (
        <div key={team.id} style={S.card}>
          {editingTeamId === team.id ? (
            <div>
              <div style={S.label}>Team Name</div>

              <div
                style={{
                  display:"flex",
                  gap:"8px",
                }}
              >
                <input
                  value={editingName}
                  onChange={e =>
                    setEditingName(e.target.value)
                  }
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      saveRename(team.id);
                    }
                  }}
                  autoFocus
                  style={{
                    ...S.input,
                    flex:1,
                  }}
                />

                <button
                  style={S.primary}
                  onClick={() => saveRename(team.id)}
                >
                  Save
                </button>

                <button
                  style={S.button}
                  onClick={() => {
                    setEditingTeamId(null);
                    setEditingName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display:"flex",
                justifyContent:"space-between",
                alignItems:"center",
                marginBottom:"14px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize:"18px",
                    fontWeight:700,
                    color:C.text,
                  }}
                >
                  {team.name}
                </div>

                <div
                  style={{
                    fontSize:"11px",
                    color:C.textMuted,
                    marginTop:"3px",
                  }}
                >
                  {team.members.length}{" "}
                  {team.members.length === 1
                    ? "bowler"
                    : "bowlers"}
                </div>
              </div>

              <div
                style={{
                  display:"flex",
                  gap:"6px",
                }}
              >
                <button
                  style={S.button}
                  onClick={() => startRename(team)}
                >
                  Rename
                </button>

                <button
                  style={{
                    ...S.button,
                    color:C.danger,
                  }}
                  onClick={() => deleteTeam(team.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          <div style={S.label}>Roster / Bowling Order</div>

          {team.members.length === 0 && (
            <div
              style={{
                color:C.textMuted,
                fontSize:"12px",
                padding:"6px 0 12px",
              }}
            >
              No bowlers assigned.
            </div>
          )}

          {team.members.map((bowlerName, index) => (
            <div
              key={`${team.id}-${bowlerName}`}
              style={{
                display:"flex",
                alignItems:"center",
                gap:"8px",
                padding:"8px 0",
                borderTop:`1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  width:"24px",
                  color:C.textMuted,
                  fontWeight:700,
                }}
              >
                {index + 1}.
              </div>

              <div
                style={{
                  flex:1,
                  color:C.text,
                }}
              >
                {bowlerName}
              </div>

              <button
                style={S.button}
                disabled={index === 0}
                onClick={() =>
                  moveBowler(team.id, index, -1)
                }
              >
                ↑
              </button>

              <button
                style={S.button}
                disabled={
                  index === team.members.length - 1
                }
                onClick={() =>
                  moveBowler(team.id, index, 1)
                }
              >
                ↓
              </button>

              <button
                style={{
                  ...S.button,
                  color:C.danger,
                }}
                onClick={() =>
                  removeBowler(team.id, bowlerName)
                }
              >
                ×
              </button>
            </div>
          ))}

          {bowlers.length > 0 && (
            <div
              style={{
                marginTop:"12px",
                paddingTop:"12px",
                borderTop:`1px solid ${C.border}`,
              }}
            >
              <div style={S.label}>Add Bowler</div>

              <select
                defaultValue=""
                onChange={e => {
                  addBowler(team.id, e.target.value);
                  e.target.value = "";
                }}
                style={S.input}
              >
                <option value="">
                  Select a bowler…
                </option>

                {bowlers
                  .filter(
                    name => !team.members.includes(name)
                  )
                  .map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
