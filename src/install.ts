#!/usr/bin/env node
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
type Command = "install" | "uninstall";
type Roots = { home: string; cwd: string };
type SelectOption<T> = { value: T; label: string; hint?: string };
type HookCommand = { type?: string; command?: string; [key: string]: unknown };
type HookEntry = { hooks?: HookCommand[]; [key: string]: unknown };
type ClaudeSettings = {
  hooks?: {
    UserPromptSubmit?: HookEntry[];
    SessionStart?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type PackageMetadata = { version: string };
type CliOptions = {
  command: Command;
  harness?: Harness;
  scope?: Scope;
  mode?: RunMode;
  yes: boolean;
};

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_HOME = os.homedir();
const META = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as PackageMetadata;
const SLUG = "scout";
const DISPLAY_NAME = "Scout";
const CODEX_START = "<!-- scout:start -->";
const CODEX_END = "<!-- scout:end -->";
const CODEX_INSTRUCTION =
  "After fully answering, silently check whether the user missed a consequential, non-obvious gap that could change the outcome. If so, append `Scout:` with one short bullet labeled Risk, Ask, Lens, Direction, or Opportunity. Add a second only when it is distinct and equally consequential. Skip routine work, diagnostics where the diagnosis is already the answer, obvious advice, weak speculation, repeats, and anything the answer already covers. No value means no Scout block.";
const CODEX_BLOCK = `${CODEX_START}\n## Scout\n\n${CODEX_INSTRUCTION}\n${CODEX_END}`;

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

Surfaces the question you didn't know to ask.

Usage:
  npx @gomzkov/scout
  npx @gomzkov/scout install [options]
  npx @gomzkov/scout uninstall [options]

Commands:
  install                 Install Scout (default)
  uninstall               Remove managed files and configuration

Options:
  -a, --agent <agent>     claude, cursor, codex, or all
  -s, --scope <scope>     global or project
  -m, --mode <mode>       Claude Code: on or demand
  -y, --yes               Confirm non-interactive uninstall
  -h, --help              Show this help
  -v, --version           Show the package version

Without --agent and --scope, the installer opens an interactive picker.
Non-interactive Claude Code installs also require --mode.`);
}

function requireInteractiveTerminal() {
  if (process.stdin.isTTY && process.stdout.isTTY) return true;
  console.error(
    "This choice needs an interactive terminal. Pass --agent and --scope to run non-interactively.",
  );
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

function rejectSymlink(targetPath: string) {
  if (symlinkAt(targetPath)) {
    throw new Error(
      `refusing to modify symlink at ${targetPath}; remove it or choose another scope`,
    );
  }
}

function writeAtomic(
  targetPath: string,
  content: string | Buffer,
  mode?: number,
) {
  rejectSymlink(targetPath);
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });
  const existingMode = fs.existsSync(targetPath)
    ? fs.statSync(targetPath).mode & 0o777
    : undefined;
  const finalMode = mode ?? existingMode;
  const temporaryPath = path.join(
    parent,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    fs.writeFileSync(
      temporaryPath,
      content,
      finalMode === undefined ? undefined : { mode: finalMode },
    );
    fs.renameSync(temporaryPath, targetPath);
    if (finalMode !== undefined) fs.chmodSync(targetPath, finalMode);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function copyManaged(
  sourcePath: string,
  targetPath: string,
  managedDirectory?: string,
) {
  if (managedDirectory) rejectSymlink(managedDirectory);
  writeAtomic(targetPath, fs.readFileSync(sourcePath));
}

function readClaudeSettings(settingsPath: string): ClaudeSettings {
  if (!fs.existsSync(settingsPath)) return {};
  rejectSymlink(settingsPath);
  const source = fs.readFileSync(settingsPath, "utf8").trim();
  if (!source) return {};
  try {
    return JSON.parse(source) as ClaudeSettings;
  } catch {
    throw new Error(`could not parse ${settingsPath}; fix or move it and retry`);
  }
}

function hasExactHook(entries: HookEntry[], command: string) {
  return entries.some((entry) =>
    Array.isArray(entry?.hooks)
      ? entry.hooks.some(
          (hook) => hook?.type === "command" && hook.command === command,
        )
      : false,
  );
}

function addSessionStartHook(settingsPath: string, command: string) {
  const config = readClaudeSettings(settingsPath);
  config.hooks ??= {};
  config.hooks.SessionStart ??= [];
  if (hasExactHook(config.hooks.SessionStart, command)) return false;

  config.hooks.SessionStart.push({
    hooks: [{ type: "command", command, timeout: 5 }],
  });
  writeAtomic(settingsPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

function removeSessionStartHook(settingsPath: string, command: string) {
  if (!fs.existsSync(settingsPath)) return false;
  const config = readClaudeSettings(settingsPath);
  const entries = config.hooks?.SessionStart;
  if (!Array.isArray(entries)) return false;

  let changed = false;
  const remaining: HookEntry[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) {
      remaining.push(entry);
      continue;
    }

    const hooks = entry.hooks.filter((hook) => {
      const managed = hook?.type === "command" && hook.command === command;
      if (managed) changed = true;
      return !managed;
    });

    if (hooks.length > 0) remaining.push({ ...entry, hooks });
    else if (Object.keys(entry).some((key) => key !== "hooks")) {
      remaining.push({ ...entry, hooks });
    }
  }

  if (!changed) return false;
  if (remaining.length > 0) config.hooks!.SessionStart = remaining;
  else {
    delete config.hooks!.SessionStart;
    if (Object.keys(config.hooks!).length === 0) delete config.hooks;
  }

  if (Object.keys(config).length === 0) fs.rmSync(settingsPath, { force: true });
  else writeAtomic(settingsPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

function addMarkedBlock(targetPath: string) {
  rejectSymlink(targetPath);
  const source = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : "";
  const start = source.indexOf(CODEX_START);
  const end = source.indexOf(CODEX_END);

  if ((start === -1) !== (end === -1)) {
    throw new Error(`found an incomplete ${DISPLAY_NAME} block in ${targetPath}`);
  }

  if (start !== -1 && end !== -1) {
    const afterEnd = end + CODEX_END.length;
    const next = `${source.slice(0, start)}${CODEX_BLOCK}${source.slice(afterEnd)}`;
    if (next === source) return false;
    writeAtomic(targetPath, next);
    return true;
  }

  const prefix = source.trimEnd();
  writeAtomic(targetPath, `${prefix}${prefix ? "\n\n" : ""}${CODEX_BLOCK}\n`);
  return true;
}

function removeMarkedBlock(targetPath: string) {
  if (!fs.existsSync(targetPath)) return false;
  rejectSymlink(targetPath);
  const source = fs.readFileSync(targetPath, "utf8");
  const start = source.indexOf(CODEX_START);
  const end = source.indexOf(CODEX_END);
  if (start === -1 && end === -1) return false;
  if (start === -1 || end === -1) {
    throw new Error(`found an incomplete ${DISPLAY_NAME} block in ${targetPath}`);
  }

  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end + CODEX_END.length).trimStart();
  const remaining = [before, after].filter(Boolean).join("\n\n");
  if (!remaining) fs.rmSync(targetPath, { force: true });
  else writeAtomic(targetPath, `${remaining}\n`);
  return true;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function bashPath(value: string) {
  return value.replaceAll("\\", "/");
}

function removeManagedFile(
  targetPath: string,
  label: string,
  done: string[],
) {
  if (!fs.existsSync(targetPath) && !symlinkAt(targetPath)) return false;
  rejectSymlink(targetPath);
  fs.rmSync(targetPath, { force: true });
  done.push(`${label.padEnd(7)} ${dim(targetPath)}`);
  return true;
}

function removeEmptyDirectory(directoryPath: string) {
  try {
    fs.rmdirSync(directoryPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") {
      throw error;
    }
  }
}

function installClaudeCode(
  scope: Scope,
  alwaysOn: boolean,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const base =
    scope === "global"
      ? path.join(roots.home, ".claude")
      : path.join(roots.cwd, ".claude");
  const settingsPath = path.join(base, "settings.json");
  readClaudeSettings(settingsPath);

  const skillDirectory = path.join(base, "skills", SLUG);
  const skillPath = path.join(skillDirectory, "SKILL.md");
  copyManaged(
    path.join(PACKAGE_ROOT, "SKILL.md"),
    skillPath,
    skillDirectory,
  );
  done.push(`skill   ${dim(skillPath)}`);

  const hookPath = path.join(base, "hooks", `${SLUG}.sh`);
  const command = `bash ${shellQuote(bashPath(hookPath))}`;
  const legacyCommand = `bash ${hookPath}`;

  if (alwaysOn) {
    copyManaged(
      path.join(PACKAGE_ROOT, "hook", `${SLUG}.sh`),
      hookPath,
    );
    fs.chmodSync(hookPath, 0o755);
    done.push(`hook    ${dim(hookPath)}`);

    const migrated =
      legacyCommand === command
        ? false
        : removeSessionStartHook(settingsPath, legacyCommand);
    const changed = addSessionStartHook(settingsPath, command);
    done.push(
      `config  ${dim(settingsPath)}${changed || migrated ? "" : gray(" (already set)")}`,
    );
  } else {
    const removedCurrent = removeSessionStartHook(settingsPath, command);
    const removedLegacy =
      legacyCommand !== command &&
      removeSessionStartHook(settingsPath, legacyCommand);
    if (removedCurrent || removedLegacy) {
      done.push(`config  ${dim(settingsPath)}`);
    }
    removeManagedFile(hookPath, "hook", done);
    removeEmptyDirectory(path.dirname(hookPath));
  }
}

function installCursor(
  scope: Scope,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const base =
    scope === "global"
      ? path.join(roots.home, ".cursor")
      : path.join(roots.cwd, ".cursor");
  const skillDirectory = path.join(base, "skills", SLUG);
  const skillPath = path.join(skillDirectory, "SKILL.md");
  copyManaged(
    path.join(PACKAGE_ROOT, "SKILL.md"),
    skillPath,
    skillDirectory,
  );
  done.push(`skill   ${dim(skillPath)}`);

  if (scope === "project") {
    const rulePath = path.join(base, "rules", `${SLUG}.mdc`);
    copyManaged(
      path.join(PACKAGE_ROOT, "cursor", `${SLUG}.mdc`),
      rulePath,
    );
    done.push(`rule    ${dim(rulePath)}`);
  }
}

function installCodex(
  scope: Scope,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const skillBase =
    scope === "global"
      ? path.join(roots.home, ".agents")
      : path.join(roots.cwd, ".agents");
  const skillDirectory = path.join(skillBase, "skills", SLUG);
  const skillPath = path.join(skillDirectory, "SKILL.md");
  copyManaged(
    path.join(PACKAGE_ROOT, "SKILL.md"),
    skillPath,
    skillDirectory,
  );
  done.push(`skill   ${dim(skillPath)}`);

  const agentsPath =
    scope === "global"
      ? path.join(roots.home, ".codex", "AGENTS.md")
      : path.join(roots.cwd, "AGENTS.md");
  const changed = addMarkedBlock(agentsPath);
  done.push(
    `agents  ${dim(agentsPath)}${changed ? "" : gray(" (already set)")}`,
  );
}

function uninstallClaudeCode(
  scope: Scope,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const base =
    scope === "global"
      ? path.join(roots.home, ".claude")
      : path.join(roots.cwd, ".claude");
  const hookPath = path.join(base, "hooks", `${SLUG}.sh`);
  const settingsPath = path.join(base, "settings.json");
  const command = `bash ${shellQuote(bashPath(hookPath))}`;
  const legacyCommand = `bash ${hookPath}`;

  const removedCurrent = removeSessionStartHook(settingsPath, command);
  const removedLegacy =
    legacyCommand !== command &&
    removeSessionStartHook(settingsPath, legacyCommand);
  if (removedCurrent || removedLegacy) {
    done.push(`config  ${dim(settingsPath)}`);
  }

  const skillDirectory = path.join(base, "skills", SLUG);
  removeManagedFile(path.join(skillDirectory, "SKILL.md"), "skill", done);
  removeEmptyDirectory(skillDirectory);
  removeEmptyDirectory(path.dirname(skillDirectory));
  removeManagedFile(hookPath, "hook", done);
  removeEmptyDirectory(path.dirname(hookPath));
  removeEmptyDirectory(base);
}

function uninstallCursor(
  scope: Scope,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const base =
    scope === "global"
      ? path.join(roots.home, ".cursor")
      : path.join(roots.cwd, ".cursor");
  const skillDirectory = path.join(base, "skills", SLUG);
  removeManagedFile(path.join(skillDirectory, "SKILL.md"), "skill", done);
  removeEmptyDirectory(skillDirectory);
  removeEmptyDirectory(path.dirname(skillDirectory));

  if (scope === "project") {
    const rulePath = path.join(base, "rules", `${SLUG}.mdc`);
    removeManagedFile(rulePath, "rule", done);
    removeEmptyDirectory(path.dirname(rulePath));
  }
  removeEmptyDirectory(base);
}

function uninstallCodex(
  scope: Scope,
  done: string[],
  roots: Roots = { home: USER_HOME, cwd: process.cwd() },
) {
  const skillBase =
    scope === "global"
      ? path.join(roots.home, ".agents")
      : path.join(roots.cwd, ".agents");
  const skillDirectory = path.join(skillBase, "skills", SLUG);
  removeManagedFile(path.join(skillDirectory, "SKILL.md"), "skill", done);
  removeEmptyDirectory(skillDirectory);
  removeEmptyDirectory(path.dirname(skillDirectory));
  removeEmptyDirectory(skillBase);

  const agentsPath =
    scope === "global"
      ? path.join(roots.home, ".codex", "AGENTS.md")
      : path.join(roots.cwd, "AGENTS.md");
  if (removeMarkedBlock(agentsPath)) {
    done.push(`agents  ${dim(agentsPath)}`);
  }
  if (scope === "global") removeEmptyDirectory(path.dirname(agentsPath));
}

function countOccurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${SLUG}-selftest-`));
  const roots = {
    home: path.join(root, "home with spaces"),
    cwd: path.join(root, "project with spaces"),
  };
  const expect = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`selftest failed: ${message}`);
  };

  try {
    const globalSettings = path.join(
      roots.home,
      ".claude",
      "settings.json",
    );
    const globalHookPath = path.join(
      roots.home,
      ".claude",
      "hooks",
      `${SLUG}.sh`,
    );
    const legacyCommand = `bash ${globalHookPath}`;
    fs.mkdirSync(path.dirname(globalSettings), { recursive: true });
    fs.writeFileSync(
      globalSettings,
      `${JSON.stringify(
        {
          model: "opus",
          hooks: {
            UserPromptSubmit: [{ hooks: [] }],
            SessionStart: [
              {
                hooks: [
                  { type: "command", command: "echo existing", timeout: 5 },
                ],
              },
              {
                hooks: [
                  { type: "command", command: legacyCommand, timeout: 5 },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );

    const globalAgents = path.join(roots.home, ".codex", "AGENTS.md");
    const projectAgents = path.join(roots.cwd, "AGENTS.md");
    fs.mkdirSync(path.dirname(globalAgents), { recursive: true });
    fs.mkdirSync(path.dirname(projectAgents), { recursive: true });
    fs.writeFileSync(globalAgents, "# Existing global guidance\n");
    fs.writeFileSync(projectAgents, "# Existing project guidance\n");

    for (const scope of ["global", "project"] as const) {
      installClaudeCode(scope, true, [], roots);
      installClaudeCode(scope, true, [], roots);
      installCursor(scope, [], roots);
      installCursor(scope, [], roots);
      installCodex(scope, [], roots);
      installCodex(scope, [], roots);
    }

    const settings = JSON.parse(
      fs.readFileSync(globalSettings, "utf8"),
    ) as ClaudeSettings;
    expect(settings.model === "opus", "Claude settings were not preserved");
    expect(
      settings.hooks?.UserPromptSubmit?.length === 1,
      "existing Claude hooks were not preserved",
    );
    expect(
      settings.hooks?.SessionStart?.length === 2,
      "Claude hook installation is not idempotent",
    );
    const installedCommand =
      settings.hooks?.SessionStart?.[1]?.hooks?.[0]?.command;
    expect(
      installedCommand === `bash ${shellQuote(bashPath(globalHookPath))}`,
      "Claude hook path was not safely quoted",
    );
    expect(
      installedCommand !== legacyCommand,
      "legacy Claude hook command was not migrated",
    );

    for (const base of [
      path.join(roots.home, ".claude"),
      path.join(roots.cwd, ".claude"),
      path.join(roots.home, ".cursor"),
      path.join(roots.cwd, ".cursor"),
      path.join(roots.home, ".agents"),
      path.join(roots.cwd, ".agents"),
    ]) {
      expect(
        fs.existsSync(path.join(base, "skills", SLUG, "SKILL.md")),
        `skill missing under ${base}`,
      );
    }

    expect(
      fs.existsSync(
        path.join(roots.cwd, ".cursor", "rules", `${SLUG}.mdc`),
      ),
      "Cursor project rule missing",
    );
    expect(
      !fs.existsSync(
        path.join(roots.home, ".cursor", "rules", `${SLUG}.mdc`),
      ),
      "unsupported global Cursor rule was installed",
    );
    expect(
      countOccurrences(fs.readFileSync(globalAgents, "utf8"), CODEX_START) ===
        1,
      "global Codex block is not idempotent",
    );
    expect(
      countOccurrences(fs.readFileSync(projectAgents, "utf8"), CODEX_START) ===
        1,
      "project Codex block is not idempotent",
    );

    const hookPath = path.join(PACKAGE_ROOT, "hook", `${SLUG}.sh`);
    const hook = spawnSync("bash", [hookPath], { encoding: "utf8" });
    const mutedHook = spawnSync("bash", [hookPath], {
      encoding: "utf8",
      env: { ...process.env, SCOUT_DISABLE: "1" },
    });
    expect(hook.status === 0, "Claude hook did not exit cleanly");
    expect(mutedHook.status === 0, "muted Claude hook did not exit cleanly");
    expect(mutedHook.stdout === "", "SCOUT_DISABLE did not mute the hook");
    const hookOutput = JSON.parse(hook.stdout || "{}") as {
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };
    expect(
      hookOutput.hookSpecificOutput?.hookEventName === "SessionStart",
      "Claude hook output has the wrong event",
    );
    expect(
      hookOutput.hookSpecificOutput?.additionalContext?.includes("Scout:"),
      "Claude hook output is missing the instruction",
    );

    const installOptions = parseOptions([
      "install",
      "--agent",
      "all",
      "--scope",
      "global",
      "--mode",
      "on",
    ]);
    expect(
      installOptions.command === "install" &&
        installOptions.harness === "all" &&
        installOptions.scope === "global" &&
        installOptions.mode === "on",
      "non-interactive install options were not parsed",
    );
    const uninstallOptions = parseOptions([
      "remove",
      "-a",
      "codex",
      "-s",
      "project",
      "-y",
    ]);
    expect(
      uninstallOptions.command === "uninstall" &&
        uninstallOptions.harness === "codex" &&
        uninstallOptions.scope === "project" &&
        uninstallOptions.yes,
      "non-interactive uninstall options were not parsed",
    );

    for (const scope of ["global", "project"] as const) {
      uninstallClaudeCode(scope, [], roots);
      uninstallClaudeCode(scope, [], roots);
      uninstallCursor(scope, [], roots);
      uninstallCursor(scope, [], roots);
      uninstallCodex(scope, [], roots);
      uninstallCodex(scope, [], roots);
    }

    const cleanedSettings = JSON.parse(
      fs.readFileSync(globalSettings, "utf8"),
    ) as ClaudeSettings;
    expect(
      cleanedSettings.model === "opus",
      "Claude settings changed during uninstall",
    );
    expect(
      cleanedSettings.hooks?.UserPromptSubmit?.length === 1,
      "existing Claude hook was removed",
    );
    expect(
      cleanedSettings.hooks?.SessionStart?.length === 1 &&
        cleanedSettings.hooks.SessionStart[0]?.hooks?.[0]?.command ===
          "echo existing",
      "managed Claude hook was not removed cleanly",
    );
    expect(
      fs.readFileSync(globalAgents, "utf8") ===
        "# Existing global guidance\n",
      "global AGENTS.md content changed during uninstall",
    );
    expect(
      fs.readFileSync(projectAgents, "utf8") ===
        "# Existing project guidance\n",
      "project AGENTS.md content changed during uninstall",
    );
    expect(
      !fs.existsSync(path.join(roots.cwd, ".claude")),
      "empty project Claude directory was left behind",
    );
    expect(
      !fs.existsSync(path.join(roots.cwd, ".cursor")),
      "empty project Cursor directory was left behind",
    );
    expect(
      !fs.existsSync(path.join(roots.cwd, ".agents")),
      "empty project Codex skill directory was left behind",
    );

    installClaudeCode("global", false, [], roots);
    expect(
      !fs.existsSync(globalHookPath),
      "on-demand Claude install unexpectedly created a hook",
    );
    uninstallClaudeCode("global", [], roots);

    const externalSkill = path.join(root, "external-scout");
    const scoutLink = path.join(
      roots.home,
      ".claude",
      "skills",
      SLUG,
    );
    fs.mkdirSync(externalSkill, { recursive: true });
    fs.writeFileSync(path.join(externalSkill, "SKILL.md"), "original\n");
    fs.mkdirSync(path.dirname(scoutLink), { recursive: true });
    fs.symlinkSync(externalSkill, scoutLink, "dir");
    let symlinkError: unknown;
    try {
      installClaudeCode("global", false, [], roots);
    } catch (error) {
      symlinkError = error;
    }
    expect(
      symlinkError instanceof Error &&
        symlinkError.message.includes("refusing to modify symlink"),
      "existing skill symlink was not rejected",
    );
    expect(
      fs.readFileSync(path.join(externalSkill, "SKILL.md"), "utf8") ===
        "original\n",
      "symlink target was overwritten",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("selftest ok");
}

function parseOptions(args: string[]): CliOptions {
  let command: Command = "install";
  let harness: Harness | undefined;
  let scope: Scope | undefined;
  let mode: RunMode | undefined;
  let yes = false;
  let index = 0;

  if (args[0] === "install") index += 1;
  else if (
    args[0] === "uninstall" ||
    args[0] === "remove" ||
    args[0] === "--uninstall"
  ) {
    command = "uninstall";
    index += 1;
  }

  while (index < args.length) {
    const argument = args[index];
    if (argument === "--agent" || argument === "-a") {
      const value = args[index + 1];
      if (!["claude", "cursor", "codex", "all"].includes(value || "")) {
        throw new Error("--agent must be claude, cursor, codex, or all");
      }
      harness = value as Harness;
      index += 2;
    } else if (argument === "--scope" || argument === "-s") {
      const value = args[index + 1];
      if (value !== "global" && value !== "project") {
        throw new Error("--scope must be global or project");
      }
      scope = value;
      index += 2;
    } else if (argument === "--mode" || argument === "-m") {
      const value = args[index + 1];
      if (value !== "on" && value !== "demand") {
        throw new Error("--mode must be on or demand");
      }
      mode = value;
      index += 2;
    } else if (argument === "--yes" || argument === "-y") {
      yes = true;
      index += 1;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }

  return {
    command,
    ...(harness === undefined ? {} : { harness }),
    ...(scope === undefined ? {} : { scope }),
    ...(mode === undefined ? {} : { mode }),
    yes,
  };
}

async function chooseHarness(current?: Harness): Promise<Harness> {
  if (current) return current;
  if (!requireInteractiveTerminal()) throw new Error("agent choice required");
  return select<Harness>(`Which agent should use ${DISPLAY_NAME}?`, [
    { value: "claude", label: "Claude Code", hint: "skill + optional always-on hook" },
    { value: "cursor", label: "Cursor", hint: "skill + project rule" },
    { value: "codex", label: "Codex", hint: "skill + AGENTS.md instruction" },
    { value: "all", label: "All of them" },
  ]);
}

async function chooseScope(current?: Scope): Promise<Scope> {
  if (current) return current;
  if (!requireInteractiveTerminal()) throw new Error("scope choice required");
  return select<Scope>("Which scope?", [
    { value: "global", label: "Globally", hint: "every project on this machine" },
    { value: "project", label: "This project only", hint: process.cwd() },
  ]);
}

async function chooseMode(
  current: RunMode | undefined,
  harness: Harness,
): Promise<RunMode> {
  const includesClaude = harness === "claude" || harness === "all";
  if (!includesClaude) {
    if (current) throw new Error("--mode only applies to Claude Code");
    return "demand";
  }
  if (current) return current;
  if (!requireInteractiveTerminal()) {
    throw new Error("Claude Code mode required; pass --mode on or demand");
  }
  return select<RunMode>("How should Scout run in Claude Code?", [
    { value: "on", label: "Always on", hint: "applies every session" },
    { value: "demand", label: "On demand", hint: "type /scout when you want it" },
  ]);
}

async function install(options: CliOptions) {
  banner("Install for Claude Code, Cursor, or Codex");
  const harness = await chooseHarness(options.harness);
  const scope = await chooseScope(options.scope);
  const mode = await chooseMode(options.mode, harness);
  const operation = spinner(`Installing ${DISPLAY_NAME}...`);
  const done: string[] = [];

  try {
    if (harness === "claude" || harness === "all") {
      installClaudeCode(scope, mode === "on", done);
    }
    if (harness === "cursor" || harness === "all") {
      installCursor(scope, done);
    }
    if (harness === "codex" || harness === "all") {
      installCodex(scope, done);
    }
    operation.stop(true, `${DISPLAY_NAME} installed`);
  } catch (error) {
    operation.stop(false, "Install failed");
    console.log(
      `  ${red(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("");
  done.forEach((item) => console.log(`  ${green("+")} ${item}`));
  console.log("");
  console.log(`  ${bold("Next:")}`);

  if (harness === "claude" && mode === "on") {
    console.log(`  ${gray("Start a new Claude Code session. Scout runs automatically.")}`);
  } else if (harness === "claude") {
    console.log(`  ${gray("Start a new Claude Code session. Use ")}${accent("/scout")}${gray(" or let Claude match the skill.")}`);
  } else if (harness === "cursor" && scope === "project") {
    console.log(`  ${gray("Start a new Cursor chat. The project rule applies automatically.")}`);
  } else if (harness === "cursor") {
    console.log(`  ${gray("Start a new Cursor chat. Use ")}${accent("/scout")}${gray(" or let Cursor match the skill.")}`);
  } else if (harness === "codex") {
    console.log(`  ${gray("Start a new Codex task. The AGENTS.md instruction applies automatically.")}`);
  } else {
    console.log(`  ${gray("Restart open agent sessions so they load Scout.")}`);
  }
  console.log("");
}

async function uninstall(options: CliOptions) {
  if (options.mode) throw new Error("--mode only applies to install");
  banner("Remove from Claude Code, Cursor, or Codex");
  const harness = await chooseHarness(options.harness);
  const scope = await chooseScope(options.scope);

  if (!options.yes) {
    if (!requireInteractiveTerminal()) {
      throw new Error("non-interactive uninstall requires --yes");
    }
    const target =
      harness === "all"
        ? "all agents"
        : harness === "claude"
          ? "Claude Code"
          : harness === "cursor"
            ? "Cursor"
            : "Codex";
    const location =
      scope === "global" ? "this machine" : "this project";
    const confirmed = await select<boolean>(
      `Remove ${DISPLAY_NAME} from ${target} on ${location}?`,
      [
        { value: false, label: "Cancel", hint: "keep Scout installed" },
        {
          value: true,
          label: `Uninstall ${DISPLAY_NAME}`,
          hint: "remove only managed files and configuration",
        },
      ],
    );
    if (!confirmed) {
      console.log(`  ${gray(`${DISPLAY_NAME} was not removed.`)}\n`);
      return;
    }
  }

  const operation = spinner(`Removing ${DISPLAY_NAME}...`);
  const done: string[] = [];
  try {
    if (harness === "claude" || harness === "all") {
      uninstallClaudeCode(scope, done);
    }
    if (harness === "cursor" || harness === "all") {
      uninstallCursor(scope, done);
    }
    if (harness === "codex" || harness === "all") {
      uninstallCodex(scope, done);
    }
    operation.stop(
      true,
      done.length > 0
        ? `${DISPLAY_NAME} uninstalled`
        : `${DISPLAY_NAME} was not installed here`,
    );
  } catch (error) {
    operation.stop(false, "Uninstall failed");
    console.log(
      `  ${red(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (done.length > 0) {
    console.log("");
    done.forEach((item) => console.log(`  ${gray("−")} ${item}`));
    console.log("");
    console.log(`  ${gray("Restart open agent sessions to finish.")}`);
  }
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) return selftest();
  if (args.includes("--help") || args.includes("-h")) return help();
  if (args.includes("--version") || args.includes("-v")) {
    console.log(META.version);
    return;
  }

  try {
    const options = parseOptions(args);
    if (options.command === "uninstall") await uninstall(options);
    else await install(options);
  } catch (error) {
    console.error(
      `error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

await main();
