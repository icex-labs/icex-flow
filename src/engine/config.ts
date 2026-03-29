import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type {
  GlobalConfig,
  ProjectRegistry,
  ProjectRegistryEntry,
  RoutesConfig,
  Route,
  ContextManifest,
  WorkflowDefinition,
} from '../types.js';

// ── Paths ────────────────────────────────────────────────────────────

export const GLOBAL_DIR = join(homedir(), '.icex-flow');
export const GLOBAL_CONFIG_PATH = join(GLOBAL_DIR, 'config.json');
export const GLOBAL_REGISTRY_PATH = join(GLOBAL_DIR, 'projects.json');
export const GLOBAL_CONTEXT_DIR = join(GLOBAL_DIR, 'context', 'L0-global');
export const GLOBAL_WORKFLOWS_DIR = join(GLOBAL_DIR, 'workflows');

// ── Global directory init ────────────────────────────────────────────

export function ensureGlobalDir(): void {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  mkdirSync(GLOBAL_CONTEXT_DIR, { recursive: true });
  mkdirSync(GLOBAL_WORKFLOWS_DIR, { recursive: true });

  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    const config: GlobalConfig = {
      version: '1.0.0',
    };
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  if (!existsSync(GLOBAL_REGISTRY_PATH)) {
    const registry: ProjectRegistry = {
      version: '1.0.0',
      projects: [],
    };
    writeFileSync(GLOBAL_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  }
}

// ── Registry operations ──────────────────────────────────────────────

export function loadRegistry(): ProjectRegistry {
  ensureGlobalDir();
  try {
    return JSON.parse(readFileSync(GLOBAL_REGISTRY_PATH, 'utf-8'));
  } catch {
    return { version: '1.0.0', projects: [] };
  }
}

export function saveRegistry(registry: ProjectRegistry): void {
  ensureGlobalDir();
  writeFileSync(GLOBAL_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

export function registerProject(entry: ProjectRegistryEntry): void {
  const registry = loadRegistry();
  const absPath = resolve(entry.path);

  // Upsert by path
  const idx = registry.projects.findIndex((p) => resolve(p.path) === absPath);
  if (idx >= 0) {
    registry.projects[idx] = { ...entry, path: absPath };
  } else {
    registry.projects.push({ ...entry, path: absPath });
  }

  saveRegistry(registry);
}

export function unregisterProject(path: string): boolean {
  const registry = loadRegistry();
  const absPath = resolve(path);
  const before = registry.projects.length;
  registry.projects = registry.projects.filter((p) => resolve(p.path) !== absPath);
  saveRegistry(registry);
  return registry.projects.length < before;
}

// ── Config merging ───────────────────────────────────────────────────

/**
 * Merge global + project routes. Project routes override global routes
 * when they share the same workflow+agent combination.
 */
export function mergeRoutes(projectDir: string): RoutesConfig | null {
  const projectRoutesPath = join(projectDir, '.icex-flow', 'routes.json');
  const globalRoutesPath = join(GLOBAL_DIR, 'routes.json');

  let projectRoutes: RoutesConfig | null = null;
  let globalRoutes: RoutesConfig | null = null;

  if (existsSync(projectRoutesPath)) {
    try {
      projectRoutes = JSON.parse(readFileSync(projectRoutesPath, 'utf-8'));
    } catch { /* skip */ }
  }

  if (existsSync(globalRoutesPath)) {
    try {
      globalRoutes = JSON.parse(readFileSync(globalRoutesPath, 'utf-8'));
    } catch { /* skip */ }
  }

  if (!projectRoutes && !globalRoutes) return null;
  if (!projectRoutes) return globalRoutes;
  if (!globalRoutes) return projectRoutes;

  // Project routes take priority; add global routes that don't conflict
  const projectKeys = new Set(
    projectRoutes.routes.map((r) => routeKey(r)),
  );

  const mergedRoutes: Route[] = [
    ...projectRoutes.routes,
    ...globalRoutes.routes.filter((r) => !projectKeys.has(routeKey(r))),
  ];

  return {
    version: projectRoutes.version,
    default_agent: projectRoutes.default_agent ?? globalRoutes.default_agent,
    default_workflow: projectRoutes.default_workflow ?? globalRoutes.default_workflow,
    routes: mergedRoutes,
  };
}

function routeKey(r: Route): string {
  return `${r.workflow}:${r.agent}`;
}

/**
 * Merge global + project workflows. Project workflows override global by name.
 */
export function mergeWorkflows(projectDir: string): WorkflowDefinition[] {
  const projectWfDir = join(projectDir, '.icex-flow', 'workflows');
  const workflows = new Map<string, WorkflowDefinition>();

  // Load global workflows first
  if (existsSync(GLOBAL_WORKFLOWS_DIR)) {
    for (const file of readdirSync(GLOBAL_WORKFLOWS_DIR).filter((f: string) => f.endsWith('.flow.json'))) {
      try {
        const wf: WorkflowDefinition = JSON.parse(readFileSync(join(GLOBAL_WORKFLOWS_DIR, file), 'utf-8'));
        workflows.set(wf.name, wf);
      } catch { /* skip */ }
    }
  }

  // Project workflows override by name
  if (existsSync(projectWfDir)) {
    for (const file of readdirSync(projectWfDir).filter((f: string) => f.endsWith('.flow.json'))) {
      try {
        const wf: WorkflowDefinition = JSON.parse(readFileSync(join(projectWfDir, file), 'utf-8'));
        workflows.set(wf.name, wf);
      } catch { /* skip */ }
    }
  }

  return Array.from(workflows.values());
}

/**
 * Merge context: L0 from global, L1+L2 from project, produce unified manifest.
 */
export function mergeContextManifest(projectDir: string): ContextManifest | null {
  const projectManifestPath = join(projectDir, '.icex-flow', 'context.manifest.json');

  if (!existsSync(projectManifestPath)) return null;

  try {
    const manifest: ContextManifest = JSON.parse(readFileSync(projectManifestPath, 'utf-8'));

    // Inject global L0 context files if the global context dir has content
    if (existsSync(GLOBAL_CONTEXT_DIR)) {
      const globalFiles = readdirSync(GLOBAL_CONTEXT_DIR).filter((f) => f.endsWith('.md'));
      if (globalFiles.length > 0) {
        // Ensure global L0 is in the inject_if_exists (optional, don't break if missing)
        const globalPath = GLOBAL_CONTEXT_DIR + '/';
        if (!manifest.global.always_inject.includes(globalPath) &&
            !(manifest.global.inject_if_exists ?? []).includes(globalPath)) {
          manifest.global.inject_if_exists = manifest.global.inject_if_exists ?? [];
          manifest.global.inject_if_exists.push(globalPath);
        }
      }
    }

    return manifest;
  } catch {
    return null;
  }
}
