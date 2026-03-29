import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadJson, parseFlags } from '../utils.js';
import { GLOBAL_DIR, GLOBAL_WORKFLOWS_DIR } from '../engine/config.js';
import type {
  RoutesConfig,
  ContextManifest,
  WorkflowDefinition,
} from '../types.js';

interface ValidationError {
  file: string;
  message: string;
  level: 'global' | 'project';
}

export function cmdValidate(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const targetDir = positional[0] ?? '.';
  const flowDir = join(resolve(targetDir), '.icex-flow');
  const validateGlobal = flags['global'] === 'true' || flags['all'] === 'true';

  if (!existsSync(flowDir) && !validateGlobal) {
    console.error(`Not initialized: ${flowDir}`);
    console.error('Run: icex-flow init');
    process.exit(1);
  }

  const errors: ValidationError[] = [];
  let fileCount = 0;

  // --- Validate project-level configs ---
  if (existsSync(flowDir)) {
    // Validate routes.json
    const routesPath = join(flowDir, 'routes.json');
    if (existsSync(routesPath)) {
      fileCount++;
      errors.push(...validateRoutes(routesPath, 'project'));
    } else {
      errors.push({ file: 'routes.json', message: 'File not found', level: 'project' });
    }

    // Validate context.manifest.json
    const contextPath = join(flowDir, 'context.manifest.json');
    if (existsSync(contextPath)) {
      fileCount++;
      errors.push(...validateContext(contextPath, 'project'));
    } else {
      errors.push({ file: 'context.manifest.json', message: 'File not found', level: 'project' });
    }

    // Validate workflow files
    const wfDir = join(flowDir, 'workflows');
    if (existsSync(wfDir)) {
      const files = readdirSync(wfDir).filter((f: string) => f.endsWith('.flow.json'));
      for (const file of files) {
        fileCount++;
        errors.push(...validateWorkflow(join(wfDir, file), file, 'project'));
      }
    }

    // Cross-validate: routes reference valid workflows
    const routesPath2 = join(flowDir, 'routes.json');
    const wfDir2 = join(flowDir, 'workflows');
    if (existsSync(routesPath2) && existsSync(wfDir2)) {
      errors.push(...crossValidate(routesPath2, wfDir2, 'project'));
    }
  }

  // --- Validate global configs ---
  if (validateGlobal && existsSync(GLOBAL_DIR)) {
    const globalRoutesPath = join(GLOBAL_DIR, 'routes.json');
    if (existsSync(globalRoutesPath)) {
      fileCount++;
      errors.push(...validateRoutes(globalRoutesPath, 'global'));
    }

    if (existsSync(GLOBAL_WORKFLOWS_DIR)) {
      const files = readdirSync(GLOBAL_WORKFLOWS_DIR).filter((f: string) => f.endsWith('.flow.json'));
      for (const file of files) {
        fileCount++;
        errors.push(...validateWorkflow(join(GLOBAL_WORKFLOWS_DIR, file), `global/${file}`, 'global'));
      }
    }
  }

  // Report
  if (errors.length === 0) {
    console.log(`All ${fileCount} file(s) valid`);
    if (validateGlobal) {
      console.log('  (validated both project and global configs)');
    }
  } else {
    console.error(`${errors.length} error(s) in ${fileCount} files:\n`);
    for (const err of errors) {
      const prefix = err.level === 'global' ? '[global] ' : '';
      console.error(`  ${prefix}${err.file}: ${err.message}`);
    }
    process.exit(1);
  }
}

function validateRoutes(path: string, level: 'global' | 'project'): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const config = loadJson<RoutesConfig>(path);
    if (!config.version) errors.push({ file: 'routes.json', message: 'Missing "version"', level });
    if (!config.default_agent) errors.push({ file: 'routes.json', message: 'Missing "default_agent"', level });
    if (!Array.isArray(config.routes)) errors.push({ file: 'routes.json', message: '"routes" must be an array', level });
    for (let i = 0; i < (config.routes?.length ?? 0); i++) {
      const r = config.routes[i];
      if (!r.match) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "match"`, level });
      if (!r.workflow) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "workflow"`, level });
      if (!r.agent) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "agent"`, level });
    }
  } catch (e) {
    errors.push({ file: 'routes.json', message: (e as Error).message, level });
  }
  return errors;
}

function validateContext(path: string, level: 'global' | 'project'): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const config = loadJson<ContextManifest>(path);
    if (!config.version) errors.push({ file: 'context.manifest.json', message: 'Missing "version"', level });
    if (!config.global) errors.push({ file: 'context.manifest.json', message: 'Missing "global"', level });
    if (!Array.isArray(config.global?.always_inject)) {
      errors.push({ file: 'context.manifest.json', message: '"global.always_inject" must be an array', level });
    }
  } catch (e) {
    errors.push({ file: 'context.manifest.json', message: (e as Error).message, level });
  }
  return errors;
}

function validateWorkflow(
  path: string,
  filename: string,
  level: 'global' | 'project',
): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const wf = loadJson<WorkflowDefinition>(path);
    if (!wf.name) errors.push({ file: filename, message: 'Missing "name"', level });
    if (!wf.version) errors.push({ file: filename, message: 'Missing "version"', level });
    if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
      errors.push({ file: filename, message: '"steps" must be a non-empty array', level });
    }
    const ids = new Set<string>();
    for (let i = 0; i < (wf.steps?.length ?? 0); i++) {
      const s = wf.steps[i];
      if (!s.id) errors.push({ file: filename, message: `steps[${i}]: missing "id"`, level });
      if (!s.name) errors.push({ file: filename, message: `steps[${i}]: missing "name"`, level });
      if (!s.action) errors.push({ file: filename, message: `steps[${i}]: missing "action"`, level });
      if (!['shell', 'agent', 'notify', 'gate'].includes(s.action)) {
        errors.push({ file: filename, message: `steps[${i}]: invalid action "${s.action}"`, level });
      }
      if (s.action === 'shell' && !s.command) {
        errors.push({ file: filename, message: `steps[${i}]: shell action requires "command"`, level });
      }
      if (s.action === 'agent' && !s.agent) {
        errors.push({ file: filename, message: `steps[${i}]: agent action requires "agent"`, level });
      }
      if (ids.has(s.id)) {
        errors.push({ file: filename, message: `steps[${i}]: duplicate id "${s.id}"`, level });
      }
      ids.add(s.id);
    }
  } catch (e) {
    errors.push({ file: filename, message: (e as Error).message, level });
  }
  return errors;
}

function crossValidate(
  routesPath: string,
  wfDir: string,
  level: 'global' | 'project',
): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const config = loadJson<RoutesConfig>(routesPath);
    const wfFiles = readdirSync(wfDir).filter((f: string) => f.endsWith('.flow.json'));
    const wfNames = new Set(
      wfFiles.map((f) => {
        try {
          return loadJson<WorkflowDefinition>(join(wfDir, f)).name;
        } catch {
          return '';
        }
      }),
    );

    for (const route of config.routes ?? []) {
      if (route.workflow && !wfNames.has(route.workflow)) {
        errors.push({
          file: 'routes.json',
          message: `Route references workflow "${route.workflow}" but no matching .flow.json found`,
          level,
        });
      }
    }
  } catch {
    // Skip cross-validation if files are invalid
  }
  return errors;
}
