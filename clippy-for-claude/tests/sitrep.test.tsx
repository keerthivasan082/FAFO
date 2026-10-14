import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gitOnlySitrep, parseGit, parseSitrep, transcriptOf } from '../hooks/sitrep'

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const NOTE = {
  at: 0,
  turn: 4,
  source: 'fork',
  now: 'Clippy mod: sitrep card built, waiting on a look in the app.',
  last: ['Added the sitrep card', 'Saved a rollback snapshot'],
  you: 'Decide whether the card stays or gets rolled back.',
  next: ['You open a new chat to see it', 'Claude tunes spacing from a screenshot'],
}

const quiet = (on: On) => {
  mock.clock(on)
  mock.store(on, { 'sitrep:/proj': NOTE })
  on('session.root', () => ({ value: '/proj' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] },
  }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'sitrep' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
}

test('parses a JSON note, even wrapped in prose, and trims it to two items', () => {
  const note = parseSitrep(
    'Sure: {"now":"Doing X","last":["a","b","c"],"you":"Pick Y","next":"Claude does Z"}',
    1,
    2,
    'fork',
  )
  expect(note?.now).toBe('Doing X')
  expect(note?.last).toHaveLength(2)
  expect(note?.next).toEqual(['Claude does Z'])
  expect(parseSitrep('no json here', 1, 2, 'fork')).toBeNull()
})

test('reads branch, dirty count and recent commits from git', () => {
  const g = parseGit('## design/initial-design...origin/design/initial-design\n M a.ts\n?? b.ts\n', 'abc123 Fix x\ndef456 Add y\n')
  expect(g.branch).toBe('design/initial-design')
  expect(g.dirty).toBe(2)
  expect(gitOnlySitrep(g, 0, 0).now).toContain('2 uncommitted files')
})

test('the transcript keeps the latest messages within budget', () => {
  const messages = Array.from({ length: 50 }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    text: `message ${i} ${'x'.repeat(100)}`,
    toolUses: [],
  }))
  const t = transcriptOf(messages, 500)
  expect(t).toContain('message 49')
  expect(t).not.toContain('message 0 ')
})

test("a new chat in the same folder opens with the last chat's sitrep, and close hides it", async ($, on) => {
  quiet(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'clippy', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ type: 'Text', text: /sitrep/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /waiting on a look/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Decide whether/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h|cache/ })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  await ui.press({ key: 'pin' })
  expect(await ui.find({ key: 'pin' })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(await ui.find({ type: 'Text', text: /waiting on a look/ })).toBeUndefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('/sitrep asks over the warm chat, then shows and saves the note', async ($, on) => {
  quiet(on)
  on('session.turns', () => ({ value: 3 }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'build the card', toolUses: [] }] }))
  const usage = { input_tokens: 10, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const reply = '{"now":"Sitrep wired up","last":["Wrote tests"],"you":"Look at the card","next":["Claude polishes it"]}'
  on('model.fork', () => ({ value: { isAnswered: true, text: reply, usage } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: reply, usage } }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const out = await $.command.run({
    command: 'sitrep',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(out.text).toContain('Sitrep updated')

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: /Sitrep wired up/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Look at the card/ })).toBeDefined()
  expect(await ui.find({ key: 'pin' })).toBeDefined()
  await ui.unmount()
})

test('the sitrep button opens the card on the desktop, where /sitrep is not listed', async ($, on) => {
  quiet(on)
  on('session.turns', () => ({ value: 5 }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hi', toolUses: [] }] }))
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"now":"Button works","last":[],"you":"","next":[]}', usage } }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  await ui.press({ key: 'close' })
  expect(await ui.find({ key: 'sitrep' })).toBeDefined()
  await ui.press({ key: 'sitrep' })
  expect(await ui.find({ type: 'Text', text: /Button works/ })).toBeDefined()
  await ui.unmount()
})

test('a model the organization refuses falls through to one it allows, and never leaves the card empty', async ($, on) => {
  quiet(on)
  on('session.turns', () => ({ value: 6 }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hi', toolUses: [] }] }))
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const asked: string[] = []
  on('model.complete', ($, e) => {
    asked.push(e.model)
    if (e.model !== 'claude-opus-5-5') return { deny: `model "${e.model}" is not in this organization's allowlist` }
    return { value: { isAnswered: true, text: '{"now":"Allowed model wrote this","last":[],"you":"","next":[]}', usage } }
  })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  await ui.press({ key: 'close' })
  await ui.press({ key: 'sitrep' })
  expect(await ui.find({ type: 'Text', text: /Allowed model wrote this/ })).toBeDefined()
  expect(asked).toEqual(['haiku', 'sonnet', 'claude-opus-5-5'])
  await ui.unmount()
})
