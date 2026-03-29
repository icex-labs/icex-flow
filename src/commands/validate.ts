import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadJson } from '../utils.js';
import type {
  RoutesConfig,
  ContextManifest,
  WorkflowDefinition,
} from '../types.js';

interface ValidationError {
  file: string;
  message: string;
}

export function cmdValidate(args: string[]): void {
  const targetDir = args[0] ?? '.';
  const flowDir = join(resolve(targetDir), '.icex-flow');

  if (!existsSync(flowDir)) {
    console.error(`Not initialized: ${flowDir}`);
    console.error('Run: icex-flow init');
    process.exit(1);
  }

  const errors: ValidationError[] = [];
  let fileCount = 0;

  // Validate routes.json
  const routesPath = join(flowDir, 'routes.json');
  if (existsSync(routesPath)) {
    fileCount++;
    errors.push(...validateRoutes(routesPath));
  } else {
    errors.push({ file: 'routes.json', message: 'File not found' });
  }

  // Validate context.manifest.json
  const contextPath = join(flowDir, 'context.manifest.json');
  if (existsSync(contextPath)) {
    fileCount++;
    errors.push(...validateContext(contextPath));
  } else {
    errors.push({
      file: 'context.manifest.json',
      message: 'File not found',
    });
  }

  // Validate workflow files
  const wfDir = join(flowDir, 'workflows');
  if (existsSync(wfDir)) {
    const files = readdirSync(wfDir).filter((f: string) => f.endsWith('.flow.json'));
    for (const file of files) {
      fileCount++;
      errors.push(...validateWorkflow(join(wfDir, file), file));
    }
  }

  // Cross-validate: routes reference valid workflows
  if (existsSync(routesPath) && existsSync(wfDir)) {
    errors.push(...crossValidate(routesPath, wfDir));
  }

  // Report
  if (errors.length === 0) {
    console.log(`✅ All ${fileCount} files valid`);
  } else {
    console.error(`❌ ${errors.length} error(s) in ${fileCount} files:\n`);
    for (const err of errors) {
      console.error(`  ${err.file}: ${err.message}`);
    }
    process.exit(1);
  }
}

function validateRoutes(path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const config = loadJson<RoutesConfig>(path);
    if (!config.version) errors.push({ file: 'routes.json', message: 'Missing "version"' });
    if (!config.default_agent) errors.push({ file: 'routes.json', message: 'Missing "default_agent"' });
    if (!Array.isArray(config.routes)) errors.push({ file: 'routes.json', message: '"routes" must be an array' });
    for (let i = 0; i < (config.routes?.length ?? 0); i++) {
      const r = config.routes[i];
      if (!r.match) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "match"` });
      if (!r.workflow) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "workflow"` });
      if (!r.agent) errors.push({ file: 'routes.json', message: `routes[${i}]: missing "agent"` });
    }
  } catch (e) {
    errors.push({ file: 'routes.json', message: (e as Error).message });
  }
  return errors;
}

function validateContext(path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const config = loadJson<ContextManifest>(path);
    if (!config.version) errors.push({ file: 'context.manifest.json', message: 'Missing "version"' });
    if (!config.global) errors.push({ file: 'context.manifest.json', message: 'Missing "global"' });
    if (!Array.isArray(config.global?.always_inject)) {
      errors.push({ file: 'context.manifest.json', message: '"global.always_inject" must be an array' });
    }
  } catch (e) {
    errors.push({ file: 'context.manifest.json', message: (e as Error).message });
  }
  return errors;
}

function validateWorkflow(
  path: string,
  filename: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const wf = loadJson<WorkflowDefinition>(path);
    if (!wf.name) errors.push({ file: filename, message: 'Missing "name"' });
    if (!wf.version) errors.push({ file: filename, message: 'Missing "version"' });
    if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
      errors.push({ file: filename, message: '"steps" must be a non-empty array' });
    }
    const ids = new Set<string>();
    for (let i = 0; i < (wf.steps?.length ?? 0); i++) {
      const s = wf.steps[i];
      if (!s.id) errors.push({ file: filename, message: `steps[${i}]: missing "id"` });
      if (!s.name) errors.push({ file: filename, message: `steps[${i}]: missing "name"` });
      if (!s.action) errors.push({ file: filename, message: `steps[${i}]: missing "action"` });
      if (!['shell', 'agent', 'notify', 'gate'].includes(s.action)) {
        errors.push({ file: filename, message: `steps[${i}]: invalid action "${s.action}"` });
      }
      if (s.action === 'shell' && !s.command) {
        errors.push({ file: filename, message: `steps[${i}]: shell action requires "command"` });
      }
      if (s.action === 'agent' && !s.agent) {
        errors.push({ file: filename, message: `steps[${i}]: agent action requires "agent"` });
      }
      if (ids.has(s.id)) {
        errors.push({ file: filename, message: `steps[${i}]: duplicate id "${s.id}"` });
      }
      ids.add(s.id);
    }
  } catch (e) {
    errors.push({ file: filename, message: (e as Error).message });
  }
  return errors;
}

function crossValidate(
  routesPath: string,
  wfDir: string,
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
        });
      }
    }
  } catch {
    // Skip cross-validation if files are invalid
  }
  return errors;
}
