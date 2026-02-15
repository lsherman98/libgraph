import { useState, useEffect } from "react";
import { Loader2, Link2, Pencil, BookText, FileText, Headphones, Video, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useUpdateUpload, useCreatePerson, useCreatePublication, useCreateTag, useCreateTopic } from "@/lib/api/mutations";
import { usePeople, usePublications, useTags, useTopics, useUploads, useUploadById } from "@/lib/api/queries";
import { getUserId } from "@/lib/utils";
import {
  UploadsTypeOptions,
  PeopleTypeOptions,
  type PeopleResponse,
  type PublicationsResponse,
  type TagsResponse,
  type TopicsResponse,
  type UploadsResponse,
} from "@/lib/pocketbase-types";
import { useNavigate } from "@tanstack/react-router";

interface DocumentInfoPanelProps {
  uploadId: string;
}

export function DocumentInfoPanel({ uploadId }: DocumentInfoPanelProps) {
  const navigate = useNavigate();
  const { data: upload, isLoading } = useUploadById(uploadId);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<UploadsTypeOptions>(UploadsTypeOptions.book);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [publication, setPublication] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [relatedUploads, setRelatedUploads] = useState<string[]>([]);

  const updateUpload = useUpdateUpload();
  const createPersonMutation = useCreatePerson();
  const createPublicationMutation = useCreatePublication();
  const createTagMutation = useCreateTag();
  const createTopicMutation = useCreateTopic();

  const peopleQuery = usePeople();
  const publicationsQuery = usePublications();
  const tagsQuery = useTags();
  const topicsQuery = useTopics();
  const uploadsQuery = useUploads();

  useEffect(() => {
    if (upload) {
      setTitle(upload.title || "");
      setType(upload.type || UploadsTypeOptions.book);
      setSubjects(upload.people || []);
      setPublication(upload.publication || "");
      setTags(upload.tags || []);
      setTopics(upload.topic || []);
      setRelatedUploads(upload.uploads || []);
    }
  }, [upload]);

  const handleSave = async () => {
    if (!upload) return;

    await updateUpload.mutateAsync({
      id: upload.id,
      data: {
        title,
        type,
        people: subjects.length > 0 ? subjects : [],
        publication: publication || undefined,
        tags: tags.length > 0 ? tags : [],
        topic: topics.length > 0 ? topics : [],
        uploads: relatedUploads.length > 0 ? relatedUploads : [],
      },
    });

    setIsEditing(false);
  };

  const handleCancel = () => {
    if (upload) {
      setTitle(upload.title || "");
      setType(upload.type || UploadsTypeOptions.book);
      setSubjects(upload.people || []);
      setPublication(upload.publication || "");
      setTags(upload.tags || []);
      setTopics(upload.topic || []);
      setRelatedUploads(upload.uploads || []);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!upload) return null;

  const getPersonName = (id: string) => peopleQuery.data?.find((p: PeopleResponse) => p.id === id)?.name || "Unknown";
  const getPublicationName = (id: string) => publicationsQuery.data?.find((p: PublicationsResponse) => p.id === id)?.name || "Unknown";
  const getTagTitle = (id: string) => tagsQuery.data?.find((t: TagsResponse) => t.id === id)?.title || id;
  const getTopicTitle = (id: string) => topicsQuery.data?.find((t: TopicsResponse) => t.id === id)?.title || id;
  const getUploadTitle = (id: string) => uploadsQuery.data?.find((u: UploadsResponse) => u.id === id)?.title || "Untitled";

  const authorOptions = (peopleQuery.data || [])
    .filter((p: PeopleResponse) => !p.type || p.type === PeopleTypeOptions.author)
    .map((p: PeopleResponse) => ({ label: p.name || "Unknown", value: p.id }));

  const publicationOptions = (publicationsQuery.data || []).map((p: PublicationsResponse) => ({
    label: p.name || "Unknown",
    value: p.id,
  }));

  const tagOptions = (tagsQuery.data || []).map((t: TagsResponse) => ({
    label: t.title || t.id,
    value: t.id,
  }));

  const topicOptions = (topicsQuery.data || []).map((t: TopicsResponse) => ({
    label: t.title || "Untitled",
    value: t.id,
  }));

  const uploadOptions = (uploadsQuery.data || [])
    .filter((u: UploadsResponse) => u.id !== upload.id)
    .map((u: UploadsResponse) => ({
      label: u.title || "Untitled",
      value: u.id,
    }));

  const typeIcons: Record<string, typeof FileText> = {
    book: BookText,
    article: FileText,
    podcast: Headphones,
    lecture: Video,
  };
  const TypeIcon = typeIcons[upload.type] || FileText;

  if (isEditing) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Edit Document</h3>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" className="h-8 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as UploadsTypeOptions)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UploadsTypeOptions).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Authors</Label>
              <CreatableCombobox
                options={authorOptions}
                value={subjects}
                isMulti
                className="text-sm"
                onSelect={(val) => setSubjects((prev) => (prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]))}
                onCreate={(name) => {
                  createPersonMutation
                    .mutateAsync({ name, type: PeopleTypeOptions.author, user: getUserId() })
                    .then((record) => setSubjects((prev) => [...prev, record.id]));
                }}
                placeholder="Select authors..."
                emptyText="No authors found."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Publication</Label>
              <CreatableCombobox
                options={publicationOptions}
                value={publication}
                className="text-sm"
                onSelect={(val) => setPublication(val)}
                onCreate={(name) => {
                  createPublicationMutation.mutateAsync({ name, user: getUserId() }).then((record) => setPublication(record.id));
                }}
                placeholder="Select publication..."
                emptyText="No publications found."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Tags</Label>
              <CreatableCombobox
                options={tagOptions}
                value={tags}
                isMulti
                className="text-sm"
                onSelect={(val) => setTags((prev) => (prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]))}
                onCreate={(tagTitle) => {
                  createTagMutation.mutateAsync({ title: tagTitle, user: getUserId() }).then((record) => setTags((prev) => [...prev, record.id]));
                }}
                placeholder="Select tags..."
                emptyText="No tags found."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Topics</Label>
              <CreatableCombobox
                options={topicOptions}
                value={topics}
                isMulti
                className="text-sm"
                onSelect={(val) => setTopics((prev) => (prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]))}
                onCreate={(topicTitle) => {
                  createTopicMutation
                    .mutateAsync({ title: topicTitle, user: getUserId() })
                    .then((record) => setTopics((prev) => [...prev, record.id]));
                }}
                placeholder="Select topics..."
                emptyText="No topics found."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Related Documents</Label>
              <CreatableCombobox
                options={uploadOptions}
                value={relatedUploads}
                isMulti
                className="text-sm"
                onSelect={(val) => setRelatedUploads((prev) => (prev.includes(val) ? prev.filter((u) => u !== val) : [...prev, val]))}
                onCreate={() => {}}
                placeholder="Link documents..."
                emptyText="No other documents."
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={handleCancel} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateUpload.isPending} className="flex-1">
              {updateUpload.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className="h-5 w-5 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-semibold truncate">{upload.title || "Untitled"}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground">Type</span>
            <p className="text-sm capitalize">{upload.type}</p>
          </div>
          {upload.people?.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Authors</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {upload.people.map((id: string) => (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {getPersonName(id)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {upload.publication && (
            <div>
              <span className="text-xs text-muted-foreground">Publication</span>
              <p className="text-sm">{getPublicationName(upload.publication)}</p>
            </div>
          )}
          {upload.tags?.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {upload.tags.map((id: string) => (
                  <Badge key={id} variant="outline" className="text-xs">
                    {getTagTitle(id)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {upload.topic?.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Topics</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {upload.topic.map((id: string) => (
                  <Badge key={id} variant="outline" className="text-xs">
                    {getTopicTitle(id)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {upload.uploads?.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                Related Documents
              </span>
              <div className="mt-1 space-y-1">
                {upload.uploads.map((id: string) => (
                  <button
                    key={id}
                    className="flex items-center gap-2 text-sm text-left w-full px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    onClick={() => navigate({ to: "/workspace", search: { id, type: "upload" } })}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{getUploadTitle(id)}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {upload.num_pages > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Pages</span>
              <p className="text-sm">{upload.num_pages}</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
