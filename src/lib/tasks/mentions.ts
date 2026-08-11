/**
 * @mention encoding for task comments.
 *
 * A mention is stored inline in the comment body as `@[Display Name](userId)`.
 * Keeping the id in the text (rather than only in the `mentions` column) means
 * the renderer can highlight the exact span, and a later display-name change
 * doesn't break the link — the id is authoritative, the name is just a label.
 *
 * The `mentions` column is the denormalised id list, used for notification
 * fan-out without re-parsing.
 */

/** Matches `@[Name](userId)`. Name may not contain `]`, id may not contain `)`. */
export const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g

export interface ParsedMention {
  name: string
  userId: string
}

/** Every mention token in `body`, in order, duplicates included. */
export function parseMentions(body: string): ParsedMention[] {
  const out: ParsedMention[] = []
  // Fresh regex per call — a module-level /g regex carries lastIndex between
  // calls and would skip matches on the second invocation.
  const re = new RegExp(MENTION_PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    out.push({ name: m[1], userId: m[2] })
  }
  return out
}

/** Unique mentioned user ids. */
export function mentionedUserIds(body: string): string[] {
  return Array.from(new Set(parseMentions(body).map(m => m.userId)))
}

/**
 * Comment text with mention tokens flattened to `@Name`, for notification
 * bodies and anywhere the markup would just be noise.
 */
export function stripMentionMarkup(body: string): string {
  return body.replace(new RegExp(MENTION_PATTERN.source, 'g'), '@$1')
}

/**
 * Split a body into plain-text and mention segments so the UI can render
 * highlights without using dangerouslySetInnerHTML.
 */
export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; name: string; userId: string }

export function segmentComment(body: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  const re = new RegExp(MENTION_PATTERN.source, 'g')
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: body.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'mention', name: m[1], userId: m[2] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) })
  }
  return segments
}
