import type { ClientModule } from 'claude-code'

import type { Phase } from '../types'

import { HAND as HAND_AT, MEDIUM, MEDIUM_LAYER, PALETTE, SMALL, SMALL_HAND, SMALL_LAYER } from './sprite'

// Terminal stage in half blocks (▀: foreground = upper pixel, background = lower pixel).
// Two sizes: "large" (30 × 36 figure, 18 rows) when the band has room, otherwise "small".
export type StageSize = 'small' | 'large'

const SIZES = {
  small: { body: SMALL, layer: SMALL_LAYER, w: 30, h: 24, x: 8, blade: 12, hand: SMALL_HAND },
  large: { body: MEDIUM, layer: MEDIUM_LAYER, w: 42, h: 36, x: 10, blade: 16, hand: undefined },
}
const TICK_MS = 110

type Props = { phase: Phase; size?: StageSize }
type State = { t: number; phase: Phase; since: number }
type Grid = (string | null)[]

// The current size; scene() sets it for every frame
let W = SIZES.small.w
let H = SIZES.small.h
let BODY = SIZES.small.body
let LAYER = SIZES.small.layer
let BODY_X = SIZES.small.x
let FIG_W = BODY[0]?.length ?? 20
let BLADE_LEN = SIZES.small.blade
let HAND = { x: 0, y: 0 }

const use = (size: StageSize) => {
  const c = SIZES[size]
  W = c.w
  H = c.h
  BODY = c.body
  LAYER = c.layer
  BODY_X = c.x
  FIG_W = BODY[0]?.length ?? 20
  BLADE_LEN = c.blade
  HAND = c.hand
    ? { x: BODY_X + c.hand.x, y: c.hand.y }
    : { x: BODY_X + Math.round(HAND_AT.x * FIG_W), y: Math.round(HAND_AT.y * H) }
}

const BLADE = '#e8eef5'
const TRAIL = '#8fb3d9'
const ROT = ['#ff6a3d', '#d0402f', '#ff9f68', '#ffd1a8']

const put = (g: Grid, x: number, y: number, c: string | null | undefined) => {
  if (c === undefined) return
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi >= 0 && xi < W && yi >= 0 && yi < H) g[yi * W + xi] = c
}

// deterministic noise for particles
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

const blade = (g: Grid, angle: number, color: string, length = BLADE_LEN) => {
  put(g, HAND.x, HAND.y, '#7a5c22')
  for (let i = 1; i <= length; i++) {
    put(g, HAND.x + Math.cos(angle) * i, HAND.y + Math.sin(angle) * i, color)
  }
}

// Hair and cape first (they sway outwards, more further down), then everything else on top.
const body = (g: Grid, t: number, wild: number) => {
  const flap = Math.floor(t / 4) % 2 === 1
  for (const pass of ['h', 'w', 'b']) {
    BODY.forEach((line, y) => {
      const layer = LAYER[y] ?? ''
      for (let x = 0; x < line.length; x++) {
        const ch = line[x]
        if (ch === undefined || ch === '.' || layer[x] !== pass) continue
        let dx = 0
        let dy = y
        if (pass === 'h') {
          const side = x < FIG_W / 2 ? -1 : 1
          const reach = Math.max(0, (y - H * 0.2) / (H * 0.6))
          dx = side * Math.round(Math.sin(t * (0.3 + wild * 0.35) + y * 0.55) * (0.8 + wild * 1.4) * reach)
        } else if (pass === 'w' && flap) {
          dy = y - 1 // wing flap
        }
        put(g, BODY_X + x + dx, dy, PALETTE[ch])
      }
    })
  }
}

