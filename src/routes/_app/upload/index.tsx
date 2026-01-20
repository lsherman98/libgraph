import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, Upload, File as FileIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CreatableCombobox } from "@/components/creatable-combobox";

import { useUpload, useCreateAuthor, useCreateTag, useCreateTopic } from "@/lib/api/mutations";
import { useAuthors, useTags, useTopics } from "@/lib/api/queries";
import { getUserRecord } from "@/lib/utils";
import {
  UploadsStatusOptions,
  UploadsTypeOptions,
  type AuthorsResponse,
  type TagsResponse,
  type TopicsResponse,
} from "@/lib/pocketbase-types";

export const Route = createFileRoute("/_app/upload/")({
  component: RouteComponent,
});

interface FileMetadata {
  id: string;
  file: File;
  name: string;
  type: UploadsTypeOptions;
  author: string;
  tags: string[];
  topics: string[];
  status: "PENDING" | "UPLOADING" | "SUCCESS" | "ERROR";
}

function RouteComponent() {
  const [files, setFiles] = useState<FileMetadata[]>([]);

  const authorsQuery = useAuthors();
  const tagsQuery = useTags();
  const topicsQuery = useTopics();

  const uploadMutation = useUpload();
  const createAuthorMutation = useCreateAuthor();
  const createTagMutation = useCreateTag();
  const createTopicMutation = useCreateTopic();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name.replace(/\.[^/.]+$/, ""),
      type: UploadsTypeOptions.book,
      author: "",
      tags: [],
      topics: [],
      status: "PENDING" as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<FileMetadata>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleUploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === "PENDING" || f.status === "ERROR");

    if (pendingFiles.length === 0) return;

    for (const fileData of pendingFiles) {
      updateFile(fileData.id, { status: "UPLOADING" });
      try {
        await uploadMutation.mutateAsync({
          file: fileData.file,
          title: fileData.name,
          type: fileData.type,
          author: fileData.author || undefined,
          tags: fileData.tags.length > 0 ? fileData.tags : undefined,
          topic: fileData.topics.length > 0 ? fileData.topics : undefined,
          user: getUserRecord().id,
          status: UploadsStatusOptions.PENDING,
        });
        updateFile(fileData.id, { status: "SUCCESS" });
      } catch (error) {
        console.error(error);
        updateFile(fileData.id, { status: "ERROR" });
      }
    }
  };

  const authorOptions = (authorsQuery.data || []).map((a: AuthorsResponse) => ({
    label: a.name || "Unknown",
    value: a.id,
  }));
  const tagOptions = (tagsQuery.data || []).map((t: TagsResponse) => ({ label: t.title || "Untitled", value: t.id }));
  const topicOptions = (topicsQuery.data || []).map((t: TopicsResponse) => ({
    label: t.title || "Untitled",
    value: t.id,
  }));

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Files</h1>
          <p className="text-muted-foreground mt-2">Drag and drop files to upload to your library.</p>
        </div>
        {files.length > 0 && (
          <Button
            onClick={handleUploadAll}
            disabled={uploadMutation.isPending || files.every((f) => f.status === "SUCCESS")}
          >
            {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload {files.filter((f) => f.status === "PENDING").length} Files
          </Button>
        )}
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center hover:bg-accent/50 transition-colors cursor-pointer ${
          isDragActive ? "border-primary bg-accent" : "border-muted-foreground/25"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Drop files here or click to select</p>
          <p className="text-sm text-muted-foreground">Support for PDF, EPUB, MP3, MP4</p>
        </div>
      </div>

      {files.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {files.map((file) => (
                <div key={file.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-muted rounded shrink-0">
                      <FileIcon className="h-4 w-4" />
                    </div>
                    <Input
                      value={file.name}
                      onChange={(e) => updateFile(file.id, { name: e.target.value })}
                      placeholder="Title"
                      className="h-8 text-sm flex-1 min-w-0"
                    />
                    <Select
                      value={file.type}
                      onValueChange={(val) => updateFile(file.id, { type: val as UploadsTypeOptions })}
                    >
                      <SelectTrigger className="h-8 text-sm w-25 shrink-0">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(UploadsTypeOptions).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <CreatableCombobox
                      options={authorOptions}
                      value={file.author}
                      className="h-8 text-sm w-40 shrink-0"
                      onSelect={(val) => updateFile(file.id, { author: val })}
                      onCreate={(name) => {
                        createAuthorMutation.mutateAsync({ name, user: getUserRecord().id }).then((record) => {
                          updateFile(file.id, { author: record.id });
                        });
                      }}
                      placeholder="Select Author"
                      emptyText="No authors found."
                    />
                    <CreatableCombobox
                      options={tagOptions}
                      value={file.tags}
                      className="h-8 text-sm w-30 shrink-0"
                      isMulti
                      onSelect={(val) => {
                        const newTags = file.tags.includes(val)
                          ? file.tags.filter((t) => t !== val)
                          : [...file.tags, val];
                        updateFile(file.id, { tags: newTags });
                      }}
                      onCreate={(title) => {
                        createTagMutation.mutateAsync({ title, user: getUserRecord().id }).then((record) => {
                          updateFile(file.id, { tags: [...file.tags, record.id] });
                        });
                      }}
                      placeholder="Tags"
                      emptyText="No tags found."
                    />
                    <CreatableCombobox
                      options={topicOptions}
                      value={file.topics}
                      className="h-8 text-sm w-30 shrink-0"
                      isMulti
                      onSelect={(val) => {
                        const newTopics = file.topics.includes(val)
                          ? file.topics.filter((t) => t !== val)
                          : [...file.topics, val];
                        updateFile(file.id, { topics: newTopics });
                      }}
                      onCreate={(title) => {
                        createTopicMutation.mutateAsync({ title, user: getUserRecord().id }).then((record) => {
                          updateFile(file.id, { topics: [...file.topics, record.id] });
                        });
                      }}
                      placeholder="Topics"
                      emptyText="No topics found."
                    />
                    <div className="w-8 shrink-0 flex justify-center">
                      {file.status === "PENDING" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      {file.status === "UPLOADING" && (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      )}
                      {file.status === "SUCCESS" && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {file.status === "ERROR" && <AlertCircle className="h-5 w-5 text-red-500" />}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground pl-9 truncate" title={file.file.name}>
                    {file.file.name} • {(file.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
