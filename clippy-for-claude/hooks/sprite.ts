import type { PetPower, PetUsage } from '../types'

// Emotes follow the Office Assistant set: Idle* while waiting, Thinking/Writing/
// Searching/Processing while busy, IdleSnooze, Congratulate and Greeting.
export type Pose = 'idle' | 'work' | 'doze' | 'charge' | 'congrats' | 'greet' | 'alert'

export type Segment = { text: string; color?: string }

const S = 0.68
const CLIP_W = 72 * S
const PAD_L = 14
const TOP = 6
export const PET_HEIGHT = Math.round(TOP + 112 * S + 4)
const H = PET_HEIGHT
const EXTRA = 34
const BUBBLE_W = 330
const BUBBLE_H = 52
const BUBBLE_Y = Math.round((H - BUBBLE_H) / 2)

const INK = '#111111'
const WIRE_DARK = '#59616C'
const BLUE = '#2D6CDF'
const GOLD = '#F2C14E'
const RED = '#D9342B'
const AMBER = '#B7791F'
const GREEN = '#3FA34D'
const BALLOON = '#FFFFCC'

export const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const percentColor = (p: number) => (p >= 85 ? RED : p >= 60 ? AMBER : undefined)

const clock = (d: Date) => {
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m}${h < 12 ? 'am' : 'pm'}`
}

// Absolute reset times keep the markup stable minute to minute, so the frame isn't redrawn mid-animation.
export const resetLabel = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const at = new Date(resetsAt)
  if (Number.isNaN(at.getTime())) return ''
  const sameDay = at.getTime() - now < 20 * 3600 * 1000
  return ` · resets ${sameDay ? '' : `${DAYS[at.getDay()]} `}${clock(at)}`
}

const kTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

export const peakPercent = (usage: PetUsage | null) => Math.max(0, ...(usage?.limits ?? []).map(l => l.percentUsed))

export const bubbleLines = (usage: PetUsage | null, now: number): Segment[][] => {
  const lines: Segment[][] = (usage?.limits ?? []).slice(0, 2).map(l => [
    { text: `${(LABELS[l.kind] ?? l.kind.replace(/_/g, ' ')).padEnd(8)}` },
    { text: `${l.percentUsed}% used`, color: percentColor(l.percentUsed) },
    { text: resetLabel(l.resetsAt, now) },
  ])
  if (lines.length === 0) {
    lines.push([{ text: 'It looks like you have no limit' }], [{ text: 'reading yet. Send a message!' }])
  }
  if (usage?.contextPercent !== undefined) {
    lines.push([
      { text: 'Context '.padEnd(8) },
      { text: `${usage.contextPercent}%`, color: percentColor(usage.contextPercent) },
      { text: ` of ${kTokens(usage.contextWindow)}` },
    ])
  }
  return lines.slice(0, 3)
}

// --- Clippy, drawn in a 72 x 112 unit box (paper included) ---

const WIRE = 'M33 42 L33 78 Q33 86 27 86 Q21 86 21 78 L21 26 Q21 12 33 12 Q45 12 45 26 L45 88 Q45 101 33 101 Q20 101 16 93'

const paper =
  `<polygon points="4,98 56,92 68,108 12,114" fill="#FFFBE8" stroke="#CDBF86" stroke-width="1"/>` +
  `<path d="M14 101 L56 96.5 M17 105 L60 100.3 M20 109 L63 104.2" stroke="#9EC3F0" stroke-width=".8"/>`

const wire =
  `<path d="${WIRE}" fill="none" stroke="${WIRE_DARK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${WIRE}" fill="none" stroke="url(#metal)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${WIRE}" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round" transform="translate(-1,-1)"/>`

const openEyes =
  `<g class="eyes">` +
  `<circle cx="26" cy="36" r="8.6" fill="#FFFFFF" stroke="${INK}" stroke-width="1.3"/>` +
  `<circle cx="42" cy="36" r="8.6" fill="#FFFFFF" stroke="${INK}" stroke-width="1.3"/>` +
  `<g class="pupils sync"><circle cx="27" cy="37" r="3.8" fill="${INK}"/><circle cx="43" cy="37" r="3.8" fill="${INK}"/>` +
  `<circle cx="28" cy="35.8" r="1" fill="#FFFFFF"/><circle cx="44" cy="35.8" r="1" fill="#FFFFFF"/></g>` +
  `</g>`

