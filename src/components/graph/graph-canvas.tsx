import { useState, useMemo, useCallback } from "react";
import { useGraphData } from "@/lib/api/queries";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import { NodesTypeOptions, EdgesTypeOptions } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  User,
  Tag,
  FolderOpen,
  Highlighter,
  Bookmark,
  MessageSquare,
  Eye,
  EyeOff,
  LayoutGrid,
  Network,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeDetailDialog } from "./node-detail-dialog";
import { ForceGraphView } from "./force-graph-view";
import { DagreGraphView } from "./dagre-graph-view";

type LayoutMode = "force" | "dagre";

// Type configuration for filter panel
const nodeTypeConfig: Record<NodesTypeOptions, { icon: React.ElementType; color: string; label: string }> = {
  [NodesTypeOptions.upload]: { icon: FileText, color: "#3b82f6", label: "Uploads" },
  [NodesTypeOptions.author]: { icon: User, color: "#9333ea", label: "Authors" },
  [NodesTypeOptions.tag]: { icon: Tag, color: "#22c55e", label: "Tags" },
  [NodesTypeOptions.topic]: { icon: FolderOpen, color: "#f97316", label: "Topics" },
  [NodesTypeOptions.highlight]: { icon: Highlighter, color: "#eab308", label: "Highlights" },
  [NodesTypeOptions.bookmark]: { icon: Bookmark, color: "#ef4444", label: "Bookmarks" },
  [NodesTypeOptions.note]: { icon: MessageSquare, color: "#6366f1", label: "Notes" },
};

const edgeTypeConfig: Record<EdgesTypeOptions, { color: string; label: string }> = {
  [EdgesTypeOptions.authored_by]: { color: "#9333ea", label: "Authored by" },
  [EdgesTypeOptions.tagged_with]: { color: "#22c55e", label: "Tagged with" },
  [EdgesTypeOptions.belongs_to]: { color: "#f97316", label: "Belongs to" },
  [EdgesTypeOptions.highlight_of]: { color: "#eab308", label: "Highlight of" },
  [EdgesTypeOptions.bookmark_of]: { color: "#ef4444", label: "Bookmark of" },
  [EdgesTypeOptions.note_of]: { color: "#6366f1", label: "Note of" },
  [EdgesTypeOptions.published_by]: { color: "#0ea5e9", label: "Published by" },
  [EdgesTypeOptions.about_person]: { color: "#d946ef", label: "About person" },
  [EdgesTypeOptions.links_to]: { color: "#14b8a6", label: "Links to" },
};

