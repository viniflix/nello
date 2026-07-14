import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { 
  Bold, Italic, Strikethrough, List, ListOrdered, 
  Quote, Undo, Redo, Heading2, Heading3, Link as LinkIcon,
  Table as TableIcon, Trash2, Columns, Rows
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MenuBar = ({ editor, disabled }) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

  if (!editor) {
    return null;
  }

  const toggleClasses = "p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-transparent transition-colors";
  const activeClasses = "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";

  const setLink = useCallback(() => {
    // cancelled
    if (linkUrl === null) {
      return;
    }

    // empty
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setIsLinkPopoverOpen(false);
      return;
    }

    // update link
    let url = linkUrl;
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkUrl('');
    setIsLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled || !editor.can().chain().focus().toggleBold().run()}
        className={`${toggleClasses} ${editor.isActive('bold') ? activeClasses : ''}`}
        title="Negrito"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled || !editor.can().chain().focus().toggleItalic().run()}
        className={`${toggleClasses} ${editor.isActive('italic') ? activeClasses : ''}`}
        title="Itálico"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={disabled || !editor.can().chain().focus().toggleStrike().run()}
        className={`${toggleClasses} ${editor.isActive('strike') ? activeClasses : ''}`}
        title="Tachado"
      >
        <Strikethrough className="w-4 h-4" />
      </button>
      
      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        disabled={disabled}
        className={`${toggleClasses} ${editor.isActive('heading', { level: 2 }) ? activeClasses : ''}`}
        title="Título 1"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        disabled={disabled}
        className={`${toggleClasses} ${editor.isActive('heading', { level: 3 }) ? activeClasses : ''}`}
        title="Título 2"
      >
        <Heading3 className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={disabled}
        className={`${toggleClasses} ${editor.isActive('bulletList') ? activeClasses : ''}`}
        title="Lista"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={disabled}
        className={`${toggleClasses} ${editor.isActive('orderedList') ? activeClasses : ''}`}
        title="Lista Numerada"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        disabled={disabled}
        className={`${toggleClasses} ${editor.isActive('blockquote') ? activeClasses : ''}`}
        title="Citação"
      >
        <Quote className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`${toggleClasses} ${editor.isActive('link') ? activeClasses : ''}`}
            title="Adicionar Link"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <div className="flex gap-2">
            <Input 
                placeholder="https://..." 
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        setLink();
                    }
                }}
            />
            <Button onClick={setLink} size="sm">Salvar</Button>
            {editor.isActive('link') && (
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                        editor.chain().focus().unsetLink().run();
                        setIsLinkPopoverOpen(false);
                    }}
                >
                    Remover
                </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        disabled={disabled}
        className={toggleClasses}
        title="Inserir Tabela"
      >
        <TableIcon className="w-4 h-4" />
      </button>

      {editor.isActive('table') && (
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-md p-1 ml-1">
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className={toggleClasses}
                title="Adicionar Coluna"
              >
                <Columns className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className={toggleClasses}
                title="Adicionar Linha"
              >
                <Rows className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className={`${toggleClasses} text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30`}
                title="Excluir Tabela"
              >
                <Trash2 className="w-3 h-3" />
              </button>
          </div>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().chain().focus().undo().run()}
        className={toggleClasses}
        title="Desfazer"
      >
        <Undo className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().chain().focus().redo().run()}
        className={toggleClasses}
        title="Refazer"
      >
        <Redo className="w-4 h-4" />
      </button>
    </div>
  );
};

export const RichTextEditor = ({ value, onChange, placeholder, disabled, minHeight = "min-h-[250px]" }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
          heading: {
              levels: [1, 2, 3],
          }
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Digite aqui (Pressione / para comandos)...',
        emptyEditorClass: 'is-editor-empty before:content-[attr(data-placeholder)] before:text-zinc-400 before:float-left before:pointer-events-none before:h-0',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 dark:text-blue-400 underline underline-offset-4 decoration-blue-300 dark:decoration-blue-700 hover:decoration-blue-600 dark:hover:decoration-blue-400 transition-colors',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full border border-zinc-300 dark:border-zinc-700 my-4',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-2 text-left font-semibold',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-zinc-300 dark:border-zinc-700 p-2',
        },
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const isEmpty = editor.isEmpty;
      onChange(isEmpty ? '' : html);
    },
    editorProps: {
      attributes: {
        // Notion-like typography: Inter font, subtle colors, consistent spacing, slightly larger line height
        class: `prose prose-zinc dark:prose-invert max-w-none focus:outline-none p-6 ${minHeight} ${disabled ? 'opacity-80' : ''} font-sans leading-relaxed text-zinc-700 dark:text-zinc-300 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_h2]:mt-8 [&_h2]:mb-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-100 [&_h3]:mt-6 [&_h3]:mb-3 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 dark:[&_blockquote]:border-zinc-700 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-600 dark:[&_blockquote]:text-zinc-400`,
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      const currentText = editor.getText();
      if (!currentText && value) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  if (!isMounted) return <div className={`border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 ${minHeight}`} />;

  return (
    <div className={`border rounded-xl bg-white dark:bg-zinc-950 flex flex-col overflow-hidden transition-all shadow-sm ${
      editor?.isFocused ? 'border-zinc-400 dark:border-zinc-600 ring-1 ring-zinc-400 dark:ring-zinc-600' : 'border-zinc-200 dark:border-zinc-800'
    } ${disabled ? 'bg-zinc-50 dark:bg-zinc-900/50' : ''}`}>
      {!disabled && <MenuBar editor={editor} disabled={disabled} />}
      <div className="flex-1 overflow-y-auto cursor-text scroll-smooth" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
