import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { cloudRead, cloudWrite } from './syncQueue.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    // Check for an existing session on first load (e.g. returning visitor
    // whose session is still valid).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Fires on sign-in, sign-out, token refresh, and — importantly — the
    // moment a magic-link redirect lands back on this page and the client
    // library finishes parsing the tokens out of the URL automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Loads this user's own display name whenever they sign in (or the app
  // starts with an existing session already active).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setDisplayName(''); return; }
    cloudRead('profiles', q => q.select('display_name').eq('id', userId).single())
      .then(({ data, online }) => {
        if (online && data) setDisplayName(data.display_name || '');
      });
  }, [session?.user?.id]);

  async function signInWithMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateDisplayName(newName) {
    const clean = newName.trim();
    if (!clean || !session?.user?.id) return { error: new Error('Not signed in or name is empty') };
    setDisplayName(clean); // optimistic, matches the rest of the app's pattern
    const result = await cloudWrite('profiles', { id: session.user.id, display_name: clean });
    if (!result.synced) {
      return { error: new Error(`Name change hasn't reached the cloud yet (${result.reason || 'unknown reason'}) — teammates won't be able to find you until it syncs.`) };
    }
    return { error: null };
  }

  const value = {
    session,
    user: session?.user ?? null,
    displayName,
    loading,
    signInWithMagicLink,
    signOut,
    updateDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
