import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Trash2, ExternalLink } from "lucide-react";
import { type GraphNodeType } from "./graph-node";
import { NodesTypeOptions } from "@/lib/pocketbase-types";
import { Link } from "@tanstack/react-router";

interface GraphNodeDetailsProps {
  node: GraphNodeType;
  onClose: () => void;
  onDelete: () => void;
}

const typeRoutes: Partial<Record<NodesTypeOptions, string>> = {
  [NodesTypeOptions.upload]: "/reader",
  [NodesTypeOptions.highlight]: "/reader",
  [NodesTypeOptions.bookmark]: "/reader",
};

export function GraphNodeDetails({ node, onClose, onDelete }: GraphNodeDetailsProps) {
  const { data } = node;
  const route = typeRoutes[data.type];

  return (
    <Card className="w-64 shadow-lg">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Node Details</CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Name</p>
          <p className="text-sm font-medium truncate" title={data.label}>
            {data.label || "Untitled"}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Type</p>
          <Badge variant="secondary" className="mt-1">
            {data.type}
          </Badge>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Node ID</p>
          <p className="text-xs font-mono text-muted-foreground truncate" title={node.id}>
            {node.id}
          </p>
        </div>

        {data.record && (
          <div>
            <p className="text-xs text-muted-foreground">Record ID</p>
            <p className="text-xs font-mono text-muted-foreground truncate" title={data.record}>
              {data.record}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t">
          {route && data.record && (
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <Link to={route} search={{ uploadId: data.record }}>
                <ExternalLink className="h-3 w-3 mr-1" />
                View
              </Link>
            </Button>
          )}
          <Button variant="destructive" size="sm" className="flex-1" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
