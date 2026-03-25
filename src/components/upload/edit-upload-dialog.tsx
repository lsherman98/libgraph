import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { useUpdateUpload, useCreatePerson, useCreatePublication, useCreateTag, useCreateTopic } from "@/lib/api/mutations";
import { usePeople, usePublications, useTags, useTopics, useUploads } from "@/lib/api/queries";
import { getUserId } from "@/lib/utils";
import {
  UploadsTypeOptions,
  PeopleTypeOptions,
  type UploadsResponse,
  type PeopleResponse,
  type PublicationsResponse,
  type TagsResponse,
  type TopicsResponse,
} from "@/lib/pocketbase-types";

const USER_UPLOAD_TYPES = Object.values(UploadsTypeOptions).filter((type) => type !== UploadsTypeOptions.summary);

interface EditUploadDialogProps {
  upload: UploadsResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUploadDialog({ upload, open, onOpenChange }: EditUploadDialogProps) {
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

  const peopleQuery = usePeople({ enabled: open });
  const publicationsQuery = usePublications({ enabled: open });
  const tagsQuery = useTags({ enabled: open });
  const topicsQuery = useTopics({ enabled: open });
  const uploadsQuery = useUploads(undefined, { enabled: open });

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
        people: subjects.length > 0 ? subjects : undefined,
        publication: publication || undefined,
        tags: tags.length > 0 ? tags : undefined,
        topic: topics.length > 0 ? topics : undefined,
        uploads: relatedUploads.length > 0 ? relatedUploads : undefined,
      },
    });

    onOpenChange(false);
  };

  const authorOptions = (peopleQuery.data || [])
    .filter((p: PeopleResponse) => !p.type || p.type === PeopleTypeOptions.author)
    .map((p: PeopleResponse) => ({
      label: p.name || "Unknown",
      value: p.id,
    }));

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
    .filter((u: UploadsResponse) => u.id !== upload?.id)
    .map((u: UploadsResponse) => ({
      label: u.title || "Untitled",
      value: u.id,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
          <DialogDescription>
            Update the metadata for this document. Changes to authors, tags, topics, and linked documents will be reflected in your knowledge graph.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(val) => setType(val as UploadsTypeOptions)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {USER_UPLOAD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Authors</Label>
            <CreatableCombobox
              options={authorOptions}
              value={subjects}
              isMulti
              onSelect={(val) => {
                setSubjects((prev) => (prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]));
              }}
              onCreate={(name) => {
                createPersonMutation
                  .mutateAsync({ name, type: PeopleTypeOptions.author, user: getUserId() })
                  .then((record) => setSubjects((prev) => [...prev, record.id]));
              }}
              placeholder="Select authors..."
              emptyText="No authors found."
            />
          </div>
          <div className="grid gap-2">
            <Label>Publication</Label>
            <CreatableCombobox
              options={publicationOptions}
              value={publication}
              onSelect={(val) => setPublication(val)}
              onCreate={(name) => {
                createPublicationMutation.mutateAsync({ name, user: getUserId() }).then((record) => setPublication(record.id));
              }}
              placeholder="Select publication..."
              emptyText="No publications found."
            />
          </div>
          <div className="grid gap-2">
            <Label>Tags</Label>
            <CreatableCombobox
              options={tagOptions}
              value={tags}
              isMulti
              onSelect={(val) => {
                setTags((prev) => (prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]));
              }}
              onCreate={(tagTitle) => {
                createTagMutation.mutateAsync({ title: tagTitle, user: getUserId() }).then((record) => setTags((prev) => [...prev, record.id]));
              }}
              placeholder="Select tags..."
              emptyText="No tags found."
            />
          </div>
          <div className="grid gap-2">
            <Label>Topics</Label>
            <CreatableCombobox
              options={topicOptions}
              value={topics}
              isMulti
              onSelect={(val) => {
                setTopics((prev) => (prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]));
              }}
              onCreate={(topicTitle) => {
                createTopicMutation.mutateAsync({ title: topicTitle, user: getUserId() }).then((record) => setTopics((prev) => [...prev, record.id]));
              }}
              placeholder="Select topics..."
              emptyText="No topics found."
            />
          </div>
          <div className="grid gap-2">
            <Label>Related Documents</Label>
            <CreatableCombobox
              options={uploadOptions}
              value={relatedUploads}
              isMulti
              onSelect={(val) => {
                setRelatedUploads((prev) => (prev.includes(val) ? prev.filter((u) => u !== val) : [...prev, val]));
              }}
              onCreate={() => {}}
              placeholder="Link related documents..."
              emptyText="No other documents found."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUpload.isPending}>
            {updateUpload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
