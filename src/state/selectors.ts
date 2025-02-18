import { selector, selectorFamily, atom } from "recoil";
import TinyColor from "tinycolor2";
// @ts-ignore
import Fuse from "fuse.js";
import { IconCategory } from "@phosphor-icons/core";

import {
  searchQueryAtom,
  iconWeightAtom,
  iconSizeAtom,
  iconColorAtom,
} from "./atoms";
import { IconEntry } from "@/lib";
import { icons } from "@/lib/icons";

// Initialize Fuse for fuzzy text search
const fuse = new Fuse(icons, {
  keys: [{ name: "name", weight: 4 }, "tags", "categories"],
  threshold: 0.2, // Tweak this to what feels like the right number of results
  // shouldSort: false,
  useExtendedSearch: true,
});

// Define embeddings atom
type EmbeddingsType = { [key: string]: { embedding: string, metadata: any, format: 'float' | 'int16-compact' } };
export const iconEmbeddingsAtom = atom<EmbeddingsType>({
  key: 'iconEmbeddings',
  default: {},
  effects: [
    ({ setSelf }) => {
      // Load embeddings asynchronously
      fetch('/data/phosphor-embeddings.json')
        .then(response => response.json())
        .then(data => setSelf(data))
        .catch(error => {
          console.warn('No embeddings found, semantic search will be disabled:', error);
        });
    }
  ]
});

// Helper functions for semantic search
function decodeEmbedding(base64: string): number[] {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const int16Array = new Int16Array(bytes.buffer);
  return Array.from(int16Array).map(x => x / 32767);
}

function cosineSimilarity(a: number[], b: number[]) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

const queryEmbeddingCache: { [key: string]: number[] } = {};

async function getQueryEmbedding(query: string): Promise<number[] | null> {
  if (queryEmbeddingCache[query]) return queryEmbeddingCache[query];

  try {
    const response = await fetch("https://api.cohere.ai/v2/embed", {
      method: "POST",
      headers: {
        // @ts-ignore - Vite will inject this at build time
        Authorization: `Bearer ${import.meta.env.VITE_COHERE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts: [query],
        model: "embed-english-v3.0",
        input_type: "search_query",
        truncate: "END",
        embedding_types: ["float"]
      }),
    });

    if (!response.ok) throw new Error(`Embedding API error: ${response.statusText}`);

    const result = await response.json();
    const embedding = result.embeddings.float[0];
    queryEmbeddingCache[query] = embedding;
    
    if (Object.keys(queryEmbeddingCache).length > 100) {
      delete queryEmbeddingCache[Object.keys(queryEmbeddingCache)[0]];
    }

    return embedding;
  } catch (error) {
    console.error('Error getting query embedding:', error);
    return null;
  }
}

async function semanticSearch(query: string, embeddings: EmbeddingsType): Promise<IconEntry[]> {
  if (Object.keys(embeddings).length === 0) return [];

  const queryEmbedding = await getQueryEmbedding(query);
  if (!queryEmbedding) return [];

  return Object.entries(embeddings)
    .map(([name, data]) => ({
      name,
      similarity: cosineSimilarity(queryEmbedding, decodeEmbedding(data.embedding)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 50)
    .map(result => icons.find(icon => icon.name === result.name)!)
    .filter(Boolean);
}

export const filteredQueryResultsSelector = selector<ReadonlyArray<IconEntry>>({
  key: "filteredQueryResults",
  get: async ({ get }) => {
    const query = get(searchQueryAtom).trim().toLowerCase();
    if (!query) return icons;

    // Get fuzzy search results
    const fuseResults = fuse.search(query).map(value => value.item);
    
    // Get semantic search results if available
    const embeddings = get(iconEmbeddingsAtom);
    const semanticResults = await semanticSearch(query, embeddings);

    // Combine and deduplicate results
    const combinedResults = [...fuseResults];
    for (const result of semanticResults) {
      if (!combinedResults.some(r => r.name === result.name)) {
        combinedResults.push(result);
      }
    }

    return combinedResults;
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
