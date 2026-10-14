export type PetLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type PetUsage = {
  limits: PetLimit[]
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  costUsd?: number
}

export type PetMood = 'awake' | 'doze' | 'charge'

export type PetEmote = 'greet' | 'congrats'

export type PetPower = { isOnAc: boolean; isCharging: boolean; percent?: number }

export type Sitrep = {
  at: number
  now: string
  last: string[]
  you: string
  next: string[]
  // Which user turn the note was written after, so an unchanged session isn't summarised twice.
  turn: number
  source: 'fork' | 'haiku' | 'git'
}

export type SitrepView = 'hidden' | 'shown' | 'pinned'

// Kept across chats in $.store, so a muted or hidden Clippy stays that way.
export type PetPrefs = { isMuted: boolean; isHidden: boolean; snoozeUntil: number }

export type PetSpeech = {
  id: number
  lines: { text: string; color?: string }[][]
  pose: 'alert' | 'congrats' | 'idle'
}

export type PetMeta = {
  branch: string | null
  dirty: number
  lastReplyAt: number
  cacheTtlMs: number
  isPreparing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'clippy': {
      isOpen: boolean
      usage: PetUsage | null
      mood: PetMood
      power: PetPower | null
      emote: PetEmote | null
      sitrep: Sitrep | null
      view: SitrepView
      meta: PetMeta
      tick: number
      prefs: PetPrefs
      speech: PetSpeech | null
      isMenuOpen: boolean
    }
  }
}
