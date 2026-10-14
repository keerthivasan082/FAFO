import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { PetEmote, PetMood, PetPower, PetPrefs, PetSpeech, PetUsage, Sitrep, SitrepView } from '../types'
import {
  NOTIFY_AT,
  checkKind,
  contextSpeech,
  contextStep,
  failSpeech,
  failureCount,
  fixedSpeech,
  limitKey,
  limitNotice,
  limitSpeech,
  limitStep,
} from './coach'
import type { CheckKind } from './coach'
import {
  ago,
  forkPrompt,
  gitOnlySitrep,
  gitSummary,
  haikuPrompt,
  parseGit,
  parseSitrep,
  timeOfDay,
  transcriptOf,
} from './sitrep'
import type { GitSnapshot } from './sitrep'
import { BAND_W, COMPACT_W, PET_HEIGHT, bubbleLines, petSvg } from './sprite'
import type { Pose } from './sprite'

const isOpen = atom({ plugin: 'clippy', key: 'isOpen' } as const, false)
const usage = atom({ plugin: 'clippy', key: 'usage' } as const, null)
const mood = atom({ plugin: 'clippy', key: 'mood' } as const, 'awake')
const power = atom({ plugin: 'clippy', key: 'power' } as const, null)
const emote = atom({ plugin: 'clippy', key: 'emote' } as const, null)
const sitrep = atom({ plugin: 'clippy', key: 'sitrep' } as const, null)
const view = atom({ plugin: 'clippy', key: 'view' } as const, 'hidden')
const tick = atom({ plugin: 'clippy', key: 'tick' } as const, 0)
const speech = atom({ plugin: 'clippy', key: 'speech' } as const, null)
const isMenuOpen = atom({ plugin: 'clippy', key: 'isMenuOpen' } as const, false)
const prefs = atom({ plugin: 'clippy', key: 'prefs' } as const, { isMuted: false, isHidden: false, snoozeUntil: 0 })

const FIVE_MIN = 5 * 60 * 1000
const meta = atom({ plugin: 'clippy', key: 'meta' } as const, {
  branch: null,
  dirty: 0,
  lastReplyAt: 0,
  cacheTtlMs: FIVE_MIN,
  isPreparing: false,
})

const DOZE_AFTER_MS = 2 * 60 * 1000
const CHECK_EVERY_MS = 10 * 1000
const POWER_EVERY_MS = 30 * 1000
const EMOTE_MS = 6 * 1000
// Written while the prompt cache is still warm (it lasts at least 5 minutes), so the note is nearly free.
const PREPARE_AFTER_MS = 4 * 60 * 1000
const AWAY_MS = 30 * 60 * 1000
const TTL_KEY = 'cacheTtlMs'
const PREFS_KEY = 'prefs'
const COACH_KEY = 'coachSeen'
// The rules that keep him from being *that* Clippy: one unprompted balloon per 10 minutes, gone after 8 seconds.
const SPEAK_GAP_MS = 10 * 60 * 1000
const SPEAK_FOR_MS = 8 * 1000
const SNOOZE_MS = 60 * 60 * 1000

const TERMINAL_FACES: Record<Pose, string> = {
  idle: '📎 (◉‿◉)',
  work: '📎 (◉_◉)?',
  doze: '📎 (-‿-) zZ',
  charge: '📎 (^‿^)🔌',
  congrats: '📎 (★‿★)✨',
  greet: '📎 (◉‿◉)/ Hi!',
  alert: '📎 (⊙ロ⊙)!',
}

const toPetUsage = (u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): PetUsage => ({
  limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: u.context.window,
  costUsd: u.cost?.usd,
})

const refresh = async ($: EngineInterface) => {
  const fresh = toPetUsage(await $.session.usage())
  await update($, usage, () => fresh)
}

// pmset is macOS-only; anywhere else the bot simply never charges.
const readPower = async ($: EngineInterface): Promise<PetPower | null> => {
  try {
    const { exitCode, stdout } = await $.process.run(['pmset', '-g', 'batt'], { timeoutMs: 5000 })
    if (exitCode !== 0) return null
    const percent = /(\d+)%/.exec(stdout)?.[1]
    return {
      isOnAc: stdout.includes("'AC Power'"),
      isCharging: /;\s*(charging|finishing charge)/.test(stdout),
      percent: percent === undefined ? undefined : Number(percent),
    }
  } catch {
    return null
  }
}

