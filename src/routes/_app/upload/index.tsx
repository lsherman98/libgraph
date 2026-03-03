import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, Upload, File as FileIcon, Loader2, CheckCircle, AlertCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatableCombobox } from "@/components/creatable-combobox";

import { useUpload, useCreatePerson, useCreatePublication, useCreateTag, useCreateTopic } from "@/lib/api/mutations";
import { usePeople, usePublications, useTags, useTopics } from "@/lib/api/queries";
import { getUserId } from "@/lib/utils";
import {
  UploadsStatusOptions,
  UploadsTypeOptions,
  PeopleTypeOptions,
  type PeopleResponse,
  type PublicationsResponse,
  type TagsResponse,
  type TopicsResponse,
} from "@/lib/pocketbase-types";

const USER_UPLOAD_TYPES = Object.values(UploadsTypeOptions).filter((type) => type !== UploadsTypeOptions.summary);

export const Route = createFileRoute("/_app/upload/")({
  component: RouteComponent,
});

interface FileMetadata {
  id: string;
  file: File;
  transcriptFile?: File;
  name: string;
  type: UploadsTypeOptions;
  subjects: string[];
  publication: string;
  tags: string[];
  topics: string[];
  status: "PENDING" | "UPLOADING" | "SUCCESS" | "ERROR";
}

