import { parseFlags } from '../utils.js';
import { verifyStep } from '../engine/verifier.js';
import type { StepVerification } from '../types.js';

export function cmdVerify(args: string[]): void {
  const { flags } = parseFlags(args);

  const command = flags['command'];
  if (!command) {
    console.error('Usage: icex-flow verify --command "<cmd>" [--expect "<string>"] [--expect-exit <code>] [--retry <n>] [--retry-delay <sec>]');
    process.exit(1);
  }

  const verify: StepVerification = {
    command,
    expect: flags['expect'],
    expect_exit:
      flags['expect-exit'] !== undefined
        ? parseInt(flags['expect-exit'], 10)
        : undefined,
    retry:
      flags['retry'] !== undefined ? parseInt(flags['retry'], 10) : undefined,
    retry_delay:
      flags['retry-delay'] !== undefined
        ? parseInt(flags['retry-delay'], 10)
        : undefined,
  };

  // Parse vars
  const vars: Record<string, string> = {};
  if (flags['var']) {
    for (const pair of flags['var'].split(',')) {
      const [k, v] = pair.split('=');
      if (k && v) vars[k] = v;
    }
  }

  const result = verifyStep(verify, vars, flags['cwd']);

  if (result.passed) {
    console.log('✅ Verification PASSED');
  } else {
    console.log('❌ Verification FAILED');
  }

  if (result.expected) {
    console.log(`  Expected: ${result.expected}`);
  }
  if (result.exit_code !== undefined) {
    console.log(`  Exit code: ${result.exit_code}`);
  }
  if (result.output) {
    console.log(`  Output: ${result.output.slice(0, 500)}`);
  }

  if (!result.passed) {
    process.exit(1);
  }
}
