import { createClient } from '@supabase/supabase-js';

const clientOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 0 // Disable realtime/WebSocket connections
    }
  }
};

// Create a single instance of the Supabase client
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  clientOptions
);

// Helper function to sign out from all clients
export const signOutFromAll = async () => {
  try {
    await supabase.auth.signOut();
    
    // Clear ALL Supabase-related items from localStorage
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') || key.startsWith('supabase.auth.')) {
        localStorage.removeItem(key);
      }
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error };
  }
}; 