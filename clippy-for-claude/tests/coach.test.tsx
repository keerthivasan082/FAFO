import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkKind, contextStep, failureCount, limitStep } from '../hooks/coach'
import { BAND_W, petSvg } from '../hooks/sprite'

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const quiet = (on: On) => {
  mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
  mock.store(on)
  on('session.root', () => ({ value: '/proj' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
}

const measure = (percent: number, context = 10) => ({
  context: { window: 200000, percent: context },
  rateLimits: [{ kind: 'five_hour', percentUsed: percent, resetsAt: '2026-10-14T14:00:00Z' }],
  changed: ['rateLimits' as const],
})

test('classifies checks and reads failure counts', () => {
  expect(checkKind('pnpm test -- --run')).toBe('tests')
  expect(checkKind('npx vitest run src')).toBe('tests')
  expect(checkKind('npx tsc --noEmit')).toBe('the type check')
  expect(checkKind('pnpm lint')).toBe('lint')
  expect(checkKind('pnpm build')).toBe('the build')
  expect(checkKind('ls -la')).toBeNull()
  expect(failureCount('Tests: 3 failed, 40 passed')).toBe(3)
  expect(failureCount('all good')).toBeNull()
  expect(limitStep(74)).toBeNull()
  expect(limitStep(76)).toBe(75)
  expect(limitStep(93)).toBe(90)
  expect(contextStep(85)).toBe(80)
})

test('he stands centred: the band SVG is symmetric and has no wandering animation', () => {
  const svg = petSvg({ pose: 'idle', usage: null, power: null, now: 0 })
  expect(svg).toContain(`width="${BAND_W}"`)
  expect(svg).not.toContain('@keyframes wander')
  expect(svg).not.toContain('class="atom')
})

test('limit coach speaks once per step, then stays quiet for that window', async ($, on) => {
  quiet(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(78))

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: /78%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5-hour limit/ })).toBeDefined()
  await ui.unmount()
})

test('mute keeps him quiet, and the controls live behind ⋯', async ($, on) => {
  quiet(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  expect(await ui.find({ key: 'mute' })).toBeUndefined()
  await ui.press({ key: 'menu' })
  await ui.press({ key: 'mute' })
  expect(await ui.find({ key: 'mute' })).toBeDefined()
  await ui.unmount()

  await $.session.measure(measure(92))
  const after = await $.ui.mount({ plugin: 'clippy', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await after.find({ type: 'Text', text: /92%/ })).toBeUndefined()
  await after.unmount()
})

test('hide leaves only a way back', async ($, on) => {
  quiet(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props })
  await ui.press({ key: 'menu' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.press({ key: 'show' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('a failing test run gets one balloon; a context nudge waits its turn', async ($, on) => {
  quiet(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '' }, isError: true, text: 'Tests: 2 failed', }) as never)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'pnpm test' })

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: /tests failed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\(2\)/ })).toBeDefined()
  await ui.unmount()

  // Within the 10-minute gap the context nudge is held back rather than stacking a second balloon.
  await $.session.measure(measure(10, 85))
  const later = await $.ui.mount({ plugin: 'clippy', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await later.find({ type: 'Text', text: /getting long/ })).toBeUndefined()
  await later.unmount()
})
