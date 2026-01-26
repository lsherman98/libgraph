import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCreateEdge } from "@/lib/api/mutations";
import { EdgesTypeOptions, type NodesResponse } from "@/lib/pocketbase-types";

interface AddEdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: NodesResponse[];
}

const edgeTypeLabels: Record<EdgesTypeOptions, string> = {
  [EdgesTypeOptions.authored_by]: "Authored By",
  [EdgesTypeOptions.tagged_with]: "Tagged With",
  [EdgesTypeOptions.belongs_to]: "Belongs To",
  [EdgesTypeOptions.references]: "References",
  [EdgesTypeOptions.contains]: "Contains",
  [EdgesTypeOptions.related_to]: "Related To",
  [EdgesTypeOptions.highlight_of]: "Highlight Of",
  [EdgesTypeOptions.bookmark_of]: "Bookmark Of",
  [EdgesTypeOptions.user_created]: "Custom Connection",
};

export function AddEdgeDialog({ open, onOpenChange, nodes }: AddEdgeDialogProps) {
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [edgeType, setEdgeType] = useState<EdgesTypeOptions>(EdgesTypeOptions.related_to);

  const createEdgeMutation = useCreateEdge();

  const handleSubmit = () => {
    if (!sourceId || !targetId) return;

    createEdgeMutation.mutate(
      {
        source: sourceId,
        target: targetId,
        type: edgeType,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSourceId("");
          setTargetId("");
          setEdgeType(EdgesTypeOptions.related_to);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Connection</DialogTitle>
          <DialogDescription>Create a new connection between two nodes in your knowledge graph.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source">From (Source)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source node" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">[{node.type}]</span>
                      {node.name || "Untitled"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Connection Type</Label>
            <Select value={edgeType} onValueChange={(v) => setEdgeType(v as EdgesTypeOptions)}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Select connection type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(edgeTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target">To (Target)</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="target">
                <SelectValue placeholder="Select target node" />
              </SelectTrigger>
              <SelectContent>
                {nodes
                  .filter((node) => node.id !== sourceId)
                  .map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">[{node.type}]</span>
                        {node.name || "Untitled"}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!sourceId || !targetId || createEdgeMutation.isPending}>
            {createEdgeMutation.isPending ? "Creating..." : "Create Connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
