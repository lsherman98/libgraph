import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { NodesTypeOptions, EdgesTypeOptions } from "@/lib/pocketbase-types";

interface ForceGraphViewProps {
  nodes: EnrichedNodesResponse[];
  edges: EdgesResponse[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

// Type configuration for colors
const typeColors: Record<NodesTypeOptions, string> = {
  [NodesTypeOptions.upload]: "#3b82f6",
  [NodesTypeOptions.author]: "#9333ea",
  [NodesTypeOptions.tag]: "#22c55e",
  [NodesTypeOptions.topic]: "#f97316",
  [NodesTypeOptions.highlight]: "#eab308",
  [NodesTypeOptions.bookmark]: "#ef4444",
  [NodesTypeOptions.page]: "#6b7280",
};

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: NodesTypeOptions;
  label: string;
  radius: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: EdgesTypeOptions;
}

export function ForceGraphView({ nodes, edges, selectedNodeId, onSelectNode }: ForceGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();

  // Transform relevant data for d3
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    // Transform nodes
    const graphNodes: GraphNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.type as NodesTypeOptions,
      label: node.id, // Just showing node id as requested
      radius: node.id === selectedNodeId ? 8 : 5,
      x: 0,
      y: 0,
    }));

    // Transform edges
    const graphEdges: GraphEdge[] = edges
      .filter((e) => nodes.find((n) => n.id === e.source) && nodes.find((n) => n.id === e.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.type as EdgesTypeOptions,
      }));

    setGraphData({ nodes: graphNodes, edges: graphEdges });
  }, [nodes, edges, selectedNodeId]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || graphData.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(graphData.edges)
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(20));

    // Render edges
    const link = g
      .append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(graphData.edges)
      .join("line")
      .attr("stroke-width", 1.5);

    // Render nodes
    const node = g
      .append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .call(d3.drag<any, GraphNode>().on("start", dragstarted).on("drag", dragged).on("end", dragended));

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => typeColors[d.type] || "#ffffff")
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNode(d.id);
      });

    // Node labels (ID)
    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 8)
      .attr("y", 3)
      .attr("font-size", "10px")
      .attr("fill", theme === "dark" ? "#ccc" : "#333")
      .style("pointer-events", "none"); // Let clicks pass through to circle

    // Update positions on tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graphData, onSelectNode, theme]);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" onClick={() => onSelectNode("")} />
    </div>
  );
}
