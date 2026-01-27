import { useState, useMemo, useCallback } from "react";
import { useGraphData } from "@/lib/api/queries";
import { NodesTypeOptions, type EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { GraphToolbar, type ViewMode } from "./graph-toolbar";
import { NodeDetailDialog } from "./node-detail-dialog";
import { DagreGraphView } from "./dagre-graph-view";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Tag, FolderOpen, FileIcon, ChevronRight, ChevronDown, Search, Circle, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

// Types for the tree structure
export type GraphNodeData = {
  id: string;
  label: string;
  type: NodesTypeOptions;
  record?: string;
  record_data?: EnrichedNodesResponse["record_data"];
};

type TreeNode = GraphNodeData & {
  children: TreeNode[];
  edges: EdgesResponse[];
};

// Type configuration for icons and colors
const typeConfig: Partial<Record<NodesTypeOptions, { icon: React.ElementType; color: string; bgColor: string }>> = {
  [NodesTypeOptions.author]: {
    icon: User,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  [NodesTypeOptions.tag]: {
    icon: Tag,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  [NodesTypeOptions.topic]: {
    icon: FolderOpen,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  [NodesTypeOptions.upload]: {
    icon: FileIcon,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
  },
};

// Default edge color (edges don't have a type field in the schema)
const defaultEdgeColor = "bg-gray-500";

// Helper to get display label from enriched node
function getNodeLabel(node: EnrichedNodesResponse): string {
  if (node.record_data) {
    const data = node.record_data;
    // Try to get a meaningful label from the record data
    if ("title" in data && data.title) return data.title;
    if ("name" in data && data.name) return data.name;
    if ("label" in data && data.label) return data.label;
    if ("text" in data && data.text) return data.text.slice(0, 50) + (data.text.length > 50 ? "..." : "");
    if ("page" in data && data.page) return `Page ${data.page}`;
  }
  return node.record || "Untitled";
}

// Build tree structure from nodes and edges
function buildTree(
  nodes: EnrichedNodesResponse[],
  edges: EdgesResponse[],
  filterType: NodesTypeOptions | "all",
): TreeNode[] {
  // Create a map of nodes
  const nodeMap = new Map<string, TreeNode>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, {
      id: node.id,
      label: getNodeLabel(node),
      type: node.type as NodesTypeOptions,
      record: node.record,
      record_data: node.record_data,
      children: [],
      edges: [],
    });
  });

  // Track which nodes have parents
  const hasParent = new Set<string>();

  // Build parent-child relationships based on edges
  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode && targetNode) {
      // Add edge info to source
      sourceNode.edges.push(edge);

      // For hierarchical display, add target as child of source
      // Since edges don't have a type field, we treat all edges as parent-child relationships
      sourceNode.children.push(targetNode);
      hasParent.add(edge.target);
    }
  });

  // Get root nodes (nodes without parents)
  let roots = Array.from(nodeMap.values()).filter((node) => !hasParent.has(node.id));

  // Apply type filter
  if (filterType !== "all") {
    roots = roots.filter((node) => node.type === filterType);
  }

  // Sort roots by type then by label
  roots.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.label.localeCompare(b.label);
  });

  return roots;
}

// Tree node component
interface TreeItemProps {
  node: TreeNode;
  level: number;
  expanded: Set<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
  searchTerm: string;
}

