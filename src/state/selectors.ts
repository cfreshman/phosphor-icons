import { selector, selectorFamily, atomFamily } from "recoil";
import TinyColor from "tinycolor2";
// @ts-ignore
import Fuse from "fuse.js";
import { IconCategory } from "@phosphor-icons/core";
import OpenAI from 'openai';

import {
  searchQueryAtom,
  iconWeightAtom,
  iconSizeAtom,
  iconColorAtom,
  bookmarksAtom,
  isBookmarkingAtom,
  Bookmark,
  showBookmarksOnlyAtom
} from "./atoms";
import { IconEntry } from "@/lib";
import { icons } from "@/lib/icons";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

interface SearchResult {
  item: IconEntry;
  score: number;
}

interface VectorMatch {
  icon_name: string;
  similarity: number;
}

// Configure Fuse for exact/fuzzy text search
const fuse = new Fuse(icons, {
  keys: [
    { name: "name", weight: 4 },
    { name: "tags", weight: 2 },
    { name: "categories", weight: 1 }
  ],
  threshold: 0.2, // Stricter threshold for text matches
  includeScore: true
});

// Helper to generate embeddings
async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

// Text-based search selector
export const textSearchResultsSelector = selector<SearchResult[]>({
  key: "textSearchResults",
  get: ({ get }) => {
    const query = get(searchQueryAtom).trim().toLowerCase();
    if (!query) return icons.map(icon => ({ item: icon, score: 1 }));
    
    const results = fuse.search(query);
    console.log('Text Search Results:', results.map(r => ({
      name: r.item.name,
      score: r.score,
      matches: r.matches?.map(m => ({
        key: m.key,
        value: m.value,
        indices: m.indices
      }))
    })));
    
    return results.map(result => ({
      item: result.item,
      score: result.score ?? 1
    }));
  },
});

