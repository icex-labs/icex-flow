import { join, resolve } from 'node:path';
import { loadJson, parseFlags } from '../utils.js';
import { assembleContext, listContextFiles } from '../engine/context.js';
import type { ContextManifest } from '../types.js';

export function cmdContext(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const workflow = positional[0];
  const step = flags['step'];
  const dir = flags['dir'] ?? '.';
  const dryRun = flags['dry-run'] === 'true';
  const baseDir = resolve(dir);
  const manifestPath = join(baseDir, '.icex-flow', 'context.manifest.json');

  const manifest = loadJson<ContextManifest>(manifestPath);

  // Parse vars from --var key=value flags
  const vars: Record<string, string> = {};
  if (flags['var']) {
    for (const pair of flags['var'].split(',')) {
      const [k, v] = pair.split('=');
      if (k && v) vars[k] = v;
    }
  }

  if (dryRun) {
    const files = listContextFiles(manifest, baseDir, workflow, step, vars);
    console.log('Files to inject:');
    for (const f of files) {
      console.log(`  - ${f}`);
    }
    console.log(`\nTotal: ${files.length} files`);
  } else {
    const output = assembleContext(manifest, baseDir, workflow, step, vars);
    console.log(output);
  }
}
