import { usePeople, usePublications, useTags, useTopics, useUploads, useCollections } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, RotateCcw, X, Library } from "lucide-react";
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

  const handleFilterChange = (key: keyof ChatFilters, value: string) => {
    if (key === "condition") return;
    if (value === "all") {
      const next = { ...filters };
      delete next[key];
      onFiltersChange(next);
    } else {
      onFiltersChange({ ...filters, [key]: [value] });
    }
  };

  const activeFilterCount = Object.entries(filters).reduce((count, [key, val]) => {
    if (key === "condition") return count;
    return count + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col">
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
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Match Mode</label>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  (filters.condition || "or") === "or"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onFiltersChange({ ...filters, condition: "or" })}
              >
                Match Any (OR)
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filters.condition === "and" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onFiltersChange({ ...filters, condition: "and" })}
              >
                Match All (AND)
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {(filters.condition || "or") === "or" ? "Results match any selected filter." : "Results must match all selected filters."}
            </p>
          </div>
          <FilterSelect
            label="Collection"
            value={filters.collections?.[0]}
            placeholder="All collections"
            onValueChange={(value) => handleFilterChange("collections", value)}
            options={collections?.map((c) => ({
              value: c.id,
              label: c.name || "Untitled",
              icon: <Library className="h-3.5 w-3.5 text-muted-foreground" />,
            }))}
            emptyMessage="No collections yet. Create one in Library → Collections."
          />
          <FilterSelect
            label="Subject"
            value={filters.subjects?.[0]}
            placeholder="All subjects"
            onValueChange={(value) => handleFilterChange("subjects", value)}
            options={people?.map((p) => ({ value: p.id, label: p.name || "Unnamed" }))}
          />
          <FilterSelect
            label="Publication"
            value={filters.publications?.[0]}
            placeholder="All publications"
            onValueChange={(value) => handleFilterChange("publications", value)}
            options={publications?.map((p) => ({ value: p.id, label: p.name || "Unnamed" }))}
          />
          <FilterSelect
            label="Topic"
            value={filters.topics?.[0]}
            placeholder="All topics"
            onValueChange={(value) => handleFilterChange("topics", value)}
            options={topics?.map((t) => ({ value: t.id, label: t.title || "Unnamed" }))}
          />
          <FilterSelect
            label="Tag"
            value={filters.tags?.[0]}
            placeholder="All tags"
            onValueChange={(value) => handleFilterChange("tags", value)}
            options={tags?.map((t) => ({ value: t.id, label: t.title || "Unnamed" }))}
          />
          <FilterSelect
            label="Type"
            value={filters.types?.[0]}
            placeholder="All types"
            onValueChange={(value) => handleFilterChange("types", value)}
            options={Object.values(UploadsTypeOptions).map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
            }))}
          />
          <FilterSelect
            label="Document"
            value={filters.uploads?.[0]}
            placeholder="All documents"
            onValueChange={(value) => handleFilterChange("uploads", value)}
            options={uploads?.map((u) => ({ value: u.id, label: u.title || "Untitled" }))}
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

interface FilterSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface FilterSelectProps {
  label: string;
  value: string | undefined;
  placeholder: string;
  onValueChange: (value: string) => void;
  options?: FilterSelectOption[];
  emptyMessage?: string;
}

function FilterSelect({ label, value, placeholder, onValueChange, options, emptyMessage }: FilterSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value || "all"} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
          {options?.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.icon ? (
                <div className="flex items-center gap-2">
                  {opt.icon}
                  {opt.label}
                </div>
              ) : (
                opt.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {emptyMessage && options?.length === 0 && <p className="text-[11px] text-muted-foreground">{emptyMessage}</p>}
    </div>
  );
}
