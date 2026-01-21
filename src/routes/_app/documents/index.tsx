import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUploads } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/documents/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: uploads, isLoading } = useUploads();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="p-6">Loading documents...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground mt-1">View and manage your uploaded documents</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads?.map((upload) => (
            <TableRow
              key={upload.id}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/reader", search: { uploadId: upload.id } })}
            >
              <TableCell className="font-medium">{upload.title || "Untitled"}</TableCell>
              <TableCell>
                <Badge variant="outline">{upload.type}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    upload.status === "SUCCESS"
                      ? "default"
                      : upload.status === "PROCESSING"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {upload.status}
                </Badge>
              </TableCell>
              <TableCell>{new Date(upload.created).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {uploads?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No documents found. Upload a document to get started.
        </div>
      )}
    </div>
  );
}