const readGit = async ($: EngineInterface): Promise<GitSnapshot | null> => {
  try {
    const status = await $.process.run(['git', 'status', '-b', '--porcelain'], { timeoutMs: 5000 })
    if (status.exitCode !== 0) return null
    const log = await $.process.run(['git', 'log', '-3', '--format=%h %s'], { timeoutMs: 5000 })
    return parseGit(status.stdout, log.exitCode === 0 ? log.stdout : '')
  } catch {
    return null
  }
}

const storeKey = async ($: EngineInterface) => `sitrep:${await $.session.root()}`

const clockState = { lastActive: 0, lastPowerCheck: 0, promptAt: 0, lastMinute: 0, isAwayShown: false, lastSpokeAt: 0, speechId: 0 }
const contextNudged = new Set<number>()
const failing = new Set<CheckKind>()
const timers: { prepare: { cancel: () => void } | null } = { prepare: null }

const touch = async ($: EngineInterface) => {
  clockState.lastActive = await $.clock.now()
  clockState.isAwayShown = false
  if ((await read($, mood)) === 'doze') await update($, mood, () => 'awake' as PetMood)
}

const checkMood = async ($: EngineInterface) => {
  const now = await $.clock.now()
  if (now - clockState.lastPowerCheck >= POWER_EVERY_MS) {
    clockState.lastPowerCheck = now
    const p = await readPower($)
    const prev = await read($, power)
    if (JSON.stringify(p) !== JSON.stringify(prev)) await update($, power, () => p)
  }
  const p = await read($, power)
  const next: PetMood =
    now - clockState.lastActive > DOZE_AFTER_MS ? 'doze' : p?.isOnAc && p.isCharging ? 'charge' : 'awake'
  if ((await read($, mood)) !== next) await update($, mood, () => next)

  const v = await read($, view)
  // Away long enough: have the note open and waiting for when they come back.
  const isAway = now - clockState.lastActive > AWAY_MS
  if (v === 'hidden' && !clockState.isAwayShown && isAway && !(await read($, prefs)).isHidden && (await read($, sitrep))) {
    clockState.isAwayShown = true
    await update($, view, () => 'shown' as SitrepView)
  }
  // The cache countdown is in whole minutes; redraw the card only when one ticks over.
  const minute = Math.floor(now / 60000)
  if (v !== 'hidden' && minute !== clockState.lastMinute) {
    clockState.lastMinute = minute
    await update($, tick, n => n + 1)
  }
}

const isQuiet = (pr: PetPrefs, now: number) => pr.isMuted || pr.isHidden || now < pr.snoozeUntil

// Says something unprompted, unless muted, snoozed, hidden, behind the sitrep card, or he spoke in the last 10 minutes.
const say = async ($: EngineInterface, lines: PetSpeech['lines'], pose: PetSpeech['pose']) => {
  const now = await $.clock.now()
  const [pr, v] = await Promise.all([read($, prefs), read($, view)])
  if (isQuiet(pr, now) || v !== 'hidden' || now - clockState.lastSpokeAt < SPEAK_GAP_MS) return false
  clockState.lastSpokeAt = now
  const id = ++clockState.speechId
  await update($, speech, () => ({ id, lines, pose }))
  $.clock.after(SPEAK_FOR_MS, () => {
    void update($, speech, current => (current?.id === id ? null : current))
  })
  return true
}

const setPrefs = async ($: EngineInterface, change: (p: PetPrefs) => PetPrefs) => {
  const nextPrefs = change(await read($, prefs))
  await update($, prefs, () => nextPrefs)
  await $.store.set(PREFS_KEY, nextPrefs)
}

const snooze = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await setPrefs($, p => ({ ...p, snoozeUntil: now + SNOOZE_MS }))
  await update($, speech, () => null)
}

