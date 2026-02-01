import { useState, useMemo, useCallback } from "react";
import { useGraphData } from "@/lib/api/queries";
import type { EdgesResponse } from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NodeDetailDialog } from "./node-detail-dialog";
import { ForceGraphView } from "./force-graph-view";

export function GraphCanvas() {
  const { data: graphData, isLoading, error } = useGraphData();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

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
    <div className="flex-1 h-full flex flex-col p-4 overflow-hidden">
      {/* Graph view */}
      <ForceGraphView
        nodes={(graphData?.nodes as EnrichedNodesResponse[]) || []}
        edges={(graphData?.edges as EdgesResponse[]) || []}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
      />

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
