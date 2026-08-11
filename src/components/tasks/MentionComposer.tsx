'use client'

/**
 * Comment box with @mention autocomplete.
 *
 * Typing `@` opens a picker over the company's users. Selecting one inserts
 * the `@[Name](userId)` token that src/lib/projects/mentions.ts understands —
 * the id travels with the text so the mention survives a later rename.
 *
 * The token is machine-readable but ugly, so the textarea shows a plain
 * `@Name` while the raw value is kept in a ref-like state alongside it. To
 * keep that honest we store the raw body and only *display* the stripped
 * form when the field is not focused — editing always works on the raw text,
 * which avoids the two representations drifting apart.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AtSign, Loader2 } from 'lucide-react'
import { segmentComment, type MentionSegment } from '@/lib/tasks/mentions'

interface MentionUser {
  userId: string
  name: string
  email: string
  position: string | null
  employeeNo: string | null
}

export function MentionComposer({
  onSubmit,
  placeholder = 'Write a comment…  use @ to mention someone',
  submitLabel = 'Post',
}: {
  onSubmit: (body: string) => Promise<void>
  placeholder?: string
  submitLabel?: string
}) {
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<MentionUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  /** Index of the `@` that opened the picker, so we can replace from there. */
  const triggerIndex = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Debounced lookup while the picker is open.
  useEffect(() => {
    if (!pickerOpen) return
    let cancelled = false
    setLoadingUsers(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/mentionable-users?q=${encodeURIComponent(query)}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setUsers(data.users ?? [])
          setActiveIndex(0)
        }
      } finally {
        if (!cancelled) setLoadingUsers(false)
      }
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [pickerOpen, query])

  const handleChange = useCallback((value: string, caret: number) => {
    setBody(value)

    // Look backwards from the caret for an `@` that starts a mention. Bail out
    // on whitespace so "email@domain" mid-word doesn't open the picker.
    let i = caret - 1
    while (i >= 0 && !/\s/.test(value[i]) && value[i] !== '@') i--

    if (i >= 0 && value[i] === '@' && (i === 0 || /\s/.test(value[i - 1]))) {
      triggerIndex.current = i
      setQuery(value.slice(i + 1, caret))
      setPickerOpen(true)
    } else {
      triggerIndex.current = null
      setPickerOpen(false)
    }
  }, [])

  const insertMention = useCallback((user: MentionUser) => {
    const start = triggerIndex.current
    if (start === null) return
    const el = textareaRef.current
    const caret = el?.selectionStart ?? body.length
    const token = `@[${user.name}](${user.userId}) `
    const next = body.slice(0, start) + token + body.slice(caret)
    setBody(next)
    setPickerOpen(false)
    triggerIndex.current = null
    // Restore focus and drop the caret after the inserted token.
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + token.length
      el?.setSelectionRange(pos, pos)
    })
  }, [body])

  const submit = async () => {
    const trimmed = body.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      await onSubmit(trimmed)
      setBody('')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        rows={3}
        value={body}
        placeholder={placeholder}
        className="text-sm"
        onChange={e => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={e => {
          if (pickerOpen && users.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex(i => (i + 1) % users.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex(i => (i - 1 + users.length) % users.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              insertMention(users[activeIndex])
              return
            }
            if (e.key === 'Escape') {
              setPickerOpen(false)
              return
            }
          }
          // Ctrl/Cmd+Enter posts, matching most comment boxes.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />

      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {loadingUsers && users.length === 0 ? (
            <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </p>
          ) : users.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No matching users.</p>
          ) : (
            users.map((u, i) => (
              <button
                key={u.userId}
                type="button"
                onMouseDown={e => { e.preventDefault(); insertMention(u) }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
                  i === activeIndex ? 'bg-primary/10' : 'hover:bg-muted/60',
                )}
              >
                <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {u.position ?? u.email}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          <AtSign className="mr-0.5 inline h-3 w-3" />
          to mention · ⌘/Ctrl + Enter to post
        </p>
        <Button size="sm" onClick={() => void submit()} disabled={posting || !body.trim()}>
          {posting && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
      </div>

      {/* Live preview of how the mention will render, shown only when the raw
          token markup is present so it doesn't add noise to plain comments. */}
      {body.includes('@[') && (
        <div className="mt-1.5 rounded-md bg-muted/40 p-2">
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Preview</p>
          <CommentBody body={body} />
        </div>
      )}
    </div>
  )
}

/** Renders a comment with its @mentions highlighted. */
export function CommentBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm text-foreground">
      {segmentComment(body).map((seg: MentionSegment, i: number) =>
        seg.type === 'mention' ? (
          <span
            key={i}
            className="rounded bg-primary/10 px-1 font-medium text-primary"
            title={seg.name}
          >
            @{seg.name}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </p>
  )
}
