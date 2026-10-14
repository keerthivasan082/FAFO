import type { PetLimit, PetSpeech } from '../types'
import { LABELS, resetLabel } from './sprite'

type Lines = PetSpeech['lines']

const RED = '#D9342B'
const AMBER = '#B7791F'
const GREEN = '#2F8F3E'

// --- Limit coach ---

export const LIMIT_STEPS = [75, 90] as const
export const NOTIFY_AT = 95

// The highest step a window has crossed, or null below the first one.
export const limitStep = (percentUsed: number) =>
  [...LIMIT_STEPS].reverse().find(step => percentUsed >= step) ?? null

// One key per window, reset and step: a new window (new resetsAt) starts the warnings over.
export const limitKey = (l: PetLimit, step: number) => `${l.kind}:${l.resetsAt ?? ''}:${step}`

const labelOf = (l: PetLimit) => (LABELS[l.kind] ?? l.kind.replace(/_/g, ' ')).toLowerCase()

export const limitSpeech = (l: PetLimit, now: number): Lines => {
  const resets = resetLabel(l.resetsAt, now).replace(/^ · /, '')
  return [
    [{ text: 'It looks like you’ve used ' }, { text: `${Math.round(l.percentUsed)}%`, color: l.percentUsed >= 90 ? RED : AMBER }],
    [{ text: `of your ${labelOf(l)} limit.` }],
    [{ text: resets ? `It ${resets}.` : 'Maybe save the big tasks for later.' }],
  ]
}

export const limitNotice = (l: PetLimit, now: number) => {
  const resets = resetLabel(l.resetsAt, now).replace(/^ · /, '')
  return `Your ${labelOf(l)} limit is at ${Math.round(l.percentUsed)}%${resets ? `; it ${resets}` : ''}.`
}

// --- Context nudge ---

export const CONTEXT_STEPS = [80, 90] as const

export const contextStep = (percent: number) =>
  [...CONTEXT_STEPS].reverse().find(step => percent >= step) ?? null

export const contextSpeech = (percent: number): Lines => [
  [{ text: 'It looks like this chat is getting long' }],
  [{ text: '(' }, { text: `${Math.round(percent)}% full`, color: percent >= 90 ? RED : AMBER }, { text: '). Try /compact,' }],
  [{ text: 'or start a fresh chat for the next task.' }],
]

// --- Test watcher ---

export type CheckKind = 'tests' | 'the type check' | 'lint' | 'the build'

// First match wins, so `npm test` is tests even though it may also build.
const CHECKS: { kind: CheckKind; re: RegExp }[] = [
  {
    kind: 'tests',
    re: /\b(jest|vitest|pytest|mocha|rspec|phpunit|playwright test|cypress run|go test|cargo test|(npm|pnpm|yarn|bun)( run)? test(:\w+)?)\b/,
  },
  { kind: 'the type check', re: /\b(tsc|mypy|pyright|(npm|pnpm|yarn|bun) (run )?(typecheck|type-check))\b/ },
  { kind: 'lint', re: /\b(eslint|ruff|flake8|biome (check|lint)|(npm|pnpm|yarn|bun) (run )?lint)\b/ },
  { kind: 'the build', re: /\b((npm|pnpm|yarn|bun) (run )?build|vite build|next build|cargo build|go build)\b/ },
]

export const checkKind = (command: string): CheckKind | null => CHECKS.find(c => c.re.test(command))?.kind ?? null

// "3 failed", "2 failing", "5 errors" — the first count the output gives, if any.
export const failureCount = (output: string) => {
  const m = /(\d+)\s+(failed|failing|failures?|errors?)\b/i.exec(output)
  const n = m?.[1] ? Number(m[1]) : 0
  return n > 0 ? n : null
}

export const failSpeech = (kind: CheckKind, count: number | null): Lines => [
  [{ text: 'It looks like ' }, { text: `${kind} failed`, color: RED }, { text: count ? ` (${count}).` : '.' }],
  [{ text: 'Claude has the output; I’ll cheer' }],
  [{ text: 'when it’s green again.' }],
]

export const fixedSpeech = (kind: CheckKind): Lines => {
  const subject = kind === 'tests' ? 'Tests are' : `${kind[0]?.toUpperCase()}${kind.slice(1)} is`
  return [[{ text: `${subject} ` }, { text: 'green again!', color: GREEN }], [{ text: 'Nice fix.' }]]
}
