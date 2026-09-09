import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { cloudUpdate, cloudRead, cloudWrite, cloudDelete } from "./syncQueue.js";

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
// email is optional — a blank one creates a name-only "placeholder" roster
// slot rather than an error. Duplicate-checking only applies when an email
// is actually given, since multiple email-less placeholders are allowed.
export function createTeamInvite(teams, teamId, id, name, email) {
  const cleanName = (name || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanName) return { teams, invite: null, error: "invalid" };
  const team = teams.find(t => t.id === teamId);
  if (!team) return { teams, invite: null, error: "no-team" };
  if (cleanEmail && team.pendingInvites.some(inv => inv.email && inv.email.toLowerCase() === cleanEmail)) {
    return { teams, invite: null, error: "duplicate" };
  }
  const lineupPosition = team.members.length + team.pendingInvites.length;
  const invite = { id, name: cleanName, email: cleanEmail || null, lineupPosition, leftHanded: false, isSub: false };
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

// Converts a placeholder into a real member, in one atomic local update.
// Used by both linking directions: a team member manually picking an
// account, or the new person claiming their own placeholder. Preserves the
// invite's original lineup position so the roster order doesn't shuffle
// just because someone finally signed up. Returns the SAME array reference
// if teamId/inviteId don't resolve to anything, so callers can check
// `result === teams` to know nothing changed.
export function resolvePlaceholder(teams, teamId, inviteId, profile) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return teams;
  const invite = team.pendingInvites.find(inv => inv.id === inviteId);
  if (!invite) return teams;

  const withoutPlaceholder = team.pendingInvites.filter(inv => inv.id !== inviteId);
  const alreadyMember = team.members.some(m => m.userId === profile.id);
  const newMembers = alreadyMember
    ? team.members
    : [...team.members, { userId: profile.id, displayName: profile.display_name, lineupPosition: invite.lineupPosition ?? team.members.length }];

  return teams.map(t => t.id === teamId ? { ...t, pendingInvites: withoutPlaceholder, members: newMembers } : t);
}

// Shares the live palette from ui.jsx instead of carrying a private copy
// of the original slate-and-blue. A private copy meant this screen stayed
// on the old colours no matter which theme was chosen -- and `danger`
// here is just the shared `miss` red under another name.
import { C as SHARED_C } from "./ui.jsx";
const C = new Proxy({}, {
  get(_, key) {
    if (key === "danger") return SHARED_C.miss;
    return SHARED_C[key];
  },
});

// Getters, not captured values: each style recomputes from the live C
// when read, so a theme change is reflected on the next render instead
// of freezing this screen on whatever colours were current at load.
const S = new Proxy({}, {
  get(_, key) {
    const styles = ({
  card:{
    backgroundColor:C.card,
    borderRadius:"12px",
    padding:"16px",
    marginBottom:"12px",
    border:`1px solid ${C.border}`,
  },
  label:{
    fontSize:"13px",fontWeight:600,color:C.text,
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
    color:C.onAccent,
    border:"none",
    borderRadius:"8px",
    padding:"10px 14px",
    fontSize:"13px",
    fontWeight:700,
    cursor:"pointer",
  },
});
    return styles[key];
  },
});

