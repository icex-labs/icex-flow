import { execSync } from 'node:child_process';
import type { StepVerification, VerifyResult } from '../types.js';
import { resolveTemplate } from '../utils.js';

/**
 * Run a verification command and check the result.
 *
 * Supports retries with delay. Matching is substring-based for `expect`,
 * exact for `expect_exit`.
 */
export function verifyStep(
  verify: StepVerification,
  vars: Record<string, string>,
  cwd?: string,
): VerifyResult {
  const command = resolveTemplate(verify.command, vars);
  const maxRetries = verify.retry ?? 0;
  const retryDelay = verify.retry_delay ?? 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      sleepSync(retryDelay * 1000);
    }

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      // Check expected output substring
      if (verify.expect !== undefined) {
        const expected = resolveTemplate(verify.expect, vars);
        if (output.includes(expected)) {
          return { passed: true, output, expected };
        }
        if (attempt < maxRetries) continue;
        return { passed: false, output, expected };
      }

      // No expect — command succeeded (exit 0)
      return { passed: true, output, exit_code: 0 };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      const exitCode = e.status ?? 1;
      const output = ((e.stdout ?? '') + (e.stderr ?? '')).trim();

      if (
        verify.expect_exit !== undefined &&
        exitCode === verify.expect_exit
      ) {
        return { passed: true, output, exit_code: exitCode };
      }

      if (attempt < maxRetries) continue;
      return { passed: false, output, exit_code: exitCode };
    }
  }

  return { passed: false, output: 'Max retries exceeded' };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
