import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { useTheme } from "next-themes";
import { NodesTypeOptions, EdgesTypeOptions } from "@/lib/pocketbase-types";

export interface NodePreviewRequest {
  nodeId: string;
  nodeType: NodesTypeOptions;
  uploadId?: string;
  uploadTitle?: string;
  pageNumber?: number;
  recordData?: Record<string, unknown>;
}

interface ForceGraphViewProps {
  nodes: EnrichedNodesResponse[];
  edges: EdgesResponse[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onPreviewNode?: (request: NodePreviewRequest) => void;
  hiddenNodeTypes: Set<NodesTypeOptions>;
  hiddenEdgeTypes: Set<EdgesTypeOptions>;
}

const typeConfig: Record<NodesTypeOptions, { color: string; darkColor: string; icon: string }> = {
  [NodesTypeOptions.upload]: {
    color: "#3b82f6",
    darkColor: "#60a5fa",
    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  },
  [NodesTypeOptions.author]: {
    color: "#9333ea",
    darkColor: "#a855f7",
    icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  },
  [NodesTypeOptions.tag]: {
    color: "#22c55e",
    darkColor: "#4ade80",
    icon: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  },
  [NodesTypeOptions.topic]: {
    color: "#f97316",
    darkColor: "#fb923c",
    icon: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  },
  [NodesTypeOptions.highlight]: {
    color: "#eab308",
    darkColor: "#facc15",
    icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  },
  [NodesTypeOptions.bookmark]: {
    color: "#ef4444",
    darkColor: "#f87171",
    icon: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  },
  [NodesTypeOptions.note]: {
    color: "#6366f1",
    darkColor: "#818cf8",
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  },
};

const edgeTypeColors: Record<EdgesTypeOptions, string> = {
  [EdgesTypeOptions.authored_by]: "#9333ea",
  [EdgesTypeOptions.tagged_with]: "#22c55e",
  [EdgesTypeOptions.belongs_to]: "#f97316",
  [EdgesTypeOptions.highlight_of]: "#eab308",
  [EdgesTypeOptions.bookmark_of]: "#ef4444",
  [EdgesTypeOptions.note_of]: "#6366f1",
  [EdgesTypeOptions.published_by]: "#0ea5e9",
  [EdgesTypeOptions.about_person]: "#d946ef",
  [EdgesTypeOptions.links_to]: "#14b8a6",
};

function getNodeDisplayLabel(node: EnrichedNodesResponse): string {
  if (node.label) return node.label;

  const d = node.data as Record<string, unknown> | null | undefined;
  if (d) {
    if (typeof d.title === "string" && d.title) return d.title;
    if (typeof d.name === "string" && d.name) return d.name;
    if (typeof d.text === "string" && d.text) {
      return d.text.length > 30 ? d.text.slice(0, 30) + "…" : d.text;
    }
    if (typeof d.content === "string" && d.content) {
      return d.content.length > 30 ? d.content.slice(0, 30) + "…" : d.content;
    }
  }

  return node.record_id || node.id;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildExpandedHTML(enrichedNode: EnrichedNodesResponse, isDark: boolean): string {
  const type = enrichedNode.type as NodesTypeOptions;
  const cfg = typeConfig[type];
  const color = isDark ? cfg?.darkColor || "#9ca3af" : cfg?.color || "#6b7280";
  const bgColor = isDark ? "#1e293b" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const textColor = isDark ? "#e2e8f0" : "#1e293b";
  const mutedColor = isDark ? "#94a3b8" : "#64748b";

  let title = getNodeDisplayLabel(enrichedNode);
  const details: string[] = [];
  let actionLabel = "";
  let hasAction = false;
  let externalHref = "";

  const rd = enrichedNode.record_data as Record<string, unknown> | undefined;

  if (rd) {
    switch (type) {
      case NodesTypeOptions.upload: {
        title = (rd.title as string) || "Untitled Upload";
        if (rd.type) details.push(`${escapeHtml(rd.type as string)}${rd.status ? " \u00B7 " + escapeHtml(rd.status as string) : ""}`);
        if (rd.num_pages) details.push(`${rd.num_pages} pages`);
        if (rd.created) details.push(formatDateShort(rd.created as string));
        hasAction = true;
        actionLabel = "Preview";
        break;
      }
      case NodesTypeOptions.highlight: {
        const text = rd.text as string | undefined;
        title = text ? (text.length > 80 ? text.slice(0, 80) + "\u2026" : text) : "Highlight";
        const comment = rd.comment as string | undefined;
        if (comment) details.push(comment.length > 60 ? comment.slice(0, 60) + "\u2026" : comment);
        if (rd.created) details.push(formatDateShort(rd.created as string));
        if (rd.upload) {
          hasAction = true;
          actionLabel = "Preview";
        }
        break;
      }
      case NodesTypeOptions.bookmark: {
        title = (rd.comment as string) || "Bookmark";
        if (rd.page_number) details.push(`Page ${rd.page_number}`);
        if (rd.created) details.push(formatDateShort(rd.created as string));
        if (rd.upload) {
          hasAction = true;
          actionLabel = "Preview";
        }
        break;
      }
      case NodesTypeOptions.note: {
        const content = rd.content as string | undefined;
        title = content ? (content.length > 80 ? content.slice(0, 80) + "\u2026" : content) : "Note";
        if (rd.page_number) details.push(`Page ${rd.page_number}`);
        if (rd.created) details.push(formatDateShort(rd.created as string));
        if (rd.upload) {
          hasAction = true;
          actionLabel = "Preview";
        }
        break;
      }
      case NodesTypeOptions.author: {
        title = (rd.name as string) || "Unknown Person";
        if (rd.type) details.push((rd.type as string).replace(/_/g, " "));
        if (rd.created) details.push(`Added ${formatDateShort(rd.created as string)}`);
        break;
      }
      case NodesTypeOptions.tag: {
        title = (rd.title as string) || "Untitled Tag";
        if (rd.created) details.push(`Created ${formatDateShort(rd.created as string)}`);
        break;
      }
      case NodesTypeOptions.topic: {
        title = (rd.title as string) || "Untitled Topic";
        if (rd.created) details.push(`Created ${formatDateShort(rd.created as string)}`);
        break;
      }
    }
  } else {
    if (enrichedNode.record_id) details.push(`Record: ${enrichedNode.record_id.slice(0, 8)}\u2026`);
  }

  if (!hasAction && enrichedNode.record_id && type === NodesTypeOptions.upload) {
    hasAction = true;
    actionLabel = "Preview";
  }

  const truncTitle = title.length > 50 ? title.slice(0, 50) + "\u2026" : title;

  const detailsHtml = details.map((d) => `<div style="font-size:11px;color:${mutedColor};line-height:1.4">${escapeHtml(d)}</div>`).join("");

  const actionHtml = externalHref
    ? `<a href="${escapeHtml(externalHref)}"
         style="display:block;text-align:center;padding:5px 8px;background:${color};color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:500;text-decoration:none;margin-top:8px;cursor:pointer;"
         target="_blank" rel="noopener noreferrer"
       >${escapeHtml(actionLabel)}</a>`
    : hasAction
      ? `<button data-preview-action="true"
           style="display:block;width:100%;text-align:center;padding:5px 8px;background:${color};color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:500;margin-top:8px;cursor:pointer;"
         >${escapeHtml(actionLabel)}</button>`
      : "";

  return `<div xmlns="http://www.w3.org/1999/xhtml" style="
    background:${bgColor};
    border:1px solid ${borderColor};
    border-radius:8px;
    padding:10px 12px;
    font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 4px 12px rgba(0,0,0,${isDark ? "0.4" : "0.12"});
    max-width:220px;
  ">
    <div style="font-size:12px;font-weight:600;color:${textColor};line-height:1.3;margin-bottom:4px;word-wrap:break-word;" title="${escapeHtml(title)}">${escapeHtml(truncTitle)}</div>
    <span style="display:inline-block;font-size:9px;padding:1px 6px;border-radius:3px;background:${color}22;color:${color};font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${escapeHtml(type)}</span>
    ${detailsHtml ? `<div style="margin-top:4px;">${detailsHtml}</div>` : ""}
    ${actionHtml}
  </div>`;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: NodesTypeOptions;
  label: string;
  displayLabel: string;
  radius: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: EdgesTypeOptions;
}

export function ForceGraphView({ nodes, edges, selectedNodeId, onSelectNode, onPreviewNode, hiddenNodeTypes, hiddenEdgeTypes }: ForceGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  const nodeDataMapRef = useRef<Map<string, EnrichedNodesResponse>>(new Map());

  useEffect(() => {
    nodeDataMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  useEffect(() => {
    const visibleNodes = nodes.filter((n) => !hiddenNodeTypes.has(n.type as NodesTypeOptions));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    const graphNodes: GraphNode[] = visibleNodes.map((node) => {
      const label = getNodeDisplayLabel(node);
      const truncatedLabel = label.length > 12 ? label.slice(0, 12) + "…" : label;
      return {
        id: node.id,
        type: node.type as NodesTypeOptions,
        label: label,
        displayLabel: truncatedLabel,
        radius: 26,
        x: 0,
        y: 0,
      };
    });

    const graphEdges: GraphEdge[] = edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) && !hiddenEdgeTypes.has(e.type as EdgesTypeOptions))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.type as EdgesTypeOptions,
      }));

    setGraphData({ nodes: graphNodes, edges: graphEdges });
  }, [nodes, edges, hiddenNodeTypes, hiddenEdgeTypes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || graphData.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isDark = theme === "dark";
    const getRadius = (d: GraphNode) => (d.id === selectedNodeId ? 36 : 26);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    Object.entries(edgeTypeColors).forEach(([type, color]) => {
      defs
        .append("marker")
        .attr("id", `force-arrow-${type}`)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 28)
        .attr("refY", 5)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M 0 0 L 10 5 L 0 10 z")
        .attr("fill", color);
    });

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const simulation = d3
      .forceSimulation<GraphNode>(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(graphData.edges)
          .id((d) => d.id)
          .distance(140),
      )
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d) => getRadius(d as GraphNode) + 8),
      )
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04));

    const link = g
      .append("g")
      .attr("stroke-opacity", 0.5)
      .selectAll("line")
      .data(graphData.edges)
      .join("line")
      .attr("stroke", (d) => edgeTypeColors[d.type as EdgesTypeOptions] || "#999")
      .attr("stroke-width", 1.5)
      .attr("marker-end", (d) => `url(#force-arrow-${d.type})`);

    const node = g
      .append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(d3.drag<any, GraphNode>().on("start", dragstarted).on("drag", dragged).on("end", dragended))
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNode(d.id);
      });

    node
      .append("circle")
      .attr("r", (d) => getRadius(d) + 3)
      .attr("fill", "none")
      .attr("stroke", (d) => (d.id === selectedNodeId ? (isDark ? "#e2e8f0" : "#1e293b") : "none"))
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 2");

    node
      .append("circle")
      .attr("r", (d) => getRadius(d))
      .attr("fill", (d) => {
        const cfg = typeConfig[d.type];
        return isDark ? cfg?.darkColor || "#6b7280" : cfg?.color || "#6b7280";
      })
      .attr("stroke", isDark ? "#1e293b" : "#ffffff")
      .attr("stroke-width", 2);

    node.each(function (d) {
      const cfg = typeConfig[d.type];
      if (!cfg) return;
      const iconGroup = d3.select(this).append("g").attr("transform", "translate(-8, -12) scale(0.7)");

      iconGroup
        .append("path")
        .attr("d", cfg.icon)
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round");
    });

    node
      .append("text")
      .text((d) => d.displayLabel)
      .attr("x", 0)
      .attr("y", (d) => getRadius(d) + 14)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("fill", isDark ? "#e2e8f0" : "#334155")
      .style("pointer-events", "none");

    node
      .append("text")
      .text((d) => d.type)
      .attr("x", 0)
      .attr("y", (d) => getRadius(d) + 26)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", "8px")
      .attr("font-weight", "400")
      .attr("fill", (d) => {
        const cfg = typeConfig[d.type];
        return isDark ? cfg?.darkColor || "#9ca3af" : cfg?.color || "#6b7280";
      })
      .style("pointer-events", "none");

    if (selectedNodeId) {
      node
        .filter((d) => d.id === selectedNodeId)
        .raise()
        .each(function (d) {
          const enrichedNode = nodeDataMapRef.current.get(d.id);
          if (!enrichedNode) return;

          const r = getRadius(d);
          const cardWidth = 220;
          const fo = d3
            .select(this)
            .append("foreignObject")
            .attr("x", -(cardWidth / 2))
            .attr("y", r + 32)
            .attr("width", cardWidth)
            .attr("height", 300)
            .style("overflow", "visible");

          const foDiv = fo
            .append("xhtml:div")
            .html(buildExpandedHTML(enrichedNode, isDark))
            .on("click", (event: MouseEvent) => {
              event.stopPropagation();
            });

          foDiv.select("[data-preview-action]").on("click", (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            if (!onPreviewNode) return;
            const rd = enrichedNode.record_data as Record<string, unknown> | undefined;
            const nodeType = enrichedNode.type as NodesTypeOptions;
            const request: NodePreviewRequest = {
              nodeId: enrichedNode.id,
              nodeType,
              recordData: rd || undefined,
            };
            if (nodeType === NodesTypeOptions.upload) {
              request.uploadId = enrichedNode.record_id;
              request.uploadTitle = (rd?.title as string) || enrichedNode.label || "Document";
            } else if (rd?.upload) {
              request.uploadId = rd.upload as string;
              request.pageNumber = rd.page_number as number | undefined;
            }
            onPreviewNode(request);
          });
        });
    }

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

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
      simulation.alpha(0.3).restart();
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, onSelectNode, theme, selectedNodeId]);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" onClick={() => onSelectNode("")} />
    </div>
  );
}
