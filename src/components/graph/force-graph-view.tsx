import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { useTheme } from "next-themes";
import { NodesTypeOptions, EdgesTypeOptions, UploadsTypeOptions } from "@/lib/pocketbase-types";
import { edgeTypeConfig, nodeTypeConfig, uploadTypeConfig } from "./graph-style-config";

const nodeTypeIconPaths: Record<NodesTypeOptions, string> = {
  [NodesTypeOptions.upload]: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  [NodesTypeOptions.person]: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  [NodesTypeOptions.tag]: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  [NodesTypeOptions.topic]: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  [NodesTypeOptions.highlight]: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  [NodesTypeOptions.bookmark]: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  [NodesTypeOptions.note]: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};

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
  tuning: GraphTuningSettings;
}

export interface GraphTuningSettings {
  linkDistance: number;
  chargeStrength: number;
  collisionPadding: number;
  centerStrength: number;
  radialStrength: number;
  radialRadiusFactor: number;
  minZoom: number;
  maxZoom: number;
  fitPadding: number;
  fitDuration: number;
  warmupTicks: number;
  focusZoom: number;
}

export const defaultGraphTuningSettings: GraphTuningSettings = {
  linkDistance: 320,
  chargeStrength: -1000,
  collisionPadding: 40,
  centerStrength: 0.05,
  radialStrength: 0.05,
  radialRadiusFactor: 0.5,
  minZoom: 0.25,
  maxZoom: 4,
  fitPadding: 120,
  fitDuration: 350,
  warmupTicks: 90,
  focusZoom: 1.35,
};

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "youtube") return "YouTube";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function toUploadType(value: unknown): UploadsTypeOptions | undefined {
  if (typeof value !== "string") return undefined;
  if (Object.values(UploadsTypeOptions).includes(value as UploadsTypeOptions)) {
    return value as UploadsTypeOptions;
  }
  return undefined;
}

function getUploadTypeLabel(uploadType?: UploadsTypeOptions): string | undefined {
  if (!uploadType) return undefined;
  return uploadTypeConfig[uploadType]?.label ?? formatLabel(uploadType);
}

function getUploadType(node: EnrichedNodesResponse): UploadsTypeOptions | undefined {
  const data = node.data as Record<string, unknown> | null | undefined;
  const recordData = node.record_data as Record<string, unknown> | null | undefined;
  return toUploadType(data?.type) ?? toUploadType(recordData?.type);
}

function getIconPath(node: GraphNode): string {
  if (node.type === NodesTypeOptions.upload && node.uploadType) {
    return uploadTypeConfig[node.uploadType]?.icon || "";
  }
  return nodeTypeIconPaths[node.type] || "";
}

function getNodeDisplayLabel(node: EnrichedNodesResponse): string {
  if (typeof node.label === "string" && node.label.trim().length > 0) {
    return node.label;
  }

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

  return node.id;
}

