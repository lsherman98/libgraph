import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRow, TableCell } from "@/components/ui/table";
import { FileText, Pencil, Trash2, Link2 } from "lucide-react";
import type { UploadsResponse } from "@/lib/pocketbase-types";
import { typeIcons, statusConfig } from "./constants";

export function DocumentRow({
  upload,
  onEdit,
  onDelete,
  selected,
  onSelect,
}: {
  upload: UploadsResponse;
  onEdit: () => void;
  onDelete: () => void;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const TypeIcon = typeIcons[upload.type] || FileText;
  const status = statusConfig[upload.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;

  const isClickable = upload.status === "SUCCESS";
  const linkedCount = upload.uploads?.length || 0;

  return (
    <TableRow
      className={isClickable ? "cursor-pointer hover:bg-muted/50" : "opacity-75"}
      onClick={() => {
        if (isClickable) {
          navigate({ to: "/workspace", search: { id: upload.id, type: "upload" } });
        }
      }}
    >
      {onSelect !== undefined && (
        <TableCell className="w-10 pr-0">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(!!checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${upload.title || "document"}`}
          />
        </TableCell>
      )}
      <TableCell className="max-w-0 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0 overflow-hidden">
            <span className="font-medium truncate block">{upload.title || "Untitled"}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">{upload.type}</span>
              {linkedCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  {linkedCount} linked
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      {upload.status !== "SUCCESS" && (
        <TableCell>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${status.className}`} />
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </TableCell>
      )}
      {upload.status === "SUCCESS" && <TableCell />}
      <TableCell className="text-muted-foreground">
        {new Date(upload.created).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
