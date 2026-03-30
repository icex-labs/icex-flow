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

  // --list: show all knowledge
  if (flags['list'] === 'true') {
    const store = loadKnowledge(dir);
    if (store.entries.length === 0) {
      console.log('No knowledge stored yet.');
      console.log('');
      console.log('Add knowledge with: icex-flow learn "some fact about the project"');
      return;
    }

    console.log(`Knowledge entries (${store.entries.length}):`);
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
    const store = loadKnowledge(dir);
    const id = flags['remove'];
    const before = store.entries.length;
    store.entries = store.entries.filter(e => e.id !== id);
    if (store.entries.length === before) {
      console.error(`Knowledge entry not found: ${id}`);
      process.exit(1);
    }
    saveKnowledge(dir, store);
    console.log(`Removed knowledge entry: ${id}`);
    return;
  }

  // Add new knowledge
  const text = positional[0];
  if (!text) {
    console.error('Usage: icex-flow learn "<knowledge>"');
    console.error('       icex-flow learn --list');
    console.error('       icex-flow learn --remove <id>');
    process.exit(1);
  }

  // Check that .icex-flow exists
  if (!existsSync(join(dir, '.icex-flow'))) {
    console.error('Not an icex-flow project. Run "icex-flow init" first.');
    process.exit(1);
  }

  const category = categorize(text);
  const entry: KnowledgeEntry = {
    id: randomUUID().slice(0, 8),
    text,
    category,
    created_at: new Date().toISOString(),
  };

  const store = loadKnowledge(dir);
  store.entries.push(entry);
  saveKnowledge(dir, store);

  console.log(`Learned [${category}]: ${text}`);
  console.log(`  id: ${entry.id}`);
}
