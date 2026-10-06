import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, Proposal } from '../types'

import { stageSvg, SVG_SIZE } from './stage-svg'

const phase = atom({ plugin: 'blade-of-commits', key: 'phase' } as const, 'idle' as Phase)
const files = atom({ plugin: 'blade-of-commits', key: 'files' } as const, [] as string[])
const task = atom({ plugin: 'blade-of-commits', key: 'task' } as const, '')
const proposal = atom({ plugin: 'blade-of-commits', key: 'proposal' } as const, null as Proposal | null)
const note = atom({ plugin: 'blade-of-commits', key: 'note' } as const, '')

const MAX_DIFF = 14000

const SYSTEM = `You write git commit messages.
Format: Conventional Commits. First line "<type>(<optional scope>): <summary>",
imperative mood, at most 72 characters, no trailing period.
Then a blank line and 1-4 short bullet points ("- ...") explaining what changed and why,
only when the change is not trivial. Write in English.
Reply with the commit message only: no code fences, no preamble.`

// core.fsmonitor in a repository's own .git/config names a program git would run on
// every status: never let a repository run code through the mod's git calls.
const git = ($: EngineInterface, args: string[]) =>
  $.process.run(['git', '-c', 'core.fsmonitor=false', ...args])

// Diffs never run a repository's external diff or textconv programs either.
const DIFF = ['diff', '--no-ext-diff', '--no-textconv']

// Text from the model or the repository is shown in the band: keep line breaks and tabs,
// drop every other control character (terminal escape sequences included).
const printable = (text: string) => text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')

