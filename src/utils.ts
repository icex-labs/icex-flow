import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`,
  );
}

export function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function loadJson<T>(path: string): T {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = readFileSync(abs, 'utf-8');
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`Invalid JSON in ${abs}: ${(e as Error).message}`);
  }
}

export function parseFlags(args: string[]): {
  positional: string[];
  flags: Record<string, string>;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

export function formatTable(
  rows: string[][],
  headers?: string[],
): string {
  const allRows = headers ? [headers, ...rows] : rows;
  const cols = allRows[0]?.length ?? 0;
  const widths: number[] = [];

  for (let c = 0; c < cols; c++) {
    widths[c] = Math.max(...allRows.map((r) => (r[c] ?? '').length));
  }

  const lines: string[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const line = row.map((cell, c) => cell.padEnd(widths[c])).join('  ');
    lines.push(line);
    if (i === 0 && headers) {
      lines.push(widths.map((w) => '─'.repeat(w)).join('──'));
    }
  }
  return lines.join('\n');
}
