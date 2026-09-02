import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "./AuthProvider.jsx";
import { cloudRead, cloudWrite, cloudDelete } from "./syncQueue.js";

// Pure roster-management functions, extracted so they're testable without
// rendering the component. Each takes the current `teams` array plus
// whatever's needed and returns a new array — no cloud calls, no React
// state, no id generation (callers pass in an id already generated via
// crypto.randomUUID(), keeping these fully deterministic).

export function addTeamMember(teams, teamId, profile) {
  const team = teams.find(t => t.id === teamId);
  if (!team || team.members.some(m => m.userId === profile.id)) return teams;
  const lineupPosition = team.members.length;
  const newMember = { userId: profile.id, displayName: profile.display_name, lineupPosition };
  return teams.map(t => t.id === teamId ? { ...t, members: [...t.members, newMember] } : t);
}

export function removeTeamMember(teams, teamId, userId) {
  return teams.map(t => t.id === teamId
    ? { ...t, members: t.members.filter(m => m.userId !== userId) }
    : t
  );
}

// Swaps the member at `index` with its neighbor in `direction` (-1 or +1)
// and renumbers lineup_position to match the new order. Returns the SAME
// array reference if the move is out of bounds, so callers can check
// `result === teams` to know nothing changed.
export function moveTeamMember(teams, teamId, index, direction) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return teams;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= team.members.length) return teams;

  const members = [...team.members];
  [members[index], members[newIndex]] = [members[newIndex], members[index]];
  const renumbered = members.map((m, i) => ({ ...m, lineupPosition: i }));

  return teams.map(t => t.id === teamId ? { ...t, members: renumbered } : t);
}

// Returns { teams, invite, error }. error is 'invalid' (blank name/email),
// 'no-team' (bad teamId), 'duplicate' (email already invited to this team),
// or null on success.
export function createTeamInvite(teams, teamId, id, name, email) {
  const cleanName = (name || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanName || !cleanEmail) return { teams, invite: null, error: "invalid" };
  const team = teams.find(t => t.id === teamId);
  if (!team) return { teams, invite: null, error: "no-team" };
  if (team.pendingInvites.some(inv => inv.email.toLowerCase() === cleanEmail)) {
    return { teams, invite: null, error: "duplicate" };
  }
  const lineupPosition = team.members.length + team.pendingInvites.length;
  const invite = { id, name: cleanName, email: cleanEmail, lineupPosition };
  const newTeams = teams.map(t => t.id === teamId ? { ...t, pendingInvites: [...t.pendingInvites, invite] } : t);
  return { teams: newTeams, invite, error: null };
}

export function cancelTeamInvite(teams, teamId, inviteId) {
  return teams.map(t => t.id === teamId
    ? { ...t, pendingInvites: t.pendingInvites.filter(inv => inv.id !== inviteId) }
    : t
  );
}

