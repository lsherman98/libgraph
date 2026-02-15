import { useState } from "react";
import type { UploadFilters } from "@/lib/api/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { UploadsTypeOptions, UploadsStatusOptions } from "@/lib/pocketbase-types";
import { statusConfig } from "./constants";

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
}: {
  filters: UploadFilters;
  onFiltersChange: (filters: UploadFilters) => void;
  tags: { id: string; title?: string }[];
  topics: { id: string; title?: string }[];
  people: { id: string; name?: string }[];
  publications: { id: string; name?: string }[];
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount = [
    (filters.type?.length || 0) > 0,
    (filters.status?.length || 0) > 0,
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={filters.search || ""}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            className="pl-9"
          />
        </div>
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filters</h4>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</Label>
                <div className="grid grid-cols-2 gap-1">
                  {Object.values(UploadsTypeOptions).map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.type?.includes(type) || false}
                        onCheckedChange={() => toggleArrayFilter("type", type)}
                      />
                      <span className="capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</Label>
                <div className="grid grid-cols-2 gap-1">
                  {Object.values(UploadsStatusOptions).map((status) => {
                    const config = statusConfig[status];
                    return (
                      <label
                        key={status}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={filters.status?.includes(status) || false}
                          onCheckedChange={() => toggleArrayFilter("status", status)}
                        />
                        <span>{config?.label || status}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {tags.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</Label>
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={filters.tags?.includes(tag.id) || false}
                              onCheckedChange={() => toggleArrayFilter("tags", tag.id)}
                            />
                            <span className="truncate">{tag.title || "Untitled"}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
              {topics.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Topics</Label>
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {topics.map((topic) => (
                          <label
                            key={topic.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={filters.topics?.includes(topic.id) || false}
                              onCheckedChange={() => toggleArrayFilter("topics", topic.id)}
                            />
                            <span className="truncate">{topic.title || "Untitled"}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
              {people.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Authors
                    </Label>
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {people.map((person) => (
                          <label
                            key={person.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={filters.people?.includes(person.id) || false}
                              onCheckedChange={() => toggleArrayFilter("people", person.id)}
                            />
                            <span className="truncate">{person.name || "Unknown"}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
              {publications.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Publication
                    </Label>
                    <Select
                      value={filters.publication || "all"}
                      onValueChange={(value) =>
                        onFiltersChange({ ...filters, publication: value === "all" ? undefined : value })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="All publications" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All publications</SelectItem>
                        {publications.map((pub) => (
                          <SelectItem key={pub.id} value={pub.id}>
                            {pub.name || "Untitled"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Select
          value={`${filters.sortBy || "created"}_${filters.sortOrder || "desc"}`}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split("_") as [string, "asc" | "desc"];
            onFiltersChange({ ...filters, sortBy, sortOrder });
          }}
        >
          <SelectTrigger className="w-45 h-9">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Newest first</SelectItem>
            <SelectItem value="created_asc">Oldest first</SelectItem>
            <SelectItem value="title_asc">Title A–Z</SelectItem>
            <SelectItem value="title_desc">Title Z–A</SelectItem>
            <SelectItem value="type_asc">Type A–Z</SelectItem>
            <SelectItem value="updated_desc">Recently updated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
          {filters.type?.map((t) => (
            <FilterBadge key={`type-${t}`} label={t} onRemove={() => toggleArrayFilter("type", t)} />
          ))}
          {filters.status?.map((s) => (
            <FilterBadge
              key={`status-${s}`}
              label={statusConfig[s as keyof typeof statusConfig]?.label || s}
              onRemove={() => toggleArrayFilter("status", s)}
            />
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
              label={getPublicationName(filters.publication)}
              onRemove={() => onFiltersChange({ ...filters, publication: undefined })}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
