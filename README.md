# blade-of-commits

A commit button for [Claude Code](https://claude.com/claude-code). When Claude finishes a task that changed files, a band appears above the prompt: one click suggests a clean commit message for exactly those changes, a second click has Claude commit them. A pixel-art Malenia, Blade of Miquella, keeps you company while it happens.

<p>
  <img src="docs/malenia-ready.svg" alt="Malenia at rest: wings flap, hair and cape sway" width="256">
  <img src="docs/malenia-thinking.svg" alt="Malenia's Waterfowl Dance while the commit message is written" width="256">
  <img src="docs/malenia-done.svg" alt="Scarlet Aeonia blooms when the commit lands" width="256">
</p>

*Ready, writing the message, committed: the animations exactly as the desktop app draws them.*

In the terminal she is drawn with half-block characters, large when the band has room and hand-drawn small otherwise:

| | Ready | Writing the message | Committed |
| --- | --- | --- | --- |
| **Large** | <img src="docs/terminal-large-ready.gif" alt="Terminal, large: at rest" width="210"> | <img src="docs/terminal-large-thinking.gif" alt="Terminal, large: Waterfowl Dance" width="210"> | <img src="docs/terminal-large-done.gif" alt="Terminal, large: Scarlet Aeonia" width="210"> |
| **Small** | <img src="docs/terminal-small-ready.gif" alt="Terminal, small: at rest" width="200"> | <img src="docs/terminal-small-thinking.gif" alt="Terminal, small: Waterfowl Dance" width="200"> | <img src="docs/terminal-small-done.gif" alt="Terminal, small: Scarlet Aeonia" width="200"> |

## What it does

1. **Tracks the task's files.** Every file Claude writes with `Edit`, `Write` or `NotebookEdit` is remembered. When the turn ends, the files that git still reports as changed show up in the band: `2 files changed · [ Suggest commit ] [ Hide ]`.
2. **Suggests a message.** *Suggest commit* sends the diff of those files, plus what you asked Claude for, to Haiku and shows a [Conventional Commits](https://www.conventionalcommits.org/) message: a subject line of at most 72 characters and a few bullet points when the change is not trivial.
3. **Claude commits it.** *Commit* asks Claude to stage only those files and commit with exactly that message. Because Claude runs git itself, your pre-commit hooks run as usual; if one fails, Claude reports what happened instead of fixing things on its own.
4. **Malenia reacts.** She rests while the band waits, performs the Waterfowl Dance while the message is written and while Claude commits, raises her blade over the preview, blooms into Scarlet Aeonia when the commit lands, and turns grey when something goes wrong.

| Button | Hotkey | |
| --- | --- | --- |
| Suggest commit | `c` | write a commit message for the tracked files |
| Hide | | forget the tracked files and hide the band |
| Commit | `c` | let Claude commit with the suggested message |
| Regenerate | `r` | write another message |
| Cancel | | back to the file list |

Hotkeys work while the band has the focus: click into it (in the terminal also `Ctrl+X`, then `Tab`). Typed into the prompt, a `c` is just a `c`. There is also a slash command: `/commit-suggest`.

## Requirements

- Claude Code **2.1.288 or newer**. The mod is written against Claude Code's function-hook plugin API, which is in early access and may change between releases.
- A git repository as the session's working directory.
- macOS or Linux (the mod uses `mktemp` and `rm` for the commit message file).
- The message is written by `haiku` through your own Claude Code session, so each suggestion costs a small amount of usage.

## Install

Clone the repository somewhere permanent:

```bash
git clone https://github.com/steven-ngle/blade-of-commits.git ~/blade-of-commits
```

**Terminal, one session:**

```bash
claude --plugin-dir ~/blade-of-commits
```

**Every session, desktop app included:** add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, then start a new session:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/blade-of-commits"
  }
}
```

Several folders are separated by `:`.

## How it looks where

- **Desktop app:** Malenia is a crisp SVG (40 × 48 pixels at 4 CSS pixels each), animated with CSS.
- **Terminal:** she is drawn with half-block characters, two pixels per cell. When the band has at least 18 rows and 80 columns she is drawn at 30 × 36 pixels, otherwise a hand-drawn 20 × 24 variant takes over, so a large window shows her best.

## Limitations

- Only files changed through `Edit`, `Write` and `NotebookEdit` are tracked. A file Claude changes through a shell command (`sed`, a code generator, `npm install`) is not part of the suggestion.
- Files you change yourself are never staged; a file you had already modified before the task is committed whole if Claude also edited it.
- Commit messages are written in English.

## Security

The mod reads diffs of whatever repository you work in, so it treats the repository and the model's reply as untrusted:

- **The suggestion never becomes an instruction.** The commit message is written to a fresh temporary file (`mktemp`, readable only by you), and Claude is only asked to run `git add -- <files>` and `git commit -F <that file>`. Text in a diff that tries to steer the model can at worst produce a strange message, which you see before you press *Commit*.
- **No code from the repository runs through the mod.** Every git call passes `-c core.fsmonitor=false`, and every diff `--no-ext-diff --no-textconv`, so a repository's own `.git/config` cannot make git start a program. Commands run as argument lists, never through a shell.
- **Nothing reaches your terminal raw.** Control characters (escape sequences included) are stripped from the message before it is shown or written.
- **Odd paths are skipped.** A file whose name contains control characters or backticks is never tracked; the paths in Claude's commands are shell-quoted.
- **Your git hooks still run**, because Claude commits with git as usual. In a repository you do not trust, its hooks are as dangerous as always.

The diff of the tracked files, plus the text of your prompts in the task, is sent to Haiku through your own Claude Code session, the same place your conversation already goes.

## Development

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             points at the hooks module
hooks/register.tsx           tracking, message generation, the band, the commit
hooks/stage-svg.ts           Malenia for the desktop app (SVG + CSS animation)
hooks/malenia.tsx            Malenia for the terminal (half blocks, frame timer)
hooks/sprite.ts              the pixel data, generated
hooks/register.test.tsx      tests
types/index.d.ts             the mod's state contract
tools/sprites/build.py       Malenia as shapes; regenerates hooks/sprite.ts and docs/*.png
```

Load your working copy with `claude --plugin-dir .`; an interactive session reloads the mod whenever you save a file. Then:

```bash
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
```

`tsc` needs the type declarations Claude Code writes into `.claude-plugin/types/` the first time it loads the mod.

The animated SVGs in `docs/` are the output of `stageSvg()` in `hooks/stage-svg.ts`; the terminal GIFs are frames recorded from `frame()` in `hooks/malenia.tsx`.

To change Malenia, edit the shapes (or the hand-drawn small variant) in `tools/sprites/build.py` and run it; it needs nothing but Python 3:

```bash
python3 tools/sprites/build.py
```

## Disclaimer

An unofficial fan project. Malenia and Elden Ring belong to FromSoftware and Bandai Namco; this project is not affiliated with or endorsed by them. The pixel art is original and contains no game assets.

## License

[MIT](LICENSE)
