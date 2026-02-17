import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./editor-toolbar";

interface WriterEditorPaneProps {
  projectId: string;
  content: string;
  onContentChange: (content: string) => void;
  onInsertContent?: (content: string) => void;
  className?: string;
}

export function WriterEditorPane({ projectId, content, onContentChange, onInsertContent, className }: WriterEditorPaneProps) {
  const lastSavedContent = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Typography,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4",
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose dark:prose-invert max-w-none focus:outline-none min-h-[500px] px-8 py-6",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html !== lastSavedContent.current) {
        onContentChange(html);
      }
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
      lastSavedContent.current = content;
    }
  }, [projectId, content, editor]);

  const insertContent = useCallback(
    (insertText: string) => {
      if (editor) {
        editor.chain().focus().insertContent(insertText).run();
      }
    },
    [editor],
  );

  useEffect(() => {
    if (onInsertContent) {
      (window as any).__writerInsertContent = insertContent;
    }
    return () => {
      delete (window as any).__writerInsertContent;
    };
  }, [insertContent, onInsertContent]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

export function useEditorWordCount(editor: ReturnType<typeof useEditor>) {
  if (!editor) return 0;
  const text = editor.getText();
  return text.split(/\s+/).filter(Boolean).length;
}