const closedEyes =
  `<circle cx="26" cy="36" r="8.6" fill="#D9DDE3" stroke="${INK}" stroke-width="1.3"/>` +
  `<circle cx="42" cy="36" r="8.6" fill="#D9DDE3" stroke="${INK}" stroke-width="1.3"/>` +
  `<path d="M18.5 37 Q26 41.5 33.5 37 M34.5 37 Q42 41.5 49.5 37" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`

const brows = (lift = 0) =>
  `<g transform="translate(0,${lift})"><g class="brows sync">` +
  `<path d="M16 24 Q24 17 32 22" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>` +
  `<path d="M36 22 Q44 17 52 24" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>` +
  `</g></g>`

const clippy = (eyes: 'open' | 'closed', lift = 0) =>
  `<g class="body sync">${wire}${eyes === 'open' ? openEyes : closedEyes}${brows(lift)}</g>`

const at = (x: number, y: number, inner: string) => `<g transform="translate(${x},${y})">${inner}</g>`

const star = `<path d="M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4 Z" fill="${GOLD}"/>`

const gear = (r: number) =>
  `<circle r="${r}" fill="none" stroke="#6B7280" stroke-width="3.4" stroke-dasharray="2.6 2"/>` +
  `<circle r="${r - 1.6}" fill="#9CA3AF"/><circle r="${r / 3}" fill="#4B5563"/>`

const overlays = {
  think: `<g class="seg-think">${at(58, 22, `<g class="bob"><text class="glyph" fill="${BLUE}" font-size="30">?</text></g>`)}<circle cx="54" cy="30" r="1.6" fill="${BLUE}"/><circle cx="51" cy="34" r="1.1" fill="${BLUE}"/></g>`,
  write:
    `<g class="seg-write"><path class="scribble" d="M16 104 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0" fill="none" stroke="${BLUE}" stroke-width="1.3"/>` +
    at(
      18,
      96,
      `<g class="slide"><g transform="rotate(-40)"><rect x="0" y="-2" width="18" height="4" fill="${GOLD}" stroke="#8A6D1F" stroke-width=".6"/><polygon points="0,-2 -5,0 0,2" fill="#E8C9A0"/><polygon points="-3.4,-0.7 -5,0 -3.4,0.7" fill="${INK}"/><rect x="18" y="-2" width="3" height="4" fill="#E58FA0"/></g></g>`,
    ) +
    `</g>`,
  search: `<g class="seg-search">${at(62, 46, `<g transform="scale(1.3)"><g class="sweep"><line x1="4" y1="4" x2="11" y2="11" stroke="#6B4F2A" stroke-width="3.2" stroke-linecap="round"/><circle r="6.5" fill="#BFE3FF" fill-opacity=".55" stroke="#374151" stroke-width="2"/></g></g>`)}</g>`,
  process: `<g class="seg-process">${at(62, 18, `<g class="spin">${gear(10)}</g>`)}${at(74, 34, `<g class="spin-back">${gear(7)}</g>`)}</g>`,
  zzz: `<text x="52" y="22" class="z z1">z</text><text x="58" y="14" class="z z2">z</text><text x="64" y="6" class="z z3">Z</text>`,
  stars: [
    [6, 18],
    [60, 10],
    [66, 44],
    [2, 60],
    [56, 70],
  ]
    .map(([x, y], i) => at(x ?? 0, y ?? 0, `<g class="twinkle" style="animation-delay:${i * 0.18}s">${star}</g>`))
    .join(''),
  alert: `<g class="alert">${at(58, 26, `<text class="glyph" fill="${RED}" font-size="26">!</text>`)}</g>`,
  charge:
    `<path d="M66 106 Q78 108 82 100" fill="none" stroke="#4B5563" stroke-width="2.4"/>` +
    `<rect x="80" y="92" width="8" height="10" rx="1.5" fill="#9CA3AF" stroke="#4B5563"/>` +
    `<rect x="88" y="94" width="3" height="1.6" fill="#D1D5DB"/><rect x="88" y="98.4" width="3" height="1.6" fill="#D1D5DB"/>`,
  battery: (pct: number) =>
    at(
      52,
      -2,
      `<g transform="scale(1.4)"><rect width="18" height="9" rx="1.5" fill="none" stroke="#4B5563" stroke-width="1.6"/><rect x="18" y="2.5" width="2" height="4" fill="#4B5563"/>` +
        `<rect class="juice" x="1.8" y="1.8" width="${Math.max(1.5, (14.4 * pct) / 100).toFixed(1)}" height="5.4" fill="${GREEN}"/>` +
        `<g class="bolt"><path d="M27 -1 L23 5 L26 5 L24 11 L29 4 L26 4 Z" fill="${GOLD}" stroke="#8A6D1F" stroke-width=".5"/></g></g>`,
    ),
}

