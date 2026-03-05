import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  SeparatorHorizontal,
  Underline,
  Undo2,
  Variable
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RichTemplateEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export function RichTemplateEditor({
  value,
  onChange,
  className,
  placeholder = 'Comece a montar seu template aqui...'
}: RichTemplateEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    if (editor.innerHTML !== (value || '')) {
      editor.innerHTML = value || ''
    }
  }, [value])

  const emitValue = () => {
    if (!editorRef.current) {
      return
    }
    onChange(editorRef.current.innerHTML)
  }

  const focusEditor = () => {
    editorRef.current?.focus()
  }

  const exec = (command: string, argument?: string) => {
    focusEditor()
    document.execCommand(command, false, argument)
    emitValue()
  }

  const insertHtml = (html: string) => {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    emitValue()
  }

  const insertLink = () => {
    const url = window.prompt('URL do link', 'https://')
    if (!url) {
      return
    }
    exec('createLink', url)
  }

  const insertImage = () => {
    const url = window.prompt('URL da imagem', 'https://')
    if (!url) {
      return
    }

    insertHtml(`<img src="${url}" alt="Imagem" style="max-width:100%;height:auto;border-radius:8px;" />`)
  }

  const insertVariable = () => {
    const variable = window.prompt('Nome da variável', 'nome_cliente')
    if (!variable) {
      return
    }

    insertHtml(`{{${variable.trim()}}}`)
  }

  const hasContent = Boolean((value || '').replace(/<[^>]+>/g, '').trim())

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-white', className)}>
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-slate-50/70 p-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('undo')}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('redo')}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200" />

        <Button type="button" variant="ghost" size="sm" onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('underline')}>
          <Underline className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200" />

        <Button type="button" variant="ghost" size="sm" onClick={() => exec('justifyLeft')}>
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('justifyCenter')}>
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('justifyRight')}>
          <AlignRight className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200" />

        <Button type="button" variant="ghost" size="sm" onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={insertLink}>
          <Link className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={insertImage}>
          <Image className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={insertVariable}>
          <Variable className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => insertHtml('<hr style="margin:24px 0;border:0;border-top:1px solid #e2e8f0;" />')}>
          <SeparatorHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            insertHtml(
              '<a href="{{cta_url}}" style="display:inline-block;background:#0ea5e9;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">CTA principal</a>'
            )
          }
        >
          CTA
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec('removeFormat')}>
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative">
        {!hasContent && !isFocused ? (
          <div className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[320px] p-4 text-sm leading-6 text-slate-800 outline-none sm:min-h-[420px]"
          onInput={emitValue}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            emitValue()
          }}
        />
      </div>
    </div>
  )
}
