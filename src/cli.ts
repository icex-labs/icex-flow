import { cmdInit } from './commands/init.js';
import { cmdValidate } from './commands/validate.js';
import { cmdRoute } from './commands/route.js';
import { cmdContext } from './commands/context.js';
import { cmdPlan } from './commands/plan.js';
import { cmdList } from './commands/list.js';
import { cmdVerify } from './commands/verify.js';

const VERSION = '0.1.0';

const HELP = `
icex-flow v${VERSION} — Deterministic agent workflow orchestration

Usage: icex-flow <command> [options]

Commands:
  init [dir]                        Initialize .icex-flow/ in a directory
  validate [dir]                    Validate all workflow definitions
  route "<description>" [--labels]  Route a task to agent + workflow
  context [workflow] [--step]       Assemble context from manifest
  plan <workflow> [--input '{}']    Generate deterministic execution plan
  list [--dir .]                    List workflows and routes
  verify --command "<cmd>"          Run step verification

Options:
  --dir <path>     Working directory (default: .)
  --json           Output as JSON
  --help, -h       Show help
  --version, -v    Show version

Examples:
  icex-flow init
  icex-flow route "fix login bug" --labels bug
  icex-flow plan dev-chain --input '{"issue_number":"42","branch_name":"fix/login"}'
  icex-flow context dev-chain --step implement
  icex-flow verify --command "pytest tests/ -v" --expect-exit 0
`.trim();

export function main(args: string[]): void {
  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case 'init':
      return cmdInit(rest);
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
