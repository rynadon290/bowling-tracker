import { createClient } from '@supabase/supabase-js';

// Reads from a .env file at the project root (Vite convention — variable
// names MUST start with VITE_ or the browser bundle won't see them).
// Create a file named .env there with:
//
//   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
//
// Both values come from Supabase Dashboard → Project Settings → API.
// Newer projects label the second one "Publishable key" instead of
// "anon key" — same thing, safe to expose in client-side code either way.
// Do NOT put the "service_role" / "secret" key here; that one must never
// reach the browser.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Create a .env file at the project root — see supabaseClient.js for the format.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
