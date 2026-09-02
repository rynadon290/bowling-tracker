import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { cloudRead, cloudWrite, cloudDelete } from "./syncQueue.js";

// Pure functions, extracted so they're testable without rendering the
// component — same pattern as TeamManagement.jsx's roster functions.

// Sorts raw friendship rows (requester_id/addressee_id/status) into
// accepted/incoming/outgoing from the current user's point of view.
// profilesById maps the OTHER person's user id -> their display name.
export function categorizeFriendships(friendships, myUserId, profilesById) {
  const accepted = [], incoming = [], outgoing = [];
  friendships
    .filter(f => f.requester_id === myUserId || f.addressee_id === myUserId)
    .forEach(f => {
      const otherId = f.requester_id === myUserId ? f.addressee_id : f.requester_id;
      const entry = { friendshipId: f.id, userId: otherId, displayName: profilesById[otherId] || "Unknown" };
      if (f.status === "accepted") accepted.push(entry);
      else if (f.status === "pending" && f.addressee_id === myUserId) incoming.push(entry);
      else if (f.status === "pending" && f.requester_id === myUserId) outgoing.push(entry);
    });
  return { accepted, incoming, outgoing };
}

// Ranks sessions by per-person average, for everyone in `nameById` (self +
// accepted friends) who has at least one session with a real average.
export function computeLeaderboard(sessions, nameById) {
  const byUser = {};
  sessions.forEach(s => {
    if (s.average == null || !nameById[s.user_id]) return;
    (byUser[s.user_id] = byUser[s.user_id] || []).push(s.average);
  });
  return Object.entries(byUser)
    .map(([userId, averages]) => ({
      userId,
      displayName: nameById[userId],
      sessionCount: averages.length,
      overallAverage: Math.round(averages.reduce((a, b) => a + b, 0) / averages.length),
    }))
    .sort((a, b) => b.overallAverage - a.overallAverage);
}

const C = {
  bg:"#0f1117", surface:"#1a1d27", card:"#22263a",
  accent:"#4a9eff", accentDim:"#1e3a5f",
  text:"#e8eaf0", textMuted:"#8892a4", border:"#2e3347",
  danger:"#ef4444", strike:"#22c55e",
};

