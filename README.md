<div align="center">
  <h1><img src="assets/logo.png" alt="scout" width="128" height="128"><br>scout</h1>

  <p><strong>Your prompt is the starting point. Scout shows you where to look next.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@gomzkov/scout"><img src="https://img.shields.io/npm/v/@gomzkov/scout.svg" alt="npm version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js 18 or newer"></a>
  </p>

  <p>
    <a href="#how-it-works">How it works</a> •
    <a href="#examples">Examples</a> •
    <a href="#where-it-helps">Where it helps</a> •
    <a href="#install-and-use">Install</a> •
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

## Install and use

Run `npx @gomzkov/scout` with Node.js 18 or newer. The zero-dependency installer lets you choose the agent, global or project scope, and Claude Code's always-on or on-demand mode. Existing configuration is preserved.

- **Claude Code:** type `/scout`, use automatic matching, or enable always-on mode
- **Cursor:** type `/scout`, use automatic matching, or install the project rule
- **Codex:** type `$scout` or use automatic matching

## Uninstall

```bash
npx @gomzkov/scout uninstall
```

Choose the agent and whether to remove the global or project installation. The uninstaller removes only Scout's files. For Claude Code always-on mode, it also removes only Scout's `SessionStart` hook and preserves the rest of your settings.

Restart any open agent sessions after uninstalling.

## High signal by design

- **Answer first.** Scout never replaces or buries the real answer.
- **One line by default.** A second appears only when it materially changes the outcome.
- **No manufactured insight.** Nothing worth saying means no Scout block.
- **Calibrated to you.** Scout skips what you know and searches beyond your current frame.

Edit the installed `SKILL.md` to tune the pointer budget, skip rules, and activity level.

## License

[MIT](LICENSE) © [Evgeni Gomziakov](https://github.com/gomzkov)
