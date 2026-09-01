import React from 'react';
import { createRoot } from 'react-dom/client';
import BowlingTracker from './BowlingTracker.jsx';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import SignIn from './SignIn.jsx';
import './styles.css';

function AuthGate() {
  const { user, loading } = useAuth();

  // Avoid a flash of the sign-in screen while the initial session check is
  // still in flight (getSession() takes a beat on first load).
  if (loading) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#0f1117' }} />;
  }

  return user ? <BowlingTracker /> : <SignIn />;
}

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
