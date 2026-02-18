import { usePeople, usePublications, useTags, useTopics, useUploads, useCollections } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { SlidersHorizontal, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadsTypeOptions } from "@/lib/pocketbase-types";
import type { ChatFilters } from "@/lib/types";

interface ChatFiltersPanelProps {
  filters: ChatFilters;
  onFiltersChange: (filters: ChatFilters) => void;
  onClose: () => void;
}

export function ChatFiltersPanel({ filters, onFiltersChange, onClose }: ChatFiltersPanelProps) {
  const { data: people } = usePeople();
  const { data: publications } = usePublications();
  const { data: tags } = useTags();
  const { data: topics } = useTopics();
  const { data: uploads } = useUploads();
  const { data: collections } = useCollections();

  const handleFilterToggle = (key: keyof ChatFilters, value: string) => {
    if (key === "condition") return;
    const current = (filters[key] as string[] | undefined) || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    if (next.length === 0) {
      const updated = { ...filters };
      delete updated[key];
      onFiltersChange(updated);
    } else {
      onFiltersChange({ ...filters, [key]: next });
    }
  };

  const activeFilterCount = Object.entries(filters).reduce((count, [key, val]) => {
    if (key === "condition") return count;
    return count + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="w-64 min-w-0 max-w-64 shrink-0 overflow-hidden border-r border-border bg-muted/30 flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 [&>div>div]:block!">
        <div className="p-4 space-y-5 overflow-hidden">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Match Mode</label>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  (filters.condition || "or") === "or"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onFiltersChange({ ...filters, condition: "or" })}
              >
                OR
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  filters.condition === "and" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onFiltersChange({ ...filters, condition: "and" })}
              >
                AND
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {(filters.condition || "or") === "or" ? "Results match any filter." : "Results must match all filters."}
            </p>
          </div>
          <FilterCombobox
            label="Collection"
            values={filters.collections}
            placeholder="All collections"
            onToggle={(value) => handleFilterToggle("collections", value)}
            options={collections?.map((c) => ({ value: c.id, label: c.name || "Untitled" })) ?? []}
            emptyMessage="No collections yet."
          />
          <FilterCombobox
            label="Subject"
            values={filters.people}
            placeholder="All subjects"
            onToggle={(value) => handleFilterToggle("people", value)}
            options={people?.map((p) => ({ value: p.id, label: p.name || "Unnamed" })) ?? []}
          />
          <FilterCombobox
            label="Publication"
            values={filters.publications}
            placeholder="All publications"
            onToggle={(value) => handleFilterToggle("publications", value)}
            options={publications?.map((p) => ({ value: p.id, label: p.name || "Unnamed" })) ?? []}
          />
          <FilterCombobox
            label="Topic"
            values={filters.topics}
            placeholder="All topics"
            onToggle={(value) => handleFilterToggle("topics", value)}
            options={topics?.map((t) => ({ value: t.id, label: t.title || "Unnamed" })) ?? []}
          />
          <FilterCombobox
            label="Tag"
            values={filters.tags}
            placeholder="All tags"
            onToggle={(value) => handleFilterToggle("tags", value)}
            options={tags?.map((t) => ({ value: t.id, label: t.title || "Unnamed" })) ?? []}
          />
          <FilterCombobox
            label="Type"
            values={filters.types}
            placeholder="All types"
            onToggle={(value) => handleFilterToggle("types", value)}
            options={Object.values(UploadsTypeOptions).map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
            }))}
          />
          <FilterCombobox
            label="Document"
            values={filters.uploads}
            placeholder="All documents"
            onToggle={(value) => handleFilterToggle("uploads", value)}
            options={uploads?.map((u) => ({ value: u.id, label: u.title || "Untitled" })) ?? []}
          />
        </div>
      </ScrollArea>
      {hasActiveFilters && (
        <>
          <Separator />
          <div className="p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange({})}
              className="w-full gap-2 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear all filters
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

interface FilterComboboxProps {
  label: string;
  values: string[] | undefined;
  placeholder: string;
  onToggle: (value: string) => void;
  options: { value: string; label: string }[];
  emptyMessage?: string;
}

function FilterCombobox({ label, values, placeholder, onToggle, options, emptyMessage }: FilterComboboxProps) {
  return (
    <div className="space-y-1.5 min-w-0 overflow-hidden">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <CreatableCombobox
        options={options}
        value={values ?? []}
        onSelect={onToggle}
        placeholder={placeholder}
        emptyText={emptyMessage ?? "No results found."}
        isMulti
        className="h-9 text-sm"
      />
    </div>
  );
}
