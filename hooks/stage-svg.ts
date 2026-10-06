import type { Phase } from '../types'

import { BIG, BIG_LAYER, HAND, PALETTE } from './sprite'

// Desktop stage: a real SVG, one rect per run of pixels, animated with CSS
// (no timer in the mod). 64 × 48 pixels, 4 CSS pixels each.
const W = 64
const H = 48
const FIG_X = 14
const FIG_W = BIG[0]?.length ?? 40
const MID = FIG_X + FIG_W / 2
const SCALE = 4
const HX = FIG_X + Math.round(HAND.x * FIG_W)
const HY = Math.round(HAND.y * H)

export const SVG_SIZE = { width: W * SCALE, height: H * SCALE }

const rect = (x: number, y: number, w: number, color: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${color}"/>`

// The pixels of one layer as runs of the same color; hair split by row and side
const runs = (row: string, layer: string, want: string, from: number, to: number, y: number) => {
  let out = ''
  let x = from
  while (x < to) {
    const ch = row[x]
    if (ch === undefined || ch === '.' || layer[x] !== want) {
      x += 1
      continue
    }
    let end = x + 1
    while (end < to && row[end] === ch && layer[end] === want) end += 1
    out += rect(FIG_X + x, y, end - x, PALETTE[ch] ?? '#ff00ff')
    x = end
  }
  return out
}

const figure = () => {
  let body = ''
  let wings = ''
  let hair = ''
  BIG.forEach((row, y) => {
    const layer = BIG_LAYER[y] ?? ''
    body += runs(row, layer, 'b', 0, row.length, y)
    wings += runs(row, layer, 'w', 0, row.length, y)
    // Hair and cape sway more further down; a delay per row turns it into a wave
    const reach = Math.max(0, (y - 10) / 30)
    const amp = Math.round(reach * 2 * 10) / 10
    const delay = (-y * 0.07).toFixed(2)
    const left = runs(row, layer, 'h', 0, FIG_W / 2, y)
    const right = runs(row, layer, 'h', FIG_W / 2, row.length, y)
    if (left) hair += `<g class="hair" style="--a:${-amp}px;animation-delay:${delay}s">${left}</g>`
    if (right) hair += `<g class="hair" style="--a:${amp}px;animation-delay:${delay}s">${right}</g>`
  })
  return { body, wings, hair }
}

// Built once: the figure never changes, only the animation per phase
const FIGURE = figure()

const blade = (cls: string, extra = '') =>
  `<g class="${cls}" ${extra}><rect x="${HX}" y="${HY}" width="18" height="1" fill="${PALETTE.B ?? '#e9eef4'}"/>` +
  `<rect x="${HX}" y="${HY}" width="2" height="1" fill="#7a5c22"/></g>`

const petals = () => {
  let out = ''
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    const r = 14 + (i % 3) * 4
    const x = Math.round(MID + Math.cos(a) * r)
    const y = Math.round(24 + Math.sin(a) * r * 0.8)
    const c = ['#ff6a3d', '#d0402f', '#ff9f68', '#ffd1a8'][i % 4]
    out += `<rect class="petal" x="${x}" y="${y}" width="${1 + (i % 2)}" height="${1 + (i % 2)}" fill="${c}" style="animation-delay:${(-(i % 7) * 0.4).toFixed(1)}s"/>`
  }
  return `<g class="bloom">${out}</g>`
}

const sparks = () => {
  let out = ''
  for (let i = 0; i < 8; i++) {
    const x = 6 + ((i * 23) % 54)
    const y = 4 + ((i * 17) % 38)
    out += `<rect class="spark" x="${x}" y="${y}" width="1" height="1" fill="#f6e2a0" style="animation-delay:${(i * 0.13).toFixed(2)}s"/>`
  }
  return out
}

const STYLE = `
svg{shape-rendering:crispEdges}
.hair{animation:sway 1.6s steps(1,end) infinite}
@keyframes sway{0%,100%{transform:translateX(0)}25%{transform:translateX(var(--a))}50%{transform:translateX(0)}75%{transform:translateX(calc(var(--a) * -0.5))}}
.wings{animation:flap 1.4s steps(1,end) infinite}
@keyframes flap{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.blade,.trail{transform-origin:${HX}px ${HY + 0.5}px}
.idle{animation:rest 2.4s steps(1,end) infinite}
@keyframes rest{0%,100%{transform:rotate(140deg)}50%{transform:rotate(144deg)}}
.raised{transform:rotate(-125deg);animation:gleam 1.2s steps(1,end) infinite}
@keyframes gleam{0%,100%{opacity:1}50%{opacity:.75}}
.down{transform:rotate(100deg)}
.spin{animation:spin .7s linear infinite}
.slow{animation-duration:1.6s}
.trail{opacity:.35}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.spark{opacity:0;animation:blink .9s steps(1,end) infinite}
@keyframes blink{0%,60%{opacity:0}61%,100%{opacity:1}}
.bloom{transform-origin:${MID}px 24px;animation:burst 1.2s steps(6,end) 1 both}
@keyframes burst{from{transform:scale(0)}to{transform:scale(1)}}
.petal{animation:fall 3s linear infinite}
@keyframes fall{from{transform:translateY(-4px);opacity:1}to{transform:translateY(10px);opacity:0}}
.grey{filter:grayscale(1) brightness(.65)}
`

export const stageSvg = (phase: Phase) => {
  const isDancing = phase === 'thinking' || phase === 'committing'
  const speed = phase === 'committing' ? ' slow' : ''
  let sword = ''
  if (isDancing) {
    sword =
      blade(`trail spin${speed}`, 'style="animation-delay:-.12s"') +
      blade(`trail spin${speed}`, 'style="animation-delay:-.06s"') +
      blade(`blade spin${speed}`)
  } else if (phase === 'preview' || phase === 'done') {
    sword = blade('blade raised')
  } else if (phase === 'error') {
    sword = blade('blade down')
  } else {
    sword = blade('blade idle')
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${SVG_SIZE.width}" height="${SVG_SIZE.height}">` +
    `<style>${STYLE}</style>` +
    (phase === 'done' ? petals() : '') +
    `<g class="${phase === 'error' ? 'grey' : ''}">` +
    `<g class="hair-all">${FIGURE.hair}</g>` +
    `<g class="wings">${FIGURE.wings}</g>` +
    FIGURE.body +
    sword +
    `</g>` +
    (isDancing ? sparks() : '') +
    `</svg>`
  )
}
