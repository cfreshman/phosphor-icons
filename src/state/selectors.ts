import { selector, selectorFamily, atomFamily } from "recoil";
import TinyColor from "tinycolor2";
// @ts-ignore
import Fuse from "fuse.js";
import { IconCategory } from "@phosphor-icons/core";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

import {
  searchQueryAtom,
  iconWeightAtom,
  iconSizeAtom,
  iconColorAtom,
  bookmarksAtom,
  isBookmarkingAtom,
  Bookmark
} from "./atoms";
import { IconEntry } from "@/lib";
import { icons } from "@/lib/icons";

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

interface Database {
  public: {
    Functions: {
      match_icons: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
        };
        Returns: VectorMatch[];
      };
    };
  };
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

// Semantic search selector
export const semanticSearchResultsSelector = selector<SearchResult[]>({
  key: "semanticSearchResults",
  get: async ({ get }) => {
    const query = get(searchQueryAtom).trim();
    if (!query) return [];
    
    try {
      const embedding = await generateEmbedding(query);
      const { data, error } = await (supabase as SupabaseClient<Database>)
        .rpc('match_icons', {
          query_embedding: embedding,
          match_threshold: 0.25,
          match_count: 100
        });
      
      if (error) throw error;

      console.log('Semantic Search Results:', (data ?? []).map((match: VectorMatch) => ({
        name: match.icon_name,
        similarity: match.similarity,
        metadata: icons.find(icon => icon.name === match.icon_name)?.tags
      })));
      
      return (data ?? []).map((match: VectorMatch) => ({
        item: icons.find(icon => icon.name === match.icon_name)!,
        score: match.similarity
      }));
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  }
});

// Combined hybrid search selector
export const filteredQueryResultsSelector = selector<ReadonlyArray<IconEntry>>({
  key: "filteredQueryResults",
  get: async ({ get }) => {
    const query = get(searchQueryAtom).trim();
    if (!query) return icons;

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
        isExact: score > 0.8, // Stricter threshold for exact matches
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

    const results = Array.from(resultMap.values())
      .sort((a, b) => {
        if (a.isExact && !b.isExact) return -1;
        if (!a.isExact && b.isExact) return 1;
        return b.score - a.score;
      });

    console.log('Final Sorted Results:', results.map(r => ({
      name: r.item.name,
      score: r.score,
      isExact: r.isExact,
      matchType: r.matchType,
      originalScores: r.originalScores,
      tags: r.item.tags,
      categories: r.item.categories
    })));

    return results.map(result => result.item);
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

// Bookmark operations
export const bookmarkOperationsSelector = atomFamily<{
  fetchBookmarks: () => Promise<void>;
  addBookmark: (iconName: string) => Promise<void>;
  removeBookmark: (iconName: string) => Promise<void>;
}, void>({
  key: "bookmarkOperations",
  default: ({ get, set }) => ({
    fetchBookmarks: async () => {
      const { data: bookmarks, error } = await supabase
        .from('bookmarks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bookmarks:', error);
        return;
      }

      set(bookmarksAtom, bookmarks as Bookmark[]);
    },

    addBookmark: async (iconName: string) => {
      set(isBookmarkingAtom, true);
      try {
        const { error } = await supabase
          .from('bookmarks')
          .insert([
            {
              icon_name: iconName,
              metadata: {
                weight: get(iconWeightAtom),
                size: get(iconSizeAtom),
                color: get(iconColorAtom)
              }
            }
          ]);

        if (error) throw error;
        
        // Refresh bookmarks
        const { data: bookmarks } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false });
          
        set(bookmarksAtom, bookmarks as Bookmark[]);
      } catch (error) {
        console.error('Error adding bookmark:', error);
      } finally {
        set(isBookmarkingAtom, false);
      }
    },

    removeBookmark: async (iconName: string) => {
      set(isBookmarkingAtom, true);
      try {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .match({ icon_name: iconName });

        if (error) throw error;
        
        // Refresh bookmarks
        const { data: bookmarks } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false });
          
        set(bookmarksAtom, bookmarks as Bookmark[]);
      } catch (error) {
        console.error('Error removing bookmark:', error);
      } finally {
        set(isBookmarkingAtom, false);
      }
    }
  })
});

// Helper selector to check if an icon is bookmarked
export const isBookmarkedSelector = selectorFamily<boolean, string>({
  key: "isBookmarked",
  get: (iconName: string) => ({ get }) => {
    const bookmarks = get(bookmarksAtom);
    return bookmarks.some(bookmark => bookmark.icon_name === iconName);
  }
});
