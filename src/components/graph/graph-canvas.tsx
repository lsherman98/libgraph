import { useState, useMemo, useCallback } from "react";
import { useGraphData } from "@/lib/api/queries";
import type { UploadFilters } from "@/lib/api/api";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import { NodesTypeOptions, EdgesTypeOptions } from "@/lib/pocketbase-types";
import type { HighlightsRecord, BookmarksRecord, NotesRecord } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse, UploadNodeData } from "@/lib/types";
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
  ChevronDown,
  ChevronRight,
  Filter,
  PanelLeftClose,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ForceGraphView, type NodePreviewRequest } from "./force-graph-view";
import { PreviewDialog } from "@/components/workspace/preview-dialog";
import { GraphFiltersPanel } from "./graph-filters-panel";

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

  const [uploadFilters, setUploadFilters] = useState<UploadFilters>({});
  const debouncedSearch = useDebounce(uploadFilters.search, 300);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<NodesTypeOptions>>(new Set());
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<EdgesTypeOptions>>(new Set());
  const [showNodeFilters, setShowNodeFilters] = useState(true);
  const [showEdgeFilters, setShowEdgeFilters] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"highlight" | "bookmark" | "note" | "source" | "upload">("upload");
  const [previewItem, setPreviewItem] = useState<HighlightsRecord | BookmarksRecord | NotesRecord | null>(null);
  const [previewUploadId, setPreviewUploadId] = useState<string | undefined>();
  const [previewUploadTitle, setPreviewUploadTitle] = useState<string | undefined>();
  const [previewPageNumber, setPreviewPageNumber] = useState<number | undefined>();

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      if (!nodeId || nodeId === selectedNodeId) {
        setSelectedNodeId(null);
      } else {
        setSelectedNodeId(nodeId);
      }
    },
    [selectedNodeId],
  );

  const handlePreviewNode = useCallback((request: NodePreviewRequest) => {
    const { nodeType, uploadId, uploadTitle, pageNumber, recordData } = request;

    if (nodeType === NodesTypeOptions.upload) {
      setPreviewType("upload");
      setPreviewItem(null);
      setPreviewUploadId(uploadId);
      setPreviewUploadTitle(uploadTitle);
      setPreviewPageNumber(1);
    } else if (nodeType === NodesTypeOptions.highlight || nodeType === NodesTypeOptions.bookmark || nodeType === NodesTypeOptions.note) {
      setPreviewType(nodeType as "highlight" | "bookmark" | "note");
      setPreviewItem((recordData as HighlightsRecord | BookmarksRecord | NotesRecord) ?? null);
      setPreviewUploadId(uploadId);
      setPreviewUploadTitle(undefined);
      setPreviewPageNumber(pageNumber);
    } else {
      return;
    }

    setPreviewOpen(true);
  }, []);

  const nodeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allNodes = (graphData?.nodes as EnrichedNodesResponse[]) || [];
    for (const node of allNodes) {
      const t = node.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [graphData?.nodes]);

  const edgeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const allEdges = (graphData?.edges as EdgesResponse[]) || [];
    for (const edge of allEdges) {
      const t = edge.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [graphData?.edges]);

  // Client-side filtering of graph nodes based on UploadFilters
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const allNodes = (graphData?.nodes as EnrichedNodesResponse[]) || [];
    const allEdges = (graphData?.edges as EdgesResponse[]) || [];

    const hasUploadFilters =
      debouncedSearch ||
      (uploadFilters.type?.length ?? 0) > 0 ||
      (uploadFilters.status?.length ?? 0) > 0 ||
      (uploadFilters.tags?.length ?? 0) > 0 ||
      (uploadFilters.topics?.length ?? 0) > 0 ||
      (uploadFilters.people?.length ?? 0) > 0 ||
      !!uploadFilters.publication;

    if (!hasUploadFilters) {
      return { filteredNodes: allNodes, filteredEdges: allEdges };
    }

    // Build a lookup: record_id -> node id (for tags/topics/people/publications)
    const recordIdToNodeId = new Map<string, string>();
    for (const node of allNodes) {
      if (node.record_id) {
        recordIdToNodeId.set(node.record_id, node.id);
      }
    }

    // Build adjacency from edges: node id -> Set of connected node ids
    const nodeEdgeMap = new Map<string, Set<string>>();
    for (const edge of allEdges) {
      if (!nodeEdgeMap.has(edge.source)) nodeEdgeMap.set(edge.source, new Set());
      if (!nodeEdgeMap.has(edge.target)) nodeEdgeMap.set(edge.target, new Set());
      nodeEdgeMap.get(edge.source)!.add(edge.target);
      nodeEdgeMap.get(edge.target)!.add(edge.source);
    }

    // Find upload node IDs connected to selected filter entities
    const getUploadNodeIdsConnectedTo = (recordIds: string[]): Set<string> => {
      const connectedUploadNodeIds = new Set<string>();
      for (const recordId of recordIds) {
        const filterNodeId = recordIdToNodeId.get(recordId);
        if (!filterNodeId) continue;
        const neighbors = nodeEdgeMap.get(filterNodeId);
        if (!neighbors) continue;
        for (const neighborId of neighbors) {
          connectedUploadNodeIds.add(neighborId);
        }
      }
      return connectedUploadNodeIds;
    };

    // Determine which upload nodes pass all active filters (AND logic across filter categories)
    const passingUploadNodeIds = new Set<string>();

    for (const node of allNodes) {
      if (node.type !== NodesTypeOptions.upload) continue;

      const data = node.data as UploadNodeData | null | undefined;
      let passes = true;

      // Search filter
      if (debouncedSearch) {
        const search = debouncedSearch.toLowerCase();
        const title = (data?.title || node.label || "").toLowerCase();
        if (!title.includes(search)) {
          passes = false;
        }
      }

      // Type filter
      if (passes && uploadFilters.type && uploadFilters.type.length > 0) {
        if (!data?.type || !uploadFilters.type.includes(data.type)) {
          passes = false;
        }
      }

      // Status filter
      if (passes && uploadFilters.status && uploadFilters.status.length > 0) {
        if (!data?.status || !uploadFilters.status.includes(data.status)) {
          passes = false;
        }
      }

      // Tags filter (OR within category: upload must be connected to at least one selected tag)
      if (passes && uploadFilters.tags && uploadFilters.tags.length > 0) {
        const connectedToTags = getUploadNodeIdsConnectedTo(uploadFilters.tags);
        if (!connectedToTags.has(node.id)) {
          passes = false;
        }
      }

      // Topics filter
      if (passes && uploadFilters.topics && uploadFilters.topics.length > 0) {
        const connectedToTopics = getUploadNodeIdsConnectedTo(uploadFilters.topics);
        if (!connectedToTopics.has(node.id)) {
          passes = false;
        }
      }

      // People filter
      if (passes && uploadFilters.people && uploadFilters.people.length > 0) {
        const connectedToPeople = getUploadNodeIdsConnectedTo(uploadFilters.people);
        if (!connectedToPeople.has(node.id)) {
          passes = false;
        }
      }

      // Publication filter
      if (passes && uploadFilters.publication) {
        const connectedToPub = getUploadNodeIdsConnectedTo([uploadFilters.publication]);
        if (!connectedToPub.has(node.id)) {
          passes = false;
        }
      }

      if (passes) {
        passingUploadNodeIds.add(node.id);
      }
    }

    // Collect all node IDs that should remain visible:
    // - Upload nodes that pass filters
    // - Non-upload nodes that are connected to at least one passing upload node
    const visibleNodeIds = new Set<string>();
    for (const id of passingUploadNodeIds) {
      visibleNodeIds.add(id);
    }
    for (const node of allNodes) {
      if (node.type === NodesTypeOptions.upload) continue;
      const neighbors = nodeEdgeMap.get(node.id);
      if (!neighbors) continue;
      for (const neighborId of neighbors) {
        if (passingUploadNodeIds.has(neighborId)) {
          visibleNodeIds.add(node.id);
          break;
        }
      }
    }

    const fNodes = allNodes.filter((n) => visibleNodeIds.has(n.id));
    const fEdges = allEdges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    return { filteredNodes: fNodes, filteredEdges: fEdges };
  }, [graphData?.nodes, graphData?.edges, debouncedSearch, uploadFilters]);

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

  const hasActiveUploadFilters =
    Object.keys(uploadFilters).filter((k) => k !== "sortBy" && k !== "sortOrder" && uploadFilters[k as keyof UploadFilters]).length > 0;

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {isFiltersPanelOpen && (
        <GraphFiltersPanel filters={uploadFilters} onFiltersChange={setUploadFilters} onClose={() => setIsFiltersPanelOpen(false)} />
      )}
      {sidebarOpen && (
        <div className="w-64 border-r flex flex-col bg-background overflow-y-auto shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Graph</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Content Filters toggle */}
          <div className="p-3 border-b">
            <Button
              variant={isFiltersPanelOpen ? "secondary" : "outline"}
              size="sm"
              className="w-full gap-2"
              onClick={() => setIsFiltersPanelOpen(!isFiltersPanelOpen)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Content Filters
              {hasActiveUploadFilters && (
                <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
                  {Object.keys(uploadFilters).filter((k) => k !== "sortBy" && k !== "sortOrder" && uploadFilters[k as keyof UploadFilters]).length}
                </Badge>
              )}
            </Button>
            {hasActiveUploadFilters && (
              <div className="text-xs text-muted-foreground mt-2">
                Showing {filteredNodes.length} of {allNodes.length} nodes
              </div>
            )}
          </div>

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
          <div className="p-3 text-xs text-muted-foreground space-y-1 mt-auto">
            <div>
              {allNodes.length - hiddenNodeTypes.size * 0} nodes visible /{" "}
              {filteredNodes.filter((n) => !hiddenNodeTypes.has(n.type as NodesTypeOptions)).length} shown
            </div>
            <div>{filteredEdges.filter((e) => !hiddenEdgeTypes.has(e.type as EdgesTypeOptions)).length} edges shown</div>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {!sidebarOpen && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-2 left-2 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        )}
        <ForceGraphView
          nodes={filteredNodes}
          edges={filteredEdges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onPreviewNode={handlePreviewNode}
          hiddenNodeTypes={hiddenNodeTypes}
          hiddenEdgeTypes={hiddenEdgeTypes}
        />
        <PreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          type={previewType}
          item={previewItem}
          uploadId={previewUploadId}
          uploadTitle={previewUploadTitle}
          pageNumber={previewPageNumber}
        />
      </div>
    </div>
  );
}
