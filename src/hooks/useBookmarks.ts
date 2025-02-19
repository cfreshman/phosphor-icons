import { useCallback, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { bookmarksAtom, Bookmark, iconWeightAtom, iconSizeAtom, iconColorAtom } from '@/state/atoms';
import { supabase } from '@/lib/supabase';

// Track if we've fetched bookmarks for the current session
let currentSession: string | null = null;
let isInitialFetchDone = false;
let lastFetchAttempt = 0;
let fetchAttempts = 0;
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_COOLDOWN = 5000; // 5 seconds

const LOCAL_STORAGE_KEY = 'phosphor-bookmarks';
let currentAuthState: boolean | null = null;
let authChangeCallbacks: Set<(isAuthenticated: boolean) => void> = new Set();

// Set up auth subscription at module level
supabase.auth.onAuthStateChange(async (event, session) => {
  const isAuthenticated = !!session;
  console.log('Auth state changed:', event, 'Session:', !!session, 'Previous:', currentAuthState);
  
  // Only trigger if auth state actually changed
  if (currentAuthState !== isAuthenticated) {
    console.log('Auth state actually changed, updating...');
    currentAuthState = isAuthenticated;
    // Reset session tracking on auth state change
    currentSession = null;
    isInitialFetchDone = false;
    fetchAttempts = 0;
    // Notify all subscribers
    authChangeCallbacks.forEach(cb => cb(isAuthenticated));
  }
});

// Initial session check
supabase.auth.getSession().then(({ data: { session } }) => {
  const isAuthenticated = !!session;
  console.log('Initial session check:', !!session, 'Previous:', currentAuthState);
  
  // Only trigger if this is first check or state changed
  if (currentAuthState === null || currentAuthState !== isAuthenticated) {
    console.log('Initial auth state set, updating...');
    currentAuthState = isAuthenticated;
    // Notify all subscribers
    authChangeCallbacks.forEach(cb => cb(isAuthenticated));
  }
});

// Separate hook for auth state management
function useAuthState(onAuthChange: (isAuthenticated: boolean) => void) {
  useEffect(() => {
    // Add callback to subscribers
    authChangeCallbacks.add(onAuthChange);

    return () => {
      // Remove callback when component unmounts
      authChangeCallbacks.delete(onAuthChange);
    };
  }, [onAuthChange]);

  return currentAuthState;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useRecoilState(bookmarksAtom);
  const weight = useRecoilValue(iconWeightAtom);
  const size = useRecoilValue(iconSizeAtom);
  const color = useRecoilValue(iconColorAtom);

  const fetchBookmarks = useCallback(async () => {
    console.log('=== useBookmarks: fetchBookmarks called ===');
    
    // Check if we're within the cooldown period
    const now = Date.now();
    if (now - lastFetchAttempt < FETCH_COOLDOWN) {
      console.log('Fetch attempt too soon, waiting for cooldown');
      return;
    }
    
    // Check if we've exceeded max attempts
    if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
      console.log('Max fetch attempts reached, stopping');
      return;
    }
    
    lastFetchAttempt = now;
    fetchAttempts++;
    
    try {
      // First try to get user session
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if we've already fetched for this session
      if (session?.user) {
        if (currentSession === session.user.id && isInitialFetchDone) {
          console.log('Bookmarks already fetched for current session, skipping');
          return;
        }
        
        // User is logged in, fetch from Supabase
        console.log('Fetching bookmarks from Supabase for user:', session.user.id);
        const { data, error } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching bookmarks:', error);
          throw error;
        }
        console.log('Successfully loaded bookmarks:', data?.length || 0);
        setBookmarks(data as Bookmark[]);
        // Update session tracking
        currentSession = session.user.id;
        isInitialFetchDone = true;
        fetchAttempts = 0; // Reset attempts on success
        // Clear local storage when we have cloud data
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } else {
        if (isInitialFetchDone && !currentSession) {
          console.log('Local bookmarks already loaded, skipping');
          return;
        }
        
        // User is not logged in, load from localStorage
        console.log('User not logged in, checking localStorage');
        const localBookmarks = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localBookmarks) {
          console.log('Found local bookmarks:', JSON.parse(localBookmarks).length);
          setBookmarks(JSON.parse(localBookmarks));
        } else {
          console.log('No local bookmarks found');
          setBookmarks([]);
        }
        // Update tracking for local state
        currentSession = null;
        isInitialFetchDone = true;
        fetchAttempts = 0; // Reset attempts on success
      }
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      // Don't clear bookmarks on error, keep existing state
      if (fetchAttempts < MAX_FETCH_ATTEMPTS) {
        console.log(`Fetch attempt ${fetchAttempts} failed, will retry after cooldown`);
      } else {
        console.log('Max fetch attempts reached, keeping existing bookmarks');
      }
    }
  }, [setBookmarks]);

  const handleAuthChange = useCallback((isAuthenticated: boolean) => {
    console.log('=== useBookmarks: Auth state changed ===', { isAuthenticated });
    if (!isAuthenticated) {
      console.log('User signed out, clearing bookmarks');
      setBookmarks([]);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      currentSession = null;
      isInitialFetchDone = false;
      fetchAttempts = 0;
    } else {
      console.log('User signed in, loading bookmarks');
      fetchBookmarks();
    }
  }, [setBookmarks, fetchBookmarks]);

  const isAuthenticated = useAuthState(handleAuthChange);

  const addBookmark = useCallback(async (iconName: string) => {
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;

      // Create new bookmark object
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        icon_name: iconName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { weight, size, color }
      };

      if (!session?.user) {
        // User is not logged in, save to localStorage
        const updatedBookmarks = [...bookmarks, newBookmark];
        setBookmarks(updatedBookmarks);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBookmarks));
        return;
      }

      // Add user_id to bookmark for cloud storage
      const bookmarkWithUser = {
        ...newBookmark,
        user_id: session.user.id
      };

      // First check if bookmark already exists
      const { data: existing } = await supabase
        .from('bookmarks')
        .select('id')
        .match({ user_id: session.user.id, icon_name: iconName })
        .single();

      if (existing) {
        console.log('Bookmark already exists');
        return;
      }

      // Add new bookmark to server
      const { error: insertError } = await supabase
        .from('bookmarks')
        .insert([bookmarkWithUser])
        .select()
        .single();

      if (insertError) throw insertError;

      // Update local state after successful server update
      setBookmarks(prev => [...prev, bookmarkWithUser]);
    } catch (error) {
      console.error('Error adding bookmark:', error);
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  }, [weight, size, color, bookmarks, setBookmarks]);

  // Add this new effect to sync local bookmarks when signing in
  useEffect(() => {
    if (isAuthenticated) {
      // Get local bookmarks
      const localBookmarks = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localBookmarks) {
        const bookmarks = JSON.parse(localBookmarks);
        // Upload each local bookmark
        Promise.all(
          bookmarks.map(async (bookmark: Bookmark) => {
            try {
              await addBookmark(bookmark.icon_name);
            } catch (error) {
              console.error('Error syncing bookmark:', bookmark.icon_name, error);
            }
          })
        ).then(() => {
          // Clear local storage after sync
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          // Fetch updated bookmarks from server
          fetchBookmarks();
        });
      }
    }
  }, [isAuthenticated, addBookmark, fetchBookmarks]);

  const removeBookmark = useCallback(async (iconName: string) => {
    try {
      // Optimistically update local state
      const bookmarkToRemove = bookmarks.find(b => b.icon_name === iconName);
      if (!bookmarkToRemove) return;
      
      setBookmarks(prev => prev.filter(b => b.icon_name !== iconName));

      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // User is logged in, remove from Supabase
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .match({ user_id: session.user.id, icon_name: iconName });

        if (error) {
          // Revert optimistic update on error
          setBookmarks(prev => [...prev, bookmarkToRemove]);
          throw error;
        }
      } else {
        // User is not logged in, update localStorage
        const updatedBookmarks = bookmarks.filter(b => b.icon_name !== iconName);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBookmarks));
      }
    } catch (error) {
      console.error('Error removing bookmark:', error);
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  }, [bookmarks, setBookmarks]);

  const isBookmarked = useCallback((iconName: string) => {
    return bookmarks.some(bookmark => bookmark.icon_name === iconName);
  }, [bookmarks]);

  return {
    bookmarks,
    isAuthenticated,
    fetchBookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked
  };
} 