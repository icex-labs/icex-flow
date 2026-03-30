import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// ── Types ────────────────────────────────────────────────────────────

export interface DiscoveredEnvironment {
  name: string;
  type: 'kubernetes' | 'docker-compose' | 'terraform' | 'pulumi' | 'helm' | 'argocd' | 'flux' | 'env-file' | 'container';
  endpoint?: string;
  namespace?: string;
  isProduction: boolean;
  details?: Record<string, unknown>;
}

export interface EnvironmentDiscoveryResult {
  environments: DiscoveredEnvironment[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function isProdName(name: string): boolean {
  const lower = name.toLowerCase();
  return /\bprod(uction)?\b/.test(lower) || lower === 'prd' || lower === 'live';
}

function envNameFromSuffix(filename: string): string {
  // .env.production -> production, .env.dev -> dev
  const m = filename.match(/\.env\.(.+)$/);
  if (m) return m[1];
  return 'default';
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

// ── Scanners ─────────────────────────────────────────────────────────

function scanKubeConfig(): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const kubeconfigPath = process.env['KUBECONFIG'] || join(homedir(), '.kube', 'config');

  const content = readFileSafe(kubeconfigPath);
  if (!content) return envs;

  // Parse YAML-like kubeconfig (simple regex extraction, no YAML parser dep)
  // Extract contexts
  const contextBlocks = content.split(/^- context:/gm);
  const nameMatches = content.matchAll(/^- name:\s*(.+)$/gm);

  // Simpler approach: extract context names
  const contextNames: string[] = [];
  for (const m of nameMatches) {
    contextNames.push(m[1].trim());
  }

  // Extract clusters and namespaces per context
  // Pattern: "- context:\n    cluster: <cluster>\n    namespace: <ns>\n    user: <user>\n  name: <name>"
  const contextRegex = /-\s*context:\s*\n\s*cluster:\s*(.+)\n(?:\s*namespace:\s*(.+)\n)?\s*(?:user:\s*.+\n)?\s*name:\s*(.+)/gm;
  let match: RegExpExecArray | null;
  while ((match = contextRegex.exec(content)) !== null) {
    const cluster = match[1].trim();
    const namespace = match[2]?.trim() || undefined;
    const name = match[3].trim();
    envs.push({
      name,
      type: 'kubernetes',
      endpoint: cluster,
      namespace,
      isProduction: isProdName(name) || isProdName(cluster),
    });
  }

  // If regex didn't match (different YAML formatting), fall back to simpler extraction
  if (envs.length === 0 && contextNames.length > 0) {
    for (const name of contextNames) {
      // Skip entries that look like cluster/user definitions rather than contexts
      envs.push({
        name,
        type: 'kubernetes',
        isProduction: isProdName(name),
      });
    }
    // Deduplicate: only keep unique context names (the contexts: section names)
    // In kubeconfig, names appear under contexts, clusters, and users sections
    // We try to identify context-specific ones
  }

  return envs;
}

function scanDockerCompose(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'docker-compose.dev.yml',
    'docker-compose.dev.yaml', 'docker-compose.prod.yml', 'docker-compose.prod.yaml',
    'docker-compose.staging.yml', 'docker-compose.staging.yaml',
    'docker-compose.override.yml', 'docker-compose.override.yaml',
    'compose.yml', 'compose.yaml'];

  for (const file of composeFiles) {
    const filePath = join(dir, file);
    const content = readFileSafe(filePath);
    if (!content) continue;

    // Extract environment name from filename
    const envMatch = file.match(/docker-compose\.(\w+)\.(yml|yaml)$/) || file.match(/compose\.(\w+)\.(yml|yaml)$/);
    const envName = envMatch ? envMatch[1] : 'local';

    // Extract services
    const services: string[] = [];
    const ports: string[] = [];
    const volumes: string[] = [];

    // Simple YAML parsing: find services section and extract top-level keys
    const lines = content.split('\n');
    let inServices = false;
    let indent = 0;

    for (const line of lines) {
      if (/^services:\s*$/.test(line)) {
        inServices = true;
        continue;
      }
      if (inServices) {
        // Top-level service key (2-space or 4-space indent)
        const svcMatch = line.match(/^(\s{2}|\s{4})(\w[\w-]*):\s*$/);
        if (svcMatch && !line.startsWith('    ')) {
          services.push(svcMatch[2]);
        } else if (/^\S/.test(line) && line.trim() !== '') {
          inServices = false;
        }
      }
      // Extract ports
      const portMatch = line.match(/["']?(\d+:\d+)["']?/);
      if (portMatch) ports.push(portMatch[1]);
      // Extract volumes
      const volMatch = line.match(/-\s*["']?([./\w-]+:[./\w-]+)["']?/);
      if (volMatch) volumes.push(volMatch[1]);
    }

    envs.push({
      name: envName === 'override' ? 'local' : envName,
      type: 'docker-compose',
      isProduction: isProdName(envName),
      details: {
        file,
        services,
        ports,
        volumes,
      },
    });
  }

  return envs;
}

function scanEnvFiles(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (file === '.env' || /^\.env\.\w+$/.test(file)) {
        const envName = file === '.env' ? 'default' : envNameFromSuffix(file);
        // Don't add if it's just '.env.example' or '.env.template'
        if (envName === 'example' || envName === 'template' || envName === 'sample') continue;
        envs.push({
          name: envName,
          type: 'env-file',
          isProduction: isProdName(envName),
          details: { file },
        });
      }
    }
  } catch {
    // Directory not readable
  }

  return envs;
}

function scanContainerFiles(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const containerFiles = ['Dockerfile', 'Containerfile'];

  for (const file of containerFiles) {
    if (existsSync(join(dir, file))) {
      envs.push({
        name: 'container',
        type: 'container',
        isProduction: false,
        details: { file },
      });
      break; // Only add once
    }
  }

  return envs;
}

function scanTerraform(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const tfDir = join(dir, 'terraform');
  const tfDirs = [tfDir, dir];

  for (const d of tfDirs) {
    try {
      if (!existsSync(d)) continue;
      const files = readdirSync(d);
      const hasTf = files.some(f => f.endsWith('.tf'));
      if (!hasTf) continue;

      // Check for environment-specific directories
      const envDirs = files.filter(f => {
        try {
          return statSync(join(d, f)).isDirectory() &&
            ['dev', 'staging', 'prod', 'production', 'test', 'uat'].includes(f.toLowerCase());
        } catch { return false; }
      });

      if (envDirs.length > 0) {
        for (const envDir of envDirs) {
          envs.push({
            name: envDir,
            type: 'terraform',
            isProduction: isProdName(envDir),
          });
        }
      } else if (d === tfDir) {
        envs.push({
          name: 'terraform',
          type: 'terraform',
          isProduction: false,
        });
      }
      break;
    } catch { /* skip */ }
  }

  return envs;
}

function scanPulumi(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  if (existsSync(join(dir, 'Pulumi.yaml')) || existsSync(join(dir, 'Pulumi.yml'))) {
    // Check for stack files: Pulumi.<stack>.yaml
    try {
      const files = readdirSync(dir);
      const stacks = files
        .filter(f => /^Pulumi\.\w+\.(yaml|yml)$/.test(f) && f !== 'Pulumi.yaml' && f !== 'Pulumi.yml')
        .map(f => {
          const m = f.match(/^Pulumi\.(\w+)\.(yaml|yml)$/);
          return m ? m[1] : null;
        })
        .filter((s): s is string => s !== null);

      if (stacks.length > 0) {
        for (const stack of stacks) {
          envs.push({
            name: stack,
            type: 'pulumi',
            isProduction: isProdName(stack),
          });
        }
      } else {
        envs.push({
          name: 'pulumi',
          type: 'pulumi',
          isProduction: false,
        });
      }
    } catch {
      envs.push({
        name: 'pulumi',
        type: 'pulumi',
        isProduction: false,
      });
    }
  }

  return envs;
}

function scanArgoCD(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const argoDir = join(dir, 'argocd');
  const appDir = join(dir, 'apps');

  for (const d of [argoDir, appDir, dir]) {
    try {
      if (!existsSync(d)) continue;
      const files = readdirSync(d);
      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        const content = readFileSafe(join(d, file));
        if (!content) continue;
        if (content.includes('kind: Application') && content.includes('argoproj.io')) {
          const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
          const nsMatch = content.match(/^\s*namespace:\s*(.+)$/m);
          const name = nameMatch ? nameMatch[1].trim() : basename(file, '.yaml').replace('.yml', '');
          envs.push({
            name,
            type: 'argocd',
            namespace: nsMatch ? nsMatch[1].trim() : undefined,
            isProduction: isProdName(name),
          });
        }
      }
    } catch { /* skip */ }
  }

  return envs;
}

function scanFlux(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const fluxDir = join(dir, 'flux-system');
  const clusterDir = join(dir, 'clusters');

  for (const d of [fluxDir, clusterDir, dir]) {
    try {
      if (!existsSync(d)) continue;
      const files = readdirSync(d);
      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        const content = readFileSafe(join(d, file));
        if (!content) continue;
        if (content.includes('fluxcd.io') || content.includes('toolkit.fluxcd.io')) {
          const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
          const name = nameMatch ? nameMatch[1].trim() : basename(file).replace(/\.(yaml|yml)$/, '');
          envs.push({
            name,
            type: 'flux',
            isProduction: isProdName(name),
          });
        }
      }
    } catch { /* skip */ }
  }

  return envs;
}

function scanHelmValues(dir: string): DiscoveredEnvironment[] {
  const envs: DiscoveredEnvironment[] = [];
  const searchDirs = [dir, join(dir, 'helm'), join(dir, 'charts')];

  for (const d of searchDirs) {
    try {
      if (!existsSync(d)) continue;
      const files = readdirSync(d);
      for (const file of files) {
        const m = file.match(/^values[-.](\w+)\.(yaml|yml)$/);
        if (m) {
          const envName = m[1];
          if (envName === 'schema' || envName === 'template') continue;
          envs.push({
            name: envName,
            type: 'helm',
            isProduction: isProdName(envName),
          });
        }
      }

      // Also scan chart subdirectories
      if (d !== dir) continue;
      const chartsDir = join(d, 'charts');
      if (!existsSync(chartsDir)) continue;
      const chartSubs = readdirSync(chartsDir).filter(f => {
        try { return statSync(join(chartsDir, f)).isDirectory(); } catch { return false; }
      });
      for (const chart of chartSubs) {
        const chartFiles = readdirSync(join(chartsDir, chart));
        for (const file of chartFiles) {
          const cm = file.match(/^values[-.](\w+)\.(yaml|yml)$/);
          if (cm) {
            const envName = cm[1];
            if (envName === 'schema' || envName === 'template') continue;
            envs.push({
              name: `${chart}/${envName}`,
              type: 'helm',
              isProduction: isProdName(envName),
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  return envs;
}

// ── Main ─────────────────────────────────────────────────────────────

export function discoverEnvironments(dir: string): EnvironmentDiscoveryResult {
  const environments: DiscoveredEnvironment[] = [
    ...scanKubeConfig(),
    ...scanDockerCompose(dir),
    ...scanEnvFiles(dir),
    ...scanContainerFiles(dir),
    ...scanTerraform(dir),
    ...scanPulumi(dir),
    ...scanArgoCD(dir),
    ...scanFlux(dir),
    ...scanHelmValues(dir),
  ];

  // Deduplicate by name+type
  const seen = new Set<string>();
  const unique = environments.filter(e => {
    const key = `${e.type}:${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { environments: unique };
}
