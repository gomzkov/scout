<div align="center">
  <h1><img src="assets/logo.png" alt="scout" width="128" height="128"><br>scout</h1>

  <p><strong>Your prompt is the starting point. Scout shows you where to look next.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@gomzkov/scout"><img src="https://img.shields.io/npm/v/@gomzkov/scout.svg" alt="npm version"></a>
    <a href="https://github.com/gomzkov/scout/actions/workflows/ci.yml"><img src="https://github.com/gomzkov/scout/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node.js 22 or newer"></a>
  </p>

  <p>
    <a href="#how-it-works">How it works</a> •
    <a href="#examples">Examples</a> •
    <a href="#where-it-helps">Where it helps</a> •
    <a href="#install">Install</a> •
    <a href="#uninstall">Uninstall</a>
  </p>
</div>

<br>

AI gave us the greatest answer engine ever built.

But there is one brutal limit:

### **It cannot answer a question you never ask.**

If you do not know a concept exists, you cannot ask about it. The blind spot, better question, different perspective, or next opportunity stays invisible.

**Scout reveals it.**

```bash
npx @gomzkov/scout
```

## How it works

Scout is a behavior layer for Claude Code, Cursor, and Codex. Your agent gives you the full answer first. When Scout finds a high-value gap, it adds one short pointer. It adds a second only when both materially matter:

- **Risk:** the hidden constraint, failure mode, or assumption
- **Ask:** the next question that unlocks a better answer
- **Lens:** the perspective that changes the picture
- **Direction:** the work that matters more
- **Opportunity:** the feature, product, tool, or idea sitting nearby

No gap, no block. Scout stays silent until it has something worth saying.

**The goal: 10x the value of the conversation without 10x the noise.**

## Examples

Your agent answers the request. Scout adds the gap:

### Software

> **You:** Help me design an expense approval workflow.
>
> **Scout:**
>
> - **Risk:** The happy path breaks when the approver is unavailable or submits their own expense. Define delegation, reassignment, and self-approval rules now.

### Product

> **You:** How should we improve onboarding for our analytics product?
>
> **Scout:**
>
> - **Direction:** Optimize for the first useful decision, not completed setup. Measure time to first insight before adding more onboarding steps.

### Creative

> **You:** Help me outline a documentary about abandoned shopping malls.
>
> **Scout:**
>
> - **Lens:** The buildings are the setting, not the story. Follow one person whose life changed with the mall and let the decline unfold through them.

## Scout discovered Scout

Scout started as a private skill I built for myself. Then it surfaced an adjacent opportunity I had not asked about: turn the behavior into a standalone product so other people could use it.

That suggestion created this repository. Scout found the product hiding next to the work.

## Where it helps

- **Developers:** catch logic holes, missing states, security gaps, and failure modes
- **Founders and product teams:** find the user need behind the feature and the product behind the workaround
- **Researchers:** uncover missing vocabulary, assumptions, sources, and opposing models
- **Creative people:** discover stronger angles, formats, constraints, and adjacent ideas
- **Decision makers:** expose hidden tradeoffs, second-order effects, and better options

## Install

Run the interactive installer with Node.js 22 or newer:

```bash
npx @gomzkov/scout
```

Choose:

1. Claude Code, Cursor, Codex, or all three
2. A global installation or the current project
3. Always-on or on-demand mode when installing for Claude Code

Running the installer again updates Scout without duplicating configuration. Existing settings and instruction files are preserved.

### Non-interactive install

```bash
npx @gomzkov/scout install --agent all --scope global --mode on
```

Available values:

| Option | Values |
| --- | --- |
| `--agent` | `claude`, `cursor`, `codex`, `all` |
| `--scope` | `global`, `project` |
| `--mode` | `on`, `demand` for Claude Code or `all` |

### Agent behavior

| Agent | Global | Project |
| --- | --- | --- |
| Claude Code | Skill plus optional always-on hook | Project skill plus optional always-on hook |
| Cursor | Personal skill, loaded by matching or `/scout` | Skill plus always-applied project rule |
| Codex | Skill plus a managed `~/.codex/AGENTS.md` block | Skill plus a managed project `AGENTS.md` block |

Start a new agent session after installing.

## Uninstall

```bash
npx @gomzkov/scout uninstall
```

For an unattended uninstall:

```bash
npx @gomzkov/scout uninstall --agent all --scope global --yes
```

The uninstaller removes only Scout's files, its Claude Code hook, and its marked Codex instruction block. Other hooks, settings, skills, rules, and `AGENTS.md` content stay untouched.

Restart any open agent sessions after uninstalling.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SCOUT_DISABLE` | `0` | Set to `1` to mute the Claude Code always-on hook without uninstalling |

## Installer safety

- Zero runtime dependencies.
- No install or postinstall script. Nothing changes until you run the CLI.
- Writes are atomic and refuse symlinked targets.
- Install and uninstall are idempotent and preserve unrelated configuration.
- The package tests global and project flows for all supported agents.

## High signal by design

- **Answer first.** Scout never replaces or buries the real answer.
- **One line by default.** A second appears only when it materially changes the outcome.
- **No manufactured insight.** Nothing worth saying means no Scout block.
- **Calibrated to you.** Scout skips what you know and searches beyond your current frame.

Edit the installed `SKILL.md` to tune the pointer budget, skip rules, and activity level.

## Development

```bash
npm ci
npm test
npm pack --dry-run
```

`npm test` compiles the installer and exercises install, update, and uninstall flows inside a temporary directory.

## License

[MIT](LICENSE) © [Evgeni Gomziakov](https://github.com/gomzkov)
