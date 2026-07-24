#!/usr/bin/env node
// Scout installer. Zero dependencies. Interactive, so it stays instant on npx.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Key } from "node:readline";

type Scope = "global" | "project";
type Harness = "claude" | "cursor" | "codex" | "all";
type RunMode = "on" | "demand";
type Roots = { home: string; cwd: string };
type SelectOption<T> = { value: T; label: string; hint?: string };
type HookCommand = { type: string; command: string; timeout?: number; [key: string]: unknown };
type HookEntry = { hooks?: HookCommand[]; [key: string]: unknown };
type ClaudeSettings = {
  hooks?: { SessionStart?: HookEntry[]; [key: string]: unknown };
  [key: string]: unknown;
};
type PackageMetadata = { version: string };

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_HOME = os.homedir();
const META = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")) as PackageMetadata;

// ---------- style ----------
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code: string) => (text: string) => (supportsColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const accent = paint("36");
const dim = paint("2");
const bold = paint("1");
const green = paint("32");
const red = paint("31");
const gray = paint("90");

function banner(action: string) {
  console.log("");
  console.log("  " + bold("scout") + " " + gray(`v${META.version}`));
  console.log("  " + gray(action));
  console.log("");
}

function help() {
  console.log(`scout ${META.version}

Install Scout for Claude Code, Cursor, or Codex.

Usage:
  npx @gomzkov/scout
  npx @gomzkov/scout uninstall

Commands:
  uninstall        Remove Scout files and configuration

Options:
  -h, --help       Show this help
  -v, --version    Show the installed version
      --uninstall  Alias for the uninstall command

The interactive installer lets you choose the agent, install scope, and
Claude Code mode. It preserves existing configuration.`);
}

function requireInteractiveTerminal() {
  if (process.stdin.isTTY && process.stdout.isTTY) return true;
  console.error("Scout uses an interactive installer. Run this command directly in a terminal.");
  return false;
}

// ---------- spinner ----------
function spinner(text: string) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  if (!process.stdout.isTTY) {
    console.log("  " + text);
    return { stop() {} };
  }
  process.stdout.write("\x1b[?25l");
  const id = setInterval(() => {
    process.stdout.write("\r  " + accent(frames[i++ % frames.length]!) + " " + text);
  }, 80);
  return {
    stop(ok = true, msg = text) {
      clearInterval(id);
      const mark = ok ? green("✓") : red("✗");
      process.stdout.write("\r  " + mark + " " + msg + "\x1b[K\n");
      process.stdout.write("\x1b[?25h");
    },
  };
}

// ---------- select prompt (arrow keys) ----------
function clearLines(count: number) {
  process.stdout.write(`\x1b[${count}A\r`);
  for (let i = 0; i < count; i++) {
    process.stdout.write("\x1b[2K");
    if (i < count - 1) process.stdout.write("\x1b[1B\r");
  }
  if (count > 1) process.stdout.write(`\x1b[${count - 1}A\r`);
}

function fitHint(label: string, hint?: string) {
  if (!hint) return "";
  const available = (process.stdout.columns || 80) - label.length - 7;
  if (available < 12) return "";
  return hint.length > available ? hint.slice(0, available - 1) + "…" : hint;
}

function select<T>(message: string, options: SelectOption<T>[]): Promise<T> {
  return new Promise<T>((resolve) => {
    let idx = 0;
    const lineCount = options.length + 1;
    const render = (first: boolean) => {
      if (!first) process.stdout.write(`\x1b[${lineCount}A`);
      process.stdout.write("  " + bold(message) + "\x1b[K\n");
      options.forEach((o, i) => {
        const active = i === idx;
        const pointer = active ? accent("❯") : " ";
        const label = active ? accent(o.label) : o.label;
        const fittedHint = fitHint(o.label, o.hint);
        const hint = active && fittedHint ? "  " + dim(fittedHint) : "";
        process.stdout.write(`  ${pointer} ${label}${active ? hint : ""}\x1b[K\n`);
      });
    };
    render(true);

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (_str: string | undefined, key: Key) => {
      if (key.name === "up") idx = (idx - 1 + options.length) % options.length;
      else if (key.name === "down") idx = (idx + 1) % options.length;
      else if (key.name === "return") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("keypress", onKey);
        clearLines(lineCount);
        process.stdout.write("\x1b[?25h");
        return resolve(options[idx]!.value);
      } else if (key.name === "c" && key.ctrl) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("keypress", onKey);
        clearLines(lineCount);
        process.stdout.write("  " + gray("Operation cancelled.") + "\x1b[?25h\n\n");
        process.exit(130);
      } else return;
      render(false);
    };
    process.stdout.write("\x1b[?25l");
    process.stdin.on("keypress", onKey);
  });
}