function escapeHtml(value: unknown): string {
  const str = String(value ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
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
  const uploadType = type === NodesTypeOptions.upload ? getUploadType(enrichedNode) : undefined;
  const uploadTypeLabel = getUploadTypeLabel(uploadType);
  const cfg = nodeTypeConfig[type];
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
        if (uploadTypeLabel) details.push(`Upload Type: ${uploadTypeLabel}`);
        if (rd.status) details.push(`Status: ${formatLabel(rd.status as string)}`);
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
      case NodesTypeOptions.person: {
        title = (rd.name as string) || "Unknown Person";
        if (rd.type) details.push(formatLabel(rd.type as string));
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
    <span style="display:inline-block;font-size:9px;padding:1px 6px;border-radius:3px;background:${color}22;color:${color};font-weight:500;letter-spacing:0.2px;margin-bottom:6px;">${escapeHtml(formatLabel(type))}${uploadTypeLabel ? ` \u00B7 ${escapeHtml(uploadTypeLabel)}` : ""}</span>
    ${detailsHtml ? `<div style="margin-top:4px;">${detailsHtml}</div>` : ""}
    ${actionHtml}
  </div>`;
}

function buildTooltipHTML(enrichedNode: EnrichedNodesResponse, isDark: boolean): string {
  const type = enrichedNode.type as NodesTypeOptions;
  const uploadType = type === NodesTypeOptions.upload ? getUploadType(enrichedNode) : undefined;
  const uploadTypeLabel = getUploadTypeLabel(uploadType);
  const cfg = nodeTypeConfig[type];
  const color = isDark ? cfg?.darkColor || "#9ca3af" : cfg?.color || "#6b7280";
  const bgColor = isDark ? "#0f172a" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const textColor = isDark ? "#e2e8f0" : "#0f172a";
  const mutedColor = isDark ? "#94a3b8" : "#64748b";

  const title = getNodeDisplayLabel(enrichedNode);
  const details: string[] = [];
  const rd = enrichedNode.record_data as Record<string, unknown> | undefined;

  if (rd) {
    if (typeof rd.title === "string" && rd.title) details.push(`Title: ${rd.title}`);
    if (typeof rd.name === "string" && rd.name) details.push(`Name: ${rd.name}`);
    if (uploadTypeLabel) details.push(`Upload Type: ${uploadTypeLabel}`);
    if (typeof rd.type === "string" && rd.type && !uploadTypeLabel) details.push(`Kind: ${formatLabel(rd.type)}`);
    if (typeof rd.status === "string" && rd.status) details.push(`Status: ${formatLabel(rd.status)}`);
    if (typeof rd.page_number === "number" && rd.page_number > 0) details.push(`Page: ${rd.page_number}`);
    if (typeof rd.num_pages === "number" && rd.num_pages > 0) details.push(`Pages: ${rd.num_pages}`);
    if (typeof rd.comment === "string" && rd.comment) details.push(`Comment: ${rd.comment}`);
    if (typeof rd.text === "string" && rd.text) details.push(`Text: ${rd.text}`);
    if (typeof rd.content === "string" && rd.content) details.push(`Content: ${rd.content}`);
  }

  const renderedDetails = details
    .slice(0, 4)
    .map((line) => {
      const value = line.length > 90 ? `${line.slice(0, 90)}…` : line;
      return `<div style=\"font-size:11px;color:${mutedColor};line-height:1.35;word-break:break-word;\">${escapeHtml(value)}</div>`;
    })
    .join("");

  return `<div xmlns=\"http://www.w3.org/1999/xhtml\" style=\"
    max-width:280px;
    background:${bgColor};
    border:1px solid ${borderColor};
    border-radius:8px;
    padding:8px 10px;
    font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 8px 20px rgba(0,0,0,${isDark ? "0.45" : "0.16"});
  \">
    <div style=\"font-size:12px;font-weight:600;color:${textColor};line-height:1.35;word-break:break-word;\">${escapeHtml(title)}</div>
    <div style=\"font-size:10px;color:${color};font-weight:600;letter-spacing:0.2px;margin-top:3px;\">${escapeHtml(formatLabel(type))}${uploadTypeLabel ? ` \u00B7 ${escapeHtml(uploadTypeLabel)}` : ""}</div>
    ${renderedDetails ? `<div style=\"margin-top:6px;display:grid;gap:2px;\">${renderedDetails}</div>` : ""}
  </div>`;
}

function buildTooltipFallbackHTML(node: GraphNode, isDark: boolean): string {
  const cfg = nodeTypeConfig[node.type];
  const color = isDark ? cfg?.darkColor || "#9ca3af" : cfg?.color || "#6b7280";
  const bgColor = isDark ? "#0f172a" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const textColor = isDark ? "#e2e8f0" : "#0f172a";

  const typeLabel = formatLabel(node.type);
  const subTypeLabel = node.type === NodesTypeOptions.upload ? getUploadTypeLabel(node.uploadType) : undefined;

  return `<div xmlns="http://www.w3.org/1999/xhtml" style="
    max-width:260px;
    background:${bgColor};
    border:1px solid ${borderColor};
    border-radius:8px;
    padding:8px 10px;
    font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 8px 20px rgba(0,0,0,${isDark ? "0.45" : "0.16"});
  ">
    <div style="font-size:12px;font-weight:600;color:${textColor};line-height:1.35;word-break:break-word;">${escapeHtml(node.label || node.id)}</div>
    <div style="font-size:10px;color:${color};font-weight:600;letter-spacing:0.2px;margin-top:3px;">${escapeHtml(typeLabel)}${subTypeLabel ? ` \u00B7 ${escapeHtml(subTypeLabel)}` : ""}</div>
  </div>`;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: NodesTypeOptions;
  uploadType?: UploadsTypeOptions;
  label: string;
  displayLabel: string;
  radius: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: EdgesTypeOptions;
  curveOffset: number;
}

function buildLinkPath(edge: GraphEdge): string {
  const source = typeof edge.source === "string" ? undefined : edge.source;
  const target = typeof edge.target === "string" ? undefined : edge.target;

  if (!source || !target) {
    return "";
  }

  const sourceX = source.x ?? 0;
  const sourceY = source.y ?? 0;
  const targetX = target.x ?? 0;
  const targetY = target.y ?? 0;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const distance = Math.hypot(deltaX, deltaY) || 1;

  if (edge.curveOffset === 0) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const normalX = -deltaY / distance;
  const normalY = deltaX / distance;
  const controlX = midX + normalX * edge.curveOffset;
  const controlY = midY + normalY * edge.curveOffset;

  return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;
}

/**
 * Compute all node IDs that should be hidden: nodes whose type is directly
 * hidden PLUS any node whose every neighbour is already hidden (cascading).
 */
function computeHiddenNodeIds(
  hiddenTypes: Set<NodesTypeOptions>,
  nodeTypeMap: Map<string, NodesTypeOptions>,
  adjacencyMap: Map<string, Set<string>>,
): Set<string> {
  // Seed: all nodes whose type is directly filtered out
  const hidden = new Set<string>();
  for (const [id, type] of nodeTypeMap) {
    if (hiddenTypes.has(type)) hidden.add(id);
  }

  // Iteratively hide nodes whose ALL neighbours are hidden (fixed-point)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id] of nodeTypeMap) {
      if (hidden.has(id)) continue;
      const neighbours = adjacencyMap.get(id);
      if (!neighbours || neighbours.size === 0) continue;
      let allHidden = true;
      for (const nid of neighbours) {
        if (!hidden.has(nid)) {
          allHidden = false;
          break;
        }
      }
      if (allHidden) {
        hidden.add(id);
        changed = true;
      }
    }
  }

  return hidden;
}

export function ForceGraphView({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onPreviewNode,
  hiddenNodeTypes,
  hiddenEdgeTypes,
  tuning,
}: ForceGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  const nodeDataMapRef = useRef<Map<string, EnrichedNodesResponse>>(new Map());

  // Refs for D3 selections to support filter visibility without re-simulation
  const nodeSelectionRef = useRef<d3.Selection<any, GraphNode, any, unknown> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<any, GraphEdge, any, unknown> | null>(null);
  const lastAutoFitKeyRef = useRef<string>("");
  const zoomTransformRef = useRef(d3.zoomIdentity);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const nodeTypeMapRef = useRef<Map<string, NodesTypeOptions>>(new Map());
  const adjacencyMapRef = useRef<Map<string, Set<string>>>(new Map());
  const hiddenNodeTypesRef = useRef(hiddenNodeTypes);
  const hiddenEdgeTypesRef = useRef(hiddenEdgeTypes);
  hiddenNodeTypesRef.current = hiddenNodeTypes;
  hiddenEdgeTypesRef.current = hiddenEdgeTypes;

  useEffect(() => {
    nodeDataMapRef.current = new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  // Build graph data from ALL nodes/edges — no filtering here
  useEffect(() => {
    const allNodeIds = new Set(nodes.map((n) => n.id));

    const graphNodes: GraphNode[] = nodes.map((node) => {
      const label = getNodeDisplayLabel(node);
      const truncatedLabel = label.length > 12 ? label.slice(0, 12) + "…" : label;
      const uploadType = node.type === NodesTypeOptions.upload ? getUploadType(node) : undefined;
      return {
        id: node.id,
        type: node.type as NodesTypeOptions,
        uploadType,
        label: label,
        displayLabel: truncatedLabel,
        radius: 22,
        x: 0,
        y: 0,
      };
    });

    const visibleEdges = edges.filter((e) => allNodeIds.has(e.source) && allNodeIds.has(e.target));
    const pairCounts = new Map<string, number>();

    for (const edge of visibleEdges) {
      const pairKey = [edge.source, edge.target].sort().join(":");
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }

    const pairOffsets = new Map<string, number>();
    const graphEdges: GraphEdge[] = visibleEdges.map((edge) => {
      const pairKey = [edge.source, edge.target].sort().join(":");
      const pairCount = pairCounts.get(pairKey) ?? 1;
      const pairIndex = pairOffsets.get(pairKey) ?? 0;
      pairOffsets.set(pairKey, pairIndex + 1);

      return {
        source: edge.source,
        target: edge.target,
        type: edge.type as EdgesTypeOptions,
        curveOffset: pairCount > 1 ? (pairIndex - (pairCount - 1) / 2) * 28 : 0,
      };
    });

    nodeTypeMapRef.current = new Map(graphNodes.map((n) => [n.id, n.type]));

    // Build adjacency map for cascading filter visibility
    const adjMap = new Map<string, Set<string>>();
    for (const n of graphNodes) adjMap.set(n.id, new Set());
    for (const e of graphEdges) {
      const s = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
      adjMap.get(s)?.add(t);
      adjMap.get(t)?.add(s);
    }
    adjacencyMapRef.current = adjMap;

    setGraphData({ nodes: graphNodes, edges: graphEdges });
  }, [nodes, edges]);

  // Update visibility when filters change without rebuilding the simulation
  useEffect(() => {
    if (!nodeSelectionRef.current || !linkSelectionRef.current) return;

    const hiddenIds = computeHiddenNodeIds(hiddenNodeTypes, nodeTypeMapRef.current, adjacencyMapRef.current);

    nodeSelectionRef.current.style("display", (d: GraphNode) => (hiddenIds.has(d.id) ? "none" : null));

    linkSelectionRef.current.style("display", (d: GraphEdge) => {
      const sourceId = typeof d.source === "string" ? d.source : (d.source as GraphNode).id;
      const targetId = typeof d.target === "string" ? d.target : (d.target as GraphNode).id;
      if (hiddenIds.has(sourceId)) return "none";
      if (hiddenIds.has(targetId)) return "none";
      if (d.type && hiddenEdgeTypes.has(d.type)) return "none";
      return null;
    });
  }, [hiddenNodeTypes, hiddenEdgeTypes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || graphData.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isDark = theme === "dark";
    const getRadius = (d: GraphNode) => (d.id === selectedNodeId ? 30 : 22);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    Object.entries(edgeTypeConfig).forEach(([type, cfg]) => {
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
        .attr("fill", cfg.color);
    });

    const g = svg.append("g");

    const visibleHiddenIds = computeHiddenNodeIds(hiddenNodeTypesRef.current, nodeTypeMapRef.current, adjacencyMapRef.current);

    const fitToView = (animate: boolean) => {
      const visibleNodes = graphData.nodes.filter((n) => !visibleHiddenIds.has(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y));
      if (visibleNodes.length === 0) return;

      const minX = d3.min(visibleNodes, (n) => n.x as number) ?? 0;
      const maxX = d3.max(visibleNodes, (n) => n.x as number) ?? width;
      const minY = d3.min(visibleNodes, (n) => n.y as number) ?? 0;
      const maxY = d3.max(visibleNodes, (n) => n.y as number) ?? height;

      const graphWidth = Math.max(maxX - minX, 1);
      const graphHeight = Math.max(maxY - minY, 1);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const scale = Math.max(
        tuning.minZoom,
        Math.min(tuning.maxZoom, Math.min((width - tuning.fitPadding) / graphWidth, (height - tuning.fitPadding) / graphHeight)),
      );
      const transform = d3.zoomIdentity.translate(width / 2 - centerX * scale, height / 2 - centerY * scale).scale(scale);

      if (animate) {
        svg.transition().duration(tuning.fitDuration).call(zoom.transform, transform);
      } else {
        svg.call(zoom.transform, transform);
      }
    };

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([tuning.minZoom, tuning.maxZoom])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    graphData.nodes.forEach((n, index) => {
      const existing = nodePositionsRef.current.get(n.id);
      if (existing) {
        n.x = existing.x;
        n.y = existing.y;
      } else {
        const angle = index * 2.399963229728653;
        const radius = 40 + Math.sqrt(index + 1) * 35;
        n.x = width / 2 + Math.cos(angle) * radius;
        n.y = height / 2 + Math.sin(angle) * radius;
      }
      n.vx = 0;
      n.vy = 0;
    });

    const simulation = d3
      .forceSimulation<GraphNode>(graphData.nodes)
      .randomSource(d3.randomLcg(0.42))
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(graphData.edges)
          .id((d) => d.id)
          .distance(tuning.linkDistance),
      )
      .force("charge", d3.forceManyBody().strength(tuning.chargeStrength))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d) => getRadius(d as GraphNode) + tuning.collisionPadding),
      )
      .force("x", d3.forceX(width / 2).strength(tuning.centerStrength))
      .force("y", d3.forceY(height / 2).strength(tuning.centerStrength))
      .force("radial", d3.forceRadial(Math.min(width, height) * tuning.radialRadiusFactor, width / 2, height / 2).strength(tuning.radialStrength));

    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .style("position", "absolute")
      .style("left", "0px")
      .style("top", "0px")
      .style("pointer-events", "none")
      .style("opacity", "0")
      .style("z-index", "20");

    const link = g
      .append("g")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.5)
      .selectAll("path")
      .data(graphData.edges)
      .join("path")
      .attr("stroke", (d) => edgeTypeConfig[d.type as EdgesTypeOptions]?.color || "#999")
      .attr("stroke-width", 1.5)
      .attr("d", (d) => buildLinkPath(d))
      .attr("marker-end", (d) => `url(#force-arrow-${d.type})`);

    const node = g
      .append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(d3.drag<any, GraphNode>().on("start", dragstarted).on("drag", dragged).on("end", dragended))
      .on("mouseenter", (event, d) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        const enrichedNode = nodeDataMapRef.current.get(d.id);
        let tooltipHtml = "";
        try {
          tooltipHtml = enrichedNode ? buildTooltipHTML(enrichedNode, isDark) : buildTooltipFallbackHTML(d, isDark);
        } catch {
          tooltipHtml = buildTooltipFallbackHTML(d, isDark);
        }
        tooltip.style("opacity", "1").html(tooltipHtml);
        tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
      })
      .on("mousemove", (event) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", "0");
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNode(d.id);
        const currentScale = zoomTransformRef.current.k || 1;
        const targetScale = Math.max(currentScale, tuning.focusZoom);
        const nodeX = d.x ?? width / 2;
        const nodeY = d.y ?? height / 2;
        const transform = d3.zoomIdentity.translate(width / 2 - nodeX * targetScale, height / 2 - nodeY * targetScale).scale(targetScale);
        svg.transition().duration(tuning.fitDuration).call(zoom.transform, transform);
      });

    node
      .append("circle")
      .attr("class", "node-ring")
      .attr("r", (d) => getRadius(d) + 3)
      .attr("fill", "none")
      .attr("stroke", (d) => (d.id === selectedNodeId ? (isDark ? "#e2e8f0" : "#1e293b") : "none"))
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 2");

    node
      .append("circle")
      .attr("class", "node-body")
      .attr("r", (d) => getRadius(d))
      .attr("fill", (d) => {
        if (d.type === NodesTypeOptions.upload && d.uploadType) {
          return isDark ? uploadTypeConfig[d.uploadType]?.darkColor || "#60a5fa" : uploadTypeConfig[d.uploadType]?.color || "#3b82f6";
        }
        const cfg = nodeTypeConfig[d.type];
        return isDark ? cfg?.darkColor || "#6b7280" : cfg?.color || "#6b7280";
      })
      .attr("stroke", isDark ? "#1e293b" : "#ffffff")
      .attr("stroke-width", 2);

    node.each(function (d) {
      const iconPath = getIconPath(d);
      if (!iconPath) return;
      const iconGroup = d3.select(this).append("g").attr("transform", "translate(-8.4, -8.4) scale(0.7)");

      iconGroup
        .append("path")
        .attr("d", iconPath)
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
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("fill", isDark ? "#e2e8f0" : "#334155")
      .attr("stroke", isDark ? "#0f172a" : "#ffffff")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .style("pointer-events", "none");

    node
      .append("text")
      .text((d) => {
        if (d.type === NodesTypeOptions.upload && d.uploadType) {
          return getUploadTypeLabel(d.uploadType) || formatLabel(d.uploadType);
        }
        return formatLabel(d.type);
      })
      .attr("x", 0)
      .attr("y", (d) => getRadius(d) + 26)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", "9px")
      .attr("font-weight", "500")
      .attr("fill", (d) => {
        if (d.type === NodesTypeOptions.upload && d.uploadType) {
          return isDark ? uploadTypeConfig[d.uploadType]?.darkColor || "#93c5fd" : uploadTypeConfig[d.uploadType]?.color || "#3b82f6";
        }
        const cfg = nodeTypeConfig[d.type];
        return isDark ? cfg?.darkColor || "#9ca3af" : cfg?.color || "#6b7280";
      })
      .attr("stroke", isDark ? "#020617" : "#ffffff")
      .attr("stroke-width", 2.2)
      .attr("paint-order", "stroke")
      .style("pointer-events", "none");

    const connectedNodeIds = new Set<string>();
    const connectedEdgeKeys = new Set<string>();
    if (selectedNodeId) {
      connectedNodeIds.add(selectedNodeId);
      for (const edge of graphData.edges) {
        const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
        const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
        if (sourceId === selectedNodeId || targetId === selectedNodeId) {
          connectedNodeIds.add(sourceId);
          connectedNodeIds.add(targetId);
          connectedEdgeKeys.add(`${sourceId}:${targetId}`);
          connectedEdgeKeys.add(`${targetId}:${sourceId}`);
        }
      }
    }

    const inactiveOpacity = 0.18;

    link
      .style("opacity", (d) => {
        if (!selectedNodeId) return 0.5;
        const sourceId = typeof d.source === "string" ? d.source : d.source.id;
        const targetId = typeof d.target === "string" ? d.target : d.target.id;
        return connectedEdgeKeys.has(`${sourceId}:${targetId}`) ? 0.95 : inactiveOpacity;
      })
      .attr("stroke-width", (d) => {
        if (!selectedNodeId) return 1.5;
        const sourceId = typeof d.source === "string" ? d.source : d.source.id;
        const targetId = typeof d.target === "string" ? d.target : d.target.id;
        return connectedEdgeKeys.has(`${sourceId}:${targetId}`) ? 2.8 : 1.2;
      });

    node
      .style("opacity", (d) => {
        if (!selectedNodeId) return 1;
        return connectedNodeIds.has(d.id) ? 1 : inactiveOpacity;
      })
      .each(function (d) {
        const body = d3.select(this).select<SVGCircleElement>(".node-body");
        const ring = d3.select(this).select<SVGCircleElement>(".node-ring");
        if (!selectedNodeId) {
          body.attr("stroke-width", 2);
          ring.attr("stroke", "none");
          return;
        }
        if (d.id === selectedNodeId) {
          body.attr("stroke-width", 3);
          ring.attr("stroke", isDark ? "#f8fafc" : "#0f172a").attr("stroke-width", 2.5);
          return;
        }
        if (connectedNodeIds.has(d.id)) {
          body.attr("stroke-width", 2.5);
          ring.attr("stroke", isDark ? "#94a3b8" : "#475569").attr("stroke-width", 1.5);
          return;
        }
        body.attr("stroke-width", 1.5);
        ring.attr("stroke", "none");
      });

    if (selectedNodeId) {
      link
        .filter((d) => {
          const sourceId = typeof d.source === "string" ? d.source : d.source.id;
          const targetId = typeof d.target === "string" ? d.target : d.target.id;
          return connectedEdgeKeys.has(`${sourceId}:${targetId}`);
        })
        .raise();

      node.filter((d) => connectedNodeIds.has(d.id) && d.id !== selectedNodeId).raise();
    }

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

      node.filter((d) => d.id === selectedNodeId).raise();
    }

    // Store refs for filter visibility updates
    nodeSelectionRef.current = node;
    linkSelectionRef.current = link;

    // Apply current filter visibility without affecting simulation
    const hiddenIds = visibleHiddenIds;
    node.style("display", (d: GraphNode) => (hiddenIds.has(d.id) ? "none" : null));
    link.style("display", (d: GraphEdge) => {
      const sourceId = typeof d.source === "string" ? d.source : (d.source as GraphNode).id;
      const targetId = typeof d.target === "string" ? d.target : (d.target as GraphNode).id;
      if (hiddenIds.has(sourceId)) return "none";
      if (hiddenIds.has(targetId)) return "none";
      if (d.type && hiddenEdgeTypesRef.current.has(d.type)) return "none";
      return null;
    });

    const hiddenNodeKey = [...hiddenNodeTypesRef.current].sort().join(",");
    const hiddenEdgeKey = [...hiddenEdgeTypesRef.current].sort().join(",");
    const autoFitKey = `${graphData.nodes.length}:${graphData.edges.length}:${hiddenNodeKey}:${hiddenEdgeKey}`;
    const shouldAutoFit = lastAutoFitKeyRef.current !== autoFitKey;

    simulation.stop();
    const warmupTicks = Math.max(0, Math.floor(tuning.warmupTicks));
    for (let i = 0; i < warmupTicks; i++) {
      simulation.tick();
    }

    link
      .attr("x1", (d) => (d.source as GraphNode).x!)
      .attr("y1", (d) => (d.source as GraphNode).y!)
      .attr("x2", (d) => (d.target as GraphNode).x!)
      .attr("y2", (d) => (d.target as GraphNode).y!);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);

    if (shouldAutoFit) {
      lastAutoFitKeyRef.current = autoFitKey;
      fitToView(false);
    } else {
      svg.call(zoom.transform, zoomTransformRef.current);
    }

    simulation.alpha(0.7).restart();

    simulation.on("tick", () => {
      link.attr("d", (d) => buildLinkPath(d));

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);

      for (const n of graphData.nodes) {
        if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
          nodePositionsRef.current.set(n.id, { x: n.x as number, y: n.y as number });
        }
      }
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
      tooltip.remove();
      nodeSelectionRef.current = null;
      linkSelectionRef.current = null;
    };
  }, [graphData, onSelectNode, theme, selectedNodeId, tuning]);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" onClick={() => onSelectNode("")} />
    </div>
  );
}
