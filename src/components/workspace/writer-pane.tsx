import { type WriterTab } from "@/lib/stores/workspace-tabs-store";
import { WriterEditorPane } from "./editor-pane";

interface WriterPaneProps {
  tab: WriterTab;
  localContent: string;
  project: any;
  onContentChange?: (content: string) => void;
}

export function WriterPane({ tab, localContent, project, onContentChange }: WriterPaneProps) {
  if (!project) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading project...</div>;
  }

  return <WriterEditorPane projectId={tab.projectId} content={localContent} onContentChange={onContentChange ?? (() => {})} className="h-full" />;
}
