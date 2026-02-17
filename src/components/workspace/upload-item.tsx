import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, X } from "lucide-react";
import type { UploadsResponse } from "@/lib/pocketbase-types";

interface UploadItemProps {
  upload: UploadsResponse;
  onUnlink: () => void;
  onOpen: () => void;
}

export function UploadItem({ upload, onUnlink, onOpen }: UploadItemProps) {
  return (
    <div className="group rounded-md border bg-card p-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{upload.title}</p>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {upload.type}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={onOpen} title="Open document">
          <ExternalLink className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUnlink} title="Remove from project">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
