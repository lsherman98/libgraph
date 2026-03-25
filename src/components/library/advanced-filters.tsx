import type { UploadFilters } from "@/lib/api/api";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, ArrowUpDown } from "lucide-react";
import { UploadsTypeOptions } from "@/lib/pocketbase-types";
import { CreatableCombobox } from "@/components/creatable-combobox";

const USER_UPLOAD_TYPES = Object.values(UploadsTypeOptions).filter((type) => type !== UploadsTypeOptions.summary);

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

export function AdvancedFilters({
  filters,
  onFiltersChange,
  tags,
  topics,
  people,
  publications,
  actions,
}: {
  filters: UploadFilters;
  onFiltersChange: (filters: UploadFilters) => void;
  tags: { id: string; title?: string }[];
  topics: { id: string; title?: string }[];
  people: { id: string; name?: string }[];
  publications: { id: string; name?: string }[];
  actions?: ReactNode;
}) {
  const activeFilterCount = [
    (filters.type?.length || 0) > 0,
    (filters.tags?.length || 0) > 0,
    (filters.topics?.length || 0) > 0,
    (filters.people?.length || 0) > 0,
    !!filters.publication,
  ].filter(Boolean).length;

  const toggleArrayFilter = (key: keyof UploadFilters, value: string) => {
    const current = (filters[key] as string[] | undefined) || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFiltersChange({ ...filters, [key]: next.length > 0 ? next : undefined });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  };

  const getTagName = (id: string) => tags.find((t) => t.id === id)?.title || id;
  const getTopicName = (id: string) => topics.find((t) => t.id === id)?.title || id;
  const getPersonName = (id: string) => people.find((p) => p.id === id)?.name || id;
  const getPublicationName = (id: string) => publications.find((p) => p.id === id)?.name || id;
  const filterTypeOptions = USER_UPLOAD_TYPES.map((type) => ({
    value: type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
  }));

  const filterTagOptions = tags.map((tag) => ({
    value: tag.id,
    label: tag.title || "Untitled",
  }));

  const filterTopicOptions = topics.map((topic) => ({
    value: topic.id,
    label: topic.title || "Untitled",
  }));

  const filterPeopleOptions = people.map((person) => ({
    value: person.id,
    label: person.name || "Unknown",
  }));

  const filterPublicationOptions = publications.map((publication) => ({
    value: publication.id,
    label: publication.name || "Unknown",
  }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-52 sm:w-56 shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={filters.search || ""}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            className="pl-9"
          />
        </div>
        <Select
          value={`${filters.sortBy || "created"}_${filters.sortOrder || "desc"}`}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split("_") as [string, "asc" | "desc"];
            onFiltersChange({ ...filters, sortBy, sortOrder });
          }}
        >
          <SelectTrigger className="w-36 h-9 shrink-0">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Newest first</SelectItem>
            <SelectItem value="created_asc">Oldest first</SelectItem>
            <SelectItem value="title_asc">Title A–Z</SelectItem>
            <SelectItem value="title_desc">Title Z–A</SelectItem>
            <SelectItem value="type_asc">Type A–Z</SelectItem>
          </SelectContent>
        </Select>
        <FilterDropdown
          label="Type"
          values={filters.type}
          placeholder="Type"
          searchable={false}
          options={filterTypeOptions}
          onToggle={(value) => toggleArrayFilter("type", value)}
          className="w-30"
        />
        <FilterDropdown
          label="Tags"
          values={filters.tags}
          placeholder="Tags"
          searchable
          options={filterTagOptions}
          onToggle={(value) => toggleArrayFilter("tags", value)}
          className="w-32"
        />
        <FilterDropdown
          label="Topics"
          values={filters.topics}
          placeholder="Topics"
          searchable
          options={filterTopicOptions}
          onToggle={(value) => toggleArrayFilter("topics", value)}
          className="w-32"
        />
        <FilterDropdown
          label="Authors"
          values={filters.people}
          placeholder="Authors"
          searchable
          options={filterPeopleOptions}
          onToggle={(value) => toggleArrayFilter("people", value)}
          className="w-32"
        />
        <div className="min-w-0 shrink-0 w-40">
          <CreatableCombobox
            options={filterPublicationOptions}
            value={filters.publication}
            onSelect={(value) => onFiltersChange({ ...filters, publication: value === filters.publication ? undefined : value })}
            placeholder="Publication"
            emptyText="No publications found."
            className="h-9 text-sm"
          />
        </div>
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
          {filters.type?.map((t) => (
            <FilterBadge key={`type-${t}`} label={t} onRemove={() => toggleArrayFilter("type", t)} />
          ))}
          {filters.tags?.map((t) => (
            <FilterBadge key={`tag-${t}`} label={getTagName(t)} onRemove={() => toggleArrayFilter("tags", t)} />
          ))}
          {filters.topics?.map((t) => (
            <FilterBadge key={`topic-${t}`} label={getTopicName(t)} onRemove={() => toggleArrayFilter("topics", t)} />
          ))}
          {filters.people?.map((p) => (
            <FilterBadge key={`person-${p}`} label={getPersonName(p)} onRemove={() => toggleArrayFilter("people", p)} />
          ))}
          {filters.publication && (
            <FilterBadge
              key={`publication-${filters.publication}`}
              label={getPublicationName(filters.publication)}
              onRemove={() => onFiltersChange({ ...filters, publication: undefined })}
            />
          )}
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground" onClick={clearAllFilters}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  values: string[] | undefined;
  placeholder: string;
  searchable: boolean;
  options: { value: string; label: string }[];
  onToggle: (value: string) => void;
  className?: string;
}

function FilterDropdown({ values, placeholder, searchable, options, onToggle, className }: FilterDropdownProps) {
  return (
    <div className={`min-w-0 shrink-0 ${className ?? ""}`}>
      <CreatableCombobox
        options={options}
        value={values ?? []}
        onSelect={onToggle}
        placeholder={placeholder}
        emptyText="No results found."
        isMulti
        searchable={searchable}
        className="h-9 text-sm"
      />
    </div>
  );
}