export default function TeamManagement({
  leagues = [],
  onTeamsChange, focusTeamId,
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
  const[editingTeamId, setEditingTeamId] = useState(null);

  // The team just created from the Leagues card above. Scrolled to on
  // arrival so adding players continues straight on from adding the team,
  // rather than leaving the bowler to find it further down the page.
  // Which team's cards are showing. Every team used to render its own
  // full stack -- name, roster, invite form, "not signed up yet" form --
  // so three teams meant scrolling past three of everything to reach the
  // one you wanted.
  const [shownTeamId, setShownTeamId] = useState("");
  const shownTeam = teams.find(t => t.id === shownTeamId) || teams[0] || null;

  const focusedTeamRef = useRef(null);
  useEffect(() => {
    if (!focusTeamId) return;
    // Select it as well as scrolling: with one team shown at a time, a
    // newly created team that isn't selected would scroll to nothing.
    setShownTeamId(focusTeamId);
    if (focusedTeamRef.current) {
      focusedTeamRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusTeamId, teams.length]);
  const[editingName, setEditingName] = useState("");
  // Asked at creation because there's no other reliable way to know when a
  // season ends -- leagues in this app have no automatic boundary, so this
  // is what makes the book-average update prompt possible at all. Optional:
  // an ongoing house shot with no fixed end just leaves these blank, and
  // the prompt never fires for it.
  // Per-team "add a teammate" search state: {[teamId]: {term, results, searching}}
  const[searchState, setSearchState] = useState({});
  const searchTimers = useRef({});
  // "Your Name" editing
  const[editingMyName, setEditingMyName] = useState(false);
  const[myNameInput, setMyNameInput] = useState("");
  // Per-team invite-by-email form: {[teamId]: {name, email}}
  const[inviteForm, setInviteForm] = useState({});
  // Per-placeholder "link to an account" search, keyed by invite id:
  // {[inviteId]: {term, results, searching}}
  const[linkSearchState, setLinkSearchState] = useState({});
  const linkSearchTimers = useRef({});
  // Self-claim: invites addressed to this account's own verified email,
  // loaded automatically rather than searched by typed name -- RLS now
  // only returns rows actually meant for this signed-in user, so there's
  // no free-text search surface that could leak or let someone claim a
  // spot that isn't theirs.
  // QR code for the sign-in URL, generated once on mount

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
    const membersRes = await cloudRead("team_members", q => q.select("team_id,user_id,lineup_position,left_handed,is_sub,profiles(display_name)"));
    const invitesRes = await cloudRead("pending_invites", q => q.select("id,team_id,invited_name,invited_email,lineup_position,left_handed,is_sub").is("accepted_at", null));

    if (teamsRes.online && teamsRes.data) {
      const membersByTeam = {};
      (membersRes.data || []).forEach(m => {
        if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
        membersByTeam[m.team_id].push({
          userId: m.user_id,
          displayName: m.profiles?.display_name || "Unknown",
          lineupPosition: m.lineup_position ?? 0,
          leftHanded: !!m.left_handed,
          isSub: !!m.is_sub,
        });
      });
      Object.values(membersByTeam).forEach(list => list.sort((a, b) => a.lineupPosition - b.lineupPosition));

      const invitesByTeam = {};
      (invitesRes.data || []).forEach(inv => {
        if (!invitesByTeam[inv.team_id]) invitesByTeam[inv.team_id] = [];
        invitesByTeam[inv.team_id].push({
          id: inv.id, name: inv.invited_name, email: inv.invited_email, lineupPosition: inv.lineup_position,
          leftHanded: !!inv.left_handed, isSub: !!inv.is_sub,
        });
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



  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Tells the parent about the current teams whenever they change, in the
  // SAME shape it always used (members as plain display-name strings) —
  // BowlingTracker.jsx's existing team-membership checks (e.g.
  // t.members.includes(activeBowler)) keep working unchanged. Internally
  // this component tracks richer per-member data (userId, lineup position)
  // that the parent doesn't need to know about.
  useEffect(() => {
    const simplified = teams.map(t => {
      // Placeholders merged in alongside real members, sorted together by
      // lineup position — a placeholder's scores are tracked identically to
      // a real member's (proxy-logged under their name), so anything that
      // resolves "is this bowler on this team" (team_id lookups, match/shot
      // cloud sync) needs to see them the same way, in the same actual
      // bowling order. The only real difference is they don't have a
      // linked account yet, which doesn't matter for local team membership.
      const combined = [
        ...t.members.map(m => ({ name: m.displayName, lineupPosition: m.lineupPosition ?? 0, leftHanded: !!m.leftHanded, isSub: !!m.isSub })),
        ...t.pendingInvites.map(inv => ({ name: inv.name, lineupPosition: inv.lineupPosition ?? 999, leftHanded: !!inv.leftHanded, isSub: !!inv.isSub })),
      ].sort((a, b) => a.lineupPosition - b.lineupPosition);
      const memberHandedness = {};
      const memberIsSub = {};
      combined.forEach(x => { memberHandedness[x.name] = x.leftHanded; memberIsSub[x.name] = x.isSub; });
      return { id: t.id, name: t.name, league: t.league, members: combined.map(x => x.name), memberHandedness, memberIsSub };
    });
    onTeamsChange?.(simplified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const leagueList = (leagues || []).length ? leagues : ["Tuesday House Shot", "Thursday House Shot"];



  function startRename(team) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
  }

  function saveRename(teamId) {
    const name = editingName.trim();
    if (!name) return;
    const renaming = teams.find(t => t.id === teamId);
    const duplicate = teams.some(team => team.id !== teamId
      && team.league === renaming?.league
      && team.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { alert("A team with that name already exists in this league."); return; }

    setTeams(prev => prev.map(team => team.id === teamId ? { ...team, name } : team));
    // cloudUpdate, not cloudWrite: cloudWrite UPSERTS the whole row, so
    // sending just { id, name } wrote league_id as null and the NOT NULL
    // constraint rejected it with 23502 -- then the queue retried the
    // same doomed write forever. A rename should change the name and
    // nothing else, which is what an UPDATE does.
    cloudUpdate("teams", { id: teamId }, { name });
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

  // Handedness and sub status for a real member. Only the changed field is
  // sent — upsert() only updates columns present in the payload, so
  // lineup_position and everything else on the existing row is left alone.
  function setMemberHandedness(teamId, userId, leftHanded) {
    setTeams(prev => prev.map(t => t.id !== teamId ? t : {
      ...t,
      members: t.members.map(m => m.userId === userId ? { ...m, leftHanded } : m),
    }));
    cloudWrite("team_members", { team_id: teamId, user_id: userId, left_handed: leftHanded });
  }
  function setMemberIsSub(teamId, userId, isSub) {
    setTeams(prev => prev.map(t => t.id !== teamId ? t : {
      ...t,
      members: t.members.map(m => m.userId === userId ? { ...m, isSub } : m),
    }));
    cloudWrite("team_members", { team_id: teamId, user_id: userId, is_sub: isSub });
  }

  // Same, for a placeholder.
  function setInviteHandedness(teamId, inviteId, leftHanded) {
    setTeams(prev => prev.map(t => t.id !== teamId ? t : {
      ...t,
      pendingInvites: t.pendingInvites.map(inv => inv.id === inviteId ? { ...inv, leftHanded } : inv),
    }));
    // cloudUpdate, not cloudWrite. cloudWrite upserts the WHOLE row, so
    // sending { id, left_handed } wiped team_id, invited_name and
    // invited_email to null -- rejected by NOT NULL, then retried
    // forever by the queue. Same bug the team rename had.
    cloudUpdate("pending_invites", { id: inviteId }, { left_handed: leftHanded });
  }
  function setInviteIsSub(teamId, inviteId, isSub) {
    setTeams(prev => prev.map(t => t.id !== teamId ? t : {
      ...t,
      pendingInvites: t.pendingInvites.map(inv => inv.id === inviteId ? { ...inv, isSub } : inv),
    }));
    cloudUpdate("pending_invites", { id: inviteId }, { is_sub: isSub });
  }

  // Manual link: a team member picks any real, already-signed-up account
  // for one of their own placeholders.
  function handleLinkSearchChange(inviteId, term) {
    setLinkSearchState(prev => ({ ...prev, [inviteId]: { term, results: prev[inviteId]?.results || [], searching: !!term.trim() } }));
    clearTimeout(linkSearchTimers.current[inviteId]);
    if (!term.trim()) {
      setLinkSearchState(prev => ({ ...prev, [inviteId]: { term: "", results: [], searching: false } }));
      return;
    }
    linkSearchTimers.current[inviteId] = setTimeout(async () => {
      const { data, online } = await cloudRead("profiles", q =>
        q.select("id,display_name").ilike("display_name", `%${term.trim()}%`).limit(8)
      );
      setLinkSearchState(prev => ({ ...prev, [inviteId]: { term, results: online && data ? data : [], searching: false } }));
    }, 300);
  }

  function linkPlaceholderToAccount(teamId, inviteId, profile) {
    const invite = teams.find(t => t.id === teamId)?.pendingInvites.find(i => i.id === inviteId);
    const lineupPosition = invite?.lineupPosition ?? 0;
    setTeams(prev => resolvePlaceholder(prev, teamId, inviteId, profile));
    setLinkSearchState(prev => ({ ...prev, [inviteId]: { term: "", results: [], searching: false } }));
    cloudWrite("team_members", { team_id: teamId, user_id: profile.id, lineup_position: lineupPosition });
    cloudUpdate("pending_invites", { id: inviteId }, { accepted_at: new Date().toISOString(), accepted_user_id: profile.id });
  }



  async function saveMyName() {
    const name = myNameInput.trim();
    if (!name) return;
    setEditingMyName(false);
    const { error } = await updateDisplayName(name);
    if (error) alert(error.message);
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

  return (
    <div>
      {loading && (
        <div style={S.card}>
          <div style={{ color:C.textMuted, textAlign:"center", padding:"12px 0" }}>Loading teams…</div>
        </div>
      )}

      {!loading && teams.length===0 && (
        <div style={S.card}>
          <div style={{color:C.textMuted,textAlign:"center",padding:"12px 0"}}>
            No teams yet — add one under a league in the Leagues card above.
          </div>
        </div>
      )}

      {/* Every team, not just one league's. The league dropdown that used
          to scope this list is gone: picking a league now happens in the
          Leagues card above, where teams are created, so a second picker
          here was a way to end up looking at a different league than the
          one you just added a team to. */}
      {/* One team at a time, chosen from a dropdown. */}
      {teams.length > 1 && (
        <div style={S.card}>
          <div style={S.label}>Team</div>
          <select style={{ ...S.input, appearance: "auto" }}
            value={shownTeam?.id || ""}
            onChange={e => setShownTeamId(e.target.value)}>
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.league ? ` — ${String(t.league).replace(" House Shot", "")}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {[shownTeam].filter(Boolean).map(team => (
        <div key={team.id} ref={team.id===focusTeamId?focusedTeamRef:null} style={{
          ...S.card,
          // A brief outline on the team you just made, so it's obvious
          // which one the page jumped to.
          ...(team.id===focusTeamId?{border:`1px solid ${C.accent}66`}:{}),
        }}>
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
                  {team.league?`${String(team.league).replace(" House Shot","")} · `:""}
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
              <button style={{...S.button,minWidth:"28px"}} title="Bowling hand — tap to switch"
                onClick={()=>setMemberHandedness(team.id,member.userId,!member.leftHanded)}>{member.leftHanded?"L":"R"}</button>
              <button style={{...S.button,color:member.isSub?C.accent:undefined}} title="Sub — tap to toggle"
                onClick={()=>setMemberIsSub(team.id,member.userId,!member.isSub)}>{member.isSub?"Sub ✓":"Sub"}</button>
              <button style={S.button} disabled={index===0} onClick={()=>moveMember(team.id,index,-1)}>↑</button>
              <button style={S.button} disabled={index===team.members.length-1} onClick={()=>moveMember(team.id,index,1)}>↓</button>
              <button style={{...S.button,color:C.danger}} onClick={()=>removeMember(team.id,member.userId)}>×</button>
            </div>
          ))}
          {team.pendingInvites.map(invite => (
            <div key={invite.id} style={{padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <div style={{width:"24px"}}></div>
                <div style={{flex:1}}>
                  <div style={{color:C.textMuted,fontStyle:"italic"}}>{invite.name}</div>
                  <div style={{color:C.textMuted,fontSize:"10px"}}>
                    {invite.email ? "invited · not signed in yet" : "placeholder · no email on file"}
                  </div>
                </div>
                <button style={{...S.button,minWidth:"28px"}} title="Bowling hand — tap to switch"
                  onClick={()=>setInviteHandedness(team.id,invite.id,!invite.leftHanded)}>{invite.leftHanded?"L":"R"}</button>
                <button style={{...S.button,color:invite.isSub?C.accent:undefined}} title="Sub — tap to toggle"
                  onClick={()=>setInviteIsSub(team.id,invite.id,!invite.isSub)}>{invite.isSub?"Sub ✓":"Sub"}</button>
                <button style={S.button} onClick={()=>setLinkSearchState(prev=>prev[invite.id]!==undefined
                  ?{...prev,[invite.id]:undefined}
                  :{...prev,[invite.id]:{term:"",results:[],searching:false}}
                )}>{linkSearchState[invite.id]!==undefined?"Cancel":"Link Account"}</button>
                <button style={{...S.button,color:C.danger}} onClick={()=>cancelInvite(team.id,invite.id)}>×</button>
              </div>
              {linkSearchState[invite.id]!==undefined && (
                <div style={{marginTop:"8px",marginLeft:"32px"}}>
                  <input
                    value={linkSearchState[invite.id]?.term||""}
                    onChange={e=>handleLinkSearchChange(invite.id,e.target.value)}
                    placeholder="Search for their real account…"
                    style={S.input}
                  />
                  {linkSearchState[invite.id]?.searching && (
                    <div style={{fontSize:"12px",color:C.textMuted,marginTop:"6px"}}>Searching…</div>
                  )}
                  {!linkSearchState[invite.id]?.searching && (linkSearchState[invite.id]?.results?.length>0) && (
                    <div style={{marginTop:"6px"}}>
                      {linkSearchState[invite.id].results.map(p=>(
                        <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                          <span style={{color:C.text}}>{p.display_name}</span>
                          <button style={S.button} onClick={()=>linkPlaceholderToAccount(team.id,invite.id,p)}>Link</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!linkSearchState[invite.id]?.searching && linkSearchState[invite.id]?.term && linkSearchState[invite.id]?.results?.length===0 && (
                    <div style={{fontSize:"12px",color:C.textMuted,marginTop:"6px"}}>No one found with that name.</div>
                  )}
                </div>
              )}
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
              <div style={S.label}>Or Add Someone Not Signed Up Yet</div>
              <div style={{fontSize:"11px",color:C.textMuted,marginBottom:"8px"}}>
                Reserves their spot on the roster now — you can start logging their scores under their name right away via Who's Bowling, no account needed yet. Email is optional: with one, they're linked automatically the moment they sign in with that exact address. Without one, you'll need to link them manually once they join.
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
                  placeholder="Their email (optional)"
                  type="email"
                  style={S.input}
                />
                <button style={S.primary} onClick={()=>createInvite(team.id)}>Add to Roster</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