// Each window warns once per step (75%, 90%), remembered across chats; at 95% a desktop notification too.
const coachLimits = async ($: EngineInterface, limits: PetUsage['limits']) => {
  const now = await $.clock.now()
  const stored = await $.store.get(COACH_KEY)
  const seen = new Set(Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : [])
  const pr = await read($, prefs)
  let isChanged = false
  for (const l of limits) {
    if (l.percentUsed >= NOTIFY_AT && !seen.has(limitKey(l, NOTIFY_AT)) && now >= pr.snoozeUntil) {
      seen.add(limitKey(l, NOTIFY_AT))
      isChanged = true
      void $.ui.notify(limitNotice(l, now), { title: 'Clippy' })
    }
    const step = limitStep(l.percentUsed)
    if (step === null || seen.has(limitKey(l, step))) continue
    // A muted warning still counts as given, so unmuting doesn't replay a backlog.
    if (isQuiet(pr, now) || (await say($, limitSpeech(l, now), 'alert'))) {
      seen.add(limitKey(l, step))
      isChanged = true
    }
  }
  if (isChanged) await $.store.set(COACH_KEY, [...seen].slice(-60))
}

const nudgeContext = async ($: EngineInterface, percent: number | undefined) => {
  const step = percent === undefined ? null : contextStep(percent)
  if (step === null || percent === undefined || contextNudged.has(step)) return
  const pr = await read($, prefs)
  if (isQuiet(pr, await $.clock.now()) || (await say($, contextSpeech(percent), 'alert'))) contextNudged.add(step)
}

// Greeting and Congratulate play once, then hand back to whatever mood is current.
const playEmote = async ($: EngineInterface, name: PetEmote) => {
  await update($, emote, () => name)
  $.clock.after(EMOTE_MS, () => {
    void update($, emote, current => (current === name ? null : current))
  })
}

const MODEL_KEY = 'sitrepModel'
const logged = new Set<string>()