const S = {
  card:{ backgroundColor:C.card, borderRadius:"12px", padding:"16px", marginBottom:"12px", border:`1px solid ${C.border}` },
  label:{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:C.textMuted, marginBottom:"8px" },
  input:{ width:"100%", backgroundColor:C.surface, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px", color:C.text, fontSize:"14px", boxSizing:"border-box", outline:"none" },
  button:{ backgroundColor:C.surface, color:C.text, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"9px 12px", fontSize:"13px", fontWeight:600, cursor:"pointer" },
  primary:{ backgroundColor:C.accent, color:"#fff", border:"none", borderRadius:"8px", padding:"10px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
};

export default function Friends() {
  const{user,displayName}=useAuth();
  const[friends,setFriends]=useState([]);
  const[incoming,setIncoming]=useState([]);
  const[outgoing,setOutgoing]=useState([]);
  const[loading,setLoading]=useState(true);

  const[searchTerm,setSearchTerm]=useState("");
  const[searchResults,setSearchResults]=useState([]);
  const[searching,setSearching]=useState(false);
  const searchTimer=useRef(null);

  const[leaderboard,setLeaderboard]=useState([]);
  const[leaderboardLoading,setLeaderboardLoading]=useState(false);

  async function loadFriendships() {
    setLoading(true);
    const{data,online}=await cloudRead("friendships",q=>q.select("id,requester_id,addressee_id,status"));
    if (!online || !data) { setLoading(false); return; }

    const myId=user?.id;
    const relevant=data.filter(f=>f.requester_id===myId||f.addressee_id===myId);
    const otherIds=[...new Set(relevant.map(f=>f.requester_id===myId?f.addressee_id:f.requester_id))];

    let profilesById={};
    if (otherIds.length) {
      const profRes=await cloudRead("profiles",q=>q.select("id,display_name").in("id",otherIds));
      if (profRes.online && profRes.data) {
        profRes.data.forEach(p=>{profilesById[p.id]=p.display_name;});
      }
    }

    const{accepted,incoming:inc,outgoing:out}=categorizeFriendships(relevant,myId,profilesById);
    setFriends(accepted);
    setIncoming(inc);
    setOutgoing(out);
    setLoading(false);
  }

  useEffect(()=>{ loadFriendships(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[]);

  async function loadLeaderboard() {
    if (!user?.id) return;
    setLeaderboardLoading(true);
    const friendIds=friends.map(f=>f.userId);
    const allIds=[user.id,...friendIds];
    const nameById={[user.id]:displayName||"You"};
    friends.forEach(f=>{nameById[f.userId]=f.displayName;});

    const{data,online}=await cloudRead("sessions",q=>q.select("user_id,average").in("user_id",allIds));
    if (online && data) setLeaderboard(computeLeaderboard(data,nameById));
    setLeaderboardLoading(false);
  }

  useEffect(()=>{ loadLeaderboard(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[friends]);

  function handleSearchChange(term) {
    setSearchTerm(term);
    clearTimeout(searchTimer.current);
    if (!term.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current=setTimeout(async ()=>{
      const{data,online}=await cloudRead("profiles",q=>q.select("id,display_name").ilike("display_name",`%${term.trim()}%`).limit(8));
      const results=(online&&data)?data.filter(p=>p.id!==user?.id):[];
      setSearchResults(results);
      setSearching(false);
    },300);
  }

  async function sendRequest(profile) {
    const alreadyConnected=[...friends,...incoming,...outgoing].some(f=>f.userId===profile.id);
    if (alreadyConnected) return;
    const id=crypto.randomUUID();
    setOutgoing(prev=>[...prev,{friendshipId:id,userId:profile.id,displayName:profile.display_name}]);
    setSearchTerm(""); setSearchResults([]);
    await cloudWrite("friendships",{id,requester_id:user?.id,addressee_id:profile.id,status:"pending"});
  }

  async function acceptRequest(entry) {
    setIncoming(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    setFriends(prev=>[...prev,entry]);
    await cloudWrite("friendships",{id:entry.friendshipId,status:"accepted"});
  }

  async function declineRequest(entry) {
    setIncoming(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    await cloudDelete("friendships",entry.friendshipId);
  }

  async function cancelRequest(entry) {
    setOutgoing(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    await cloudDelete("friendships",entry.friendshipId);
  }

  async function removeFriend(entry) {
    if (!window.confirm(`Remove ${entry.displayName} as a friend?`)) return;
    setFriends(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    await cloudDelete("friendships",entry.friendshipId);
  }

  const visibleResults=searchResults.filter(p=>
    !friends.some(f=>f.userId===p.id) && !incoming.some(f=>f.userId===p.id) && !outgoing.some(f=>f.userId===p.id)
  );

  return (
    <div>
      {loading && (
        <div style={S.card}>
          <div style={{color:C.textMuted,textAlign:"center",padding:"12px 0"}}>Loading friends…</div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Add a Friend</div>
        <input value={searchTerm} onChange={e=>handleSearchChange(e.target.value)} placeholder="Search by name…" style={S.input}/>
        {searching && <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>Searching…</div>}
        {!searching && visibleResults.length>0 && (
          <div style={{marginTop:"8px"}}>
            {visibleResults.map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                <span style={{color:C.text}}>{p.display_name}</span>
                <button style={S.button} onClick={()=>sendRequest(p)}>Add</button>
              </div>
            ))}
          </div>
        )}
        {!searching && searchTerm && visibleResults.length===0 && (
          <div style={{fontSize:"12px",color:C.textMuted,marginTop:"8px"}}>No one found with that name.</div>
        )}
      </div>

      {incoming.length>0 && (
        <div style={S.card}>
          <div style={S.label}>Requests</div>
          {incoming.map(entry=>(
            <div key={entry.friendshipId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
              <span style={{color:C.text}}>{entry.displayName}</span>
              <div style={{display:"flex",gap:"6px"}}>
                <button style={{...S.button,color:C.strike}} onClick={()=>acceptRequest(entry)}>Accept</button>
                <button style={{...S.button,color:C.danger}} onClick={()=>declineRequest(entry)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {outgoing.length>0 && (
        <div style={S.card}>
          <div style={S.label}>Sent</div>
          {outgoing.map(entry=>(
            <div key={entry.friendshipId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
              <span style={{color:C.textMuted,fontStyle:"italic"}}>{entry.displayName}</span>
              <button style={S.button} onClick={()=>cancelRequest(entry)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Friends</div>
        {!loading && friends.length===0 && (
          <div style={{color:C.textMuted,fontSize:"12px",padding:"6px 0"}}>No friends yet — search above to add someone.</div>
        )}
        {friends.map(entry=>(
          <div key={entry.friendshipId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
            <span style={{color:C.text}}>{entry.displayName}</span>
            <button style={{...S.button,color:C.danger}} onClick={()=>removeFriend(entry)}>Remove</button>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.label}>Leaderboard</div>
        {leaderboardLoading && <div style={{color:C.textMuted,fontSize:"12px",padding:"6px 0"}}>Loading…</div>}
        {!leaderboardLoading && leaderboard.length===0 && (
          <div style={{color:C.textMuted,fontSize:"12px",padding:"6px 0"}}>No sessions logged yet among you and your friends.</div>
        )}
        {!leaderboardLoading && leaderboard.map((row,i)=>(
          <div key={row.userId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:i>0?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <div style={{width:"20px",color:C.textMuted,fontWeight:700}}>{i+1}.</div>
              <span style={{color:row.userId===user?.id?C.accent:C.text,fontWeight:row.userId===user?.id?700:400}}>{row.displayName}</span>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:C.text,fontWeight:700}}>{row.overallAverage}</div>
              <div style={{color:C.textMuted,fontSize:"10px"}}>{row.sessionCount} {row.sessionCount===1?"night":"nights"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
