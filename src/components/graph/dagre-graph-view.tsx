import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import dagre from "dagre";
import { NodesTypeOptions, EdgesTypeOptions, type EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  User,
  Tag,
  FolderOpen,
  Highlighter,
  Bookmark,
  FileIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Type configuration for icons and colors
const typeConfig: Record<
  NodesTypeOptions,
  { icon: ComponentType<{ className?: string }>; color: string; bgColor: string; stroke: string }
> = {
  [NodesTypeOptions.upload]: {
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    stroke: "#3b82f6",
  },
  [NodesTypeOptions.author]: {
    icon: User,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    stroke: "#9333ea",
  },
  [NodesTypeOptions.publication]: {
    icon: FileText,
    color: "text-sky-600 dark:text-sky-400",
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    stroke: "#0ea5e9",
  },
  [NodesTypeOptions.tag]: {
    icon: Tag,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    stroke: "#22c55e",
  },
  [NodesTypeOptions.topic]: {
    icon: FolderOpen,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    stroke: "#f97316",
  },
  [NodesTypeOptions.highlight]: {
    icon: Highlighter,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    stroke: "#eab308",
  },
  [NodesTypeOptions.bookmark]: {
    icon: Bookmark,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    stroke: "#ef4444",
  },
  [NodesTypeOptions.note]: {
    icon: FileIcon,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    stroke: "#475569",
  },
};

// Edge type colors
const edgeTypeColors: Record<EdgesTypeOptions, string> = {
  [EdgesTypeOptions.authored_by]: "#9333ea",
  [EdgesTypeOptions.tagged_with]: "#22c55e",
  [EdgesTypeOptions.belongs_to]: "#f97316",
  [EdgesTypeOptions.highlight_of]: "#eab308",
  [EdgesTypeOptions.bookmark_of]: "#ef4444",
  [EdgesTypeOptions.note_of]: "#475569",
  [EdgesTypeOptions.published_by]: "#0ea5e9",
  [EdgesTypeOptions.about_person]: "#d946ef",
};

interface LayoutNode {
  id: string;
  type: NodesTypeOptions;
  record?: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  type: EdgesTypeOptions;
  points: { x: number; y: number }[];
}

interface DagreGraphViewProps {
  nodes: EnrichedNodesResponse[];
  edges: EdgesResponse[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

// Helper to get display label from enriched node
function getNodeLabel(node: EnrichedNodesResponse): string {
  if (node.record_data) {
    const data = node.record_data;
    if ("title" in data && data.title) return data.title;
    if ("name" in data && data.name) return data.name;
    if ("text" in data && data.text) {
      const text = data.text;
      return text.length > 30 ? text.slice(0, 30) + "..." : text;
    }
    if ("page" in data && data.page) return `Page ${data.page}`;
  }
  return node.record_id || "Untitled";
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;

export function DagreGraphView({ nodes, edges, selectedNodeId, onSelectNode }: DagreGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Use all nodes (no filtering)
  const filteredNodes = nodes;

  // Use all edges between visible nodes
  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, filteredNodes]);

  // Create dagre layout
  const { layoutNodes, layoutEdges, graphWidth, graphHeight } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      nodesep: 50,
      ranksep: 80,
      marginx: 40,
      marginy: 40,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    filteredNodes.forEach((node) => {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    // Add edges
    filteredEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    // Run layout
    dagre.layout(g);

    // Extract positioned nodes
    const layoutNodes: LayoutNode[] = filteredNodes.map((node) => {
      const dagreNode = g.node(node.id);
      return {
        id: node.id,
        type: node.type as NodesTypeOptions,
        record: node.record_id,
        label: getNodeLabel(node),
        x: dagreNode?.x || 0,
        y: dagreNode?.y || 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    });

    // Extract edges with points
    const layoutEdges: LayoutEdge[] = filteredEdges.map((edge) => {
      const dagreEdge = g.edge(edge.source, edge.target);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type as EdgesTypeOptions,
        points: dagreEdge?.points || [],
      };
    });

    // Calculate graph dimensions
    const graphInfo = g.graph();
    const graphWidth = (graphInfo.width || 800) + 80;
    const graphHeight = (graphInfo.height || 600) + 80;

    return { layoutNodes, layoutEdges, graphWidth, graphHeight };
  }, [filteredNodes, filteredEdges]);

  // Fit to view
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / graphWidth;
    const scaleY = containerHeight / graphHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9;

    const x = (containerWidth - graphWidth * scale) / 2;
    const y = (containerHeight - graphHeight * scale) / 2;

    setTransform({ x, y, scale });
  }, [graphWidth, graphHeight]);

  // Initial fit to view
  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setTransform((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    },
    [isPanning, panStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(Math.max(prev.scale * delta, 0.1), 3),
    }));
  }, []);

  const zoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale * 1.2, 3),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale / 1.2, 0.1),
    }));
  }, []);

  // Generate edge path
  const getEdgePath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return "";
    const [start, ...rest] = points;
    let path = `M ${start.x} ${start.y}`;
    rest.forEach((point) => {
      path += ` L ${point.x} ${point.y}`;
    });
    return path;
  };

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      {/* Controls */}
      <div className="p-2 border-b flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={fitToView}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground ml-2">{Math.round(transform.scale * 100)}%</span>
      </div>

      {/* Graph Canvas */}
      <CardContent
        ref={containerRef}
        className="flex-1 overflow-hidden p-0 relative bg-muted/20"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <defs>
            {/* Arrow markers for each edge type */}
            {Object.entries(edgeTypeColors).map(([type, color]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            {/* Render edges */}
            {layoutEdges.map((edge) => (
              <g key={edge.id}>
                <path
                  d={getEdgePath(edge.points)}
                  fill="none"
                  stroke={edgeTypeColors[edge.type] || "#6b7280"}
                  strokeWidth={2}
                  markerEnd={`url(#arrow-${edge.type})`}
                  className="transition-opacity"
                />
              </g>
            ))}

            {/* Render nodes */}
            {layoutNodes.map((node) => {
              const config = typeConfig[node.type] || typeConfig[NodesTypeOptions.upload];
              const Icon = config.icon;
              const isSelected = selectedNodeId === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
                  onClick={() => onSelectNode(node.id)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Node background */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={8}
                    className={cn(
                      "fill-background stroke-2 transition-all",
                      isSelected ? "stroke-primary" : "stroke-border",
                    )}
                    style={{
                      filter: isSelected ? "drop-shadow(0 0 8px rgba(var(--primary), 0.5))" : undefined,
                    }}
                  />

                  {/* Icon background */}
                  <rect
                    x={8}
                    y={(node.height - 24) / 2}
                    width={24}
                    height={24}
                    rx={4}
                    fill={config.stroke}
                    fillOpacity={0.15}
                  />

                  {/* Icon */}
                  <foreignObject x={8} y={(node.height - 24) / 2} width={24} height={24}>
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                    </div>
                  </foreignObject>

                  {/* Node label */}
                  <foreignObject x={36} y={6} width={node.width - 44} height={20}>
                    <div className="text-xs font-medium truncate leading-5" title={node.label}>
                      {node.label}
                    </div>
                  </foreignObject>

                  {/* Type badge */}
                  <foreignObject x={36} y={26} width={node.width - 44} height={18}>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 h-4"
                      style={{ borderColor: config.stroke, color: config.stroke }}
                    >
                      {node.type}
                    </Badge>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </CardContent>
    </Card>
  );
}
