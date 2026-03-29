import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
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
    const expanded = resolveFiles(root, resolved);
    for (const f of expanded) {
      const content = readRequired(join(root, f), f);
      parts.push(section(f, content));
    }
  }

  // Global if-exists (optional)
  if (manifest.global.inject_if_exists) {
    for (const file of manifest.global.inject_if_exists) {
      const resolved = vars ? resolveTemplate(file, vars) : file;
      const expanded = resolveFiles(root, resolved);
      for (const f of expanded) {
        const fullPath = join(root, f);
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf-8');
          parts.push(section(f, content));
        }
      }
    }
  }

  // Workflow-specific
  if (workflow && manifest.workflows?.[workflow]) {
    const wf = manifest.workflows[workflow];

    if (wf.always_inject) {
      for (const file of wf.always_inject) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const expanded = resolveFiles(root, resolved);
        for (const f of expanded) {
          const content = readRequired(join(root, f), f);
          parts.push(section(f, content));
        }
      }
    }

    if (wf.inject_if_exists) {
      for (const file of wf.inject_if_exists) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const expanded = resolveFiles(root, resolved);
        for (const f of expanded) {
          const fullPath = join(root, f);
          if (existsSync(fullPath)) {
            const content = readFileSync(fullPath, 'utf-8');
            parts.push(section(f, content));
          }
        }
      }
    }

    // Step-specific
    if (step && wf.steps?.[step]?.inject) {
      for (const file of wf.steps[step].inject!) {
        const resolved = vars ? resolveTemplate(file, vars) : file;
        const expanded = resolveFiles(root, resolved);
        for (const f of expanded) {
          const content = readRequired(join(root, f), f);
          parts.push(section(f, content));
        }
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
    const resolved = vars ? resolveTemplate(f, vars) : f;
    files.push(...resolveFiles(root, resolved));
  }

  if (manifest.global.inject_if_exists) {
    for (const f of manifest.global.inject_if_exists) {
      const resolved = vars ? resolveTemplate(f, vars) : f;
      const expanded = resolveFiles(root, resolved);
      for (const ef of expanded) {
        if (existsSync(join(root, ef))) files.push(ef);
      }
    }
  }

  if (workflow && manifest.workflows?.[workflow]) {
    const wf = manifest.workflows[workflow];
    if (wf.always_inject) {
      for (const f of wf.always_inject) {
        const resolved = vars ? resolveTemplate(f, vars) : f;
        files.push(...resolveFiles(root, resolved));
      }
    }
    if (wf.inject_if_exists) {
      for (const f of wf.inject_if_exists) {
        const resolved = vars ? resolveTemplate(f, vars) : f;
        const expanded = resolveFiles(root, resolved);
        for (const ef of expanded) {
          if (existsSync(join(root, ef))) files.push(ef);
        }
      }
    }
    if (step && wf.steps?.[step]?.inject) {
      for (const f of wf.steps[step].inject!) {
        const resolved = vars ? resolveTemplate(f, vars) : f;
        files.push(...resolveFiles(root, resolved));
      }
    }
  }

  return files;
}

/**
 * Resolve a path pattern to concrete file paths.
 *
 * Supports:
 * - Plain file path: returns as-is
 * - Directory path (trailing slash or is a directory): returns all .md files in it
 * - Glob-like pattern with `*`: expands to matching .md files in the parent dir
 */
function resolveFiles(root: string, pattern: string): string[] {
  const fullPath = join(root, pattern);

  // Glob pattern: "some/dir/*" — list .md files in the directory portion
  if (pattern.endsWith('/*') || pattern.endsWith('/*.*')) {
    const dirPath = join(root, pattern.replace(/\/\*(\.\*)?$/, ''));
    return listMdFiles(dirPath, pattern.replace(/\/\*(\.\*)?$/, ''));
  }

  // Directory: trailing slash or an existing directory
  if (pattern.endsWith('/') || (existsSync(fullPath) && statSync(fullPath).isDirectory())) {
    const dirPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    return listMdFiles(fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath, dirPattern);
  }

  // Plain file
  return [pattern];
}

/**
 * List all .md files in a directory, returning paths relative to root.
 */
function listMdFiles(dirPath: string, relativeDir: string): string[] {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    return [];
  }
  return readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => `${relativeDir}/${f}`);
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
