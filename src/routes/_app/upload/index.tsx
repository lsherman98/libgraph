import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/lib/api/mutations";
import { getUserRecord } from "@/lib/utils";

export const Route = createFileRoute("/_app/upload/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [files, setFiles] = useState<FileList | null>(null);

  const uploadMutation = useUpload();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(event.target.files);
  };

  const handleUpload = () => {
    if (files) {
      Array.from(files).forEach((file) => {
        uploadMutation.mutate({
          file: file,
          title: file.name,
          user: getUserRecord().id,
        });
      });
    }
  };

  return (
    <div className="p-4">
      <Button onClick={() => document.getElementById("fileInput")?.click()}>Select Files</Button>
      <input id="fileInput" type="file" multiple style={{ display: "none" }} onChange={handleFileSelect} />
      <Button onClick={handleUpload} disabled={!files} className="ml-2">
        Upload Files
      </Button>
      {files && <p>Selected {files.length} file(s)</p>}
    </div>
  );
}
