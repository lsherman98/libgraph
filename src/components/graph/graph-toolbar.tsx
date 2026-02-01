import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Circle, Network, Sparkles } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ViewMode = "graph" | "pixi";

interface GraphToolbarProps {
  nodeCount: number;
  edgeCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function GraphToolbar({ nodeCount, edgeCount, viewMode, onViewModeChange }: GraphToolbarProps) {
  return (
    <Card className="shadow-lg w-56 shrink-0">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Knowledge Graph
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        {/* View Mode Toggle */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">View</p>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
            className="justify-start flex-wrap"
          >
            <ToggleGroupItem value="graph" aria-label="Graph view" className="flex-1">
              <Network className="h-4 w-4 mr-1" />
              Graph
            </ToggleGroupItem>
            <ToggleGroupItem value="pixi" aria-label="Pixi view" className="flex-1">
              <Sparkles className="h-4 w-4 mr-1" />
              Pixi
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

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
