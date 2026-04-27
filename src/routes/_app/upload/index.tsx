import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, Upload, File as FileIcon, Loader2, CheckCircle, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";

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
  type PeopleResponse,
  type PublicationsResponse,
  type TagsResponse,
  type TopicsResponse,
} from "@/lib/pocketbase-types";

const USER_UPLOAD_TYPES = Object.values(UploadsTypeOptions).filter(
  (type) => type !== UploadsTypeOptions.summary && type !== UploadsTypeOptions.transcript,
);

export const Route = createFileRoute("/_app/upload/")({
  component: RouteComponent,
});

interface FileMetadata {
  id: string;
  file: File;
  transcriptFile?: File;
  audioDurationSeconds?: number;
  name: string;
  type?: UploadsTypeOptions;
  author: string;
  people: string[];
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

  const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wma", ".webm", ".mp4"]);
  const DOCUMENT_EXTENSIONS = new Set([".pdf", ".epub", ".txt", ".md", ".markdown"]);
  const TRANSCRIPT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
  const ALLOWED_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);
  const MAX_AUDIO_DURATION_SECONDS = 60 * 60;
  const MAX_PARALLEL_UPLOADS = 2;

  const getExtension = (filename: string) => {
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex < 0) return "";
    return filename.toLowerCase().slice(dotIndex);
  };
  const getBaseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");
  const getNormalizedBaseName = (filename: string) => getBaseName(filename).trim().toLowerCase();
  const isAudioFile = (filename: string) => AUDIO_EXTENSIONS.has(getExtension(filename));
  const isTranscriptFile = (filename: string) => TRANSCRIPT_EXTENSIONS.has(getExtension(filename));

  const getAudioDurationSeconds = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(file);

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        URL.revokeObjectURL(objectUrl);

        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Invalid audio duration"));
          return;
        }

        resolve(duration);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to read audio metadata"));
      };

      audio.src = objectUrl;
    });

  const createFileMetadata = (file: File, transcriptFile?: File, audioDurationSeconds?: number): FileMetadata => {
    return {
      id: Math.random().toString(36).substring(7),
      file,
      transcriptFile,
      audioDurationSeconds,
      name: getBaseName(file.name),
      author: "",
      people: [],
      publication: "",
      tags: [],
      topics: [],
      status: "PENDING" as const,
    };
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const extensionFiltered = acceptedFiles.filter((file) => {
      const ext = getExtension(file.name);
      return ALLOWED_EXTENSIONS.has(ext);
    });

    const filtered: File[] = [];
    const audioDurations = new Map<string, number>();

    for (const file of extensionFiltered) {
      filtered.push(file);

      if (!isAudioFile(file.name)) continue;

      try {
        const durationSeconds = await getAudioDurationSeconds(file);
        audioDurations.set(file.name, durationSeconds);
      } catch {
        toast.warning(`Could not verify duration for ${file.name}; audio over 60 minutes still needs a transcript.`);
      }
    }

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
          nextFiles.push(createFileMetadata(file, transcript, audioDurations.get(file.name)));
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
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wma", ".webm"],
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
  const pendingFilesMissingType = files.some((f) => f.status === "PENDING" && !f.type);

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const clearUploads = () => {
    if (files.length === 0) return;

    setFiles([]);
    setSelectedIds(new Set());
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

    const transcriptUploadIdsByBaseName = new Map<string, string[]>();
    const pendingAudioBaseNames = new Set(
      pendingFiles.filter((file) => isAudioFile(file.file.name)).map((file) => getNormalizedBaseName(file.file.name)),
    );
    const isTranscriptLinkedToPendingAudio = (fileData: FileMetadata) =>
      isTranscriptFile(fileData.file.name) &&
      !isAudioFile(fileData.file.name) &&
      pendingAudioBaseNames.has(getNormalizedBaseName(fileData.file.name));

    const missingTypeCount = pendingFiles.filter((file) => !file.type && !isTranscriptLinkedToPendingAudio(file)).length;
    if (missingTypeCount > 0) {
      toast.error(
        `Select a type for all files before uploading. ${missingTypeCount} file${missingTypeCount > 1 ? "s are" : " is"} still missing a type.`,
      );
      return;
    }

    const uploadSingleFile = async (fileData: FileMetadata) => {
      updateFile(fileData.id, { status: "UPLOADING" });

      const isAudioUpload = isAudioFile(fileData.file.name);
      const isTranscriptUpload = isTranscriptLinkedToPendingAudio(fileData);
      const audioBaseName = getNormalizedBaseName(fileData.file.name);
      let linkedTranscriptIds = isAudioUpload ? (transcriptUploadIdsByBaseName.get(audioBaseName) ?? []) : [];

      if (isAudioUpload && fileData.transcriptFile) {
        try {
          const transcriptBaseTitle = (getBaseName(fileData.transcriptFile.name) || `${fileData.name} Transcript`).trim();
          const transcriptTitle = /\btranscript\b$/i.test(transcriptBaseTitle) ? transcriptBaseTitle : `${transcriptBaseTitle} Transcript`;

          const transcriptUpload = await uploadMutation.mutateAsync({
            file: fileData.transcriptFile,
            title: transcriptTitle,
            type: UploadsTypeOptions.transcript,
            author: fileData.author || undefined,
            people: fileData.people.length > 0 ? fileData.people : undefined,
            publication: fileData.publication || undefined,
            tags: fileData.tags.length > 0 ? fileData.tags : undefined,
            topics: fileData.topics.length > 0 ? fileData.topics : undefined,
            user: getUserId(),
            status: UploadsStatusOptions.pending,
          });

          if (!linkedTranscriptIds.includes(transcriptUpload.id)) {
            linkedTranscriptIds = [...linkedTranscriptIds, transcriptUpload.id];
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          toast.error(`${fileData.file.name}: failed to upload transcript (${message})`);
          updateFile(fileData.id, { status: "ERROR" });
          return;
        }
      }

      if (isAudioUpload && linkedTranscriptIds.length === 0) {
        const resolvedDurationSeconds = fileData.audioDurationSeconds ?? (await getAudioDurationSeconds(fileData.file).catch(() => undefined));
        if (resolvedDurationSeconds !== undefined && resolvedDurationSeconds > MAX_AUDIO_DURATION_SECONDS) {
          updateFile(fileData.id, { status: "ERROR", audioDurationSeconds: resolvedDurationSeconds });
          toast.error(`${fileData.file.name} is over 60 minutes and needs a transcript before upload.`);
          return;
        }
      }

      try {
        const created = await uploadMutation.mutateAsync({
          file: fileData.file,
          uploads: linkedTranscriptIds.length > 0 ? linkedTranscriptIds : undefined,
          title: fileData.name,
          type: isTranscriptUpload ? UploadsTypeOptions.transcript : fileData.type!,
          author: fileData.author || undefined,
          people: fileData.people.length > 0 ? fileData.people : undefined,
          publication: fileData.publication || undefined,
          tags: fileData.tags.length > 0 ? fileData.tags : undefined,
          topics: fileData.topics.length > 0 ? fileData.topics : undefined,
          user: getUserId(),
          status: UploadsStatusOptions.pending,
        });

        if (isTranscriptUpload) {
          const baseName = getNormalizedBaseName(fileData.file.name);
          const existing = transcriptUploadIdsByBaseName.get(baseName) ?? [];
          transcriptUploadIdsByBaseName.set(baseName, [...existing, created.id]);
        }

        updateFile(fileData.id, { status: "SUCCESS" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        toast.error(`${fileData.file.name}: ${message}`);
        updateFile(fileData.id, { status: "ERROR" });
      }
    };

    const runUploadQueue = async (queueFiles: FileMetadata[]) => {
      if (queueFiles.length === 0) return;

      const queue = [...queueFiles];
      const workerCount = Math.min(MAX_PARALLEL_UPLOADS, queue.length);

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const nextFile = queue.shift();
            if (!nextFile) break;

            await uploadSingleFile(nextFile);
          }
        }),
      );
    };

    const transcriptUploads = pendingFiles.filter((file) => isTranscriptLinkedToPendingAudio(file));
    const audioUploads = pendingFiles.filter((file) => isAudioFile(file.file.name));
    const otherUploads = pendingFiles.filter((file) => !isTranscriptLinkedToPendingAudio(file) && !isAudioFile(file.file.name));

    await runUploadQueue(transcriptUploads);
    await runUploadQueue(otherUploads);
    await runUploadQueue(audioUploads);
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
  const pendingOrErrorAudioBaseNames = new Set(
    files
      .filter((file) => (file.status === "PENDING" || file.status === "ERROR") && isAudioFile(file.file.name))
      .map((file) => getNormalizedBaseName(file.file.name)),
  );

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
            <Button variant="outline" size="sm" onClick={clearUploads}>
              Clear
            </Button>
            <Button
              onClick={handleUploadAll}
              disabled={uploadMutation.isPending || files.every((f) => f.status === "SUCCESS") || pendingFilesMissingType}
            >
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
            <p className="text-sm text-muted-foreground">
              Supports PDFs, EPUBs, Text, Markdown, and audio files. Audio over 60 minutes requires a transcript.
            </p>
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
                    const transcriptUpload =
                      isTranscriptFile(file.file.name) && !audioUpload && pendingOrErrorAudioBaseNames.has(getNormalizedBaseName(file.file.name));

                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
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
                            className="h-8 text-sm min-w-0 flex-1 basis-64"
                          />
                          <Select
                            value={transcriptUpload ? UploadsTypeOptions.transcript : file.type}
                            onValueChange={(val) => {
                              if (transcriptUpload) return;
                              updateFile(file.id, { type: val as UploadsTypeOptions });
                            }}
                            disabled={transcriptUpload}
                          >
                            <SelectTrigger className="h-8 text-sm w-25 shrink-0">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {(transcriptUpload ? [UploadsTypeOptions.transcript] : USER_UPLOAD_TYPES).map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {audioUpload && (
                            <div className="flex items-center gap-2 min-w-0 shrink basis-full sm:basis-auto">
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
                          <div className="w-8 shrink-0 flex justify-center ml-auto">
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
                        <div className={`grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5 ${file.status === "PENDING" ? "pl-14" : "pl-9"}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">Author</span>
                            <CreatableCombobox
                              options={authorOptions || []}
                              value={file.author}
                              className="h-8 text-sm flex-1 min-w-0"
                              onSelect={(val) => updateFile(file.id, { author: val })}
                              onCreate={(name) => {
                                createPersonMutation.mutateAsync({ name, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { author: record.id });
                                });
                              }}
                              placeholder="Author..."
                              emptyText="No people found."
                            />
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">People</span>
                            <CreatableCombobox
                              options={authorOptions || []}
                              value={file.people}
                              className="h-8 text-sm flex-1 min-w-0"
                              isMulti
                              onSelect={(val) => {
                                const newPeople = file.people.includes(val) ? file.people.filter((p) => p !== val) : [...file.people, val];
                                updateFile(file.id, { people: newPeople });
                              }}
                              onCreate={(name) => {
                                createPersonMutation.mutateAsync({ name, user: getUserId() }).then((record) => {
                                  updateFile(file.id, { people: [...file.people, record.id] });
                                });
                              }}
                              placeholder="People..."
                              emptyText="No people found."
                            />
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">Publication</span>
                            <CreatableCombobox
                              options={publicationOptions || []}
                              value={file.publication}
                              className="h-8 text-sm flex-1 min-w-0"
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
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">Tags</span>
                            <CreatableCombobox
                              options={tagOptions || []}
                              value={file.tags}
                              className="h-8 text-sm flex-1 min-w-0"
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
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">Topics</span>
                            <CreatableCombobox
                              options={topicOptions || []}
                              value={file.topics}
                              className="h-8 text-sm flex-1 min-w-0"
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
