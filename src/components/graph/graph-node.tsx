import { memo } from "react";
import { Handle, Position, type Node } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, User, Tag, FolderOpen, Highlighter, Bookmark, FileIcon } from "lucide-react";
import { NodesTypeOptions } from "@/lib/pocketbase-types";

export type GraphNodeData = {
  label: string;
  type: NodesTypeOptions;
  record?: string;
};

export type GraphNodeType = Node<GraphNodeData, "graphNode">;

const typeConfig: Record<NodesTypeOptions, { icon: React.ElementType; color: string; bgColor: string }> = {
  [NodesTypeOptions.upload]: {
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
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
  [NodesTypeOptions.highlight]: {
    icon: Highlighter,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  [NodesTypeOptions.bookmark]: {
    icon: Bookmark,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  [NodesTypeOptions.page]: {
    icon: FileIcon,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
  [NodesTypeOptions.file]: {
    icon: FileIcon,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
  },
};

interface GraphNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

function GraphNode({ data, selected }: GraphNodeProps) {
  const config = typeConfig[data.type] || typeConfig[NodesTypeOptions.file];
  const Icon = config.icon;

  return (
    <>
      <Handle type="target" position={Position.Top} className="bg-muted-foreground!" />
      <Card
        className={`min-w-37.5 max-w-62.5 transition-all ${selected ? "ring-2 ring-primary shadow-lg" : "shadow-sm"}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className={`p-1.5 rounded ${config.bgColor}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={data.label}>
                {data.label || "Untitled"}
              </p>
              <Badge variant="outline" className="text-xs mt-1">
                {data.type}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Bottom} className="bg-muted-foreground!" />
    </>
  );
}

export default memo(GraphNode);
