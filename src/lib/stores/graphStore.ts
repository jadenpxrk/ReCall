import type {
  GraphData,
  KeywordNode,
  MentionNode,
  WebsiteNode,
  WebsiteToKeywordEdge,
  WebsiteToMentionEdge,
  Edge,
  Position,
  SearchResults,
} from "~/types";

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StorageValue,
} from "zustand/middleware";

// initial empty graph data
const initialGraphData: GraphData = {
  websites: [],
  keywords: [],
  mentions: [],
  websiteToKeywordEdges: [],
  websiteToMentionEdges: [],
};

// generate unique ids
const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export interface GraphStore {
  websites: WebsiteNode[];
  keywords: KeywordNode[];
  mentions: MentionNode[];
  websiteToKeywordEdges: Edge[];
  websiteToMentionEdges: Edge[];

  // methods
  loadFromChromeStorage: () => Promise<void>;
  resetGraph: () => Promise<void>;
  saveToChromeStorage: () => void;
  addWebsite: (website: Omit<WebsiteNode, "id">) => string;
  updateWebsite: (id: string, updates: Partial<WebsiteNode>) => void;
  updateWebsitePosition: (id: string, position: Position) => void;
  addKeyword: (keyword: Omit<KeywordNode, "id">) => string;
  updateKeyword: (id: string, updates: Partial<KeywordNode>) => void;
  updateKeywordPosition: (id: string, position: Position) => void;
  addMention: (mention: Omit<MentionNode, "id">) => string;
  updateMention: (id: string, updates: Partial<MentionNode>) => void;
  updateMentionPosition: (id: string, position: Position) => void;
  addWebsiteToKeywordEdge: (edge: Omit<Edge, "id">) => string;
  addWebsiteToMentionEdge: (edge: Omit<Edge, "id">) => string;
  searchByKeyword: (keyword: string) => SearchResults | null;
}

// Custom IndexedDB storage for Zustand
const indexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const request = indexedDB.open("RecallExtensionDB", 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("graphData")) {
          db.createObjectStore("graphData", { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction("graphData", "readonly");
        const store = transaction.objectStore("graphData");
        const getRequest = store.get(name);

        getRequest.onsuccess = () => {
          resolve(getRequest.result ? getRequest.result.value : null);
        };

        getRequest.onerror = () => {
          resolve(null);
        };
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  },

  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      const request = indexedDB.open("RecallExtensionDB", 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("graphData")) {
          db.createObjectStore("graphData", { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction("graphData", "readwrite");
        const store = transaction.objectStore("graphData");

        const item = {
          id: name,
          value,
        };

        const putRequest = store.put(item);

        putRequest.onsuccess = () => {
          resolve();
        };

        putRequest.onerror = () => {
          resolve();
        };
      };

      request.onerror = () => {
        resolve();
      };
    });
  },

  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      const request = indexedDB.open("RecallExtensionDB", 1);

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction("graphData", "readwrite");
        const store = transaction.objectStore("graphData");

        const deleteRequest = store.delete(name);

        deleteRequest.onsuccess = () => {
          resolve();
        };

        deleteRequest.onerror = () => {
          resolve();
        };
      };

      request.onerror = () => {
        resolve();
      };
    });
  },
};

// Helper function to save state back to chrome.storage.local
const saveToChromeStorage = (state: GraphData) => {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.set({ graphData: state }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error syncing with chrome storage:",
          chrome.runtime.lastError
        );
      } else {
        console.log("State synced with chrome storage");
      }
    });
  }
};