// The canonical shape of a freshly-created team — every field the render
// code assumes exists (members, pendingInvites) must be present here, or
// creating a team crashes the instant it tries to render. Centralized so
// this can't silently drift out of sync with what the render code expects,
// the way the inline version in createTeam() once did.
export function newTeamObject(id, name, league) {
  return { id, name, league, members: [], pendingInvites: [] };
}

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
  const{user,displayName,updateDisplayName}=useAuth();
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
  // "Your Name" editing
  const[editingMyName, setEditingMyName] = useState(false);
  const[myNameInput, setMyNameInput] = useState("");
  // Per-team invite-by-email form: {[teamId]: {name, email}}
  const[inviteForm, setInviteForm] = useState({});
  // QR code for the sign-in URL, generated once on mount
  const[qrDataUrl, setQrDataUrl] = useState("");

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
    const invitesRes = await cloudRead("pending_invites", q => q.select("id,team_id,invited_name,invited_email").is("accepted_at", null));

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

      const invitesByTeam = {};
      (invitesRes.data || []).forEach(inv => {
        if (!invitesByTeam[inv.team_id]) invitesByTeam[inv.team_id] = [];
        invitesByTeam[inv.team_id].push({ id: inv.id, name: inv.invited_name, email: inv.invited_email });
      });

      setTeams(teamsRes.data.map(t => ({
        id: t.id,
        name: t.name,
        league: leagueNameById[t.league_id] || "",
        members: membersByTeam[t.id] || [],
        pendingInvites: invitesByTeam[t.id] || [],
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

  // A QR code for the app's own sign-in URL — a convenient way to hand
  // someone the link, nothing more. It cannot log anyone in as anyone else;
  // each person still has to enter their own email and get their own magic
  // link. The actual "this person is pre-assigned to this roster slot"
  // linking happens via email-matched pending invites, independent of how
  // someone arrived at the sign-in screen.
  useEffect(() => {
    const url = window.location.origin + window.location.pathname;
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, []);

  const leagueList = leagues.length ? leagues : ["Tuesday House Shot", "Thursday House Shot"];
  const leagueTeams = teams.filter(team => team.league === selectedLeague);

  function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    const duplicate = leagueTeams.some(team => team.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { alert("A team with that name already exists in this league."); return; }

    const id = crypto.randomUUID();
    const leagueId = leagueIdsRef.current[selectedLeague];
    setTeams(prev => [...prev, newTeamObject(id, name, selectedLeague)]);
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
    setTeams(prev => addTeamMember(prev, teamId, profile));
    setSearchState(prev => ({ ...prev, [teamId]: { term: "", results: [], searching: false } }));
    cloudWrite("team_members", { team_id: teamId, user_id: profile.id, lineup_position: team.members.length });
  }

  function removeMember(teamId, userId) {
    setTeams(prev => removeTeamMember(prev, teamId, userId));
    cloudDelete("team_members", { team_id: teamId, user_id: userId });
  }

  // Pre-assigns a roster slot to someone who hasn't signed up yet. When
  // they eventually sign in with this exact email, a database trigger
  // automatically sets their display name and adds them to this team —
  // nothing further needs to happen on this end.
  function createInvite(teamId) {
    const form = inviteForm[teamId] || {};
    const id = crypto.randomUUID();
    const { teams: newTeams, invite, error } = createTeamInvite(teams, teamId, id, form.name, form.email);
    if (error === "duplicate") {
      alert("There's already a pending invite for that email on this team.");
      return;
    }
    if (error || !invite) return;
    setTeams(newTeams);
    setInviteForm(prev => ({ ...prev, [teamId]: { name: "", email: "" } }));
    cloudWrite("pending_invites", {
      id, team_id: teamId, invited_name: invite.name, invited_email: invite.email,
      lineup_position: invite.lineupPosition, created_by: user?.id || null,
    });
  }

  function cancelInvite(teamId, inviteId) {
    setTeams(prev => cancelTeamInvite(prev, teamId, inviteId));
    cloudDelete("pending_invites", inviteId);
  }

  function saveMyName() {
    const name = myNameInput.trim();
    if (!name) return;
    updateDisplayName(name);
    setEditingMyName(false);
  }

  function moveMember(teamId, index, direction) {
    const newTeams = moveTeamMember(teams, teamId, index, direction);
    if (newTeams === teams) return; // out of bounds, nothing changed
    setTeams(newTeams);
    const movedTeam = newTeams.find(t => t.id === teamId);
    const newIndex = index + direction;
    cloudWrite("team_members", { team_id: teamId, user_id: movedTeam.members[index].userId, lineup_position: movedTeam.members[index].lineupPosition });
    cloudWrite("team_members", { team_id: teamId, user_id: movedTeam.members[newIndex].userId, lineup_position: movedTeam.members[newIndex].lineupPosition });
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
        <div style={S.label}>Your Name</div>
        {!editingMyName ? (
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.text,fontSize:"15px",fontWeight:600}}>{displayName || "(not set)"}</span>
            <button style={S.button} onClick={()=>{setMyNameInput(displayName||"");setEditingMyName(true);}}>Edit</button>
          </div>
        ) : (
          <div style={{display:"flex",gap:"8px"}}>
            <input value={myNameInput} onChange={e=>setMyNameInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveMyName();}} autoFocus style={{...S.input,flex:1}}/>
            <button style={S.primary} onClick={saveMyName}>Save</button>
            <button style={S.button} onClick={()=>setEditingMyName(false)}>Cancel</button>
          </div>
        )}
        <div style={{fontSize:"11px",color:C.textMuted,marginTop:"8px"}}>
          This is what teammates see when they search for you or view the roster — it defaults to your email prefix until you set it.
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Share Sign-In Link</div>
        <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"10px"}}>
          A quick way to hand someone the app link — scanning this just opens the sign-in screen. It doesn't log anyone in as anyone; each person still enters their own email.
        </div>
        {qrDataUrl && (
          <div style={{textAlign:"center"}}>
            <img src={qrDataUrl} alt="QR code to sign-in page" style={{borderRadius:"8px",background:"#fff",padding:"8px"}}/>
          </div>
        )}
      </div>

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
          {team.members.length===0 && team.pendingInvites.length===0 && (
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
          {team.pendingInvites.map(invite => (
            <div key={invite.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
              <div style={{width:"24px"}}></div>
              <div style={{flex:1}}>
                <div style={{color:C.textMuted,fontStyle:"italic"}}>{invite.name}</div>
                <div style={{color:C.textMuted,fontSize:"10px"}}>invited · not signed in yet</div>
              </div>
              <button style={{...S.button,color:C.danger}} onClick={()=>cancelInvite(team.id,invite.id)}>×</button>
            </div>
          ))}

          <div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${C.border}`}}>
            <div style={S.label}>Add a Teammate</div>
            <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
              Search only finds people who've actually signed in at least once.
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

            <div style={{marginTop:"14px",paddingTop:"14px",borderTop:`1px solid ${C.border}`}}>
              <div style={S.label}>Or Invite Someone Not Signed Up Yet</div>
              <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                Reserves their spot on the roster now. The moment they sign in with this exact email, they're linked automatically — no extra steps.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                <input
                  value={inviteForm[team.id]?.name || ""}
                  onChange={e=>setInviteForm(prev=>({...prev,[team.id]:{...prev[team.id],name:e.target.value}}))}
                  placeholder="Their name"
                  style={S.input}
                />
                <input
                  value={inviteForm[team.id]?.email || ""}
                  onChange={e=>setInviteForm(prev=>({...prev,[team.id]:{...prev[team.id],email:e.target.value}}))}
                  placeholder="Their email"
                  type="email"
                  style={S.input}
                />
                <button style={S.primary} onClick={()=>createInvite(team.id)}>Send Invite</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
