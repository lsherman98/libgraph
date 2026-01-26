import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, GitBranch, Circle } from "lucide-react";
import { NodesTypeOptions } from "@/lib/pocketbase-types";

interface GraphToolbarProps {
  filterType: NodesTypeOptions | "all";
  onFilterChange: (type: NodesTypeOptions | "all") => void;
  onAddEdge: () => void;
  nodeCount: number;
  edgeCount: number;
}

const nodeTypeLabels: Record<NodesTypeOptions | "all", string> = {
  all: "All Types",
  [NodesTypeOptions.upload]: "Uploads",
  [NodesTypeOptions.author]: "Authors",
  [NodesTypeOptions.tag]: "Tags",
  [NodesTypeOptions.topic]: "Topics",
  [NodesTypeOptions.highlight]: "Highlights",
  [NodesTypeOptions.bookmark]: "Bookmarks",
  [NodesTypeOptions.page]: "Pages",
  [NodesTypeOptions.file]: "Files",
};

export function GraphToolbar({ filterType, onFilterChange, onAddEdge, nodeCount, edgeCount }: GraphToolbarProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Knowledge Graph
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={(v) => onFilterChange(v as NodesTypeOptions | "all")}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(nodeTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" variant="outline" className="w-full" onClick={onAddEdge}>
          <Plus className="h-4 w-4 mr-1" />
          Add Connection
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
          <div className="flex items-center gap-1">
            <Circle className="h-3 w-3 fill-current" />
            <span>{nodeCount} nodes</span>
          </div>
          <div className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            <span>{edgeCount} edges</span>
          </div>
        </div>

        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground mb-1">Legend:</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <Badge variant="outline" className="text-purple-600 border-purple-300">
              authored
            </Badge>
            <Badge variant="outline" className="text-green-600 border-green-300">
              tagged
            </Badge>
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              belongs to
            </Badge>
            <Badge variant="outline" className="text-blue-600 border-blue-300">
              references
            </Badge>
            <Badge variant="outline" className="text-yellow-600 border-yellow-300">
              highlight
            </Badge>
            <Badge variant="outline" className="text-red-600 border-red-300">
              bookmark
            </Badge>
            <Badge variant="outline" className="text-teal-600 border-teal-300">
              custom
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