// One line per distinct problem per load, so a repeated failure doesn't flood the transcript.
const logOnce = ($: EngineInterface, line: string) => {
  if (logged.has(line)) return
  logged.add(line)
  $.ui.log(line)
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

// An organization may allow only some models: try the cheapest first, then the session's own, and remember
// the first one that is let through so later notes go straight to it.
const completeWithAllowedModel = async ($: EngineInterface, prompt: string) => {
  const [remembered, own] = await Promise.all([$.store.get(MODEL_KEY), $.session.model().catch(() => null)])
  const candidates = [remembered, 'haiku', 'sonnet', own].filter(
    (c, i, all): c is string => typeof c === 'string' && c.length > 0 && all.indexOf(c) === i,
  )
  for (const model of candidates) {
    try {
      const r = await $.model.complete({ model, prompt, maxTokens: 700, effort: 'low', timeoutMs: 60000 })
      if (model !== remembered) await $.store.set(MODEL_KEY, model)
      return r
    } catch {
      // Refused before sending (not allowlisted, unknown alias): try the next one.
    }
  }
  logOnce($, `sitrep: no model this organization allows could write the note (${candidates.join(', ')}); showing git only`)
  return null
}

// Warm cache: ask over the session's own transcript (served from cache). Cold: a quick summary of a trimmed
// transcript, so a long session is never re-read at full price. No model at all: what git says.
const prepareSitrep = async ($: EngineInterface, isManual: boolean) => {
  const m = await read($, meta)
  if (m.isPreparing) return
  const turn = await $.session.turns()
  const existing = await read($, sitrep)
  if (!isManual && existing?.turn === turn) return

  await update($, meta, x => ({ ...x, isPreparing: true }))
  try {
    const git = await readGit($)
    await update($, meta, x => ({ ...x, branch: git?.branch ?? null, dirty: git?.dirty ?? 0 }))
    const now = await $.clock.now()
    const isWarm = m.lastReplyAt > 0 && now - m.lastReplyAt < m.cacheTtlMs - 20000
    let note: Sitrep | null = null

    // Each step fails on its own, so a refused model still leaves the git-only note.
    if (isWarm) {
      try {
        const r = await $.model.fork({ prompt: forkPrompt(gitSummary(git)) })
        if (r.isAnswered) note = parseSitrep(r.text, now, turn, 'fork')
      } catch (err) {
        logOnce($, `sitrep: asking over this chat failed (${errText(err)})`)
      }
    }
    if (!note && turn > 0) {
      try {
        const transcript = transcriptOf(await $.session.messages())
        const r = transcript ? await completeWithAllowedModel($, haikuPrompt(transcript, gitSummary(git))) : null
        if (r?.isAnswered) note = parseSitrep(r.text, now, turn, 'haiku')
      } catch (err) {
        logOnce($, `sitrep: quick summary failed (${errText(err)})`)
      }
    }
    const final = note ?? gitOnlySitrep(git, now, turn)
    await update($, sitrep, () => final)
    await $.store.set(await storeKey($), final)
  } catch (err) {
    logOnce($, `sitrep: could not write a note (${errText(err)})`)
  } finally {
    await update($, meta, x => ({ ...x, isPreparing: false }))
  }
}

// After a gap longer than 5 minutes, a first reply that mostly read the cache means it lasts an hour here.
const learnCacheTtl = async ($: EngineInterface, cacheRead: number, cacheWrite: number) => {
  const m = await read($, meta)
  const gap = clockState.promptAt - m.lastReplyAt
  if (m.lastReplyAt === 0 || gap < FIVE_MIN + 60000 || gap > 60 * 60 * 1000) return
  const ttl = cacheRead > cacheWrite ? 60 * 60 * 1000 : FIVE_MIN
  if (ttl !== m.cacheTtlMs) {
    await update($, meta, x => ({ ...x, cacheTtlMs: ttl }))
    await $.store.set(TTL_KEY, ttl)
  }
}

const schedulePrepare = ($: EngineInterface) => {
  timers.prepare?.cancel()
  timers.prepare = $.clock.after(PREPARE_AFTER_MS, () => {
    timers.prepare = null
    void prepareSitrep($, false)
  })
}

const setView = ($: EngineInterface, next: SitrepView) => update($, view, () => next)

// The desktop app doesn't list mod-registered slash commands, so the band carries its own sitrep button.
const openSitrep = async ($: EngineInterface) => {
  await setView($, 'pinned')
  await prepareSitrep($, true)
}

const PLACEHOLDER: Sitrep = { at: 0, turn: -1, source: 'git', now: 'Clippy is writing your note…', last: [], you: '', next: [] }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    clockState.lastActive = await $.clock.now()
    await refresh($)
    await checkMood($)
    await playEmote($, 'greet')
    $.clock.every(CHECK_EVERY_MS, () => {
      void checkMood($)
    })

    const savedPrefs = await $.store.get(PREFS_KEY)
    if (savedPrefs && typeof savedPrefs === 'object') await update($, prefs, x => ({ ...x, ...(savedPrefs as Partial<PetPrefs>) }))

    // Terminal sessions list these; the desktop app doesn't, so the band has buttons for the same things.
    try {
      await $.command.register({ name: 'sitrep', description: "Clippy's catch-up note: what's in progress, what's done, what's next" })
      await $.command.register({ name: 'clippy', description: 'Clippy: hide, show, snooze, wake, mute or unmute', argumentHint: 'hide|show|snooze|wake|mute|unmute' })
    } catch (err) {
      logOnce($, `sitrep: commands not registered (${errText(err)})`)
    }

    // A note left by an earlier chat in this folder is the "where you left off" for this one.
    const [saved, ttl, git] = await Promise.all([$.store.get(await storeKey($)), $.store.get(TTL_KEY), readGit($)])
    await update($, meta, x => ({
      ...x,
      branch: git?.branch ?? null,
      dirty: git?.dirty ?? 0,
      cacheTtlMs: typeof ttl === 'number' ? ttl : x.cacheTtlMs,
    }))
    if (saved && typeof saved === 'object' && 'now' in saved) {
      await update($, sitrep, () => saved as Sitrep)
      if (!(await read($, prefs)).isHidden) await setView($, 'shown')
    }
    return next(e)
  })

  on('command.run', { command: 'sitrep' }, async $ => {
    await openSitrep($)
    const note = await read($, sitrep)
    return { text: note ? `📎 Sitrep updated (${note.source === 'fork' ? 'from this chat' : note.source === 'haiku' ? 'quick summary' : 'git only'}).` : '📎 No sitrep yet.' }
  })

  on('command.run', { command: 'clippy' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide') await setPrefs($, p => ({ ...p, isHidden: true }))
    else if (arg === 'show') await setPrefs($, p => ({ ...p, isHidden: false }))
    else if (arg === 'snooze') await snooze($)
    else if (arg === 'wake') await setPrefs($, p => ({ ...p, snoozeUntil: 0 }))
    else if (arg === 'mute') await setPrefs($, p => ({ ...p, isMuted: true }))
    else if (arg === 'unmute') await setPrefs($, p => ({ ...p, isMuted: false }))
    else return { text: 'Usage: /clippy hide | show | snooze | wake | mute | unmute' }
    return { text: `📎 Clippy: ${arg}.` }
  })

  // Test watcher: a failing check gets one balloon; the first pass after a failure gets a cheer.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const kind = e.run_in_background ? null : checkKind(e.command)
    if (!kind || ran.deny !== undefined) return ran
    if (ran.isError === true) {
      const isNew = !failing.has(kind)
      failing.add(kind)
      if (isNew) await say($, failSpeech(kind, failureCount(ran.text ?? '')), 'alert')
    } else if (failing.delete(kind)) {
      await say($, fixedSpeech(kind), 'congrats')
    }
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    clockState.promptAt = await $.clock.now()
    await touch($)
    timers.prepare?.cancel()
    timers.prepare = null
    if ((await read($, view)) === 'shown') await setView($, 'hidden')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await touch($)
    if (e.agentId === undefined) {
      if (e.usage) await learnCacheTtl($, e.usage.cache_read_input_tokens, e.usage.cache_creation_input_tokens)
      const now = await $.clock.now()
      await update($, meta, x => ({ ...x, lastReplyAt: now }))
      schedulePrepare($)
      await playEmote($, 'congrats')
    }
    return next(e)
  })

  // Pushed after each turn and whenever a rate-limit window moves a point.
  on('session.measure', async ($, e, next) => {
    const fresh = toPetUsage(e)
    await update($, usage, () => fresh)
    await coachLimits($, fresh.limits)
    await nudgeContext($, fresh.contextPercent)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const [m, em, u, p, saved, v, info, now, said, pr, isMenu] = await Promise.all([
      read($, mood),
      read($, emote),
      read($, usage),
      read($, power),
      read($, sitrep),
      read($, view),
      read($, meta),
      $.clock.now(),
      read($, speech),
      read($, prefs),
      read($, isMenuOpen),
      read($, tick),
    ])
    const isSnoozed = now < pr.snoozeUntil
    const spoken = said && said.pose !== 'idle' ? said.pose : null
    const pose: Pose = e.props.isWorking
      ? 'work'
      : (spoken ?? em ?? (isSnoozed ? 'doze' : m === 'awake' ? 'idle' : m))
    const isGraphic = e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile'

    const note = saved ?? (info.isPreparing ? { ...PLACEHOLDER, at: now } : null)

    const toggleMenu = () => update($, isMenuOpen, x => !x)
    // Snooze/mute/hide, folded behind ⋯ so the band stays quiet until asked.
    const controls = (Button: (typeof $.ui.resolve extends (...a: never[]) => infer T ? T : never)['Button']) =>
      isMenu ? (
        <>
          {isSnoozed ? (
            <Button key="wake" plain dimColor label="wake" onPress={() => setPrefs($, x => ({ ...x, snoozeUntil: 0 }))} />
          ) : (
            <Button key="snooze" plain dimColor label="snooze 1h" onPress={() => snooze($)} />
          )}
          <Button
            key="mute"
            plain
            dimColor
            label={pr.isMuted ? 'unmute tips' : 'mute tips'}
            onPress={() => setPrefs($, x => ({ ...x, isMuted: !x.isMuted }))}
          />
          <Button key="hide" plain dimColor label="hide Clippy" onPress={() => setPrefs($, x => ({ ...x, isHidden: true }))} />
          <Button key="menu" plain dimColor label="done" onPress={toggleMenu} />
        </>
      ) : (
        <>
          <Button key="sitrep" plain dimColor label="sitrep" onPress={() => openSitrep($)} />
          <Button key="menu" plain dimColor label="⋯" onPress={toggleMenu} />
        </>
      )

    if (pr.isHidden) {
      const { Box, Button } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" justifyContent="flex-end">
          <Button key="show" plain dimColor label="📎 show Clippy" onPress={() => setPrefs($, x => ({ ...x, isHidden: false }))} />
        </Box>
      )
    }

    if (!note || v === 'hidden') {
      if (isGraphic) {
        const { Box, Button, Svg } = $.ui.resolve(e)
        // The SVG is symmetric about Clippy, so centring it centres him; the controls float in the corner,
        // out of the flow, so their width can't push him off the middle.
        return (
          <Box flexDirection="row" justifyContent="center" alignItems="center">
            <Svg
              source={petSvg({ pose, usage: u, power: p, now, speech: said?.lines ?? null })}
              alt="Clippy, your token pet. Hover over him to see your usage limits."
              width={BAND_W}
              height={PET_HEIGHT}
              isInteractive
            />
            <Box position="absolute" top={0} right={0} flexDirection="row" columnGap={2}>
              {controls(Button)}
            </Box>
          </Box>
        )
      }
      const { Box, Button, Text } = $.ui.resolve(e)
      const open = await read($, isOpen)
      const toggle = async () => {
        const willOpen = !(await read($, isOpen))
        if (willOpen) await refresh($)
        await update($, isOpen, () => willOpen)
      }
      return (
        <Box flexDirection="row" gap={1}>
          <Button key="pet" plain onPress={toggle}>
            <Text bold>{TERMINAL_FACES[pose]}</Text>
          </Button>
          {controls(Button)}
          {said && (
            <Text>
              {said.lines.map((segments, i) => (
                <Text key={`say-${i}`}>
                  {segments.map((s, j) => (
                    <Text key={`say-${i}-${j}`} color={s.color}>
                      {s.text}
                    </Text>
                  ))}{' '}
                </Text>
              ))}
            </Text>
          )}
          {open && (
            <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
              {bubbleLines(u, now).map((segments, i) => (
                <Text key={`line-${i}`}>
                  {segments.map((s, j) => (
                    <Text key={`seg-${j}`} color={s.color}>
                      {s.text}
                    </Text>
                  ))}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // --- The sitrep card, with Clippy standing beside it: just the four answers, nothing else ---
    const { Box, Button, Text } = $.ui.resolve(e)
    const isPinned = v === 'pinned'

    const header = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text>
          <Text bold>sitrep</Text>
          <Text dimColor>{`  ${timeOfDay(note.at)} · ${info.isPreparing ? 'updating…' : ago(now - note.at)}`}</Text>
        </Text>
        <Box flexDirection="row" columnGap={2}>
          <Button
            key="pin"
            hotkey="p"
            plain
            dimColor
            label={isPinned ? 'unpin' : 'pin'}
            onPress={() => setView($, isPinned ? 'shown' : 'pinned')}
          />
          <Button key="close" hotkey="d" plain dimColor label="close" onPress={() => setView($, 'hidden')} />
        </Box>
      </Box>
    )

    // Labels sit on the first line of their row; a second item gets its own line with a dim dash.
    const row = (label: string, lines: string[], isCallout = false) =>
      lines.length === 0 ? null : (
        <Box key={`row-${label}`} flexDirection="row" alignItems="flex-start">
          <Box width={6} flexShrink={0}>
            <Text color={isCallout ? 'warning' : undefined} dimColor={!isCallout}>
              {label}
            </Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {lines.map((line, i) => (
              <Text key={`${label}-${i}`} color={isCallout ? 'warning' : undefined}>
                {lines.length > 1 ? <Text dimColor>{'– '}</Text> : ''}
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      )

    const card = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {header}
        {row('now', note.now ? [note.now] : [])}
        {row('last', note.last)}
        {row('you', note.you ? [note.you] : [], true)}
        {row('next', note.next)}
      </Box>
    )

    if (isGraphic) {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" columnGap={1} alignItems="flex-start">
          <Svg
            source={petSvg({ pose, usage: u, power: p, now, compact: true })}
            alt="Clippy, holding your catch-up note."
            width={COMPACT_W}
            height={PET_HEIGHT}
            isInteractive
          />
          {card}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" columnGap={1} alignItems="flex-start">
        <Text bold>{TERMINAL_FACES[pose]}</Text>
        {card}
      </Box>
    )
  })
}
