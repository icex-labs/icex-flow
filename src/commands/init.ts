import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFlags } from '../utils.js';
import { detectProject } from '../engine/detect.js';
import { generatePreset } from '../presets/index.js';
import { ensureGlobalDir, registerProject } from '../engine/config.js';
import { runGenerate } from './generate.js';

export function cmdInit(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  // --path specifies a remote scan directory; config is written to cwd (or positional dir)
  const scanDir = flags['path'] ? resolve(flags['path']) : null;
  const targetDir = positional[0] ?? '.';
  const absDir = resolve(targetDir);
  const flowDir = join(absDir, '.icex-flow');
  const force = flags['force'] === 'true';
  const reset = flags['reset'] === 'true';

  // The directory we scan for project detection (remote or local)
  const projectDir = scanDir ?? absDir;

  const alreadyExists = existsSync(flowDir);

  // If config exists and neither --force nor --reset, tell the user and exit
  if (alreadyExists && !force && !reset) {
    console.log(`Config already exists: ${flowDir}`);
    console.log('');
    console.log('Options:');
    console.log('  icex-flow init --force   Re-scan the project (updates detected.json only, preserves customizations)');
    console.log('  icex-flow init --reset   Start fresh (overwrites all config files with templates)');
    process.exit(1);
  }

  // 1. Ensure global config directory exists
  ensureGlobalDir();

  // 2. Auto-detect project characteristics
  if (scanDir) {
    console.log(`Scanning remote path: ${projectDir}`);
    console.log(`Config will be written to: ${flowDir}`);
  } else {
    console.log(`Scanning ${absDir} ...`);
  }
  const detected = detectProject(projectDir);

  console.log('');
  console.log(`  Project:    ${detected.name}`);
  console.log(`  Preset:     ${detected.preset}`);
  console.log(`  Language:   ${detected.language}${detected.languages.length > 1 ? ` (+${detected.languages.slice(1).join(', ')})` : ''}`);
  if (detected.repo_url) {
    console.log(`  Repo:       ${detected.repo_url}`);
  }
  if (detected.ci) {
    console.log(`  CI:         ${detected.ci}`);
  }
  if (detected.deployment) {
    console.log(`  Deploy:     ${detected.deployment}`);
  }
  if (detected.test_command) {
    console.log(`  Test cmd:   ${detected.test_command}`);
  }
  if (detected.containerized) {
    console.log(`  Container:  yes`);
  }
  if (detected.has_db_migrations) {
    console.log(`  DB migrate: yes`);
  }
  if (detected.is_claude_code) {
    console.log(`  Claude Code: yes`);
  }
  if (detected.detected_features.length > 0) {
    console.log(`  Features:   ${detected.detected_features.join(', ')}`);
  }
  console.log('');

  // --force with existing config: only update detected.json (re-scan), preserve user files
  if (force && alreadyExists) {
    // Ensure directory structure exists (in case user deleted subdirs)
    mkdirSync(join(flowDir, 'workflows'), { recursive: true });
    mkdirSync(join(flowDir, 'context', 'L1-project'), { recursive: true });
    mkdirSync(join(flowDir, 'context', 'L2-reference'), { recursive: true });

    // Only update detected.json
    writeFileSync(
      join(flowDir, 'detected.json'),
      JSON.stringify(detected, null, 2),
      'utf-8',
    );

    // Update project registry
    registerProject({
      path: absDir,
      name: detected.name,
      preset: detected.preset,
      registered_at: new Date().toISOString(),
      repo_url: detected.repo_url,
    });

    console.log(`Re-scanned project and updated ${join(flowDir, 'detected.json')}`);
    console.log('');
    console.log('Preserved (not overwritten):');
    console.log('  .icex-flow/routes.json');
    console.log('  .icex-flow/context.manifest.json');
    console.log('  .icex-flow/workflows/');
    console.log('');
    console.log('Use --reset instead of --force to overwrite all config files.');
    return;
  }

  // Fresh init or --reset: generate everything from templates
  const preset = generatePreset(detected);

  // Create directory structure
  mkdirSync(join(flowDir, 'workflows'), { recursive: true });
  mkdirSync(join(flowDir, 'context', 'L1-project'), { recursive: true });
  mkdirSync(join(flowDir, 'context', 'L2-reference'), { recursive: true });

  // Write routes.json
  writeFileSync(
    join(flowDir, 'routes.json'),
    JSON.stringify(preset.routes, null, 2),
    'utf-8',
  );

  // Write context.manifest.json
  writeFileSync(
    join(flowDir, 'context.manifest.json'),
    JSON.stringify(preset.context_manifest, null, 2),
    'utf-8',
  );

  // Write workflow files
  for (const wf of preset.workflows) {
    const filename = `${wf.name}.flow.json`;
    writeFileSync(
      join(flowDir, 'workflows', filename),
      JSON.stringify(wf, null, 2),
      'utf-8',
    );
  }

  // Write detection summary
  writeFileSync(
    join(flowDir, 'detected.json'),
    JSON.stringify(detected, null, 2),
    'utf-8',
  );

  // Register project in global registry
  registerProject({
    path: absDir,
    name: detected.name,
    preset: detected.preset,
    registered_at: new Date().toISOString(),
    repo_url: detected.repo_url,
  });

  console.log(`Initialized icex-flow at ${flowDir}`);
  console.log('');
  console.log('Created:');
  console.log('  .icex-flow/routes.json               — task routing rules');
  console.log('  .icex-flow/context.manifest.json      — context assembly manifest');
  console.log('  .icex-flow/detected.json              — auto-detection results');
  for (const wf of preset.workflows) {
    console.log(`  .icex-flow/workflows/${wf.name}.flow.json`);
  }
  console.log('  .icex-flow/context/L1-project/        — project-specific context');
  console.log('  .icex-flow/context/L2-reference/       — tool/API references');
  console.log('');
  console.log(`Preset: ${detected.preset}`);
  console.log(`Registered in ~/.icex-flow/projects.json`);
  console.log('');
  // Auto-generate PROJECT.md (scan remote dir if provided, write to local config)
  console.log('');
  runGenerate(absDir, scanDir ?? undefined);

  console.log('');
  console.log('Next steps:');
  console.log('  1. Review and customize .icex-flow/routes.json');
  console.log('  2. Review generated PROJECT.md in context/L1-project/');
  console.log('  3. Add knowledge: icex-flow learn "your project fact"');
  console.log('  4. Customize workflows in .icex-flow/workflows/');
  console.log('  5. Run: icex-flow validate');
}
