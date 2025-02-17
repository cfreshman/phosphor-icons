import { useCallback, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { createClient } from '@supabase/supabase-js';
import { bookmarksAtom, isBookmarkingAtom, Bookmark, iconWeightAtom, iconSizeAtom, iconColorAtom } from '@/state/atoms';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LOCAL_STORAGE_KEY = 'phosphor-bookmarks';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useRecoilState(bookmarksAtom);
  const [isBookmarking, setIsBookmarking] = useRecoilState(isBookmarkingAtom);
  const weight = useRecoilValue(iconWeightAtom);
  const size = useRecoilValue(iconSizeAtom);
  const color = useRecoilValue(iconColorAtom);

  // Load initial bookmarks from localStorage
  useEffect(() => {
    const localBookmarks = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localBookmarks) {
      setBookmarks(JSON.parse(localBookmarks));
    }
  }, [setBookmarks]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_UP') {
        // Get local bookmarks
        const localBookmarksStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        const localBookmarks: Bookmark[] = localBookmarksStr ? JSON.parse(localBookmarksStr) : [];
        
        if (localBookmarks.length > 0) {
          // Get cloud bookmarks
          const { data: cloudBookmarks, error } = await supabase
            .from('bookmarks')
            .select('icon_name')
            .order('created_at', { ascending: false });

          if (!error) {
            // Find local bookmarks that don't exist in the cloud
            const cloudIconNames = new Set(cloudBookmarks?.map(b => b.icon_name) || []);
            const newBookmarks = localBookmarks.filter(b => !cloudIconNames.has(b.icon_name));

            // Upload new bookmarks to Supabase
            if (newBookmarks.length > 0) {
              const { error: insertError } = await supabase
                .from('bookmarks')
                .insert(
                  newBookmarks.map(b => ({
                    icon_name: b.icon_name,
                    metadata: b.metadata
                  }))
                );
              
              if (!insertError) {
                console.log(`Synced ${newBookmarks.length} local bookmarks to cloud`);
              }
            }
          }
        }

        // Clear local storage since everything is now in the cloud
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        
        // Fetch the complete set of bookmarks from the cloud
        await fetchBookmarks();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchBookmarks = useCallback(async () => {
    try {
      // First try to get user session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // User is logged in, fetch from Supabase
        const { data, error } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setBookmarks(data as Bookmark[]);
        // Clear local storage when we have cloud data
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } else {
        // User is not logged in, load from localStorage
        const localBookmarks = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localBookmarks) {
          setBookmarks(JSON.parse(localBookmarks));
        }
      }
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    }
  }, [setBookmarks]);

  const addBookmark = useCallback(async (iconName: string) => {
    setIsBookmarking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // User is logged in, save to Supabase
        const { error } = await supabase
          .from('bookmarks')
          .insert([{
            icon_name: iconName,
            metadata: { weight, size, color }
          }]);

        if (error) throw error;
        await fetchBookmarks();
      } else {
        // User is not logged in, save to localStorage
        const newBookmark = {
          id: crypto.randomUUID(),
          icon_name: iconName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { weight, size, color }
        };
        const updatedBookmarks = [...bookmarks, newBookmark];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBookmarks));
        setBookmarks(updatedBookmarks);
      }
    } catch (error) {
      console.error('Error adding bookmark:', error);
    } finally {
      setIsBookmarking(false);
    }
  }, [weight, size, color, bookmarks, setBookmarks, setIsBookmarking, fetchBookmarks]);

  const removeBookmark = useCallback(async (iconName: string) => {
    setIsBookmarking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // User is logged in, remove from Supabase
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .match({ icon_name: iconName });

        if (error) throw error;
        await fetchBookmarks();
      } else {
        // User is not logged in, remove from localStorage
        const updatedBookmarks = bookmarks.filter(b => b.icon_name !== iconName);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBookmarks));
        setBookmarks(updatedBookmarks);
      }
    } catch (error) {
      console.error('Error removing bookmark:', error);
    } finally {
      setIsBookmarking(false);
    }
  }, [bookmarks, setBookmarks, setIsBookmarking, fetchBookmarks]);

  const isBookmarked = useCallback((iconName: string) => {
    return bookmarks.some(bookmark => bookmark.icon_name === iconName);
  }, [bookmarks]);

  return {
    bookmarks,
    isBookmarking,
    fetchBookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked
  };
} 