import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { cloudRead, cloudWrite, adoptLegacyQueueItems, flushPendingQueue } from './syncQueue.js';
import { setStorageUser, adoptLegacyData } from './scopedStorage.js';
import { normalizePreferences, defaultPreferences } from './domain/preferences.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [preferences, setPreferences] = useState(defaultPreferences());
  // Whether local storage is ready to be read as THIS user. Adoption
  // moves pre-scoping data into their namespace, and the tracker's load
  // effect reads that namespace on mount -- so mounting before adoption
  // finishes is a race the offline case loses: the load would find an
  // empty namespace, cache an empty result into it, and adoption would
  // then decline to overwrite what it found. A returning bowler with no
  // signal would open the app to a blank history.
  const [scopeReady, setScopeReady] = useState(false);

  useEffect(() => {
    // Check for an existing session on first load (e.g. returning visitor
    // whose session is still valid).
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Set before setSession, not after. setSession schedules a render,
      // and anything that render triggers -- a cached read, a queued
      // write -- must already know whose device this is. Doing it in an
      // effect that reacts to session would leave a window where the
      // answer is "nobody", and a read in that window falls back to the
      // unscoped key.
      setStorageUser(session?.user?.id || null);
      setSession(session);
      setLoading(false);
    });

    // Fires on sign-in, sign-out, token refresh, and — importantly — the
    // moment a magic-link redirect lands back on this page and the client
    // library finishes parsing the tokens out of the URL automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Sign-out lands here too, and clearing the active user is what
        // makes the previous bowler's cache unreadable rather than merely
        // unattributed.
        setStorageUser(session?.user?.id || null);
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

  // One-time claim of pre-scoping data, on the first sign-in after this
  // shipped. Cache and queue are adopted together and guarded by the same
  // device marker, so they cannot disagree about whether it has run --
  // half-adopted state (queue claimed, cache not) would be worse than
  // either outcome.
  //
  // The flush afterwards is deliberate: those adopted items have been
  // unflushable since the update landed, and now have an owner.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    setScopeReady(false);
    (async () => {
      try {
        const { skipped } = await adoptLegacyData(userId);
        if (!skipped) {
          await adoptLegacyQueueItems(userId);
          await flushPendingQueue();
        }
      } catch {}
      // Ready even if adoption threw. A failed adoption means some legacy
      // data stays where it is; refusing to render at all over that would
      // turn a partial cache miss into a bricked app.
      if (!cancelled) setScopeReady(true);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const PREFERENCES_KEY = 'bowling-preferences-v1';

  // Loads whatever's cached on this device immediately, before any network
  // round trip and regardless of sign-in state. This is what lets Settings
  // work the instant the app opens.
  useEffect(() => {
    (async () => {
      try {
        const cached = await window.storage.get(PREFERENCES_KEY);
        if (cached) setPreferences(normalizePreferences(JSON.parse(cached.value)));
      } catch {}
    })();
  }, []);

  // Same pattern for preferences -- stored as one JSONB blob per user
  // rather than a fixed set of columns, since the toggle set is expected
  // to keep growing (this is meant to absorb any future "opt in/out of X"
  // setting, not just the four accessory fields it starts with).
  //
  // No sign-out reset here (previously this called setPreferences on every
  // change including sign-out, wiping local Settings back to defaults).
  // Signing out should not erase choices made on this device.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    cloudRead('user_preferences', q => q.select('preferences').eq('user_id', userId).single())
      .then(({ data, online }) => {
        if (online && data) {
          const normalized = normalizePreferences(data.preferences);
          setPreferences(normalized);
          try { window.storage.set(PREFERENCES_KEY, JSON.stringify(normalized)); } catch {}
        }
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

  // Accepts either a full preferences object or an updater function
  // (prevPrefs => newPrefs), matching React's own setState convention --
  // callers doing a targeted change (e.g. domain/preferences.js's
  // setTrackedField) can pass a function without needing the current
  // value from two places at once.
  //
  // Local-first, like every other piece of state in this app (shots,
  // sessions, bags, tournaments all write to window.storage immediately
  // and treat the cloud as best-effort). Previously this required a signed
  // -in session and returned an error with NO local update otherwise --
  // meaning every Settings toggle, including Environment, silently did
  // nothing for anyone not currently signed in.
  async function updatePreferences(next) {
    const resolved = typeof next === 'function' ? next(preferences) : next;
    const normalized = normalizePreferences(resolved);
    setPreferences(normalized); // always takes effect on this device
    try { window.storage.set(PREFERENCES_KEY, JSON.stringify(normalized)); } catch {}

    if (!session?.user?.id) {
      // Not an error -- the change is saved on this device. It just won't
      // follow the bowler to another device until they sign in.
      return { error: null };
    }
    // Keyed by user_id, not by the table's generated primary key.
    const result = await cloudWrite('user_preferences', { user_id: session.user.id, preferences: normalized }, { onConflict: 'user_id' });
    if (!result.synced) {
      return { error: new Error(`Saved on this device, but hasn't reached the cloud yet (${result.reason || 'unknown reason'}) — it may not carry over to another device yet.`) };
    }
    return { error: null };
  }

  const value = {
    session,
    scopeReady,
    user: session?.user ?? null,
    displayName,
    preferences,
    loading,
    signInWithMagicLink,
    signOut,
    updateDisplayName,
    updatePreferences,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