const scene = (pose: Pose, power: PetPower | null, isAlarmed: boolean) => {
  switch (pose) {
    case 'doze':
      // Both poses are drawn; a click swaps them (see WAKE_CSS) without a round trip to the hooks.
      return (
        `<g class="sleepy"><g class="lean">${clippy('closed', 2)}</g>${overlays.zzz}</g>` +
        `<g class="woke">${clippy('open', -3)}<g class="wake-mark">${at(56, 26, `<text class="glyph" fill="${RED}" font-size="28">!</text>`)}</g></g>`
      )
    case 'charge':
      return clippy('open', -2) + overlays.charge + overlays.battery(power?.percent ?? 50)
    case 'work':
      return clippy('open') + overlays.think + overlays.write + overlays.search + overlays.process
    case 'congrats':
      return `<g class="hop">${clippy('open', -3)}</g>${overlays.stars}`
    case 'greet':
      return `<g class="hop">${clippy('open', -3)}</g>`
    case 'alert':
      return `<g class="hop">${clippy('open', -4)}</g>${overlays.alert}`
    default:
      return clippy('open') + (isAlarmed ? overlays.alert : '')
  }
}

// --- Speech balloons, on the same ruled notebook paper Clippy sits on ---

const PAPER = '#FFFBE8'
const PAPER_EDGE = '#CDBF86'
const RULE = '#9EC3F0'
const MARGIN = '#E58FA0'

const balloon = (cls: string, x: number, rows: Segment[][]) => {
  const tail = BUBBLE_Y + BUBBLE_H / 2
  const cx = x + BUBBLE_W / 2
  const baseline = (i: number) => BUBBLE_Y + 17 + i * 14
  const text = rows
    .map((segments, i) => {
      const spans = segments
        .map(s => `<tspan${s.color ? ` fill="${s.color}" font-weight="700"` : ''}>${esc(s.text)}</tspan>`)
        .join('')
      return `<text class="hand" x="${x + 30}" y="${baseline(i)}" xml:space="preserve">${spans}</text>`
    })
    .join('')
  const rules = [0, 1, 2]
    .map(i => `<line x1="${x + 3}" y1="${baseline(i) + 3}" x2="${x + BUBBLE_W - 3}" y2="${baseline(i) + 3}" stroke="${RULE}" stroke-width=".8"/>`)
    .join('')
  const holes = [0, 1, 2]
    .map(i => `<circle cx="${x + 11}" cy="${baseline(i) - 4}" r="2.4" fill="#E9E1C4" stroke="${PAPER_EDGE}" stroke-width=".8"/>`)
    .join('')
  const right = x + BUBBLE_W
  const bottom = BUBBLE_Y + BUBBLE_H
  return (
    `<g class="${cls}" shape-rendering="geometricPrecision"><g transform="rotate(-1.2 ${cx} ${tail})">` +
    `<rect x="${x + 2}" y="${BUBBLE_Y + 2.5}" width="${BUBBLE_W}" height="${BUBBLE_H}" rx="2" fill="#000" fill-opacity=".22"/>` +
    `<path d="M${x} ${BUBBLE_Y + 2} Q${x} ${BUBBLE_Y} ${x + 2} ${BUBBLE_Y} L${right - 10} ${BUBBLE_Y} L${right} ${BUBBLE_Y + 10} L${right} ${bottom - 2} Q${right} ${bottom} ${right - 2} ${bottom} L${x + 2} ${bottom} Q${x} ${bottom} ${x} ${bottom - 2} Z" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="1"/>` +
    `<path d="M${right - 10} ${BUBBLE_Y} L${right - 10} ${BUBBLE_Y + 10} L${right} ${BUBBLE_Y + 10} Z" fill="#EFE5BE" stroke="${PAPER_EDGE}" stroke-width=".8" stroke-linejoin="round"/>` +
    rules +
    `<line x1="${x + 23}" y1="${BUBBLE_Y + 1}" x2="${x + 23}" y2="${bottom - 1}" stroke="${MARGIN}" stroke-width="1"/>` +
    holes +
    `<path d="M${x + 0.5} ${tail - 6} L${x - 10} ${tail + 3} L${x + 0.5} ${tail + 4}" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="1" stroke-linejoin="round"/>` +
    `<rect x="${x}" y="${tail - 5.5}" width="1.6" height="9" fill="${PAPER}"/>` +
    text +
    `</g></g>`
  )
}

