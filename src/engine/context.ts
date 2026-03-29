import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ContextManifest } from '../types.js';
import { resolveTemplate } from '../utils.js';

/**
 * Mechanical context assembly — reads manifest, injects files, no LLM discretion.
 *
 * Returns concatenated file contents with section headers.
 * Missing required files throw. Missing optional files are silently skipped.
 */
export function assembleContext(
  manifest: ContextManifest,
  baseDir: string,
  workflow?: string,
  step?: string,
  vars?: Record<string, string>,
): string {
  const root = manifest.base_dir
    ? resolve(baseDir, manifest.base_dir)
    : resolve(baseDir);

  const parts: string[] = [];

  // Global always (required)
  for (const file of manifest.global.always_inject) {
    const resolved = vars ? resolveTemplate(file, vars) : file;
    const content = readRequired(join(root, resolved), resolved);
    parts.push(section(resolved, content));
  }

  // Global if-exists (optional)
  if (manifest.global.inject_if_exists) {
    for (const file of manifest.global.inject_if_exists) {
      const resolved = vars ? resolveTemplate(file, vars) : file;
      const fullPath = join(root, resolved);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8');
        parts.push(section(resolved, content));
      }
    }
  }

  // Workflow-specific
  if (workflow && manifest.workflows?.[workflow]) {
    const wf = manifest.workflows[workflow];

    if (wf.always_inject) {
      for (const file of wf.always_inject) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const content = readRequired(join(root, resolved), resolved);
        parts.push(section(resolved, content));
      }
    }

    if (wf.inject_if_exists) {
      for (const file of wf.inject_if_exists) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const fullPath = join(root, resolved);
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf-8');
          parts.push(section(resolved, content));
        }
      }
    }

    // Step-specific
    if (step && wf.steps?.[step]?.inject) {
      for (const file of wf.steps[step].inject!) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const content = readRequired(join(root, resolved), resolved);
        parts.push(section(resolved, content));
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * List all files that would be injected (dry-run mode).
 */
export function listContextFiles(
  manifest: ContextManifest,
  baseDir: string,
  workflow?: string,
  step?: string,
  vars?: Record<string, string>,
): string[] {
  const root = manifest.base_dir
    ? resolve(baseDir, manifest.base_dir)
    : resolve(baseDir);

  const files: string[] = [];

  for (const f of manifest.global.always_inject) {
    files.push(vars ? resolveTemplate(f, vars) : f);
  }

  if (manifest.global.inject_if_exists) {
    for (const f of manifest.global.inject_if_exists) {
      const resolved = vars ? resolveTemplate(f, vars) : f;
      if (existsSync(join(root, resolved))) files.push(resolved);
    }
  }

  if (workflow && manifest.workflows?.[workflow]) {
    const wf = manifest.workflows[workflow];
    if (wf.always_inject) {
      for (const f of wf.always_inject) {
        files.push(vars ? resolveTemplate(f, vars) : f);
      }
    }
    if (wf.inject_if_exists) {
      for (const f of wf.inject_if_exists) {
        const resolved = vars ? resolveTemplate(f, vars) : f;
        if (existsSync(join(root, resolved))) files.push(resolved);
      }
    }
    if (step && wf.steps?.[step]?.inject) {
      for (const f of wf.steps[step].inject!) {
        files.push(vars ? resolveTemplate(f, vars) : f);
      }
    }
  }

  return files;
}

function readRequired(path: string, label: string): string {
  if (!existsSync(path)) {
    throw new Error(`Required context file not found: ${label} (${path})`);
  }
  return readFileSync(path, 'utf-8');
}

function section(label: string, content: string): string {
  return `--- ${label} ---\n${content}`;
}
