import { expect, mock, test } from 'claude-code/testing'

import { petSvg } from '../hooks/sprite'

const props = (hasSurvey: boolean, isWorking = false) => ({
  hasSurvey,
  isWorking,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

const USAGE = {
  startedAt: 0,
  context: { tokens: 76000, window: 200000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.5 },
    { kind: 'seven_day', percentUsed: 91 },
  ],
  cost: { usd: 1.24 },
}

test('desktop draws the animated bot with the limits in his speech bubble', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('the bubble markup carries each limit and the context fill', () => {
  const source = petSvg({
    pose: 'idle',

    usage: {
      limits: [
        { kind: 'five_hour', percentUsed: 23.5 },
        { kind: 'seven_day', percentUsed: 91 },
      ],
      contextPercent: 38,
      contextWindow: 200000,
    },
    power: null,
    now: 0,
  })
  expect(source).toContain('5-hour')
  expect(source).toContain('23.5% used')
  expect(source).toContain('91% used')
  expect(source).toContain('38%')
  expect(source).toContain('tabindex="0"')
})

test('each pose draws its own extras', () => {
  const draw = (pose: 'work' | 'doze' | 'charge' | 'congrats') =>
    petSvg({ pose, usage: null, power: { isOnAc: true, isCharging: true, percent: 50 }, now: 0 })
  expect(draw('doze')).toContain('class="z z1"')
  expect(draw('charge')).toContain('class="bolt"')
  expect(draw('work')).toContain('seg-search')
  expect(draw('congrats')).toContain('class="twinkle"')
  expect(draw('work')).toContain('no limit')
})

test('terminal: clicking the pet opens a bubble with the limits', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'terminal', component: 'AbovePrompt', props: props(false) })
  expect(await ui.find({ type: 'Text', text: /5-hour/ })).toBeUndefined()

  await ui.press({ key: 'pet' })
  expect(await ui.find({ type: 'Text', text: /5-hour/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /91% used/ })).toBeDefined()

  await ui.press({ key: 'pet' })
  expect(await ui.find({ type: 'Text', text: /5-hour/ })).toBeUndefined()
  await ui.unmount()
})

test('the pet steps aside for a survey', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>survey</Text>
  })

  const ui = await $.ui.mount({ plugin: 'clippy', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
  await ui.unmount()
})