function RouteComponent() {
  const [files, setFiles] = useState<FileMetadata[]>([]);

  const peopleQuery = usePeople();
  const publicationsQuery = usePublications();
  const tagsQuery = useTags();
  const topicsQuery = useTopics();

  const uploadMutation = useUpload();
  const createPersonMutation = useCreatePerson();
  const createPublicationMutation = useCreatePublication();
  const createTagMutation = useCreateTag();
  const createTopicMutation = useCreateTopic();

  const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma", ".webm", ".mp4"]);
  const DOCUMENT_EXTENSIONS = new Set([".pdf", ".epub", ".txt", ".md", ".markdown"]);
  const TRANSCRIPT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
  const ALLOWED_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);

  const getExtension = (filename: string) => {
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex < 0) return "";
    return filename.toLowerCase().slice(dotIndex);
  };
  const getBaseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");
  const getNormalizedBaseName = (filename: string) => getBaseName(filename).trim().toLowerCase();
  const isAudioFile = (filename: string) => AUDIO_EXTENSIONS.has(getExtension(filename));
  const isTranscriptFile = (filename: string) => TRANSCRIPT_EXTENSIONS.has(getExtension(filename));

  const createFileMetadata = (file: File, transcriptFile?: File): FileMetadata => {
    const ext = getExtension(file.name);
    const detectedType = AUDIO_EXTENSIONS.has(ext) ? UploadsTypeOptions.podcast : UploadsTypeOptions.book;

    return {
      id: Math.random().toString(36).substring(7),
      file,
      transcriptFile,
      name: getBaseName(file.name),
      type: detectedType,
      subjects: [],
      publication: "",
      tags: [],
      topics: [],
      status: "PENDING" as const,
    };
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filtered = acceptedFiles.filter((file) => {
      const ext = getExtension(file.name);
      return ALLOWED_EXTENSIONS.has(ext);
    });

    const transcriptPool = new Map<string, File[]>();
    for (const file of filtered) {
      if (!isTranscriptFile(file.name)) continue;
      const baseName = getNormalizedBaseName(file.name);
      if (!transcriptPool.has(baseName)) transcriptPool.set(baseName, []);
      transcriptPool.get(baseName)?.push(file);
    }

    const takeTranscript = (baseName: string) => {
      const matches = transcriptPool.get(baseName);
      if (!matches || matches.length === 0) return undefined;
      const transcript = matches.shift();
      if (matches.length === 0) transcriptPool.delete(baseName);
      return transcript;
    };

    setFiles((prev) => {
      const nextFiles = [...prev];

      for (const file of filtered) {
        if (isTranscriptFile(file.name)) continue;

        if (isAudioFile(file.name)) {
          const transcript = takeTranscript(getNormalizedBaseName(file.name));
          nextFiles.push(createFileMetadata(file, transcript));
          continue;
        }

        nextFiles.push(createFileMetadata(file));
      }

      for (const [baseName, transcripts] of transcriptPool) {
        for (const transcript of transcripts) {
          const existingAudioIndex = nextFiles.findIndex(
            (item) =>
              isAudioFile(item.file.name) &&
              (item.status === "PENDING" || item.status === "ERROR") &&
              getNormalizedBaseName(item.file.name) === baseName,
          );

          if (existingAudioIndex >= 0) {
            nextFiles[existingAudioIndex] = {
              ...nextFiles[existingAudioIndex],
              transcriptFile: transcript,
            };
            continue;
          }

          nextFiles.push(createFileMetadata(transcript));
        }
      }

      return nextFiles;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
      "text/plain": [".txt"],
      "text/markdown": [".md", ".markdown"],
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma", ".webm"],
      "video/mp4": [".mp4"],
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingIds = files.filter((f) => f.status === "PENDING").map((f) => f.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<FileMetadata>) => {
    const isBulk = selectedIds.has(id) && selectedIds.size > 1;
    if (isBulk) {
      const { name, ...bulkUpdates } = updates;
      if (name !== undefined) {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === id) return { ...f, ...updates };
            if (selectedIds.has(f.id)) return { ...f, ...bulkUpdates };
            return f;
          }),
        );
      } else {
        setFiles((prev) => prev.map((f) => (selectedIds.has(f.id) ? { ...f, ...bulkUpdates } : f)));
      }
    } else {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    }
  };

  const setTranscriptFile = (id: string, transcriptFile?: File) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, transcriptFile } : f)));
  };

  const handleUploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === "PENDING" || f.status === "ERROR");
    if (pendingFiles.length === 0) return;

    for (const fileData of pendingFiles) {
      updateFile(fileData.id, { status: "UPLOADING" });
      try {
        await uploadMutation.mutateAsync({
          file: fileData.file,
          transcript_file: fileData.transcriptFile,
          title: fileData.name,
          type: fileData.type,
          people: fileData.subjects.length > 0 ? fileData.subjects : undefined,
          publication: fileData.publication || undefined,
          tags: fileData.tags.length > 0 ? fileData.tags : undefined,
          topic: fileData.topics.length > 0 ? fileData.topics : undefined,
          user: getUserId(),
          status: UploadsStatusOptions.PENDING,
        });
        updateFile(fileData.id, { status: "SUCCESS" });
      } catch (error) {
        updateFile(fileData.id, { status: "ERROR" });
      }
    }
  };

  const authorOptions = peopleQuery.data?.map((p: PeopleResponse) => ({
    label: p.name,
    value: p.id,
  }));
  const publicationOptions = publicationsQuery.data?.map((p: PublicationsResponse) => ({
    label: p.name,
    value: p.id,
  }));
  const tagOptions = tagsQuery.data?.map((t: TagsResponse) => ({ label: t.title, value: t.id }));
  const topicOptions = topicsQuery.data?.map((t: TopicsResponse) => ({
    label: t.title,
    value: t.id,
  }));

  return (
    <div {...getRootProps()} className="container mx-auto px-4 py-8 space-y-8 max-w-6xl flex flex-col min-h-0 h-full">
      <input {...getInputProps()} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Files</h1>
          <p className="text-muted-foreground mt-2">Drag and drop files to upload to your library.</p>
        </div>
        {files.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={open}>
              <Plus className="mr-1 h-4 w-4" /> Add Files
            </Button>
            <Button onClick={handleUploadAll} disabled={uploadMutation.isPending || files.every((f) => f.status === "SUCCESS")}>
              {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload {files.filter((f) => f.status === "PENDING").length} Files
            </Button>
          </div>
        )}
      </div>

      {files.length === 0 && (
        <div
          onClick={open}
          className={`border-2 border-dashed rounded-lg p-12 text-center hover:bg-accent/50 transition-colors cursor-pointer flex-1 flex items-center justify-center ${
            isDragActive ? "border-primary bg-accent" : "border-muted-foreground/25"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Drop files here or click to select</p>
            <p className="text-sm text-muted-foreground">Supports PDFs, EPUBs, Text, Markdown, and audio files.</p>
            <p className="text-xs text-muted-foreground">Tip: same-name .txt/.md files are auto-added as transcripts for audio uploads.</p>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <Card className={`transition-colors ${isDragActive ? "border-primary border-2 border-dashed" : ""}`}>
          <CardContent className="p-0">
            {pendingIds.length > 1 && (
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected — edits to any selected file apply to all` : "Select files for bulk editing"}
                </span>
              </div>
            )}
            <div className="divide-y max-h-[70vh] overflow-y-auto">
              {files.map((file) => (
                <div key={file.id} className={`p-4 space-y-3 ${selectedIds.has(file.id) ? "bg-accent/40" : ""}`}>
                  {(() => {
                    const audioUpload = isAudioFile(file.file.name);

                    return (
                      <>
                        <div className="flex items-center gap-2">
                          {file.status === "PENDING" && (
                            <Checkbox checked={selectedIds.has(file.id)} onCheckedChange={() => toggleSelected(file.id)} className="shrink-0" />
                          )}
                          <div className="p-1.5 bg-muted rounded shrink-0">
                            <FileIcon className="h-4 w-4" />
                          </div>
                          <Input
                            value={file.name}
                            onChange={(e) => updateFile(file.id, { name: e.target.value })}
                            placeholder="Title"
                            className="h-8 text-sm flex-1 min-w-0"
                          />
                          <Select value={file.type} onValueChange={(val) => updateFile(file.id, { type: val as UploadsTypeOptions })}>
                            <SelectTrigger className="h-8 text-sm w-25 shrink-0">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {USER_UPLOAD_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {audioUpload && (
                            <div className="flex items-center gap-2 min-w-0 shrink">
                              <span className="text-xs text-muted-foreground shrink-0">Transcript</span>
                              <input
                                id={`transcript-${file.id}`}
                                type="file"
                                accept=".txt,.md,.markdown,text/plain,text/markdown"
                                className="hidden"
                                disabled={file.status !== "PENDING"}
                                onChange={(e) => {
                                  const transcript = e.target.files?.[0];
                                  if (!transcript) {
                                    setTranscriptFile(file.id, undefined);
                                    return;
                                  }

                                  const ext = getExtension(transcript.name);
                                  if (!TRANSCRIPT_EXTENSIONS.has(ext)) {
                                    setTranscriptFile(file.id, undefined);
                                    e.currentTarget.value = "";
                                    return;
                                  }

                                  setTranscriptFile(file.id, transcript);
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                disabled={file.status !== "PENDING"}
                                onClick={() => {
                                  const input = document.getElementById(`transcript-${file.id}`) as HTMLInputElement | null;
                                  input?.click();
                                }}
                              >
                                {file.transcriptFile ? "Change" : "Choose"}
                              </Button>
                              <span className="text-xs text-muted-foreground truncate max-w-36" title={file.transcriptFile?.name}>
                                {file.transcriptFile?.name ?? "No file"}
                              </span>
                              {file.transcriptFile && file.status === "PENDING" && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTranscriptFile(file.id, undefined)}>
                                  Clear
                                </Button>
                              )}
                            </div>
                          )}
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
                            {file.status === "UPLOADING" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                            {file.status === "SUCCESS" && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {file.status === "ERROR" && <AlertCircle className="h-5 w-5 text-red-500" />}
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${file.status === "PENDING" ? "pl-14" : "pl-9"}`}>
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted-foreground shrink-0">Authors</span>
                            <CreatableCombobox
                              options={authorOptions || []}
                              value={file.subjects}
                              className="h-8 text-sm flex-1"
                              isMulti
                              onSelect={(val) => {
                                const newSubjects = file.subjects.includes(val) ? file.subjects.filter((s) => s !== val) : [...file.subjects, val];
                                updateFile(file.id, { subjects: newSubjects });
                              }}
                              onCreate={(name) => {
                                createPersonMutation.mutateAsync({ name, type: PeopleTypeOptions.author, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { subjects: [...file.subjects, record.id] });
                                });
                              }}
                              placeholder="Authors..."
                              emptyText="No authors found."
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted-foreground shrink-0">Publication</span>
                            <CreatableCombobox
                              options={publicationOptions || []}
                              value={file.publication}
                              className="h-8 text-sm flex-1"
                              onSelect={(val) => updateFile(file.id, { publication: val })}
                              onCreate={(name) => {
                                createPublicationMutation.mutateAsync({ name, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { publication: record.id });
                                });
                              }}
                              placeholder="Publication..."
                              emptyText="No publications found."
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted-foreground shrink-0">Tags</span>
                            <CreatableCombobox
                              options={tagOptions || []}
                              value={file.tags}
                              className="h-8 text-sm flex-1"
                              isMulti
                              onSelect={(val) => {
                                const newTags = file.tags.includes(val) ? file.tags.filter((t) => t !== val) : [...file.tags, val];
                                updateFile(file.id, { tags: newTags });
                              }}
                              onCreate={(title) => {
                                createTagMutation.mutateAsync({ title, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { tags: [...file.tags, record.id] });
                                });
                              }}
                              placeholder="Tags..."
                              emptyText="No tags found."
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted-foreground shrink-0">Topics</span>
                            <CreatableCombobox
                              options={topicOptions || []}
                              value={file.topics}
                              className="h-8 text-sm flex-1"
                              isMulti
                              onSelect={(val) => {
                                const newTopics = file.topics.includes(val) ? file.topics.filter((t) => t !== val) : [...file.topics, val];
                                updateFile(file.id, { topics: newTopics });
                              }}
                              onCreate={(title) => {
                                createTopicMutation.mutateAsync({ title, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { topics: [...file.topics, record.id] });
                                });
                              }}
                              placeholder="Topics..."
                              emptyText="No topics found."
                            />
                          </div>
                        </div>
                        <div
                          className={`text-xs text-muted-foreground truncate ${file.status === "PENDING" ? "pl-14" : "pl-9"}`}
                          title={file.file.name}
                        >
                          {file.file.name} • {(file.file.size / 1024 / 1024).toFixed(2)} MB
                          {file.transcriptFile ? ` • transcript: ${file.transcriptFile.name}` : ""}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