// A path that could break out of the commit instructions is never tracked.
const isSafePath = (path: string) => path.length > 0 && !/[\u0000-\u001f\u007f`]/.test(path)

const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

const baseName = (path: string) => path.split('/').pop() ?? path

const isRepo = async ($: EngineInterface) =>
  (await git($, ['rev-parse', '--is-inside-work-tree'])).exitCode === 0

const stillDirty = async ($: EngineInterface, list: string[]) => {
  const checks = await Promise.all(
    list.map(async file => {
      const r = await git($, ['status', '--porcelain', '--untracked-files=all', '--', file])
      return r.exitCode === 0 && r.stdout.trim() !== '' ? file : null
    }),
  )
  return checks.filter((f): f is string => f !== null)
}

const head = async ($: EngineInterface) => {
  const r = await git($, ['rev-parse', '--short', 'HEAD'])
  return r.exitCode === 0 ? r.stdout.trim() : ''
}

const MAX_MESSAGE = 2000

const clean = (text: string) =>
  printable(text)
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
    .slice(0, MAX_MESSAGE)

const reset = async ($: EngineInterface) => {
  await update($, files, () => [])
  await update($, task, () => '')
  await update($, proposal, () => null)
  await update($, note, () => '')
  await update($, phase, () => 'idle')
}

const fail = async ($: EngineInterface, why: string) => {
  await update($, note, () => why)
  await update($, phase, () => 'error')
}

const propose = async ($: EngineInterface) => {
  const list = await read($, files)
  if (list.length === 0) return fail($, 'No changes from the last task found.')
  await update($, phase, () => 'thinking')

  const hasHead = (await head($)) !== ''
  const base = hasHead ? [...DIFF, 'HEAD'] : [...DIFF, '--cached']
  const stat = await git($, [...base, '--stat', '--', ...list])
  const tracked = await git($, [...base, '--', ...list])
  const untracked = await git($, ['ls-files', '--others', '--exclude-standard', '--', ...list])
  const fresh = untracked.stdout.split('\n').filter(Boolean)
  const added = await Promise.all(
    fresh.map(f => git($, [...DIFF, '--no-index', '--', '/dev/null', f]).then(r => r.stdout)),
  )

  let diff = [tracked.stdout, ...added].join('\n')
  if (diff.length > MAX_DIFF) diff = `${diff.slice(0, MAX_DIFF)}\n[... diff truncated ...]`

  const prompt = [
    'What the user asked for in this task:',
    (await read($, task)) || '(unknown)',
    '',
    'Changed files:',
    stat.stdout || list.join('\n'),
    '',
    'Diff:',
    diff,
  ].join('\n')

  const r = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt, maxTokens: 400 })
  if (!r.isAnswered) return fail($, `The model did not answer (${r.reason}).`)

  await update($, proposal, () => ({ message: clean(r.text), files: list }))
  await update($, phase, () => 'preview')
}

const track = async ($: EngineInterface, path: string) => {
  if (!isSafePath(path)) return
  await update($, files, list => (list.includes(path) ? list : [...list, path]))
}

let headBefore = ''
let messageFile = ''

const removeMessageFile = async ($: EngineInterface) => {
  if (messageFile === '') return
  await $.process.run(['rm', '-f', '--', messageFile])
  messageFile = ''
}

const commit = async ($: EngineInterface) => {
  const p = await read($, proposal)
  if (p === null) return
  const paths = p.files.filter(isSafePath)
  if (paths.length === 0) return fail($, 'None of the changed files can be committed safely.')

  // The message goes to git through a file, never through Claude's prompt: text the model
  // wrote from a diff (which a repository controls) must not reach Claude as instructions.
  // mktemp creates a new file only this user can read, so nothing can be planted there.
  const made = await $.process.run(['mktemp', '-t', 'blade-of-commits.XXXXXXXX'])
  const path = made.stdout.trim()
  if (made.exitCode !== 0 || path === '') return fail($, 'Could not create a temporary file for the commit message.')
  await $.fs.write(path, `${p.message}\n`)
  messageFile = path

  headBefore = await head($)
  await update($, phase, () => 'committing')
  await $.prompt.submit({
    text: [
      'Please commit the files of the last task now. Run exactly these two commands:',
      '',
      '```',
      `git add -- ${paths.map(shellQuote).join(' ')}`,
      `git commit -F ${shellQuote(path)}`,
      '```',
      '',
      'The commit message is already in that file; do not change it and stage nothing else.',
      'If a pre-commit hook fails, do not fix anything on your own; just report what happened.',
    ].join('\n'),
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'commit-suggest',
      description: 'Suggest a commit message for the changes of the last task',
    })
    return next(e)
  })

  on('command.run', { command: 'commit-suggest' }, async $ => {
    if ((await read($, files)).length === 0) return { text: 'No uncommitted changes from recent tasks.' }
    void propose($)
    return { text: 'Malenia is writing the commit message…' }
  })

  on('prompt.submit', async ($, e, next) => {
    const p = await read($, phase)
    if (p === 'done') await reset($)
    if (p !== 'committing') {
      await update($, phase, () => 'idle')
      await update($, proposal, () => null)
      await update($, task, prev => (prev ? `${prev}\n---\n${e.text}` : e.text).slice(-3000))
    }
    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await track($, e.file_path)
    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await track($, e.file_path)
    return ran
  })

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await track($, e.notebook_path)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const p = await read($, phase)
    if (p === 'committing') {
      await removeMessageFile($)
      const now = await head($)
      if (now !== '' && now !== headBefore) {
        await update($, note, () => now)
        await update($, phase, () => 'done')
        $.ui.toast(`blade-of-commits: created commit ${now}`)
      } else {
        await fail($, 'No new commit was created. Check Claude\'s reply to see what happened.')
      }
      return result
    }

    const list = await read($, files)
    if (list.length === 0 || !(await isRepo($))) return result
    const dirty = await stillDirty($, list)
    await update($, files, () => dirty)
    await update($, phase, () => (dirty.length > 0 ? 'ready' : 'idle'))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, phase)
    if (p === 'idle' || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, files)
    const pr = await read($, proposal)
    const info = await read($, note)

    let stage = null
    if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      // The large Malenia only when the band has enough rows and columns
      const isLarge = e.props.maxRows >= 18 && e.props.bodyColumns >= 80
      stage = (
        <Client
          key="malenia"
          module="./malenia.tsx"
          props={{ phase: p, size: isLarge ? 'large' : 'small' }}
          width={isLarge ? 42 : 30}
          height={isLarge ? 18 : 12}
        />
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      stage = (
        <Svg
          source={stageSvg(p)}
          alt="Malenia, Blade of Miquella, as a pixel animation"
          width={SVG_SIZE.width}
          height={SVG_SIZE.height}
        />
      )
    }

    const fileLine = (
      <Text dimColor wrap="truncate-end">
        {list.slice(0, 4).map(baseName).join(', ')}
        {list.length > 4 ? ` +${list.length - 4}` : ''}
      </Text>
    )

    let body
    if (p === 'ready') {
      body = (
        <Box flexDirection="column">
          <Text bold>
            {list.length} {list.length === 1 ? 'file' : 'files'} changed
          </Text>
          {fileLine}
          <Box flexDirection="row" gap={1}>
            <Button key="propose" variant="primary" hotkey="c" onPress={() => propose($)}>
              Suggest commit
            </Button>
            <Button key="hide" role="dismiss" onPress={() => reset($)}>
              Hide
            </Button>
          </Box>
        </Box>
      )
    } else if (p === 'thinking') {
      body = (
        <Box flexDirection="column">
          <Text bold>Waterfowl Dance…</Text>
          <Text dimColor>Malenia is writing the commit message.</Text>
        </Box>
      )
    } else if (p === 'preview' && pr !== null) {
      body = (
        <Box flexDirection="column">
          <Text color="#d0402f">{pr.message}</Text>
          {fileLine}
          <Box flexDirection="row" gap={1}>
            <Button key="commit" variant="primary" hotkey="c" onPress={() => commit($)}>
              Commit
            </Button>
            <Button key="again" hotkey="r" onPress={() => propose($)}>
              Regenerate
            </Button>
            <Button key="cancel" role="dismiss" onPress={() => update($, phase, () => 'ready')}>
              Cancel
            </Button>
          </Box>
        </Box>
      )
    } else if (p === 'committing') {
      body = (
        <Box flexDirection="column">
          <Text bold>Claude is committing…</Text>
          <Text dimColor>{pr?.message.split('\n')[0]}</Text>
        </Box>
      )
    } else if (p === 'done') {
      body = (
        <Box flexDirection="column">
          <Text bold color="#ff6a3d">
            Scarlet Aeonia! Commit {info}
          </Text>
          <Text dimColor>{pr?.message.split('\n')[0]}</Text>
          <Button key="ok" role="dismiss" onPress={() => reset($)}>
            OK
          </Button>
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column">
          <Text bold>I am Malenia, Blade of Miquella… and that did not work.</Text>
          <Text dimColor>{info}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="retry" variant="primary" onPress={() => propose($)}>
              Retry
            </Button>
            <Button key="close" role="dismiss" onPress={() => reset($)}>
              Close
            </Button>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={2}>
        {stage}
        {body}
      </Box>
    )
  })
}