// ---------- install helpers ----------
function symlinkAt(targetPath: string) {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function copy(src: string, dst: string) {
  const parent = path.dirname(dst);
  const scoutDirectory = path.basename(parent) === "scout" ? parent : null;
  const conflict = symlinkAt(dst) ? dst : scoutDirectory && symlinkAt(scoutDirectory) ? scoutDirectory : null;
  if (conflict) {
    throw new Error(`existing symlink at ${conflict}; run Scout's uninstaller first, then retry`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// Merge the SessionStart hook into a Claude Code settings.json without
// clobbering the user's existing config. Idempotent.
function addSessionStartHook(settingsPath: string, command: string) {
  let cfg: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as ClaudeSettings;
    } catch {
      throw new Error(`could not parse ${settingsPath}; fix or remove it and retry`);
    }
  }
  cfg.hooks ??= {};
  cfg.hooks.SessionStart ??= [];
  const already = JSON.stringify(cfg.hooks.SessionStart).includes(command);
  if (!already) {
    cfg.hooks.SessionStart.push({ hooks: [{ type: "command", command, timeout: 5 }] });
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + "\n");
  return !already;
}

function removeSessionStartHook(settingsPath: string, command: string) {
  if (!fs.existsSync(settingsPath)) return false;
  const source = fs.readFileSync(settingsPath, "utf8");
  if (!source.includes(command)) return false;

  let cfg: ClaudeSettings;
  try {
    cfg = JSON.parse(source) as ClaudeSettings;
  } catch {
    throw new Error(`could not parse ${settingsPath}; fix it and retry`);
  }

  const hooksConfig = cfg.hooks;
  if (!hooksConfig) return false;
  const entries = hooksConfig.SessionStart;
  if (!Array.isArray(entries)) return false;
  let changed = false;
  const remaining = [];

  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) {
      remaining.push(entry);
      continue;
    }

    const hooks = entry.hooks.filter((hook) => {
      const isScout = hook?.type === "command" && hook.command === command;
      if (isScout) changed = true;
      return !isScout;
    });

    if (hooks.length) remaining.push({ ...entry, hooks });
    else if (Object.keys(entry).some((key) => key !== "hooks")) remaining.push({ ...entry, hooks });
  }

  if (!changed) return false;
  if (remaining.length) hooksConfig.SessionStart = remaining;
  else delete hooksConfig.SessionStart;
  if (!Object.keys(hooksConfig).length) delete cfg.hooks;
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}

function removeFile(filePath: string, label: string, done: string[]) {
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  done.push(`${label.padEnd(6)} ${dim(filePath)}`);
  return true;
}

function removeDirectory(directoryPath: string, label: string, done: string[]) {
  if (!fs.existsSync(directoryPath)) return false;
  fs.rmSync(directoryPath, { recursive: true, force: true });
  done.push(`${label.padEnd(6)} ${dim(directoryPath)}`);
  return true;
}

function installClaudeCode(scope: Scope, alwaysOn: boolean, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  const base = scope === "global" ? path.join(roots.home, ".claude") : path.join(roots.cwd, ".claude");
  copy(path.join(PKG, "SKILL.md"), path.join(base, "skills", "scout", "SKILL.md"));
  done.push(`skill  ${dim(path.join(base, "skills", "scout", "SKILL.md"))}`);
  if (alwaysOn) {
    const hookPath = path.join(base, "hooks", "scout.sh");
    copy(path.join(PKG, "hook", "scout.sh"), hookPath);
    fs.chmodSync(hookPath, 0o755);
    const changed = addSessionStartHook(path.join(base, "settings.json"), `bash ${hookPath}`);
    done.push(`hook   ${dim(hookPath)}${changed ? "" : gray(" (already set)")}`);
  }
}

