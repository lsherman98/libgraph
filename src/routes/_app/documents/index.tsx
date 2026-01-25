import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useUploads } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookText,
  FileText,
  Headphones,
  Video,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { UploadsResponse } from "@/lib/pocketbase-types";

export const Route = createFileRoute("/_app/documents/")({
  component: RouteComponent,
});

const typeIcons = {
  book: BookText,
  article: FileText,
  podcast: Headphones,
  lecture: Video,
};

const statusConfig = {
  SUCCESS: {
    icon: CheckCircle2,
    variant: "default" as const,
    label: "Processed",
    className: "text-green-600 dark:text-green-400",
  },
  PROCESSING: {
    icon: Loader2,
    variant: "secondary" as const,
    label: "Processing",
    className: "text-blue-600 dark:text-blue-400 animate-spin",
  },
  PENDING: {
    icon: Clock,
    variant: "outline" as const,
    label: "Pending",
    className: "text-yellow-600 dark:text-yellow-400",
  },
  FAILED: {
    icon: AlertCircle,
    variant: "destructive" as const,
    label: "Failed",
    className: "text-red-600 dark:text-red-400",
  },
};

function DocumentsTableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-50" />
            <Skeleton className="h-3 w-25" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="mb-2">No documents yet</CardTitle>
        <CardDescription className="text-center mb-6 max-w-sm">
          Upload your first document to get started. We support books, articles, podcasts, and lectures.
        </CardDescription>
        <Button asChild>
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ upload }: { upload: UploadsResponse }) {
  const navigate = useNavigate();
  const TypeIcon = typeIcons[upload.type] || FileText;
  const status = statusConfig[upload.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;

  const isClickable = upload.status === "SUCCESS";

  return (
    <TableRow
      className={isClickable ? "cursor-pointer hover:bg-muted/50" : "opacity-75"}
      onClick={() => {
        if (isClickable) {
          navigate({ to: "/reader", search: { uploadId: upload.id } });
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium">{upload.title || "Untitled"}</span>
            <span className="text-xs text-muted-foreground capitalize">{upload.type}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${status.className}`} />
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(upload.created).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </TableCell>
    </TableRow>
  );
}

function RouteComponent() {
  const { data: uploads, isLoading } = useUploads();

  return (
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-1">View and manage your uploaded documents</p>
        </div>
        <Button asChild>
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <DocumentsTableSkeleton />
      ) : uploads?.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads?.map((upload) => (
                <DocumentRow key={upload.id} upload={upload} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
