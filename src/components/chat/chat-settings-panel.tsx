import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Settings2, X } from "lucide-react";
import type { LLMParameters, RetrievalParameters } from "@/lib/types";

interface ChatSettingsPanelProps {
  mode: "chat" | "search";
  llmParams: LLMParameters;
  onLlmParamsChange: (params: LLMParameters) => void;
  retrievalParams: RetrievalParameters;
  onRetrievalParamsChange: (params: RetrievalParameters) => void;
  onClose: () => void;
}

export function ChatSettingsPanel({ mode, llmParams, onLlmParamsChange, retrievalParams, onRetrievalParamsChange, onClose }: ChatSettingsPanelProps) {
  const updateLlm = <K extends keyof LLMParameters>(key: K, value: LLMParameters[K]) => onLlmParamsChange({ ...llmParams, [key]: value });

  const updateRetrieval = <K extends keyof RetrievalParameters>(key: K, value: RetrievalParameters[K]) =>
    onRetrievalParamsChange({ ...retrievalParams, [key]: value });

  return (
    <div className="w-72 shrink-0 border-r border-border bg-muted/30 flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {mode === "chat" && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LLM Parameters</h4>
              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Select value={llmParams.model_name || "GPT_4O_MINI"} onValueChange={(v) => updateLlm("model_name", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GPT_4O_MINI">GPT-4o Mini</SelectItem>
                    <SelectItem value="GPT_4O">GPT-4o</SelectItem>
                    <SelectItem value="GPT_4_TURBO">GPT-4 Turbo</SelectItem>
                    <SelectItem value="GPT_3_5_TURBO">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SliderField
                label="Temperature"
                value={llmParams.temperature ?? 0.1}
                onChange={(v) => updateLlm("temperature", v)}
                min={0}
                max={1}
                step={0.1}
                formatValue={(v) => v.toFixed(1)}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">System Prompt</Label>
                <Textarea
                  value={llmParams.system_prompt || ""}
                  onChange={(e) => updateLlm("system_prompt", e.target.value)}
                  placeholder="Optional system prompt..."
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>
              <SwitchField label="Use Citations" checked={llmParams.use_citation ?? true} onChange={(v) => updateLlm("use_citation", v)} />
              <SwitchField
                label="Chain of Thought"
                checked={llmParams.use_chain_of_thought_reasoning ?? false}
                onChange={(v) => updateLlm("use_chain_of_thought_reasoning", v)}
              />
            </div>
          )}
          {mode === "chat" && <Separator />}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Retrieval Parameters</h4>
            <div className="space-y-1.5">
              <Label className="text-xs">Retrieval Mode</Label>
              <Select
                value={retrievalParams.retrieval_mode || "chunks"}
                onValueChange={(v) => updateRetrieval("retrieval_mode", v as "chunks" | "files")}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chunks">Chunks</SelectItem>
                  <SelectItem value="files">Files</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SliderField
              label="Dense Similarity Top K"
              value={retrievalParams.dense_similarity_top_k ?? 10}
              onChange={(v) => updateRetrieval("dense_similarity_top_k", v)}
              min={1}
              max={50}
              step={1}
            />
            <SliderField
              label="Dense Similarity Cutoff"
              value={retrievalParams.dense_similarity_cutoff ?? 0}
              onChange={(v) => updateRetrieval("dense_similarity_cutoff", v)}
              min={0}
              max={1}
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
            />
            <SliderField
              label="Sparse Similarity Top K"
              value={retrievalParams.sparse_similarity_top_k ?? 0}
              onChange={(v) => updateRetrieval("sparse_similarity_top_k", v)}
              min={0}
              max={50}
              step={1}
            />
            <SliderField
              label="Alpha (hybrid balance)"
              value={retrievalParams.alpha ?? 0}
              onChange={(v) => updateRetrieval("alpha", v)}
              min={0}
              max={1}
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
            />
            <SliderField
              label="Files Top K"
              value={retrievalParams.files_top_k ?? 0}
              onChange={(v) => updateRetrieval("files_top_k", v)}
              min={0}
              max={20}
              step={1}
            />
            <SwitchField
              label="Enable Reranking"
              checked={retrievalParams.enable_reranking ?? true}
              onChange={(v) => updateRetrieval("enable_reranking", v)}
            />
            {retrievalParams.enable_reranking && (
              <SliderField
                label="Rerank Top N"
                value={retrievalParams.rerank_top_n ?? 5}
                onChange={(v) => updateRetrieval("rerank_top_n", v)}
                min={1}
                max={20}
                step={1}
              />
            )}
            <SwitchField
              label="Page Figure Nodes"
              checked={retrievalParams.retrieve_page_figure_nodes ?? false}
              onChange={(v) => updateRetrieval("retrieve_page_figure_nodes", v)}
            />
            <SwitchField
              label="Page Screenshot Nodes"
              checked={retrievalParams.retrieve_page_screenshot_nodes ?? false}
              onChange={(v) => updateRetrieval("retrieve_page_screenshot_nodes", v)}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{formatValue ? formatValue(value) : value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} className="w-full" />
    </div>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