// Scarlet Aeonia: a ring of rot blossoms, then falling petals
const bloom = (g: Grid, since: number) => {
  const cx = BODY_X + FIG_W / 2
  const cy = H / 2
  const r = Math.min(since * 1.1, H * 0.8)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.2)
      if (since < 18 && Math.abs(d - r) < 0.8) {
        put(g, x, y, ROT[(x + y + since) % 2])
      } else if (d < r - 2 && hash(x * 31 + y * 7 + Math.floor(since / 3)) > 0.93) {
        put(g, x, y, ROT[2])
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = (hash(i) * W + Math.sin(since * 0.3 + i) * 2 + W) % W
    const y = (hash(i + 50) * H + since * 0.5) % H
    put(g, x, y, ROT[(i % 2) + 2])
  }
}

// Waterfowl Dance: the blade spins, with afterimages
const dance = (g: Grid, t: number, speed: number) => {
  for (let k = 3; k >= 1; k--) blade(g, (t - k) * speed, TRAIL, BLADE_LEN - 1)
  blade(g, t * speed, BLADE)
  for (let i = 0; i < 4; i++) {
    if (hash(t * 4 + i) > 0.5) put(g, hash(t + i * 9) * W, hash(t * 3 + i) * H, PALETTE.W)
  }
}

const grey = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const v = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.7)
  const c = v.toString(16).padStart(2, '0')
  return `#${c}${c}${c}`
}

const scene = (phase: Phase, t: number, since: number, size: StageSize): Grid => {
  use(size)
  const g: Grid = new Array(W * H).fill(null)
  if (phase === 'done') bloom(g, since)
  const wild = phase === 'thinking' || phase === 'committing' ? 1 : phase === 'done' ? 0.6 : 0
  body(g, t, wild)
  if (phase === 'thinking') dance(g, t, 0.9)
  else if (phase === 'committing') dance(g, t, 0.45)
  else if (phase === 'preview' || phase === 'done') blade(g, -2.2 + Math.sin(t * 0.3) * 0.08, BLADE)
  else if (phase === 'error') blade(g, 1.75, BLADE, BLADE_LEN - 3)
  else blade(g, 2.4 + Math.sin(t * 0.2) * 0.06, BLADE)
  return phase === 'error' ? g.map(c => (c === null ? null : grey(c))) : g
}

// One frame as rows of colors (null = empty), for tests and for recording the README's GIFs.
export const frame = (phase: Phase, t: number, since: number, size: StageSize) => {
  const g = scene(phase, t, since, size)
  return Array.from({ length: H }, (_, y) => g.slice(y * W, (y + 1) * W))
}

const Stage: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state

  if (state === undefined) {
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (s !== undefined) surface.setState({ ...s, t: s.t + 1 })
    })
    surface.setState({ t: 0, phase: props.phase, since: 0 })
  } else if (state.phase !== props.phase) {
    surface.setState({ ...state, phase: props.phase, since: state.t })
  }

  const t = state?.t ?? 0
  const g = scene(props.phase, t, t - (state?.since ?? 0), props.size ?? 'small')

  const rows = []
  for (let y = 0; y < H; y += 2) {
    const runs: { ch: string; fg?: string; bg?: string; n: number }[] = []
    for (let x = 0; x < W; x++) {
      const top = g[y * W + x] ?? null
      const bottom = g[(y + 1) * W + x] ?? null
      const cell =
        top === null && bottom === null
          ? { ch: ' ' }
          : top === null
            ? { ch: '▄', fg: bottom ?? undefined }
            : { ch: '▀', fg: top, bg: bottom ?? undefined }
      const last = runs[runs.length - 1]
      if (last && last.ch === cell.ch && last.fg === cell.fg && last.bg === cell.bg) last.n += 1
      else runs.push({ ...cell, n: 1 })
    }
    rows.push(
      <Box flexDirection="row">
        {runs.map(run => (
          <Text color={run.fg} backgroundColor={run.bg}>
            {run.ch.repeat(run.n)}
          </Text>
        ))}
      </Box>,
    )
  }

  return <Box flexDirection="column">{rows}</Box>
}

export default Stage