function TreeItem({ node, level, expanded, selected, onToggle, onSelect, searchTerm }: TreeItemProps) {
  const config = typeConfig[node.type] ?? typeConfig[NodesTypeOptions.upload]!;
  const Icon = config.icon;
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selected === node.id;

  // Check if node matches search
  const matchesSearch =
    !searchTerm ||
    node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.type.toLowerCase().includes(searchTerm.toLowerCase());

  // Check if any child matches search
  const childMatchesSearch = (n: TreeNode): boolean => {
    if (n.label.toLowerCase().includes(searchTerm.toLowerCase())) return true;
    return n.children.some(childMatchesSearch);
  };

  const shouldShow = matchesSearch || childMatchesSearch(node);

  if (!shouldShow) return null;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50",
          isSelected && "bg-muted ring-1 ring-primary",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        ) : (
          <span className="w-5" />
        )}

        <div className={cn("p-1 rounded", config.bgColor)}>
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
        </div>

        <span
          className={cn("text-sm truncate flex-1", matchesSearch && searchTerm && "font-medium")}
          title={node.label}
        >
          {node.label}
        </span>

        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {node.type}
        </Badge>

        {node.edges.length > 0 && (
          <div className="flex gap-0.5 ml-1">
            {node.edges.slice(0, 3).map((_, i) => (
              <div key={i} className={cn("w-1.5 h-1.5 rounded-full", defaultEdgeColor)} title="Connection" />
            ))}
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Group header component
interface GroupHeaderProps {
  type: NodesTypeOptions;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

function GroupHeader({ type, count, expanded, onToggle }: GroupHeaderProps) {
  const config = typeConfig[type] ?? typeConfig[NodesTypeOptions.upload]!;
  const Icon = config.icon;

  return (
    <button
      className="flex items-center gap-2 w-full py-2 px-3 hover:bg-muted/50 rounded-md transition-colors"
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      <div className={cn("p-1.5 rounded", config.bgColor)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <span className="text-sm font-medium capitalize">{type}s</span>
      <Badge variant="secondary" className="ml-auto text-xs">
        {count}
      </Badge>
    </button>
  );
}

export function GraphCanvas() {
  const { data: graphData, isLoading, error } = useGraphData();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<NodesTypeOptions | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<NodesTypeOptions>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("tree");

  // Build tree structure
  const treeData = useMemo(() => {
    if (!graphData?.nodes || !graphData?.edges) return [];
    return buildTree(graphData.nodes as EnrichedNodesResponse[], graphData.edges as EdgesResponse[], filterType);
  }, [graphData?.nodes, graphData?.edges, filterType]);

  // Group nodes by type for grouped view
  const groupedNodes = useMemo(() => {
    const groups: Record<NodesTypeOptions, TreeNode[]> = {} as Record<NodesTypeOptions, TreeNode[]>;
    treeData.forEach((node) => {
      if (!groups[node.type]) {
        groups[node.type] = [];
      }
      groups[node.type].push(node);
    });
    return groups;
  }, [treeData]);

  // Get selected node data
  const selectedNode = useMemo((): EnrichedNodesResponse | null => {
    if (!selectedNodeId || !graphData?.nodes) return null;
    const node = (graphData.nodes as EnrichedNodesResponse[]).find((n) => n.id === selectedNodeId);
    return node || null;
  }, [selectedNodeId, graphData?.nodes]);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Open detail dialog when a node is selected
  const handleSelectNode = useCallback((node: TreeNode) => {
    setSelectedNodeId(node.id);
    setDetailDialogOpen(true);
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((type: NodesTypeOptions) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const addIds = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length > 0) {
          allIds.add(node.id);
          addIds(node.children);
        }
      });
    };
    addIds(treeData);
    setExpanded(allIds);
    setCollapsedGroups(new Set());
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
    setCollapsedGroups(new Set(Object.keys(groupedNodes) as NodesTypeOptions[]));
  }, [groupedNodes]);

  // Stats
  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = graphData?.edges?.length || 0;

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

  return (
    <div className="flex-1 h-full flex gap-4 p-4 overflow-hidden">
      {/* Left sidebar - Toolbar */}
      <GraphToolbar
        filterType={filterType}
        onFilterChange={setFilterType}
        nodeCount={nodeCount}
        edgeCount={edgeCount}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Main content - Tree view or Graph view */}
      {viewMode === "tree" ? (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search nodes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          <CardContent className="flex-1 overflow-auto p-2">
            {treeData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <GitBranch className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm">No nodes found</p>
                <p className="text-xs">
                  {filterType !== "all" ? "Try changing the filter" : "Add some content to see your knowledge graph"}
                </p>
              </div>
            ) : filterType === "all" ? (
              // Grouped view when no filter
              <div className="space-y-1">
                {(Object.entries(groupedNodes) as [NodesTypeOptions, TreeNode[]][]).map(([type, nodes]) => (
                  <div key={type}>
                    <GroupHeader
                      type={type}
                      count={nodes.length}
                      expanded={!collapsedGroups.has(type)}
                      onToggle={() => toggleGroup(type)}
                    />
                    {!collapsedGroups.has(type) && (
                      <div className="ml-2">
                        {nodes.map((node) => (
                          <TreeItem
                            key={node.id}
                            node={node}
                            level={0}
                            expanded={expanded}
                            selected={selectedNodeId}
                            onToggle={toggleExpanded}
                            onSelect={handleSelectNode}
                            searchTerm={searchTerm}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Flat tree when filtered
              <div className="space-y-0.5">
                {treeData.map((node) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    level={0}
                    expanded={expanded}
                    selected={selectedNodeId}
                    onToggle={toggleExpanded}
                    onSelect={handleSelectNode}
                    searchTerm={searchTerm}
                  />
                ))}
              </div>
            )}
          </CardContent>

          {/* Footer with stats */}
          <div className="p-2 border-t flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Circle className="h-3 w-3 fill-current" />
                {treeData.length} visible
              </span>
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {edgeCount} connections
              </span>
            </div>
            {searchTerm && <span className="text-muted-foreground">Filtering by "{searchTerm}"</span>}
          </div>
        </Card>
      ) : (
        <DagreGraphView
          nodes={(graphData?.nodes as EnrichedNodesResponse[]) || []}
          edges={(graphData?.edges as EdgesResponse[]) || []}
          filterType={filterType}
          selectedNodeId={selectedNodeId}
          onSelectNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setDetailDialogOpen(true);
          }}
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
  );
}
