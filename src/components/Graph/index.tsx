import "@xyflow/react/dist/style.css";

import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  Controls,
} from "@xyflow/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import useGraphData from "../../hooks/useGraphData";
import useResizeObserver from "../../hooks/useResizeObserver";
import WebsiteNode from "./WebsiteNode";
import KeywordNode from "./KeywordNode";

function GraphContent() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(wrapperRef);
  const { nodes, edges, isLoading, error } = useGraphData(dimensions);
  const { fitView } = useReactFlow();
  const reactFlowInstance = useReactFlow();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    };

    checkTheme();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.attributeName === "class" &&
          mutation.target === document.documentElement
        ) {
          checkTheme();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  const nodeTypes = useMemo(
    () => ({
      website: WebsiteNode,
      keyword: KeywordNode,
    }),
    []
  );

  useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0) return;
    console.log(
      `Rendering graph with ${nodes.length} nodes and ${edges.length} edges`
    );

    setTimeout(() => {
      reactFlowInstance.fitView({
        padding: 0.5,
        minZoom: 0.5,
        maxZoom: 1.2,
      });
    }, 300);
  }, [nodes, edges, reactFlowInstance]);

  const defaultNodes = nodes.length > 0 ? nodes : [];
  const defaultEdges = edges.length > 0 ? edges : [];

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (node.data && node.data.url && typeof node.data.url === "string") {
      window.open(node.data.url, "_blank");
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        height: "100vh",
        width: "100%",
        position: "relative",
      }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-foreground">Building your knowledge graph...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="max-w-md text-center p-6 rounded-lg bg-background/90 backdrop-blur-sm shadow-lg border border-destructive">
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              Error loading graph data
            </h3>
            <p className="text-muted-foreground">
              There was a problem loading your browsing history. Try refreshing
              the page.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !error && nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="max-w-md text-center p-6 rounded-lg bg-background/90 backdrop-blur-sm shadow-lg border border-border">
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              No browsing data found
            </h3>
            <p className="text-muted-foreground">Go visit some websites</p>
          </div>
        </div>
      )}

      <ReactFlow
        fitView
        defaultNodes={defaultNodes}
        defaultEdges={defaultEdges}
        colorMode={theme}
        edges={edges}
        fitViewOptions={{ padding: 0.2, duration: 1000 }}
        nodes={nodes}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        minZoom={0.2}
        maxZoom={2}
        onNodeClick={onNodeClick}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default function Graph() {
  return (
    <ReactFlowProvider>
      <GraphContent />
    </ReactFlowProvider>
  );
}
