import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdInit } from './commands/init.js';
import { cmdValidate } from './commands/validate.js';
import { cmdRoute } from './commands/route.js';
import { cmdContext } from './commands/context.js';
import { cmdPlan } from './commands/plan.js';
import { cmdList } from './commands/list.js';
import { cmdVerify } from './commands/verify.js';
import { cmdProjects } from './commands/projects.js';
import { cmdGenerate } from './commands/generate.js';
import { cmdLearn } from './commands/learn.js';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Walk up from dist/src/ or src/ to find package.json
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        if (pkg.name === '@icex-labs/icex-flow') return pkg.version;
      } catch { /* continue */ }
      dir = dirname(dir);
    }
  } catch { /* fallback */ }
  return '0.0.0';
}

const VERSION = getVersion();

const HELP = `
icex-flow v${VERSION} — Deterministic agent workflow orchestration

Usage: icex-flow <command> [options]

Commands:
  init [--path <dir>] [--force]   Initialize .icex-flow/ (--force re-scans only, --reset overwrites all)
  generate [--path <dir>]         Auto-generate PROJECT.md from scanned project
  learn "<knowledge>"             Store project knowledge (env, safety, arch)
  learn --list                    List all stored knowledge
  learn --remove <id>             Remove a knowledge entry
  learn --project <name>          Associate knowledge with a specific project
  validate [dir] [--global]       Validate all workflow definitions
  route "<description>" [--labels] Route a task to agent + workflow
  context [workflow] [--step]     Assemble context from manifest
  plan <workflow> [--input '{}']  Generate deterministic execution plan
                                 [--from-step <n|id>]  Resume from a specific step
  list [--dir .]                  List workflows and routes (merged)
  verify --command "<cmd>"        Run step verification
  projects [list|add|remove]      Manage registered projects

Options:
  --path <dir>     Scan a remote directory (init/generate: detect from there, write config locally)
  --dir <path>     Working directory (default: .)
  --json           Output as JSON
  --help, -h       Show help
  --version, -v    Show version

Global Config: ~/.icex-flow/
  config.json      Global settings
  projects.json    Registry of all initialized projects
  context/L0-global/ Global rules shared across all projects
  workflows/       Global workflow templates (overridable per project)

Examples:
  icex-flow init
  icex-flow init --path /path/to/remote/project
  icex-flow init --force
  icex-flow route "fix login bug" --labels bug
  icex-flow plan dev-chain --input '{"issue_number":"42","branch_name":"fix/login"}'
  icex-flow plan dev-chain --from-step 4 --input '{"issue_number":"42","branch_name":"fix/login"}'
  icex-flow context dev-chain --step implement
  icex-flow verify --command "pytest tests/ -v" --expect-exit 0
  icex-flow projects
  icex-flow projects add /path/to/project
  icex-flow projects remove /path/to/project
  icex-flow validate --global
`.trim();

export function main(args: string[]): void {
  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case 'init':
      return cmdInit(rest);
    case 'generate':
      return cmdGenerate(rest);
    case 'learn':
      return cmdLearn(rest);
    case 'validate':
      return cmdValidate(rest);
    case 'route':
      return cmdRoute(rest);
    case 'context':
      return cmdContext(rest);
    case 'plan':
      return cmdPlan(rest);
    case 'list':
      return cmdList(rest);
    case 'verify':
      return cmdVerify(rest);
    case 'projects':
      return cmdProjects(rest);
    case '--version':
    case '-v':
      console.log(`icex-flow v${VERSION}`);
      return;
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('');
      console.log(HELP);
      process.exit(1);
  }
}
