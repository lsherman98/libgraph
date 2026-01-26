import { useCallback, useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  Panel,
  MarkerType,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphData } from "@/lib/api/queries";
import { useCreateEdge, useDeleteEdge, useDeleteNode } from "@/lib/api/mutations";
import GraphNode, { type GraphNodeType } from "./graph-node";
import { NodesTypeOptions, EdgesTypeOptions, type NodesResponse, type EdgesResponse } from "@/lib/pocketbase-types";
import { Skeleton } from "@/components/ui/skeleton";
import { GraphToolbar } from "./graph-toolbar";
import { GraphNodeDetails } from "./graph-node-details";
import { AddEdgeDialog } from "./add-edge-dialog";

const nodeTypes: NodeTypes = {
  graphNode: GraphNode,
};

// Color mapping for edge types
const edgeTypeColors: Record<EdgesTypeOptions, string> = {
  [EdgesTypeOptions.authored_by]: "#9333ea", // purple
  [EdgesTypeOptions.tagged_with]: "#22c55e", // green
  [EdgesTypeOptions.belongs_to]: "#f97316", // orange
  [EdgesTypeOptions.references]: "#3b82f6", // blue
  [EdgesTypeOptions.contains]: "#6b7280", // gray
  [EdgesTypeOptions.related_to]: "#ec4899", // pink
  [EdgesTypeOptions.highlight_of]: "#eab308", // yellow
  [EdgesTypeOptions.bookmark_of]: "#ef4444", // red
  [EdgesTypeOptions.user_created]: "#14b8a6", // teal
};

function transformNodesToFlow(nodes: NodesResponse[]): GraphNodeType[] {
  // Simple grid layout - will be improved with force-directed layout
  const cols = Math.ceil(Math.sqrt(nodes.length));

  return nodes.map((node, index) => ({
    id: node.id,
    type: "graphNode" as const,
    position: {
      x: (index % cols) * 280 + 50,
      y: Math.floor(index / cols) * 150 + 50,
    },
    data: {
      label: node.name || "Untitled",
      type: node.type as NodesTypeOptions,
      record: node.record,
    },
  }));
}

function transformEdgesToFlow(edges: EdgesResponse[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "default",
    animated: edge.type === EdgesTypeOptions.user_created,
    style: {
      stroke: edgeTypeColors[edge.type as EdgesTypeOptions] || "#6b7280",
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edgeTypeColors[edge.type as EdgesTypeOptions] || "#6b7280",
    },
    label: edge.type?.replace(/_/g, " "),
    labelStyle: {
      fontSize: 10,
      fill: "#6b7280",
    },
    labelBgStyle: {
      fill: "white",
      fillOpacity: 0.8,
    },
  }));
}

export function GraphCanvas() {
  const { data: graphData, isLoading, error } = useGraphData();
  const createEdgeMutation = useCreateEdge();
  const deleteEdgeMutation = useDeleteEdge();
  const deleteNodeMutation = useDeleteNode();

  const [selectedNode, setSelectedNode] = useState<GraphNodeType | null>(null);
  const [showAddEdgeDialog, setShowAddEdgeDialog] = useState(false);
  const [filterType, setFilterType] = useState<NodesTypeOptions | "all">("all");

  // Transform data for React Flow
  const initialNodes = useMemo(() => {
    if (!graphData?.nodes) return [];
    const nodes = filterType === "all" ? graphData.nodes : graphData.nodes.filter((n) => n.type === filterType);
    return transformNodesToFlow(nodes as NodesResponse[]);
  }, [graphData?.nodes, filterType]);

  const initialEdges = useMemo(() => {
    if (!graphData?.edges) return [];
    // Filter edges to only show those between visible nodes
    const visibleNodeIds = new Set(initialNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
    return transformEdgesToFlow(filteredEdges as EdgesResponse[]);
  }, [graphData?.edges, initialNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        // Create edge in database
        createEdgeMutation.mutate({
          source: params.source,
          target: params.target,
          type: EdgesTypeOptions.user_created,
        });

        // Optimistically add to UI
        setEdges((eds) =>
          addEdge(
            {
              ...params,
              type: "default",
              animated: true,
              style: { stroke: edgeTypeColors[EdgesTypeOptions.user_created], strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: edgeTypeColors[EdgesTypeOptions.user_created],
              },
            },
            eds,
          ),
        );
      }
    },
    [createEdgeMutation, setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: GraphNodeType) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNodeMutation.mutate(nodeId);
      setSelectedNode(null);
    },
    [deleteNodeMutation],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      deleteEdgeMutation.mutate(edgeId);
    },
    [deleteEdgeMutation],
  );

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
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        deleteKeyCode={["Backspace", "Delete"]}
        onEdgesDelete={(deletedEdges) => {
          deletedEdges.forEach((edge) => handleDeleteEdge(edge.id));
        }}
      >
        <Background />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable className="bg-muted!" />
        <Panel position="top-left">
          <GraphToolbar
            filterType={filterType}
            onFilterChange={setFilterType}
            onAddEdge={() => setShowAddEdgeDialog(true)}
            nodeCount={nodes.length}
            edgeCount={edges.length}
          />
        </Panel>
        {selectedNode && (
          <Panel position="top-right">
            <GraphNodeDetails
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onDelete={() => handleDeleteNode(selectedNode.id)}
            />
          </Panel>
        )}
      </ReactFlow>

      <AddEdgeDialog
        open={showAddEdgeDialog}
        onOpenChange={setShowAddEdgeDialog}
        nodes={(graphData?.nodes as NodesResponse[]) || []}
      />
    </div>
  );
}