// --- Choreography: he stays put; only his face and props move ---

const timeline = (pose: Pose) => {
  if (pose === 'work') {
    // Thinking -> Writing -> Searching -> Processing, 4s each.
    const seg = (name: string, from: number) => {
      const open = from === 0 ? '0%{opacity:1}' : `0%{opacity:0}${from}%{opacity:1}`
      return `@keyframes ${name}{${open}${from + 25}%{opacity:0}100%{opacity:0}}.seg-${name}{opacity:0;animation:${name} 16s step-end infinite}`
    }
    return (
      seg('think', 0) +
      seg('write', 25) +
      seg('search', 50) +
      seg('process', 75) +
      `@keyframes look{0%{transform:translate(-2px,-2px)}25%{transform:translate(2px,2.5px)}50%{transform:translate(3px,0)}62%{transform:translate(-1px,0)}75%{transform:translate(0,1px)}100%{transform:translate(0,1px)}}` +
      `.pupils{animation:look 16s step-end infinite}` +
      `@keyframes brow{0%{transform:translateY(-2px)}25%{transform:translateY(0)}75%{transform:translateY(1.5px)}100%{transform:translateY(1.5px)}}` +
      `.brows{animation:brow 16s step-end infinite}`
    )
  }
  if (pose === 'congrats' || pose === 'greet' || pose === 'charge' || pose === 'alert') {
    return `.pupils{transform:translate(0,-2px)}`
  }
  return ''
}

// Invisible zones either side of him; !important lets the cursor win over the idle glance loop.
const CURSOR_CSS =
  `.zl:hover~.bot .pupils{transform:translate(-3px,.5px)!important}` +
  `.zr:hover~.bot .pupils{transform:translate(3px,.5px)!important}` +
  `.bot:hover .pupils{transform:translate(0,1px)!important}` +
  `.bot:hover .brows{transform:translateY(-3px)!important}`

// :active only lasts while the button is held, so the way back is delayed: one click keeps him up for 90s.
const WAKE_CSS =
  `.poke{transition:transform .4s cubic-bezier(.3,1.7,.5,1)}` +
  `.bot:active .poke{transform:translateY(-10px);transition:transform .06s}` +
  `.woke{opacity:0;transition:opacity 0s 90s}.sleepy{opacity:1;transition:opacity 0s 90s}` +
  `.bot:active .woke{opacity:1;transition:none}.bot:active .sleepy{opacity:0;transition:none}` +
  `.wake-mark{opacity:0;transition:opacity .5s 1.5s}.bot:active .wake-mark{opacity:1;transition:none}`