export const useGraphStore = create<GraphStore>()(
  persist(
    (set, get) => ({
      ...initialGraphData,

      // Website operations
      addWebsite: (website) => {
        const id = generateId();
        set((state) => {
          const newState = {
            ...state,
            websites: [...state.websites, { ...website, id }],
          };
          saveToChromeStorage(newState);
          return newState;
        });
        return id;
      },

      updateWebsite: (id, updates) => {
        set((state) => {
          const newState = {
            ...state,
            websites: state.websites.map((website) =>
              website.id === id ? { ...website, ...updates } : website
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      removeWebsite: (id) => {
        set((state) => {
          const newState = {
            ...state,
            websites: state.websites.filter((website) => website.id !== id),
            // Also remove related edges and nodes
            keywords: state.keywords.filter((k) => k.sourceWebsiteId !== id),
            mentions: state.mentions.filter((m) => m.sourceWebsiteId !== id),
            websiteToKeywordEdges: state.websiteToKeywordEdges.filter(
              (e) => e.source !== id
            ),
            websiteToMentionEdges: state.websiteToMentionEdges.filter(
              (e) => e.source !== id
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      // Keyword operations
      addKeyword: (keyword) => {
        const id = generateId();
        set((state) => {
          const newState = {
            ...state,
            keywords: [...state.keywords, { ...keyword, id }],
          };
          saveToChromeStorage(newState);
          return newState;
        });
        return id;
      },

      updateKeyword: (id, updates) => {
        set((state) => {
          const newState = {
            ...state,
            keywords: state.keywords.map((keyword) =>
              keyword.id === id ? { ...keyword, ...updates } : keyword
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      removeKeyword: (id) => {
        set((state) => {
          const newState = {
            ...state,
            keywords: state.keywords.filter((keyword) => keyword.id !== id),
            // Also remove related edges
            websiteToKeywordEdges: state.websiteToKeywordEdges.filter(
              (e) => e.target !== id
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      // Mention operations
      addMention: (mention) => {
        const id = generateId();
        set((state) => {
          const newState = {
            ...state,
            mentions: [...state.mentions, { ...mention, id }],
          };
          saveToChromeStorage(newState);
          return newState;
        });
        return id;
      },

      updateMention: (id, updates) => {
        set((state) => {
          const newState = {
            ...state,
            mentions: state.mentions.map((mention) =>
              mention.id === id ? { ...mention, ...updates } : mention
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      removeMention: (id) => {
        set((state) => {
          const newState = {
            ...state,
            mentions: state.mentions.filter((mention) => mention.id !== id),
            // Also remove related edges
            websiteToMentionEdges: state.websiteToMentionEdges.filter(
              (e) => e.target !== id
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      // Edge operations
      addWebsiteToKeywordEdge: (edge) => {
        const id = generateId();
        set((state) => {
          const newState = {
            ...state,
            websiteToKeywordEdges: [
              ...state.websiteToKeywordEdges,
              { ...edge, id },
            ],
          };
          saveToChromeStorage(newState);
          return newState;
        });
        return id;
      },

      removeWebsiteToKeywordEdge: (id) => {
        set((state) => {
          const newState = {
            ...state,
            websiteToKeywordEdges: state.websiteToKeywordEdges.filter(
              (edge) => edge.id !== id
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      addWebsiteToMentionEdge: (edge) => {
        const id = generateId();
        set((state) => {
          const newState = {
            ...state,
            websiteToMentionEdges: [
              ...state.websiteToMentionEdges,
              { ...edge, id },
            ],
          };
          saveToChromeStorage(newState);
          return newState;
        });
        return id;
      },

      removeWebsiteToMentionEdge: (id) => {
        set((state) => {
          const newState = {
            ...state,
            websiteToMentionEdges: state.websiteToMentionEdges.filter(
              (edge) => edge.id !== id
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      // Position update operations
      updateWebsitePosition: (id, position) => {
        set((state) => {
          const newState = {
            ...state,
            websites: state.websites.map((website) =>
              website.id === id
                ? { ...website, lastPosition: position }
                : website
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      updateKeywordPosition: (id, position) => {
        set((state) => {
          const newState = {
            ...state,
            keywords: state.keywords.map((keyword) =>
              keyword.id === id ? { ...keyword, position } : keyword
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      updateMentionPosition: (id, position) => {
        set((state) => {
          const newState = {
            ...state,
            mentions: state.mentions.map((mention) =>
              mention.id === id ? { ...mention, position } : mention
            ),
          };
          saveToChromeStorage(newState);
          return newState;
        });
      },

      // Search operations
      searchByKeyword: (keyword) => {
        const state = get();
        const lowercaseKeyword = keyword.toLowerCase();

        // Search for matching keywords
        const matchingKeywords = state.keywords.filter((k) =>
          k.text.toLowerCase().includes(lowercaseKeyword)
        );

        // Search for matching mentions
        const matchingMentions = state.mentions.filter(
          (m) =>
            m.text.toLowerCase().includes(lowercaseKeyword) ||
            m.context.toLowerCase().includes(lowercaseKeyword)
        );

        // Get websites connected to the matching keywords and mentions
        const websiteIds = new Set([
          ...matchingKeywords.map((k) => k.sourceWebsiteId),
          ...matchingMentions.map((m) => m.sourceWebsiteId),
        ]);

        const matchingWebsites = state.websites.filter(
          (w) =>
            websiteIds.has(w.id) ||
            w.title.toLowerCase().includes(lowercaseKeyword) ||
            w.url.toLowerCase().includes(lowercaseKeyword)
        );

        return {
          websites: matchingWebsites,
          keywords: matchingKeywords,
          mentions: matchingMentions,
        };
      },

      getMentionsForWebsite: (websiteId) => {
        return get().mentions.filter((m) => m.sourceWebsiteId === websiteId);
      },

      getKeywordsForWebsite: (websiteId) => {
        return get().keywords.filter((k) => k.sourceWebsiteId === websiteId);
      },

      // Load data from chrome storage
      loadFromChromeStorage: async () => {
        if (typeof chrome !== "undefined" && chrome.storage) {
          return new Promise<void>((resolve) => {
            console.log("Starting load from chrome.storage.local");
            // Create a timestamp to identify this specific load request
            const loadId = Date.now();

            chrome.storage.local.get("graphData", (result) => {
              if (result.graphData) {
                console.log("Loading data from chrome.storage.local", {
                  websites: result.graphData.websites?.length || 0,
                  keywords: result.graphData.keywords?.length || 0,
                  mentions: result.graphData.mentions?.length || 0,
                });
                // Set the state only if we have valid data
                if (
                  result.graphData.websites &&
                  Array.isArray(result.graphData.websites) &&
                  result.graphData.keywords &&
                  Array.isArray(result.graphData.keywords) &&
                  result.graphData.mentions &&
                  Array.isArray(result.graphData.mentions) &&
                  result.graphData.websiteToKeywordEdges &&
                  Array.isArray(result.graphData.websiteToKeywordEdges) &&
                  result.graphData.websiteToMentionEdges &&
                  Array.isArray(result.graphData.websiteToMentionEdges)
                ) {
                  set(result.graphData);
                } else {
                  console.warn(
                    "Invalid data format in chrome.storage.local, not loading"
                  );
                }
              } else {
                console.log("No data found in chrome.storage.local");
              }
              resolve();
            });
          });
        }
        return Promise.resolve();
      },

      // Reset all graph data
      resetGraph: async () => {
        if (typeof chrome !== "undefined" && chrome.storage) {
          return new Promise<void>((resolve) => {
            // Clear the graph data in chrome.storage
            chrome.storage.local.remove("graphData", () => {
              // Reset the local state
              set({
                websites: [],
                keywords: [],
                mentions: [],
                websiteToKeywordEdges: [],
                websiteToMentionEdges: [],
              });
              console.log("Graph data has been reset");
              resolve();
            });
          });
        }
        return Promise.resolve();
      },

      // Save current state to chrome.storage.local
      saveToChromeStorage: () => {
        const state = get();
        const dataToSave = {
          websites: state.websites,
          keywords: state.keywords,
          mentions: state.mentions,
          websiteToKeywordEdges: state.websiteToKeywordEdges,
          websiteToMentionEdges: state.websiteToMentionEdges,
        };

        if (typeof chrome !== "undefined" && chrome.storage) {
          chrome.storage.local.set({ graphData: dataToSave }, () => {
            console.log("Graph data saved to chrome.storage");
          });
        }
      },
    }),
    {
      name: "recall-graph-storage",
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
);
