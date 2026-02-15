import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Highlighter,
  CodeSquare,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OverflowAction =
  | { type: "separator" }
  | { type: "item"; label: string; icon: LucideIcon; action: () => void; active?: boolean };

interface EditorToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  if (!editor) return null;

  const showHeadings = true;
  const showLists = true;
  const showBlocks = true;
  const showOverflow = false;

  // Actions to show in overflow menu when hidden from toolbar
  const overflowActions: OverflowAction[] = [];

  if (!showHeadings) {
    overflowActions.push(
      {
        type: "item",
        label: "Heading 1",
        icon: Heading1,
        action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        active: editor.isActive("heading", { level: 1 }),
      },
      {
        type: "item",
        label: "Heading 2",
        icon: Heading2,
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        active: editor.isActive("heading", { level: 2 }),
      },
      {
        type: "item",
        label: "Heading 3",
        icon: Heading3,
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        active: editor.isActive("heading", { level: 3 }),
      },
      { type: "separator" },
    );
  }

  if (!showLists) {
    overflowActions.push(
      {
        type: "item",
        label: "Bullet List",
        icon: List,
        action: () => editor.chain().focus().toggleBulletList().run(),
        active: editor.isActive("bulletList"),
      },
      {
        type: "item",
        label: "Numbered List",
        icon: ListOrdered,
        action: () => editor.chain().focus().toggleOrderedList().run(),
        active: editor.isActive("orderedList"),
      },
      {
        type: "item",
        label: "Task List",
        icon: ListTodo,
        action: () => editor.chain().focus().toggleTaskList().run(),
        active: editor.isActive("taskList"),
      },
      { type: "separator" },
    );
  }

  if (!showBlocks) {
    overflowActions.push(
      {
        type: "item",
        label: "Quote",
        icon: Quote,
        action: () => editor.chain().focus().toggleBlockquote().run(),
        active: editor.isActive("blockquote"),
      },
      {
        type: "item",
        label: "Code Block",
        icon: CodeSquare,
        action: () => editor.chain().focus().toggleCodeBlock().run(),
        active: editor.isActive("codeBlock"),
      },
      {
        type: "item",
        label: "Horizontal Rule",
        icon: Minus,
        action: () => editor.chain().focus().setHorizontalRule().run(),
      },
      { type: "separator" },
      {
        type: "item",
        label: "Link",
        icon: LinkIcon,
        action: () => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
          } else {
            const url = window.prompt("Enter URL:");
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }
        },
        active: editor.isActive("link"),
      },
    );
  }

  return (
    <div ref={toolbarRef} className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30 w-full shrink-0">
      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5 mr-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Headings */}
      {showHeadings && (
        <div className="flex items-center gap-0.5 mr-1">
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 1 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 3 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="h-4 w-4" />
          </Toggle>
        </div>
      )}

      {/* Text formatting */}
      <div className="flex items-center gap-0.5 mr-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("strike")}
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("code")}
          onPressedChange={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("highlight")}
          onPressedChange={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="h-4 w-4" />
        </Toggle>
      </div>

      {/* Lists */}
      {showLists && (
        <div className="flex items-center gap-0.5 mr-1">
          <Toggle
            size="sm"
            pressed={editor.isActive("bulletList")}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("orderedList")}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("taskList")}
            onPressedChange={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListTodo className="h-4 w-4" />
          </Toggle>
        </div>
      )}

      {/* Blocks */}
      {showBlocks && (
        <div className="flex items-center gap-0.5">
          <Toggle
            size="sm"
            pressed={editor.isActive("blockquote")}
            onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("codeBlock")}
            onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <CodeSquare className="h-4 w-4" />
          </Toggle>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </Button>
          <Toggle
            size="sm"
            pressed={editor.isActive("link")}
            onPressedChange={() => {
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run();
              } else {
                const url = window.prompt("Enter URL:");
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              }
            }}
          >
            <LinkIcon className="h-4 w-4" />
          </Toggle>
        </div>
      )}

      {/* Overflow menu for hidden actions */}
      {showOverflow && overflowActions.length > 0 && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowActions.map((item, index) => {
                if (item.type === "separator") {
                  // Don't render separator at the end
                  if (index === overflowActions.length - 1) return null;
                  return <DropdownMenuSeparator key={index} />;
                }
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={index} onClick={item.action} className={item.active ? "bg-accent" : ""}>
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

interface WriterEditorPaneProps {
  projectId: string;
  content: string;
  onContentChange: (content: string) => void;
  onInsertContent?: (content: string) => void;
  className?: string;
}

export function WriterEditorPane({
  projectId,
  content,
  onContentChange,
  onInsertContent,
  className,
}: WriterEditorPaneProps) {
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

  // Update editor content when project changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
      lastSavedContent.current = content;
    }
  }, [projectId, content, editor]);

  // Expose insert function for workspace panel
  const insertContent = useCallback(
    (insertText: string) => {
      if (editor) {
        editor.chain().focus().insertContent(insertText).run();
      }
    },
    [editor],
  );

  // Make insert available to parent
  useEffect(() => {
    if (onInsertContent) {
      // Store the insert function reference
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

// Hook to get current word count from editor
export function useEditorWordCount(editor: ReturnType<typeof useEditor>) {
  if (!editor) return 0;
  const text = editor.getText();
  return text.split(/\s+/).filter(Boolean).length;
}