// Direct RPC call without Supabase client
async function callMatchIcons(embedding: number[]) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/match_icons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: 0.25,
      match_count: 100
    })
  });

  if (!response.ok) {
    throw new Error(`RPC call failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Semantic search selector
export const semanticSearchResultsSelector = selector<SearchResult[]>({
  key: "semanticSearchResults",
  get: async ({ get }) => {
    const query = get(searchQueryAtom).trim();
    if (!query) return [];
    
    try {
      console.log('Generating embedding for query:', query);
      const embedding = await generateEmbedding(query);
      console.log('Generated embedding, calling match_icons...');
      
      const data = await callMatchIcons(embedding);
      
      if (!data || data.length === 0) {
        console.log('No matches found from match_icons');
        return [];
      }

      console.log('Semantic Search Results:', data);
      
      return data.map((match: VectorMatch) => ({
        item: icons.find(icon => icon.name === match.icon_name)!,
        score: match.similarity
      }));
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  }
});

// Combined hybrid search selector (without bookmark filtering)
export const searchResultsSelector = selector<ReadonlyArray<IconEntry>>({
  key: "searchResults",
  get: async ({ get }) => {
    const query = get(searchQueryAtom).trim();

    // Get search results
    if (!query) {
      return icons;
    }

    // Get both text and semantic results
    const textResults = get(textSearchResultsSelector);
    const semanticResults = await get(semanticSearchResultsSelector);

    // Create a Map to deduplicate by icon name
    const resultMap = new Map<string, { 
      item: IconEntry; 
      score: number; 
      isExact: boolean;
      matchType: 'text' | 'semantic' | 'both';
      originalScores: { text?: number; semantic?: number };
    }>();

    // Add text results first (they take precedence)
    textResults.forEach(({ item, score }) => {
      resultMap.set(item.name, { 
        item, 
        score, 
        isExact: score > 0.8,
        matchType: 'text',
        originalScores: { text: score }
      });
    });

    // Add semantic results
    semanticResults.forEach(({ item, score }) => {
      const existing = resultMap.get(item.name);
      if (!existing) {
        resultMap.set(item.name, { 
          item, 
          score: score * 0.9,
          isExact: false,
          matchType: 'semantic',
          originalScores: { semantic: score }
        });
      } else if (!existing.isExact) {
        resultMap.set(item.name, {
          ...existing,
          score: Math.max(existing.score, score * 0.9),
          matchType: 'both',
          originalScores: {
            ...existing.originalScores,
            semantic: score
          }
        });
      }
    });

    return Array.from(resultMap.values())
      .sort((a, b) => {
        if (a.isExact && !b.isExact) return -1;
        if (!a.isExact && b.isExact) return 1;
        return b.score - a.score;
      })
      .map(result => result.item);
  },
});

// Filtered results selector (applies bookmark filter)
export const filteredQueryResultsSelector = selector<ReadonlyArray<IconEntry>>({
  key: "filteredQueryResults",
  get: ({ get }) => {
    const results = get(searchResultsSelector);
    const showBookmarksOnly = get(showBookmarksOnlyAtom);
    const bookmarks = get(bookmarksAtom);

    if (!showBookmarksOnly) {
      return results;
    }

    return results.filter(icon => 
      bookmarks.some(bookmark => bookmark.icon_name === icon.name)
    );
  },
});

type CategorizedIcons = Partial<Record<IconCategory, IconEntry[]>>;

export const categorizedQueryResultsSelector = selector<
  Readonly<CategorizedIcons>
>({
  key: "categorizedQueryResults",
  get: ({ get }) => {
    const filteredResults = get(filteredQueryResultsSelector);
    return new Promise((resolve) =>
      resolve(
        filteredResults.reduce<CategorizedIcons>((acc, curr) => {
          curr.categories.forEach((category) => {
            if (!acc[category]) acc[category] = [];
            acc[category]!!.push(curr);
          });
          return acc;
        }, {})
      )
    );
  },
});

export const singleCategoryQueryResultsSelector = selectorFamily<
  ReadonlyArray<IconEntry>,
  IconCategory
>({
  key: "singleCategoryQueryResults",
  get:
    (category: IconCategory) =>
    ({ get }) => {
      const filteredResults = get(filteredQueryResultsSelector);
      return new Promise((resolve) =>
        resolve(
          filteredResults.filter((icon) => icon.categories.includes(category))
        )
      );
    },
});

export const isDarkThemeSelector = selector<boolean>({
  key: "isDarkTheme",
  get: ({ get }) => TinyColor(get(iconColorAtom)).isLight(),
});

export const resetSettingsSelector = selector<null>({
  key: "resetSettings",
  get: () => null,
  set: ({ reset }) => {
    reset(iconWeightAtom);
    reset(iconSizeAtom);
    reset(iconColorAtom);
  },
});

// Helper to get the current auth token
function getCurrentToken(): string | null {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
  const authKey = keys.find(k => k.endsWith('-auth-token'));
  return authKey ? JSON.parse(localStorage.getItem(authKey) || '{}').access_token : null;
}

// Direct HTTP calls for bookmark operations
async function fetchUserBookmarks(userId: string) {
  const token = getCurrentToken();
  if (!token) throw new Error('No auth token found');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/bookmarks?user_id=eq.${userId}&order=created_at.desc`,
    {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch bookmarks: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Bookmark operations
export const bookmarkOperationsSelector = atomFamily<{
  fetchBookmarks: () => Promise<void>;
  addBookmark: (iconName: string) => Promise<void>;
  removeBookmark: (iconName: string) => Promise<void>;
}, string>({
  key: "bookmarkOperations",
  default: (param) => {
    const callbacks = {
      fetchBookmarks: async function(this: { get: any; set: any }) {
        console.log('=== Fetching Bookmarks ===');
        try {
          // Get current token
          const token = getCurrentToken();
          console.log('Auth token exists:', !!token);
          if (!token) {
            console.log('No auth token found, clearing bookmarks');
            this.set(bookmarksAtom, []);
            return;
          }

          // Get user info
          console.log('Fetching user info...');
          const userResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            }
          });

          console.log('User info response status:', userResponse.status);
          if (!userResponse.ok) {
            console.log('Failed to get user info:', userResponse.status);
            this.set(bookmarksAtom, []);
            return;
          }

          const user = await userResponse.json();
          console.log('Got user:', { id: user.id, email: user.email });

          // Fetch bookmarks
          console.log('Fetching bookmarks for user...');
          const data = await fetchUserBookmarks(user.id);
          console.log('Bookmarks loaded:', data.length);
          this.set(bookmarksAtom, data as Bookmark[]);
        } catch (error) {
          console.error('Error fetching bookmarks:', error);
          this.set(bookmarksAtom, []);
        }
      },

      addBookmark: async function(this: { get: any; set: any }, iconName: string) {
        this.set(isBookmarkingAtom, true);
        try {
          const token = getCurrentToken();
          if (!token) {
            throw new Error('User must be authenticated to add bookmarks');
          }

          // Get user info
          const userResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            }
          });

          if (!userResponse.ok) {
            throw new Error('Failed to get user info');
          }

          const user = await userResponse.json();

          // First check if bookmark already exists
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/bookmarks?user_id=eq.${user.id}&icon_name=eq.${iconName}`,
            {
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`
              }
            }
          );

          if (!response.ok) {
            throw new Error('Failed to check existing bookmark');
          }

          const existing = await response.json();
          if (existing.length > 0) {
            console.log('Bookmark already exists');
            return;
          }

          // Add new bookmark
          const createResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/bookmarks`,
            {
              method: 'POST',
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                user_id: user.id,
                icon_name: iconName,
                metadata: {
                  weight: this.get(iconWeightAtom),
                  size: this.get(iconSizeAtom),
                  color: this.get(iconColorAtom)
                }
              })
            }
          );

          if (!createResponse.ok) {
            throw new Error('Failed to create bookmark');
          }
          
          // Refresh bookmarks
          await this.get(bookmarkOperationsSelector(param)).fetchBookmarks.call(this);
        } catch (error) {
          console.error('Error adding bookmark:', error);
          if (error instanceof Error) {
            alert(error.message);
          }
        } finally {
          this.set(isBookmarkingAtom, false);
        }
      },

      removeBookmark: async function(this: { get: any; set: any }, iconName: string) {
        this.set(isBookmarkingAtom, true);
        try {
          const token = getCurrentToken();
          if (!token) {
            throw new Error('User must be authenticated to remove bookmarks');
          }

          // Get user info
          const userResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            }
          });

          if (!userResponse.ok) {
            throw new Error('Failed to get user info');
          }

          const user = await userResponse.json();

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/bookmarks?user_id=eq.${user.id}&icon_name=eq.${iconName}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Prefer': 'return=minimal'
              }
            }
          );

          if (!response.ok) {
            throw new Error('Failed to delete bookmark');
          }
          
          // Refresh bookmarks
          await this.get(bookmarkOperationsSelector(param)).fetchBookmarks.call(this);
        } catch (error) {
          console.error('Error removing bookmark:', error);
          if (error instanceof Error) {
            alert(error.message);
          }
        } finally {
          this.set(isBookmarkingAtom, false);
        }
      }
    };

    return callbacks;
  }
});

// Helper selector to check if an icon is bookmarked
export const isBookmarkedSelector = selectorFamily<boolean, string>({
  key: "isBookmarked",
  get: (iconName: string) => ({ get }) => {
    const bookmarks = get(bookmarksAtom);
    return bookmarks.some(bookmark => bookmark.icon_name === iconName);
  }
});
