import { join, resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { loadJson, formatTable, parseFlags } from '../utils.js';
import { mergeRoutes, mergeWorkflows } from '../engine/config.js';
import type { WorkflowDefinition, RoutesConfig } from '../types.js';

export function cmdList(args: string[]): void {
  const { flags } = parseFlags(args);
  const dir = flags['dir'] ?? '.';
  const absDir = resolve(dir);
  const flowDir = join(absDir, '.icex-flow');

  if (!existsSync(flowDir)) {
    console.error(`Not initialized: ${flowDir}`);
    console.error('Run: icex-flow init');
    process.exit(1);
  }

  // List workflows (merged: global + project)
  console.log('## Workflows\n');

  const allWorkflows = mergeWorkflows(absDir);

  if (allWorkflows.length === 0) {
    // Fall back to just reading project dir
    const wfDir = join(flowDir, 'workflows');
    if (existsSync(wfDir)) {
      const files = readdirSync(wfDir).filter((f: string) => f.endsWith('.flow.json'));
      if (files.length === 0) {
        console.log('  (none)');
      } else {
        const rows: string[][] = [];
        for (const file of files) {
          try {
            const wf = loadJson<WorkflowDefinition>(join(wfDir, file));
            rows.push([wf.name, wf.version, `${wf.steps?.length ?? 0} steps`, wf.description.slice(0, 60)]);
          } catch {
            rows.push([file, '?', '?', 'Invalid JSON']);
          }
        }
        console.log(formatTable(rows, ['Name', 'Version', 'Steps', 'Description']));
      }
    } else {
      console.log('  (no workflows directory)');
    }
  } else {
    const rows = allWorkflows.map((wf) => [
      wf.name,
      wf.version,
      `${wf.steps?.length ?? 0} steps`,
      wf.description.slice(0, 60),
    ]);
    console.log(formatTable(rows, ['Name', 'Version', 'Steps', 'Description']));
  }

  // List routes (merged: global + project)
  console.log('\n## Routes\n');

  const mergedConfig = mergeRoutes(absDir);
  if (mergedConfig) {
    console.log(`  Default agent: ${mergedConfig.default_agent}`);
    console.log(`  Default workflow: ${mergedConfig.default_workflow ?? '(none)'}`);
    console.log('');

    if (mergedConfig.routes.length === 0) {
      console.log('  (no routes defined)');
    } else {
      const rows = mergedConfig.routes.map((r) => [
        r.agent,
        r.workflow,
        JSON.stringify(r.match),
        String(r.priority ?? '-'),
      ]);
      console.log(formatTable(rows, ['Agent', 'Workflow', 'Match', 'Priority']));
    }
  } else {
    // Fall back to project-only
    const routesPath = join(flowDir, 'routes.json');
    if (existsSync(routesPath)) {
      try {
        const config = loadJson<RoutesConfig>(routesPath);
        console.log(`  Default agent: ${config.default_agent}`);
        console.log(`  Default workflow: ${config.default_workflow ?? '(none)'}`);
        console.log('');

        if (config.routes.length === 0) {
          console.log('  (no routes defined)');
        } else {
          const rows = config.routes.map((r) => [
            r.agent,
            r.workflow,
            JSON.stringify(r.match),
            String(r.priority ?? '-'),
          ]);
          console.log(formatTable(rows, ['Agent', 'Workflow', 'Match', 'Priority']));
        }
      } catch (e) {
        console.error(`  Error loading routes: ${(e as Error).message}`);
      }
    } else {
      console.log('  (no routes.json)');
    }
  }
}
