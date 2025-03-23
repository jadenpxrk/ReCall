import * as d3 from "d3";

import type { Edge, Node } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { MarkerType } from "@xyflow/react";
import { Storage } from "@plasmohq/storage";

// types for graph data
interface GraphNode {
  id: string;
  type: string;
  data?: any;
}

interface GraphRelationship {
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
}

export interface GraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

// mock history item for non-extension env
interface MockHistoryItem {
  id?: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
}

// helper funcs
function getColorForNodeType(type: string): string {
  const colors = {
    website: "#8b5cf6", // purple
    keyword: "#ec4899", // pink
    topic: "#06b6d4", // cyan
    person: "#f97316", // orange
    default: "#64748b", // slate
  };

  return colors[type as keyof typeof colors] || colors.default;
}

// get contrast - dark bg gets white text, light gets black
function getContrastingTextColor(backgroundColor: string): string {
  return backgroundColor.includes("f6") || backgroundColor.includes("f5")
    ? "#000000"
    : "#ffffff";
}

// make pos from seed
function generateDeterministicPosition(seed: string, maxValue: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  // normalize to maxval with margin
  const margin = maxValue * 0.1;
  return (Math.abs(hash) % (maxValue - 2 * margin)) + margin;
}

// get domain from url
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

// get keywords from title
function extractKeywords(title: string): string[] {
  if (!title) return [];

  // split words, make lowercase, remove short/common words
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "is",
    "are",
    "was",
    "were",
    "in",
    "on",
    "at",
    "to",
    "for",
    "with",
    "by",
    "about",
    "of",
    "from",
  ]);

  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // rm punctuation
    .split(/\s+/) // split on spaces
    .filter((word) => word.length > 3 && !stopWords.has(word)); // filter short/stop words

  // return unique only
  return [...new Set(words)];
}

// layout cache storage
interface LayoutStorage {
  [key: string]: {
    nodes: Node[];
    edges: Edge[];
  };
}

const layoutStorage: LayoutStorage = {};
const storage = new Storage();

