// FIRST import, deliberately. Module bodies evaluate in import order,
// and BowlingTracker installs a plain window.storage adapter at module
// scope. scopedStorage can wrap an existing adapter, so either order
// works -- but relying on that is a silent dependency on the order of
// two lines in this file, which a future tidy-up would reorder without
// knowing. Installing the scoped adapter first makes BowlingTracker's
// own installer a no-op and removes the question.
import './scopedStorage.js';
import { installErrorHandlers } from './errorLogStore.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BowlingTracker from './BowlingTracker.jsx';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import SignIn from './SignIn.jsx';
import './styles.css';
import { C } from './ui.jsx';

// Before anything renders, so an error during the first paint is
// caught too -- that is exactly when a stale chunk fails.
installErrorHandlers();

// Registered for installability, not for offline support -- see sw.js.
// Guarded: some embedded/preview contexts don't expose the API at all.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function AuthGate() {
  const { user, loading, scopeReady } = useAuth();

  // Avoid a flash of the sign-in screen while the initial session check is
  // still in flight (getSession() takes a beat on first load).
  // scopeReady gates on the one-time legacy adoption as well as the
  // session check, so the tracker never mounts against a namespace that
  // is still being filled.
  if (loading || (user && !scopeReady)) {
    // Reads the live palette so the pre-auth blank doesn't flash the old
    // slate for a beat on a light or warm theme.
    return <div style={{ minHeight: '100vh', backgroundColor: C.bg }} />;
  }

  // Keyed on the user id so switching accounts remounts from scratch.
  // Without it React reconciles the same instance and every piece of the
  // previous bowler's in-memory state -- shots, sessions, arsenal --
  // survives the switch, which is the same leak as the cache one but in
  // React state instead of localStorage.
  return user ? <BowlingTracker key={user.id} /> : <SignIn />;
}

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