function installCursor(scope: Scope, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  if (scope === "global") {
    const dst = path.join(roots.home, ".cursor", "skills", "scout", "SKILL.md");
    copy(path.join(PKG, "SKILL.md"), dst);
    done.push(`skill  ${dim(dst)}`);
    return;
  }

  const dst = path.join(roots.cwd, ".cursor", "rules", "scout.mdc");
  copy(path.join(PKG, "cursor", "scout.mdc"), dst);
  done.push(`rule   ${dim(dst)}`);
}

function installCodex(scope: Scope, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  const base = scope === "global" ? path.join(roots.home, ".agents") : path.join(roots.cwd, ".agents");
  copy(path.join(PKG, "SKILL.md"), path.join(base, "skills", "scout", "SKILL.md"));
  done.push(`skill  ${dim(path.join(base, "skills", "scout", "SKILL.md"))}`);
}

function uninstallClaudeCode(scope: Scope, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  const base = scope === "global" ? path.join(roots.home, ".claude") : path.join(roots.cwd, ".claude");
  const hookPath = path.join(base, "hooks", "scout.sh");
  const settingsPath = path.join(base, "settings.json");
  if (removeSessionStartHook(settingsPath, `bash ${hookPath}`)) {
    done.push(`config ${dim(settingsPath)}`);
  }
  removeDirectory(path.join(base, "skills", "scout"), "skill", done);
  removeFile(hookPath, "hook", done);
}

function uninstallCursor(scope: Scope, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  if (scope === "global") {
    removeDirectory(path.join(roots.home, ".cursor", "skills", "scout"), "skill", done);
    return;
  }
  removeFile(path.join(roots.cwd, ".cursor", "rules", "scout.mdc"), "rule", done);
}

function uninstallCodex(scope: Scope, done: string[], roots: Roots = { home: USER_HOME, cwd: process.cwd() }) {
  const base = scope === "global" ? path.join(roots.home, ".agents") : path.join(roots.cwd, ".agents");
  removeDirectory(path.join(base, "skills", "scout"), "skill", done);
}

