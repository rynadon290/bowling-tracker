import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { cloudRead, cloudWrite, cloudDelete } from "./syncQueue.js";
import QRCode from "qrcode";

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
  card:{ backgroundColor:C.card, borderRadius:"12px", padding:"16px", marginBottom:"12px", border:`1px solid ${C.border}` },
  label:{ fontSize:"13px",fontWeight:600,color:C.text, marginBottom:"8px" },
  input:{ width:"100%", backgroundColor:C.surface, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px", color:C.text, fontSize:"14px", boxSizing:"border-box", outline:"none" },
  button:{ backgroundColor:C.surface, color:C.text, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"9px 12px", fontSize:"13px", fontWeight:600, cursor:"pointer" },
  primary:{ backgroundColor:C.accent, color:C.onAccent, border:"none", borderRadius:"8px", padding:"10px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
});
    return styles[key];
  },
});

export default function Friends({ onRequestsChanged } = {}) {
  const{user,displayName}=useAuth();
  const[friends,setFriends]=useState([]);
  const[incoming,setIncoming]=useState([]);
  const[outgoing,setOutgoing]=useState([]);
  const[loading,setLoading]=useState(true);

  const[qrDataUrl,setQrDataUrl]=useState("");
  const[searchTerm,setSearchTerm]=useState("");
  const[searchResults,setSearchResults]=useState([]);
  const[searching,setSearching]=useState(false);
  const searchTimer=useRef(null);

  // True if this account has real session rows under its user_id, but none
  // of them matched its own display_name -- meaning the account's own
  // games are silently invisible under this account -- their bowler_name
  // doesn't match display_name -- which matters for Compare To in Stats,
  // not just any one screen
  // (most commonly: display_name was never set).
  const[nameMismatchWarning,setNameMismatchWarning]=useState(false);

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

  // The leaderboard this fed is gone -- both the global and the
  // friends-only version were dropped in favor of Compare To, which
  // scopes a comparison to one bowler or team the user chose rather than
  // publishing everyone's average to everyone else. This check survives
  // because it catches something real and unrelated to any leaderboard:
  // an account whose sessions are silently invisible to itself.
  async function checkNameMismatch() {
    if (!user?.id) return;
    const{data,online}=await cloudRead("sessions",q=>q.select("bowler_name").eq("user_id",user.id));
    if (!online || !data) return;
    const normalize=s=>(s||"").trim().toLowerCase();
    const myOwnName=displayName||"";
    const myMatchedSessions=data.filter(s=>normalize(s.bowler_name)===normalize(myOwnName));
    setNameMismatchWarning(data.length>0 && myMatchedSessions.length===0);
  }

  useEffect(()=>{ checkNameMismatch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[]);

  // A QR code for the app's own sign-in URL -- a convenient way to hand
  // someone the link, nothing more. It cannot log anyone in as anyone
  // else; each person still enters their own email and gets their own
  // magic link.
  //
  // Lives here rather than in Teams because what it actually does is
  // invite someone to the APP. That's the same job as "Add a Friend"
  // directly above it, and nothing to do with managing a roster.
  useEffect(()=>{
    const url=window.location.origin+window.location.pathname;
    QRCode.toDataURL(url,{width:220,margin:1}).then(setQrDataUrl).catch(()=>setQrDataUrl(""));
  },[]);

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

  // The inbox keeps its own read-only copy of pending requests, loaded
  // at the top level so it knows about them without the bowler visiting
  // this tab. Answering one here has to tell it, or the badge would
  // still be showing a request that's already been dealt with.
  async function acceptRequest(entry) {
    setIncoming(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    setFriends(prev=>[...prev,entry]);
    await cloudWrite("friendships",{id:entry.friendshipId,status:"accepted"});
    onRequestsChanged?.();
  }

  async function declineRequest(entry) {
    setIncoming(prev=>prev.filter(f=>f.friendshipId!==entry.friendshipId));
    await cloudDelete("friendships",entry.friendshipId);
    onRequestsChanged?.();
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

      {nameMismatchWarning && (
        <div style={{...S.card,border:`1px solid ${C.spare}44`}}>
          <div style={{color:C.spare,fontSize:"13px",fontWeight:600,marginBottom:"4px"}}>⚠️ Your games aren't attributed to your account</div>
          <div style={{color:C.textMuted,fontSize:"12px"}}>Your account's display name doesn't match the bowler name your sessions are logged under. Set your name in Teams to fix this.</div>
        </div>
      )}

      {/* The leaderboard that used to render here is gone. Comparing to a
          friend or a team is now done from Stats > Compare To, which
          shows a comparison the user actually chose to see rather than
          publishing every friend's average on this screen by default. */}
    </div>
  );
}
