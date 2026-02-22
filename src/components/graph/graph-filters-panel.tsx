import { usePeople, usePublications, useTags, useTopics } from "@/lib/api/queries";
import type { UploadFilters } from "@/lib/api/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CreatableCombobox } from "@/components/creatable-combobox";
import { SlidersHorizontal, RotateCcw, X } from "lucide-react";
import { UploadsTypeOptions } from "@/lib/pocketbase-types";

interface GraphFiltersPanelProps {
  filters: UploadFilters;
  onFiltersChange: (filters: UploadFilters) => void;
  onClose: () => void;
}

export function GraphFiltersPanel({ filters, onFiltersChange, onClose }: GraphFiltersPanelProps) {
  const { data: people } = usePeople();
  const { data: publications } = usePublications();
  const { data: tags } = useTags();
  const { data: topics } = useTopics();

  const handleFilterToggle = (key: keyof UploadFilters, value: string) => {
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

  const activeFilterCount = [
    (filters.type?.length || 0) > 0,
    (filters.tags?.length || 0) > 0,
    (filters.topics?.length || 0) > 0,
    (filters.people?.length || 0) > 0,
    !!filters.publication,
  ].filter(Boolean).length;

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
          <FilterCombobox
            label="Type"
            values={filters.type}
            placeholder="All types"
            onToggle={(value) => handleFilterToggle("type", value)}
            options={Object.values(UploadsTypeOptions).map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
            }))}
          />
          <FilterCombobox
            label="Tag"
            values={filters.tags}
            placeholder="All tags"
            onToggle={(value) => handleFilterToggle("tags", value)}
            options={tags?.map((t) => ({ value: t.id, label: t.title || "Untitled" })) ?? []}
          />
          <FilterCombobox
            label="Topic"
            values={filters.topics}
            placeholder="All topics"
            onToggle={(value) => handleFilterToggle("topics", value)}
            options={topics?.map((t) => ({ value: t.id, label: t.title || "Untitled" })) ?? []}
          />
          <FilterCombobox
            label="Author"
            values={filters.people}
            placeholder="All authors"
            onToggle={(value) => handleFilterToggle("people", value)}
            options={people?.map((p) => ({ value: p.id, label: p.name || "Unknown" })) ?? []}
          />
          <FilterCombobox
            label="Publication"
            values={filters.publication ? [filters.publication] : undefined}
            placeholder="All publications"
            onToggle={(value) => {
              onFiltersChange({
                ...filters,
                publication: filters.publication === value ? undefined : value,
              });
            }}
            options={publications?.map((p) => ({ value: p.id, label: p.name || "Untitled" })) ?? []}
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
}

function FilterCombobox({ label, values, placeholder, onToggle, options }: FilterComboboxProps) {
  return (
    <div className="space-y-1.5 min-w-0 overflow-hidden">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <CreatableCombobox
        options={options}
        value={values ?? []}
        onSelect={onToggle}
        placeholder={placeholder}
        emptyText="No results found."
        isMulti
        className="h-9 text-sm"
      />
    </div>
  );
}
