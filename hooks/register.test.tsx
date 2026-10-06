import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'blade-of-commits',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// The world beneath the mod: git reports everything as changed, tools and turns just pass.
const world = (on: On) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: ' M src/a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const finishTask = async ($: Engine) => {
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'x' })
  await $.turn.complete({ answer: 'fertig', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
}

describe('blade-of-commits band', () => {
  test('stays hidden while nothing changed', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'propose' })).toBeUndefined()
    await ui.unmount()
  })

  test('offers the commit button with Malenia dancing on terminal and desktop', async ($, on) => {
    world(on)
    await finishTask($)

    const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await term.find({ key: 'propose' })).toBeDefined()
    expect(await term.find({ type: 'Text', text: /2 files changed/ })).toBeDefined()
    const before = JSON.stringify(await term.drawn({ in: 'malenia' }))
    await term.advance(500)
    const after = JSON.stringify(await term.drawn({ in: 'malenia' }))
    expect(after).not.toBe(before)
    expect(after).toContain('▀')
    await term.unmount()

    const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desk.find({ key: 'propose' })).toBeDefined()
    const svg = JSON.stringify(await desk.drawn())
    expect(svg).toContain('class=\\"hair\\"')
    expect(svg).toContain('@keyframes sway')
    await desk.unmount()
  })

  test('hide takes the band down', async ($, on) => {
    world(on)
    await finishTask($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'hide' })
    expect(await ui.find({ key: 'propose' })).toBeUndefined()
    await ui.unmount()
  })
})
