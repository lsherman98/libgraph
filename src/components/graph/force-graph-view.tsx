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
  displayLabel: string; // Truncated label for display inside node
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
    const graphNodes: GraphNode[] = nodes.map((node) => {
      const label = node.id;
      const truncatedLabel = label.length > 6 ? label.slice(0, 6) + "…" : label;
      return {
        id: node.id,
        type: node.type as NodesTypeOptions,
        label: label,
        displayLabel: truncatedLabel,
        radius: node.id === selectedNodeId ? 28 : 24, // Larger radius to fit text inside
        x: 0,
        y: 0,
      };
    });

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

    // Define bounds for constraining the graph to the viewport
    const padding = 100; // Allow some padding outside viewport
    const bounds: [[number, number], [number, number]] = [
      [-padding, -padding],
      [width + padding, height + padding],
    ];

    // Zoom behavior with constraints
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2]) // Limit zoom: 0.5x out, 2x in
      .translateExtent(bounds) // Constrain panning to bounds
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
          .distance(120),
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d) => (d as GraphNode).radius + 5),
      )
      .force("x", d3.forceX(width / 2).strength(0.05)) // Keep nodes centered horizontally
      .force("y", d3.forceY(height / 2).strength(0.05)); // Keep nodes centered vertically

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

    // Node labels (inside the node)
    node
      .append("text")
      .text((d) => d.displayLabel)
      .attr("x", 0)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", "9px")
      .attr("font-weight", "500")
      .attr("fill", "#ffffff")
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
      // Release the fixed position so physics can reset the node
      d.fx = null;
      d.fy = null;
      // Reheat the simulation to let physics settle the graph
      simulation.alpha(0.3).restart();
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
