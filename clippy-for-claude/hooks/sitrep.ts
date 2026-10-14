import type { SessionMessage } from 'claude-code'

import type { Sitrep } from '../types'

const LINE_MAX = 140

const INSTRUCTIONS = [
  'Write a catch-up note for the user, who is stepping away and will come back to this session later.',
  'Reply with ONLY a JSON object, no prose and no code fence:',
  '{"now": string, "last": string[], "you": string, "next": string[]}',
  '- now: one sentence on what is in progress, or "Nothing in progress: <state>".',
  '- last: up to 2 short items on what was just done.',
  '- you: the one decision or action waiting on the user, or "" if none.',
  '- next: up to 2 next steps, each saying who does it ("You ..." or "Claude ...").',
  `Plain text, no markdown, each item under ${LINE_MAX - 30} characters. Be concrete: name files, features, numbers.`,
].join('\n')

export const forkPrompt = (git: string) =>
  `[Status card request from the Clippy mod. Answer only this; do not continue the task.]\n${INSTRUCTIONS}\n\nGit right now:\n${git}`

export const haikuPrompt = (transcript: string, git: string) =>
  `${INSTRUCTIONS}\n\nGit right now:\n${git}\n\nThe session so far (oldest first, trimmed):\n${transcript}`

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// Most recent messages first until the budget runs out, then back in reading order.
export const transcriptOf = (messages: readonly SessionMessage[], budget = 24000) => {
  const lines: string[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0 && used < budget; i--) {
    const m = messages[i]
    if (!m) continue
    const tools = m.toolUses.map(t => t.tool).join(', ')
    const body = clip(m.text.replace(/\s+/g, ' ').trim(), 700)
    if (!body && !tools) continue
    const line = `${m.role === 'user' ? 'USER' : 'CLAUDE'}: ${body}${tools ? ` [tools: ${tools}]` : ''}`
    lines.push(line)
    used += line.length
  }
  return lines.reverse().join('\n')
}

const asText = (v: unknown) => (typeof v === 'string' ? clip(v.trim(), LINE_MAX) : '')

const asList = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
    .map(asText)
    .filter(Boolean)
    .slice(0, 2)

export const parseSitrep = (text: string, at: number, turn: number, source: Sitrep['source']): Sitrep | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const note: Sitrep = {
      at,
      turn,
      source,
      now: asText(raw.now),
      last: asList(raw.last),
      you: asText(raw.you),
      next: asList(raw.next),
    }
    return note.now || note.last.length || note.next.length ? note : null
  } catch {
    return null
  }
}

export type GitSnapshot = { branch: string | null; dirty: number; recent: string[] }

// `git status -b --porcelain`: first line "## branch...upstream", then one line per changed file.
export const parseGit = (status: string, log: string): GitSnapshot => {
  const [head = '', ...files] = status.split('\n').filter(Boolean)
  const branch = /^## (?:No commits yet on )?([^.\s]+)/.exec(head)?.[1] ?? null
  return {
    branch,
    dirty: files.length,
    recent: log
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 3),
  }
}

export const gitSummary = (g: GitSnapshot | null) =>
  g
    ? [`branch: ${g.branch ?? 'unknown'}`, `uncommitted files: ${g.dirty}`, ...g.recent.map(c => `commit: ${c}`)].join('\n')
    : 'not a git repository'

// Free fallback when no model call is possible: what git alone can say.
export const gitOnlySitrep = (g: GitSnapshot | null, at: number, turn: number): Sitrep => ({
  at,
  turn,
  source: 'git',
  now: g ? `On ${g.branch ?? 'a detached head'} with ${g.dirty} uncommitted file${g.dirty === 1 ? '' : 's'}.` : 'No git repository here.',
  last: (g?.recent ?? []).slice(0, 2).map(c => `Committed ${clip(c.replace(/^\w+\s/, ''), LINE_MAX - 10)}`),
  you: '',
  next: ['Run /sitrep once Claude has replied for a fuller note.'],
})

export const timeOfDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export const ago = (ms: number) => {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}
