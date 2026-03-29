import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { parseFlags, formatTable } from '../utils.js';
import {
  loadRegistry,
  registerProject,
  unregisterProject,
} from '../engine/config.js';

export function cmdProjects(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const subcommand = positional[0];

  switch (subcommand) {
    case 'add':
      return projectsAdd(positional.slice(1), flags);
    case 'remove':
      return projectsRemove(positional.slice(1));
    case 'list':
    case undefined:
      return projectsList(flags);
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Usage: icex-flow projects [list|add|remove] [path]');
      process.exit(1);
  }
}

function projectsList(flags: Record<string, string>): void {
  const registry = loadRegistry();

  if (registry.projects.length === 0) {
    console.log('No registered projects.');
    console.log('Run `icex-flow init` in a project directory to register it.');
    return;
  }

  if (flags['json'] === 'true') {
    console.log(JSON.stringify(registry.projects, null, 2));
    return;
  }

  console.log(`## Registered Projects (${registry.projects.length})\n`);

  const rows = registry.projects.map((p) => {
    const active = existsSync(resolve(p.path, '.icex-flow')) ? 'yes' : 'MISSING';
    return [p.name, p.preset ?? '-', p.path, active, p.registered_at.slice(0, 10)];
  });

  console.log(formatTable(rows, ['Name', 'Preset', 'Path', 'Active', 'Registered']));
}

function projectsAdd(positional: string[], flags: Record<string, string>): void {
  const targetPath = positional[0] ?? '.';
  const absPath = resolve(targetPath);

  if (!existsSync(absPath)) {
    console.error(`Path does not exist: ${absPath}`);
    process.exit(1);
  }

  const name = flags['name'] ?? basename(absPath);
  const preset = flags['preset'];

  registerProject({
    path: absPath,
    name,
    preset,
    registered_at: new Date().toISOString(),
  });

  console.log(`Registered project: ${name} (${absPath})`);
}

function projectsRemove(positional: string[]): void {
  const targetPath = positional[0] ?? '.';
  const absPath = resolve(targetPath);

  const removed = unregisterProject(absPath);
  if (removed) {
    console.log(`Unregistered project at ${absPath}`);
  } else {
    console.error(`No project registered at ${absPath}`);
    process.exit(1);
  }
}
