import "@pixi/events";

import { Application, extend } from "@pixi/react";
import { Container, Graphics, Text } from "pixi.js";
import React, { useMemo, useState } from "react";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { Card } from "@/components/ui/card";

import { World } from "./World";
import { Mouse } from "./Mouse";
import { PixiNode, type PixiNodeType } from "./PixiNode";
import { PixiLine } from "./PixiLine";
import { PixiLabel } from "./PixiLabel";
import { PixiBorder } from "./PixiBorder";

// Extend pixi.js with the components we need
extend({ Container, Graphics, Text });

export const RESOLUTION = 2;

interface PixiGraphViewProps {
  nodes: EnrichedNodesResponse[];
  edges: EdgesResponse[];
}

// Create nodes with random positions
function createPixiNodes(nodes: EnrichedNodesResponse[], scale: number): PixiNodeType[] {
  return nodes.map((node) => ({
    key: node.id,
    position: {
      x: Math.random() * (scale - 100) + 50,
      y: Math.random() * (scale - 100) + 50,
    },
  }));
}

// Create edges from the data
interface PixiEdge {
  source: string;
  target: string;
}

function createPixiEdges(edges: EdgesResponse[]): PixiEdge[] {
  return edges
    .filter((edge) => edge.source && edge.target)
    .map((edge) => ({
      source: edge.source!,
      target: edge.target!,
    }));
}

export function PixiGraphView({ nodes: rawNodes, edges: rawEdges }: PixiGraphViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });

  // Update dimensions on resize
  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(400, width - 32),
          height: Math.max(400, height - 32),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const scale = Math.min(dimensions.width, dimensions.height);

  // Create initial node positions
  const initialNodes = useMemo(() => createPixiNodes(rawNodes, scale), [rawNodes, scale]);

  const [pixiNodes, setPixiNodes] = useState<PixiNodeType[]>(initialNodes);

  // Reset nodes when raw data changes - ignore scale to prevent reset on resize
  React.useEffect(() => {
    setPixiNodes(createPixiNodes(rawNodes, scale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes]);

  // Create edges
  const pixiEdges = useMemo(() => createPixiEdges(rawEdges), [rawEdges]);

  if (rawNodes.length === 0) {
    return (
      <Card className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">No nodes to display</p>
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col overflow-hidden" ref={containerRef}>
      <div className="flex-1 flex items-center justify-center p-4 bg-zinc-900 rounded-lg m-2">
        <Application width={scale} height={scale} resolution={RESOLUTION} antialias={true} background="#18181b">
          <World>
            <PixiBorder scale={scale} />
            <Mouse>
              {/* Draw edges first (below nodes) */}
              {pixiEdges.map(({ source, target }) => {
                const sourceNode = pixiNodes.find((node) => node.key === source);
                const targetNode = pixiNodes.find((node) => node.key === target);
                if (!sourceNode || !targetNode) return null;
                return (
                  <PixiLine
                    key={`${source}-${target}`}
                    x1={sourceNode.position.x}
                    y1={sourceNode.position.y}
                    x2={targetNode.position.x}
                    y2={targetNode.position.y}
                    color="#525252"
                  />
                );
              })}
              {/* Draw nodes and labels */}
              {pixiNodes.map((node) => (
                <React.Fragment key={node.key}>
                  <PixiLabel text={node.key} x={node.position.x} y={node.position.y + 18} color="#a1a1aa" />
                  <PixiNode
                    x={node.position.x}
                    y={node.position.y}
                    radius={20}
                    setNodes={setPixiNodes}
                    id={node.key}
                    color="#a39af7"
                  />
                </React.Fragment>
              ))}
            </Mouse>
          </World>
        </Application>
      </div>
      <div className="p-2 border-t text-xs text-muted-foreground text-center">
        {rawNodes.length} nodes · {rawEdges.length} edges · Drag nodes to interact
      </div>
    </Card>
  );
}
