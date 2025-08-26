// Supabase client wrapper for Dex
//
// This module provides a ready‑made Supabase client configured for
// the Dex innovation network.  It exports the project URL and
// instantiates the client on first import.  The client is stored on
// a global property (`__dexSupabase`) to avoid creating multiple
// instances when modules are loaded repeatedly.  You can import this
// module anywhere in the Dex codebase to access the Supabase client:
//
//   import { supabaseClient } from './supabaseClient.js';
//   const { data, error } = await supabaseClient.from('community').select('*');
//
// The credentials below correspond to the `hvmotpzhliufzomewzfl` project
// provided by the user.  To use your own project, adjust
// `SUPABASE_URL` and `SUPABASE_ANON_KEY` accordingly.  If you prefer
// to configure Supabase via `window.SUPABASE_URL` and
// `window.SUPABASE_ANON_KEY`, you can leave this file unused.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const SUPABASE_URL = 'https://hvmotpzhliufzomewzfl.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s';

export const supabaseClient = (() => {
  if (!globalThis.__dexSupabase) {
    globalThis.__dexSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: 'sb-hvmotpzhliufzomewzfl-auth-token' }
    });
    // Provide storageUrl for legacy code
    globalThis.__dexSupabase.storageUrl = `${SUPABASE_URL}/storage/v1`;
  }
  return globalThis.__dexSupabase;
})();