export function GraphCanvas() {
  const { data: graphData, isLoading, error } = useGraphData();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<NodesTypeOptions>>(new Set());
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<EdgesTypeOptions>>(new Set());
  const [showNodeFilters, setShowNodeFilters] = useState(true);
  const [showEdgeFilters, setShowEdgeFilters] = useState(false);

  // Get selected node data
  const selectedNode = useMemo((): EnrichedNodesResponse | null => {
    if (!selectedNodeId || !graphData?.nodes) return null;
    const node = (graphData.nodes as EnrichedNodesResponse[]).find((n) => n.id === selectedNodeId);
    return node || null;
  }, [selectedNodeId, graphData?.nodes]);

  const handleSelectNode = useCallback((nodeId: string) => {
    if (nodeId) {
      setSelectedNodeId(nodeId);
      setDetailDialogOpen(true);
    } else {
      setSelectedNodeId(null);
      setDetailDialogOpen(false);
    }
  }, []);

  // Count nodes by type
  const nodeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allNodes = (graphData?.nodes as EnrichedNodesResponse[]) || [];
    for (const node of allNodes) {
      const t = node.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [graphData?.nodes]);

  // Count edges by type
  const edgeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allEdges = (graphData?.edges as EdgesResponse[]) || [];
    for (const edge of allEdges) {
      const t = edge.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [graphData?.edges]);

  const toggleNodeType = useCallback((type: NodesTypeOptions) => {
    setHiddenNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((type: EdgesTypeOptions) => {
    setHiddenEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const showAllNodes = useCallback(() => setHiddenNodeTypes(new Set()), []);
  const hideAllNodes = useCallback(() => setHiddenNodeTypes(new Set(Object.values(NodesTypeOptions))), []);
  const showAllEdges = useCallback(() => setHiddenEdgeTypes(new Set()), []);
  const hideAllEdges = useCallback(() => setHiddenEdgeTypes(new Set(Object.values(EdgesTypeOptions))), []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-destructive">Failed to load graph data</p>
      </div>
    );
  }

  const allNodes = (graphData?.nodes as EnrichedNodesResponse[]) || [];
  const allEdges = (graphData?.edges as EdgesResponse[]) || [];

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {/* Left sidebar – filter controls */}
      <div className="w-64 border-r flex flex-col bg-background overflow-y-auto shrink-0">
        {/* Layout mode toggle */}
        <div className="p-3 border-b space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Layout</span>
          <div className="flex gap-1">
            <Button
              variant={layoutMode === "force" ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setLayoutMode("force")}
            >
              <Network className="h-3.5 w-3.5 mr-1" />
              Force
            </Button>
            <Button
              variant={layoutMode === "dagre" ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setLayoutMode("dagre")}
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              Dagre
            </Button>
          </div>
        </div>

        {/* Node type filters */}
        <div className="p-3 border-b space-y-2">
          <button
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full hover:text-foreground transition-colors"
            onClick={() => setShowNodeFilters(!showNodeFilters)}
          >
            {showNodeFilters ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Filter className="h-3 w-3" />
            Node Types
          </button>

          {showNodeFilters && (
            <>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={showAllNodes}>
                  Show all
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={hideAllNodes}>
                  Hide all
                </Button>
              </div>
              <div className="space-y-0.5">
                {Object.values(NodesTypeOptions).map((type) => {
                  const cfg = nodeTypeConfig[type];
                  const Icon = cfg.icon;
                  const isHidden = hiddenNodeTypes.has(type);
                  const count = nodeTypeCounts[type] || 0;

                  return (
                    <button
                      key={type}
                      onClick={() => toggleNodeType(type)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-all hover:bg-accent",
                        isHidden && "opacity-40",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.color }} />
                      <span className="flex-1 text-left truncate">{cfg.label}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 min-w-5 justify-center">
                        {count}
                      </Badge>
                      {isHidden ? (
                        <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Edge type filters */}
        <div className="p-3 space-y-2">
          <button
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full hover:text-foreground transition-colors"
            onClick={() => setShowEdgeFilters(!showEdgeFilters)}
          >
            {showEdgeFilters ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Filter className="h-3 w-3" />
            Edge Types
          </button>

          {showEdgeFilters && (
            <>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={showAllEdges}>
                  Show all
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={hideAllEdges}>
                  Hide all
                </Button>
              </div>
              <div className="space-y-0.5">
                {Object.values(EdgesTypeOptions).map((type) => {
                  const cfg = edgeTypeConfig[type];
                  const isHidden = hiddenEdgeTypes.has(type);
                  const count = edgeTypeCounts[type] || 0;

                  return (
                    <button
                      key={type}
                      onClick={() => toggleEdgeType(type)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-all hover:bg-accent",
                        isHidden && "opacity-40",
                      )}
                    >
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                      <span className="flex-1 text-left truncate">{cfg.label}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 min-w-5 justify-center">
                        {count}
                      </Badge>
                      {isHidden ? (
                        <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* Stats */}
        <div className="p-3 text-xs text-muted-foreground space-y-1 mt-auto">
          <div>
            {allNodes.length - hiddenNodeTypes.size * 0} nodes visible /{" "}
            {allNodes.filter((n) => !hiddenNodeTypes.has(n.type as NodesTypeOptions)).length} shown
          </div>
          <div>{allEdges.filter((e) => !hiddenEdgeTypes.has(e.type as EdgesTypeOptions)).length} edges shown</div>
        </div>
      </div>

      {/* Main graph area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {layoutMode === "force" ? (
          <ForceGraphView
            nodes={allNodes}
            edges={allEdges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            hiddenNodeTypes={hiddenNodeTypes}
            hiddenEdgeTypes={hiddenEdgeTypes}
          />
        ) : (
          <DagreGraphView
            nodes={allNodes}
            edges={allEdges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            hiddenNodeTypes={hiddenNodeTypes}
            hiddenEdgeTypes={hiddenEdgeTypes}
          />
        )}

        {/* Node detail dialog */}
        <NodeDetailDialog
          node={selectedNode}
          open={detailDialogOpen}
          onOpenChange={(open) => {
            setDetailDialogOpen(open);
            if (!open) setSelectedNodeId(null);
          }}
        />
      </div>
    </div>
  );
}
