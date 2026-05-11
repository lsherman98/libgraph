import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { UploadsResponse } from "@/lib/pocketbase-types";
import { pb } from "@/lib/pocketbase";

interface DownloadButtonProps {
  upload: UploadsResponse;
  isAudioFile: boolean;
}

export function DownloadButton({ upload, isAudioFile }: DownloadButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"markdown" | "audio">("markdown");
  const [isLoading, setIsLoading] = useState(false);

  const buildDownloadUrl = (format: "markdown" | "audio") => {
    const path = `/api/uploads/${upload.id}/download/markdown${format === "audio" ? "?format=audio" : ""}`;
    return `${pb.baseURL}${path.replace(/^\//, "")}`;
  };

  const handleDownload = async (format: "markdown" | "audio") => {
    try {
      setIsLoading(true);

      const response = await fetch(buildDownloadUrl(format), {
        headers: {
          Authorization: `Bearer ${pb.authStore.token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;

      if (format === "audio") {
        const contentDisposition = response.headers.get("content-disposition");
        const filename = contentDisposition ? contentDisposition.split('filename="')[1]?.split('"')[0] : `${upload.title || "audio"}.mp3`;
        link.download = filename;
      } else {
        const filename = `${upload.title || "document"}.md`;
        link.download = filename;
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setIsDialogOpen(false);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAudioFile) {
    return (
      <>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsDialogOpen(true)} title="Download" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Download Format</DialogTitle>
              <DialogDescription>Choose what you want to download</DialogDescription>
            </DialogHeader>
            <RadioGroup value={selectedFormat} onValueChange={(val) => setSelectedFormat(val as "markdown" | "audio")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="markdown" id="markdown" />
                <Label htmlFor="markdown" className="cursor-pointer flex-1">
                  Markdown (transcript)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="audio" id="audio" />
                <Label htmlFor="audio" className="cursor-pointer flex-1">
                  Audio file
                </Label>
              </div>
            </RadioGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => handleDownload(selectedFormat)} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={async () => {
        await handleDownload("markdown");
      }}
      title="Download as Markdown"
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </Button>
  );
}
