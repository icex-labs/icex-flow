import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFlags } from '../utils.js';
import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────

export type KnowledgeCategory = 'environment' | 'architecture' | 'safety' | 'workflow' | 'custom';

export interface KnowledgeEntry {
  id: string;
  text: string;
  category: KnowledgeCategory;
  created_at: string;
}

export interface KnowledgeStore {
  version: string;
  entries: KnowledgeEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function knowledgePath(dir: string): string {
  return join(dir, '.icex-flow', 'knowledge.json');
}

export function loadKnowledge(dir: string): KnowledgeStore {
  const path = knowledgePath(dir);
  if (!existsSync(path)) {
    return { version: '1.0.0', entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { version: '1.0.0', entries: [] };
  }
}

function saveKnowledge(dir: string, store: KnowledgeStore): void {
  const flowDir = join(dir, '.icex-flow');
  mkdirSync(flowDir, { recursive: true });
  writeFileSync(knowledgePath(dir), JSON.stringify(store, null, 2), 'utf-8');
}

function categorize(text: string): KnowledgeCategory {
  const lower = text.toLowerCase();

  // Safety patterns
  if (/\b(never|don't|do not|must not|forbidden|dangerous|careful|warning|caution|always confirm|require approval)\b/.test(lower)) {
    return 'safety';
  }

  // Environment patterns
  if (/\b(cluster|namespace|k3d|k8s|kubernetes|server|host|endpoint|ip\s*address|\d+\.\d+\.\d+\.\d+|port\s*\d+|prod(uction)?|staging|dev(elopment)?|environment)\b/.test(lower)) {
    return 'environment';
  }

  // Architecture patterns
  if (/\b(service|api|database|db|microservice|gateway|queue|broker|cache|schema|table|model|endpoint)\b/.test(lower)) {
    return 'architecture';
  }

  // Workflow patterns
  if (/\b(deploy|build|test|ci|cd|pipeline|release|merge|branch|pr|pull request|review|approval)\b/.test(lower)) {
    return 'workflow';
  }

  return 'custom';
}

// ── Command ──────────────────────────────────────────────────────────

export function cmdLearn(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const dir = resolve(flags['dir'] ?? '.');
  const projectName = flags['project'] ?? undefined;

  // Resolve target directory: if --project is given, look it up in the registry
  let targetDir = dir;
  if (projectName) {
    const registryPath = join(
      process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~',
      '.icex-flow',
      'projects.json',
    );
    if (existsSync(registryPath)) {
      try {
        const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
        const projects = registry.projects ?? [];
        const match = projects.find((p: { name: string; path: string }) => p.name === projectName);
        if (match) {
          targetDir = match.path;
        } else {
          console.error(`Project not found in registry: ${projectName}`);
          console.error('Use "icex-flow projects list" to see registered projects.');
          process.exit(1);
        }
      } catch {
        console.error('Failed to read project registry.');
        process.exit(1);
      }
    } else {
      console.error('No project registry found. Run "icex-flow init" in a project first.');
      process.exit(1);
    }
  }

  // --list: show all knowledge
  if (flags['list'] === 'true') {
    const store = loadKnowledge(targetDir);
    if (store.entries.length === 0) {
      console.log('No knowledge stored yet.');
      console.log('');
      console.log('Add knowledge with: icex-flow learn "some fact about the project"');
      return;
    }

    console.log(`Knowledge entries (${store.entries.length})${projectName ? ` for project "${projectName}"` : ''}:`);
    console.log('');
    for (const entry of store.entries) {
      console.log(`  [${entry.category}] ${entry.text}`);
      console.log(`    id: ${entry.id}  created: ${entry.created_at}`);
      console.log('');
    }
    return;
  }

  // --remove <id>: remove a knowledge entry
  if (flags['remove']) {
    const store = loadKnowledge(targetDir);
    const id = flags['remove'];
    const before = store.entries.length;
    store.entries = store.entries.filter(e => e.id !== id);
    if (store.entries.length === before) {
      console.error(`Knowledge entry not found: ${id}`);
      process.exit(1);
    }
    saveKnowledge(targetDir, store);
    console.log(`Removed knowledge entry: ${id}`);
    return;
  }

  // Add new knowledge
  const text = positional[0];
  if (!text) {
    console.error('Usage: icex-flow learn "<knowledge>"');
    console.error('       icex-flow learn --list');
    console.error('       icex-flow learn --remove <id>');
    console.error('       icex-flow learn --project <name> "<knowledge>"');
    process.exit(1);
  }

  // Check that .icex-flow exists
  if (!existsSync(join(targetDir, '.icex-flow'))) {
    console.error(`Not an icex-flow project${projectName ? ` (${targetDir})` : ''}. Run "icex-flow init" first.`);
    process.exit(1);
  }

  const category = categorize(text);
  const entry: KnowledgeEntry = {
    id: randomUUID().slice(0, 8),
    text,
    category,
    created_at: new Date().toISOString(),
  };

  const store = loadKnowledge(targetDir);
  store.entries.push(entry);
  saveKnowledge(targetDir, store);

  console.log(`Learned [${category}]: ${text}${projectName ? ` (project: ${projectName})` : ''}`);
  console.log(`  id: ${entry.id}`);
}
