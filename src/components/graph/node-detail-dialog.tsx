import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  User,
  Tag,
  FolderOpen,
  Highlighter,
  Bookmark,
  FileIcon,
  ExternalLink,
  Calendar,
  Hash,
  MessageSquare,
  Palette,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  NodesTypeOptions,
  type UploadsResponse,
  type HighlightsResponse,
  type BookmarksResponse,
  type AuthorsResponse,
  type TagsResponse,
  type TopicsResponse,
  type PagesResponse,
  HighlightsColorOptions,
} from "@/lib/pocketbase-types";
import type { EnrichedNodesResponse, NodeRecordData } from "@/lib/types";

// Type configuration for icons and colors
const typeConfig: Record<NodesTypeOptions, { icon: React.ElementType; color: string; bgColor: string; label: string }> =
  {
    [NodesTypeOptions.upload]: {
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      label: "Upload",
    },
    [NodesTypeOptions.author]: {
      icon: User,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      label: "Author",
    },
    [NodesTypeOptions.tag]: {
      icon: Tag,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      label: "Tag",
    },
    [NodesTypeOptions.topic]: {
      icon: FolderOpen,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      label: "Topic",
    },
    [NodesTypeOptions.highlight]: {
      icon: Highlighter,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      label: "Highlight",
    },
    [NodesTypeOptions.bookmark]: {
      icon: Bookmark,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
      label: "Bookmark",
    },
    [NodesTypeOptions.note]: {
      icon: MessageSquare,
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      label: "Note",
    },
  };

// Highlight color configuration
const highlightColors: Record<HighlightsColorOptions, string> = {
  [HighlightsColorOptions.yellow]: "bg-yellow-200 dark:bg-yellow-900/50",
  [HighlightsColorOptions.green]: "bg-green-200 dark:bg-green-900/50",
  [HighlightsColorOptions.blue]: "bg-blue-200 dark:bg-blue-900/50",
  [HighlightsColorOptions.pink]: "bg-pink-200 dark:bg-pink-900/50",
  [HighlightsColorOptions.purple]: "bg-purple-200 dark:bg-purple-900/50",
};

interface NodeDetailDialogProps {
  node: EnrichedNodesResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Upload detail component
function UploadDetail({ data }: { data: UploadsResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{data.title || "Untitled Upload"}</h3>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary">{data.type}</Badge>
          <Badge variant={data.status === "SUCCESS" ? "default" : "outline"}>{data.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {data.num_pages && (
          <div className="flex items-center gap-2">
            <FileIcon className="h-4 w-4 text-muted-foreground" />
            <span>{data.num_pages} pages</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{formatDate(data.created)}</span>
        </div>
      </div>

      <Separator />

      <Button variant="default" className="w-full" asChild>
        <Link to="/workspace" search={{ id: data.id, type: "upload" }}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Reader
        </Link>
      </Button>
    </div>
  );
}

// Highlight detail component
function HighlightDetail({ data }: { data: HighlightsResponse }) {
  const colorClass = data.color ? highlightColors[data.color] : highlightColors.yellow;

  return (
    <div className="space-y-4">
      <Card className={cn("border-none", colorClass)}>
        <CardContent className="p-4">
          <p className="text-sm italic">"{data.text || "No text captured"}"</p>
        </CardContent>
      </Card>

      {data.comment && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Note</span>
          </div>
          <p className="text-sm text-muted-foreground">{data.comment}</p>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {data.color && (
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="capitalize">{data.color}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(data.created)}</span>
        </div>
      </div>

      <Separator />

      {data.upload && (
        <Button variant="default" className="w-full" asChild>
          <Link to="/workspace" search={{ id: data.upload, type: "upload" }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View in Context
          </Link>
        </Button>
      )}
    </div>
  );
}

// Bookmark detail component
function BookmarkDetail({ data }: { data: BookmarksResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{data.comment || "Untitled Bookmark"}</h3>
      </div>

      {data.comment && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{data.comment}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {data.page_number && (
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            <span>Page {data.page_number}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(data.created)}</span>
        </div>
      </div>

      <Separator />

      {data.upload && (
        <Button variant="default" className="w-full" asChild>
          <Link to="/workspace" search={{ id: data.upload, type: "upload" }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Bookmark
          </Link>
        </Button>
      )}
    </div>
  );
}

// Author detail component
function AuthorDetail({ data }: { data: AuthorsResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{data.name || "Unknown Author"}</h3>
        <Badge variant="secondary" className="mt-1 capitalize">
          {data.type?.replace("_", " ")}
        </Badge>
      </div>

      {data.source && (
        <div>
          <span className="text-sm text-muted-foreground">Source: </span>
          <a
            href={data.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {data.source}
          </a>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Added {formatDate(data.created)}</span>
      </div>
    </div>
  );
}

// Tag detail component
function TagDetail({ data }: { data: TagsResponse }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
          <Tag className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold">{data.title || "Untitled Tag"}</h3>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Created {formatDate(data.created)}</span>
      </div>
    </div>
  );
}

// Topic detail component
function TopicDetail({ data }: { data: TopicsResponse }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
          <FolderOpen className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <h3 className="text-lg font-semibold">{data.title || "Untitled Topic"}</h3>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Created {formatDate(data.created)}</span>
      </div>
    </div>
  );
}

// Page detail component
function PageDetail({ data }: { data: PagesResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Page {data.page || "?"}</h3>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{formatDate(data.created)}</span>
      </div>

      <Separator />

      {data.upload && (
        <Button variant="default" className="w-full" asChild>
          <Link to="/workspace" search={{ id: data.upload, type: "upload" }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Page
          </Link>
        </Button>
      )}
    </div>
  );
}

// Render the appropriate detail component based on node type
function renderRecordDetail(type: NodesTypeOptions, recordData: NodeRecordData) {
  switch (type) {
    case NodesTypeOptions.upload:
      return <UploadDetail data={recordData as UploadsResponse} />;
    case NodesTypeOptions.highlight:
      return <HighlightDetail data={recordData as HighlightsResponse} />;
    case NodesTypeOptions.bookmark:
      return <BookmarkDetail data={recordData as BookmarksResponse} />;
    case NodesTypeOptions.author:
      return <AuthorDetail data={recordData as AuthorsResponse} />;
    case NodesTypeOptions.tag:
      return <TagDetail data={recordData as TagsResponse} />;
    case NodesTypeOptions.topic:
      return <TopicDetail data={recordData as TopicsResponse} />;
    default:
      return <p className="text-muted-foreground">No details available</p>;
  }
}

export function NodeDetailDialog({ node, open, onOpenChange }: NodeDetailDialogProps) {
  if (!node) return null;

  const config = typeConfig[node.type as NodesTypeOptions];
  const Icon = config?.icon || FileIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", config?.bgColor)}>
              <Icon className={cn("h-5 w-5", config?.color)} />
            </div>
            <span>{config?.label || "Node"} Details</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="pr-4">
            {node.record_data ? (
              renderRecordDetail(node.type as NodesTypeOptions, node.record_data)
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">No detailed information available for this node.</p>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-muted-foreground">Node ID: </span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{node.id}</code>
                  </div>
                  {node.record_id && (
                    <div>
                      <span className="text-muted-foreground">Record ID: </span>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{node.record_id}</code>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
