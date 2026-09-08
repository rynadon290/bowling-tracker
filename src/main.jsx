import React from 'react';
import { createRoot } from 'react-dom/client';
import BowlingTracker from './BowlingTracker.jsx';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import SignIn from './SignIn.jsx';
import './styles.css';
import { C } from './ui.jsx';

// Registered for installability, not for offline support -- see sw.js.
// Guarded: some embedded/preview contexts don't expose the API at all.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function AuthGate() {
  const { user, loading } = useAuth();

  // Avoid a flash of the sign-in screen while the initial session check is
  // still in flight (getSession() takes a beat on first load).
  if (loading) {
    // Reads the live palette so the pre-auth blank doesn't flash the old
    // slate for a beat on a light or warm theme.
    return <div style={{ minHeight: '100vh', backgroundColor: C.bg }} />;
  }

  return user ? <BowlingTracker /> : <SignIn />;
}

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