export default function useGraphData(dimensions: {
  width: number;
  height: number;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const hasLayoutRun = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<string>("");
  const [cacheKey, setCacheKey] = useState<string>(Date.now().toString());

  // load prefs
  useEffect(() => {
    const loadPreferences = async () => {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(
          ["preferences", "graphDataCache"],
          (result) => {
            if (result.preferences) {
              setPreferences(result.preferences);
            }

            // reset cache if prefs changed
            if (result.graphDataCache === null) {
              console.log("detected cache reset needed");
              // clear layout cache
              Object.keys(layoutStorage).forEach((key) => {
                delete layoutStorage[key];
              });
              // force reload with new cache key
              setCacheKey(Date.now().toString());
              // reset cache flag
              chrome.storage.local.set({ graphDataCache: "active" });
            }
          }
        );
      }
    };

    loadPreferences();

    // listen for pref changes
    const preferenceListener = (changes: any) => {
      if (changes.preferences) {
        setPreferences(changes.preferences.newValue);
        // force reload on pref change
        Object.keys(layoutStorage).forEach((key) => {
          delete layoutStorage[key];
        });
        setCacheKey(Date.now().toString());
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.onChanged.addListener(preferenceListener);
      return () => {
        chrome.storage.onChanged.removeListener(preferenceListener);
      };
    }
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(`loading graph data with cache key: ${cacheKey}`);

        // check cache but skip if prefs changed recent
        const cachedLayout = layoutStorage[`history-graph-${cacheKey}`];
        if (cachedLayout && cachedLayout.nodes.length > 0) {
          console.log(
            `using cached layout with ${cachedLayout.nodes.length} nodes`
          );
          setNodes(cachedLayout.nodes);
          setEdges(cachedLayout.edges);
          setIsLoading(false);
          return;
        }

        // try chrome storage first
        if (typeof chrome !== "undefined" && chrome.storage) {
          console.log("checking chrome storage for graph data");
          chrome.storage.local.get("graphData", (result) => {
            if (
              result.graphData &&
              result.graphData.websites &&
              result.graphData.websites.length > 0
            ) {
              console.log(`found ${result.graphData.websites.length} websites`);

              // process data now
              processGraphData(result.graphData);
            } else {
              console.log("no graph data found");
              setNodes([]);
              setEdges([]);
              setIsLoading(false);
            }
          });
        } else {
          // no chrome storage = empty data
          console.log("no chrome storage, ending load");
          setNodes([]);
          setEdges([]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("error loading history:", error);
        setError(error instanceof Error ? error : new Error(String(error)));
        setIsLoading(false);
      }
    };

    // process graph data from storage
    const processGraphData = (graphData: any) => {
      try {
        console.log("converting to reactflow format");

        // check data valid
        if (
          !graphData ||
          !graphData.websites ||
          !Array.isArray(graphData.websites)
        ) {
          console.error("bad graph data");
          setIsLoading(false);
          return;
        }

        const websites = graphData.websites || [];
        const keywords = graphData.keywords || [];

        // make nodes
        const flowNodes: Node[] = [
          ...websites.map((site: any) => createWebsiteNode(site, dimensions)),
          ...keywords.map((keyword: any) =>
            createKeywordNode(keyword, dimensions)
          ),
        ];

        // make edges
        const flowEdges: Edge[] = [
          ...(graphData.websiteToKeywordEdges || []).map((edge: any) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            markerEnd: { type: MarkerType.Arrow },
            style: { stroke: "#d4d4d8", strokeWidth: 2, opacity: 0.8 },
          })),
        ];

        // do layout
        applyForceLayout(flowNodes, flowEdges, dimensions);
      } catch (error) {
        console.error("error processing graph:", error);
        setIsLoading(false);
      }
    };

    // make website node
    const createWebsiteNode = (
      website: any,
      dimensions: { width: number; height: number }
    ): Node => {
      const x = generateDeterministicPosition(
        `website-${website.id}-x`,
        dimensions.width
      );
      const y = generateDeterministicPosition(
        `website-${website.id}-y`,
        dimensions.height
      );

      return {
        id: website.id,
        type: "website",
        data: {
          label: extractDomain(website.url),
          url: website.url,
          title: website.title || extractDomain(website.url),
          favicon: website.favicon,
        },
        position: { x, y },
        style: {
          backgroundColor: getColorForNodeType("website"),
          color: getContrastingTextColor(getColorForNodeType("website")),
          padding: "8px",
          borderRadius: "4px",
          border: "none",
          fontSize: "1rem",
          width: "auto",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          transition: "all 0.2s ease",
        },
      };
    };

    // make keyword node
    const createKeywordNode = (
      keyword: any,
      dimensions: { width: number; height: number }
    ): Node => {
      const x = generateDeterministicPosition(
        `keyword-${keyword.id}-x`,
        dimensions.width
      );
      const y = generateDeterministicPosition(
        `keyword-${keyword.id}-y`,
        dimensions.height
      );

      return {
        id: keyword.id,
        type: "keyword",
        data: {
          label: keyword.text,
          count: keyword.count || 0,
        },
        position: { x, y },
        style: {
          backgroundColor: getColorForNodeType("keyword"),
          color: getContrastingTextColor(getColorForNodeType("keyword")),
          padding: "8px",
          borderRadius: "4px",
          border: "none",
          fontSize: "0.9rem",
          width: "auto",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          transition: "all 0.2s ease",
        },
      };
    };

    // do force layout
    const applyForceLayout = (
      nodes: Node[],
      edges: Edge[],
      dimensions: { width: number; height: number }
    ) => {
      if (nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        setIsLoading(false);
        return;
      }

      console.log(`applying force layout to ${nodes.length} nodes`);

      // setup sim nodes and links
      interface SimNode extends d3.SimulationNodeDatum {
        id: string;
        x?: number;
        y?: number;
      }

      interface SimLink extends d3.SimulationLinkDatum<SimNode> {
        source: string | SimNode;
        target: string | SimNode;
      }

      const simNodes: SimNode[] = nodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      }));

      const simLinks: SimLink[] = edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      }));

      // run sim
      const simulation = d3
        .forceSimulation(simNodes)
        .force("charge", d3.forceManyBody().strength(-500))
        .force(
          "link",
          d3
            .forceLink(simLinks)
            .id((d: any) => d.id)
            .distance(200)
        )
        .force(
          "center",
          d3.forceCenter(dimensions.width / 2, dimensions.height / 2)
        )
        .force(
          "collision",
          d3
            .forceCollide()
            .radius((d: any) => {
              const node = nodes.find((n) => n.id === d.id);
              return node?.type === "website" ? 120 : 100;
            })
            .strength(1)
        )
        .force("x", d3.forceX(dimensions.width / 2).strength(0.05))
        .force("y", d3.forceY(dimensions.height / 2).strength(0.05))
        .stop();

      // run sim steps
      for (let i = 0; i < 300; i++) {
        simulation.tick();
      }

      // update node pos
      const layoutedNodes = nodes.map((node) => {
        const simNode = simNodes.find((n) => n.id === node.id);
        return {
          ...node,
          position: {
            x: simNode?.x ?? node.position.x,
            y: simNode?.y ?? node.position.y,
          },
        };
      });

      // save layout
      layoutStorage[`history-graph-${cacheKey}`] = {
        nodes: layoutedNodes,
        edges,
      };

      // update state
      setNodes(layoutedNodes);
      setEdges(edges);
      setIsLoading(false);
    };

    loadHistory();
  }, [dimensions.width, dimensions.height, preferences, cacheKey]);

  return { nodes, edges, isLoading, error };
}