const BASE_CSS =
  `@keyframes blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}` +
  `.eyes{transform-box:fill-box;transform-origin:center;animation:blink 5s infinite}` +
  `@keyframes spin{to{transform:rotate(360deg)}}.spin{transform-box:fill-box;transform-origin:center;animation:spin 2.4s linear infinite}` +
  `.spin-back{transform-box:fill-box;transform-origin:center;animation:spin 1.6s linear infinite reverse}` +
  `@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}.bob{animation:bob 1.2s ease-in-out infinite}` +
  `@keyframes slide{0%,100%{transform:translateX(0)}50%{transform:translateX(24px)}}.slide{animation:slide 1.4s ease-in-out infinite}` +
  `@keyframes ink{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}.scribble{stroke-dasharray:60;animation:ink 4s linear infinite}` +
  `@keyframes sweep{0%,100%{transform:translate(-8px,0)}50%{transform:translate(6px,-4px)}}.sweep{animation:sweep 1.6s ease-in-out infinite}` +
  `@keyframes hop{0%,100%{transform:translateY(0)}30%{transform:translateY(-7px)}55%{transform:translateY(0)}70%{transform:translateY(-3px)}}.hop{animation:hop .9s ease-out 3}` +
  `@keyframes twinkle{0%,100%{transform:scale(.2);opacity:0}40%{transform:scale(1.2);opacity:1}}.twinkle{transform-box:fill-box;transform-origin:center;animation:twinkle 1s ease-in-out infinite}` +
  `@keyframes lean{0%,100%{transform:rotate(7deg)}50%{transform:rotate(9deg)}}.lean{transform-box:fill-box;transform-origin:50% 100%;animation:lean 3.6s ease-in-out infinite}` +
  `@keyframes float{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(4px,-8px)}}` +
  `.z{font:700 11px Tahoma,Verdana,sans-serif;fill:#7B8494;animation:float 3s ease-out infinite}.z2{animation-delay:1s}.z3{animation-delay:2s}` +
  `@keyframes flash{0%,100%{opacity:1}50%{opacity:.2}}.bolt{animation:flash 1.1s steps(2) infinite}` +
  `@keyframes juice{0%,100%{opacity:1}50%{opacity:.55}}.juice{animation:juice 1.6s ease-in-out infinite}` +
  `.glyph{font-family:Tahoma,Verdana,sans-serif;font-weight:700}` +
  `.bot{cursor:pointer;outline:none}` +
  `.limits{opacity:0;pointer-events:none;transition:opacity .15s}` +
  `.bot:hover~.limits,.bot:focus~.limits{opacity:1}.bot:hover~.hello,.bot:focus~.hello{opacity:0}` +
  `.hello{transition:opacity .15s}` +
  `@keyframes say-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}` +
  `.say{animation:say-in .25s ease-out}.bot:hover~.say{opacity:0}` +
  `text{font:11.5px Tahoma,Verdana,'Segoe UI',sans-serif;fill:${INK}}` +
  `.hand{font:12px 'Chalkboard SE','Comic Sans MS','Marker Felt',cursive;fill:#26323F}` +
  CURSOR_CSS +
  WAKE_CSS

const DEFS =
  `<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="#F4F6F8"/><stop offset=".45" stop-color="#B8C0CA"/><stop offset="1" stop-color="#8C96A3"/>` +
  `</linearGradient></defs>`

export const COMPACT_W = Math.round(PAD_L + CLIP_W + 30)

// The band SVG is symmetric about Clippy's middle, so centring the SVG centres him; his balloons use the right half.
const BOT_W = Math.round(PAD_L + CLIP_W + EXTRA)
const FIGURE_MID = PAD_L + CLIP_W / 2
const HALF = Math.ceil(BOT_W + 4 + BUBBLE_W + 6 - FIGURE_MID)
export const BAND_W = HALF * 2
const CENTRED_CSS = `.mover{transform:translateX(${Math.round(HALF - FIGURE_MID)}px)}`

// Beside the card he faces it, reading along, so the eyes settle right.
const COMPACT_CSS = `.mover{transform:none}.pupils{animation:none!important;transform:translate(2.5px,1px)}`

export const petSvg = (opts: {
  pose: Pose
  usage: PetUsage | null
  power: PetPower | null
  now: number
  // Something he says unprompted (a limit warning, a failed test); shown instead of the greeting.
  speech?: Segment[][] | null
  // Just Clippy, standing still beside the sitrep card: no balloons.
  compact?: boolean
}) => {
  const { pose, usage, power, now, speech = null, compact = false } = opts
  const botW = BOT_W
  const width = compact ? COMPACT_W : BAND_W
  const bubbleX = botW + 4
  const greeting = compact
    ? ''
    : speech
      ? balloon('say', bubbleX, speech)
      : pose === 'greet'
        ? balloon('hello', bubbleX, [[{ text: 'Hi! It looks like you\u2019re writing code.' }], [{ text: 'Hover over me for your limits,' }], [{ text: 'or click me if I doze off.' }]])
        : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">` +
    DEFS +
    `<style>${BASE_CSS}${timeline(pose)}${compact ? COMPACT_CSS : CENTRED_CSS}</style>` +
    `<g class="mover">` +
    `<rect class="zl" x="-4000" y="0" width="4000" height="${H}" fill="transparent"/>` +
    `<rect class="zr" x="${botW}" y="0" width="4000" height="${H}" fill="transparent"/>` +
    `<g class="bot" tabindex="0"><rect x="0" y="0" width="${botW}" height="${H}" fill="transparent"/>` +
    `<g transform="translate(${PAD_L},${TOP}) scale(${S})">${paper}<g class="poke">${scene(pose, power, peakPercent(usage) >= 85)}</g></g></g>` +
    greeting +
    (compact ? '' : balloon('limits', bubbleX, bubbleLines(usage, now))) +
    `</g></svg>`
  )
}
