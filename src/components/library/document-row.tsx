import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRow, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Pencil, Trash2, Link2, Library } from "lucide-react";
import { DownloadButton } from "@/components/reader/download-button";
import type { UploadsResponse } from "@/lib/pocketbase-types";
import { typeIcons, statusConfig } from "./constants";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wma", ".webm", ".mp4"]);

function isAudioFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return AUDIO_EXTENSIONS.has(ext);
}

export function DocumentRow({
  upload,
  onEdit,
  onDelete,
  onAddToCollection,
  personNamesById,
  publicationNamesById,
  tagTitlesById,
  selected,
  onSelect,
}: {
  upload: UploadsResponse;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCollection?: () => void;
  personNamesById: Map<string, string>;
  publicationNamesById: Map<string, string>;
  tagTitlesById: Map<string, string>;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const TypeIcon = typeIcons[upload.type] || FileText;
  const status = statusConfig[upload.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const isClickable = upload.status === "success";
  const isProcessing = upload.status === "processing" || upload.status === "failed";
  const linkedCount = upload.uploads?.length || 0;
  const formatNames = (ids?: string[], lookup?: Map<string, string>) => {
    if (!ids?.length || !lookup) return "—";

    const names = ids.map((id) => lookup.get(id) || id);
    const visibleNames = names.slice(0, 2).join(", ");
    const remainingCount = names.length - 2;

    return remainingCount > 0 ? `${visibleNames} +${remainingCount}` : visibleNames;
  };
  const authorName = upload.author ? personNamesById.get(upload.author) || upload.author : "—";
  const publicationName = upload.publication ? publicationNamesById.get(upload.publication) || upload.publication : "—";

  return (
    <TableRow className={`${isClickable ? "hover:bg-muted/50" : ""} ${isProcessing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}>
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
      <TableCell className="overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0 overflow-hidden flex-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium truncate block w-full text-left">{upload.title || "Untitled"}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {upload.title || "Untitled"}
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2 mt-0.5 min-w-0 flex-wrap">
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
      <TableCell className="hidden lg:table-cell">
        <span className="block text-sm truncate text-muted-foreground">{authorName}</span>
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <span className="block text-sm truncate text-muted-foreground">{formatNames(upload.people, personNamesById)}</span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="block text-sm truncate text-muted-foreground">{publicationName}</span>
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block text-sm truncate text-muted-foreground text-left">{formatNames(upload.tags, tagTitlesById)}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs wrap-break-word">
            {upload.tags?.length ? upload.tags.map((id) => tagTitlesById.get(id) || id).join(", ") : "—"}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-muted-foreground hidden md:table-cell pr-6">
        {new Date(upload.created).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </TableCell>
      <TableCell className="w-64">
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {upload.status === "processing" || upload.status === "failed" ? (
            <div className="mr-1 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <StatusIcon className={`h-4 w-4 ${status.className}`} />
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                onSelect?.(true);
                if (isClickable) {
                  navigate({ to: "/workspace", search: { id: upload.id, type: "upload" } });
                }
              }}
              disabled={!isClickable}
            >
              Open
            </Button>
          )}
          <DownloadButton upload={upload} isAudioFile={upload.file ? isAudioFile(upload.file) : false} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCollection?.();
            }}
            disabled={!isClickable}
          >
            <Library className="h-4 w-4" />
          </Button>
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