// ---------- self test ----------
function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scout-selftest-"));
  const roots = { home: path.join(root, "home"), cwd: path.join(root, "project") };
  const expect = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`selftest failed: ${message}`);
  };

  try {
    const settings = path.join(roots.home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    fs.writeFileSync(
      settings,
      JSON.stringify({
        model: "opus",
        hooks: {
          UserPromptSubmit: [{ hooks: [] }],
          SessionStart: [{ hooks: [{ type: "command", command: "echo existing", timeout: 5 }] }],
        },
      }),
    );

    installClaudeCode("global", true, [], roots);
    installClaudeCode("global", true, [], roots);
    installClaudeCode("project", true, [], roots);
    installCursor("global", [], roots);
    installCursor("project", [], roots);
    installCodex("global", [], roots);
    installCodex("project", [], roots);

    const cfg = JSON.parse(fs.readFileSync(settings, "utf8"));
    const hook = spawnSync("bash", [path.join(PKG, "hook", "scout.sh")], { encoding: "utf8" });
    const hookOutput = JSON.parse(hook.stdout);
    expect(cfg.model === "opus", "Claude settings were not preserved");
    expect(cfg.hooks.UserPromptSubmit.length === 1, "existing Claude hooks were not preserved");
    expect(cfg.hooks.SessionStart.length === 2, "Claude hook installation is not idempotent");
    expect(fs.existsSync(path.join(roots.home, ".claude", "skills", "scout", "SKILL.md")), "Claude skill missing");
    expect(fs.existsSync(path.join(roots.cwd, ".claude", "skills", "scout", "SKILL.md")), "project Claude skill missing");
    expect(fs.existsSync(path.join(roots.home, ".cursor", "skills", "scout", "SKILL.md")), "global Cursor skill missing");
    expect(fs.existsSync(path.join(roots.cwd, ".cursor", "rules", "scout.mdc")), "Cursor rule missing");
    expect(fs.existsSync(path.join(roots.home, ".agents", "skills", "scout", "SKILL.md")), "global Codex skill missing");
    expect(fs.existsSync(path.join(roots.cwd, ".agents", "skills", "scout", "SKILL.md")), "project Codex skill missing");
    expect(hook.status === 0, "Claude hook did not exit cleanly");
    expect(hookOutput.hookSpecificOutput?.hookEventName === "SessionStart", "Claude hook output is invalid");

    uninstallClaudeCode("global", [], roots);
    uninstallClaudeCode("global", [], roots);
    uninstallClaudeCode("project", [], roots);
    uninstallCursor("global", [], roots);
    uninstallCursor("project", [], roots);
    uninstallCodex("global", [], roots);
    uninstallCodex("project", [], roots);

    const cleaned = JSON.parse(fs.readFileSync(settings, "utf8"));
    expect(cleaned.model === "opus", "Claude settings changed during uninstall");
    expect(cleaned.hooks.UserPromptSubmit.length === 1, "existing Claude hooks were removed");
    expect(cleaned.hooks.SessionStart.length === 1, "Scout hook was not removed cleanly");
    expect(cleaned.hooks.SessionStart[0].hooks[0].command === "echo existing", "another SessionStart hook was changed");
    expect(!fs.existsSync(path.join(roots.home, ".claude", "skills", "scout")), "global Claude skill was not removed");
    expect(!fs.existsSync(path.join(roots.cwd, ".claude", "skills", "scout")), "project Claude skill was not removed");
    expect(!fs.existsSync(path.join(roots.home, ".claude", "hooks", "scout.sh")), "global Claude hook was not removed");
    expect(!fs.existsSync(path.join(roots.cwd, ".claude", "hooks", "scout.sh")), "project Claude hook was not removed");
    expect(!fs.existsSync(path.join(roots.home, ".cursor", "skills", "scout")), "global Cursor skill was not removed");
    expect(!fs.existsSync(path.join(roots.cwd, ".cursor", "rules", "scout.mdc")), "Cursor rule was not removed");
    expect(!fs.existsSync(path.join(roots.home, ".agents", "skills", "scout")), "global Codex skill was not removed");
    expect(!fs.existsSync(path.join(roots.cwd, ".agents", "skills", "scout")), "project Codex skill was not removed");

    const externalSkill = path.join(root, "external-scout");
    const scoutLink = path.join(roots.home, ".claude", "skills", "scout");
    fs.mkdirSync(externalSkill, { recursive: true });
    fs.writeFileSync(path.join(externalSkill, "SKILL.md"), "original\n");
    fs.symlinkSync(externalSkill, scoutLink, "dir");
    let symlinkError: unknown;
    try {
      installClaudeCode("global", false, [], roots);
    } catch (error) {
      symlinkError = error;
    }
    expect(symlinkError instanceof Error && symlinkError.message.includes("existing symlink"), "existing skill symlink was not rejected");
    expect(fs.readFileSync(path.join(externalSkill, "SKILL.md"), "utf8") === "original\n", "symlink target was overwritten");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("selftest ok");
}

// ---------- uninstall ----------
async function uninstall() {
  if (!requireInteractiveTerminal()) {
    process.exitCode = 1;
    return;
  }
  banner("Remove Scout from an AI coding agent");

  const harness = await select<Harness>("Which agent are you removing Scout from?", [
    { value: "claude", label: "Claude Code", hint: "skill + always-on hook" },
    { value: "cursor", label: "Cursor", hint: "personal skill or project rule" },
    { value: "codex", label: "Codex", hint: "skill" },
    { value: "all", label: "All of them" },
  ]);

  const scope = await select<Scope>("Remove it from where?", [
    { value: "global", label: "Globally", hint: "every project on this machine" },
    { value: "project", label: "This project only", hint: process.cwd() },
  ]);

  const target: Record<Harness, string> = {
    all: "all agents",
    claude: "Claude Code",
    cursor: "Cursor",
    codex: "Codex",
  };
  const location = scope === "global" ? "this machine" : "this project";
  const confirmed = await select<boolean>(`Remove Scout from ${target[harness]} on ${location}?`, [
    { value: false, label: "Cancel", hint: "keep Scout installed" },
    { value: true, label: "Uninstall Scout", hint: "remove only Scout files and configuration" },
  ]);

  if (!confirmed) {
    console.log("  " + gray("Scout was not removed."));
    console.log("");
    return;
  }

  console.log("");
  const sp = spinner("Removing Scout...");
  const done: string[] = [];
  try {
    if (harness === "claude" || harness === "all") uninstallClaudeCode(scope, done);
    if (harness === "cursor" || harness === "all") uninstallCursor(scope, done);
    if (harness === "codex" || harness === "all") uninstallCodex(scope, done);
    sp.stop(true, done.length ? "Scout uninstalled" : "Scout was not installed here");
  } catch (error) {
    sp.stop(false, "Uninstall failed");
    console.log("  " + red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }

  if (done.length) {
    console.log("");
    done.forEach((item) => console.log("  " + gray("−") + " " + item));
    console.log("");
    console.log("  " + gray("Restart any open agent sessions to finish."));
  }
  console.log("");
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) return selftest();
  if (args.includes("--help") || args.includes("-h")) return help();
  if (args.includes("--version") || args.includes("-v")) return console.log(META.version);
  if (args.length === 1 && (args[0] === "uninstall" || args[0] === "--uninstall")) return uninstall();
  if (args.length) {
    console.error(`Unknown option: ${args[0]}\nRun with --help to see supported options.`);
    process.exitCode = 1;
    return;
  }

  if (!requireInteractiveTerminal()) {
    process.exitCode = 1;
    return;
  }

  banner("Install for Claude Code, Cursor, or Codex");

  const harness = await select<Harness>("Which agent are you installing Scout for?", [
    { value: "claude", label: "Claude Code", hint: "skill + optional always-on hook" },
    { value: "cursor", label: "Cursor", hint: "personal skill or project rule" },
    { value: "codex", label: "Codex", hint: "skill" },
    { value: "all", label: "All of them" },
  ]);

  const scope = await select<Scope>("Install where?", [
    { value: "global", label: "Globally", hint: "every project on this machine" },
    { value: "project", label: "This project only", hint: process.cwd() },
  ]);

  let alwaysOn = false;
  if (harness === "claude" || harness === "all") {
    alwaysOn =
      (await select<RunMode>("How should Scout run in Claude Code?", [
        { value: "on", label: "Always on", hint: "applies every session, one cheap injection" },
        { value: "demand", label: "On demand", hint: "type /scout when you want it" },
      ])) === "on";
  }

  console.log("");
  const sp = spinner("Installing Scout...");
  const done: string[] = [];
  try {
    if (harness === "claude" || harness === "all") installClaudeCode(scope, alwaysOn, done);
    if (harness === "cursor" || harness === "all") installCursor(scope, done);
    if (harness === "codex" || harness === "all") installCodex(scope, done);
    sp.stop(true, "Scout installed");
  } catch (error) {
    sp.stop(false, "Install failed");
    console.log("  " + red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  console.log("");
  done.forEach((d) => console.log("  " + green("+") + " " + d));
  console.log("");
  console.log("  " + bold("Next:"));
  if (harness === "cursor" && scope === "project") {
    console.log("  " + gray("Cursor applies the project rule automatically. Just start working."));
  } else if (harness === "cursor") {
    console.log("  " + gray("Type ") + accent("/scout") + gray(" to invoke it, or let Cursor match it automatically."));
  } else if (harness === "all") {
    console.log("  " + gray(`Claude Code: ${alwaysOn ? "active next session" : "type /scout or use automatic matching"}`));
    console.log("  " + gray(`Cursor: ${scope === "project" ? "project rule active automatically" : "type /scout or use automatic matching"}`));
    console.log("  " + gray("Codex: type $scout or use automatic matching"));
  } else if (alwaysOn) {
    console.log("  " + gray("Scout is active in your next session. No command needed."));
  } else if (harness === "codex") {
    console.log("  " + gray("Type ") + accent("$scout") + gray(" to invoke it, or let Codex match it automatically."));
  } else {
    console.log("  " + gray("Type ") + accent("/scout") + gray(" while exploring, or let Claude match it automatically."));
  }
  console.log("  " + gray("Tune it anytime in the installed ") + "SKILL.md" + gray("."));
  console.log("");
}

main();
