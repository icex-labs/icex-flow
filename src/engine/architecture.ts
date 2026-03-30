import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────

export interface DiscoveredService {
  name: string;
  language?: string;
  port?: number;
  dependencies?: string[];
  database?: string;
}

export interface ArchitectureResult {
  services: DiscoveredService[];
  dataFlow?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function detectLanguage(dir: string): string | undefined {
  if (existsSync(join(dir, 'package.json'))) {
    if (existsSync(join(dir, 'tsconfig.json'))) return 'typescript';
    return 'node';
  }
  if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'setup.py'))) return 'python';
  if (existsSync(join(dir, 'go.mod'))) return 'go';
  if (existsSync(join(dir, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(dir, 'pom.xml')) || existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'))) return 'java';
  return undefined;
}

function detectDatabaseFromContent(content: string): string | undefined {
  const lower = content.toLowerCase();
  if (/postgres(ql)?|pg_|psycopg|DATABASE_URL.*postgres/i.test(content)) return 'postgresql';
  if (/mysql|mariadb/i.test(content)) return 'mysql';
  if (/mongodb|mongo_uri|mongoose/i.test(content)) return 'mongodb';
  if (/redis|REDIS_URL|ioredis/i.test(content)) return 'redis';
  if (/sqlite/i.test(content)) return 'sqlite';
  if (/cassandra|cql/i.test(content)) return 'cassandra';
  if (/elasticsearch|elastic/i.test(content)) return 'elasticsearch';
  return undefined;
}

function detectPortFromDockerfile(dir: string): number | undefined {
  const content = readFileSafe(join(dir, 'Dockerfile')) || readFileSafe(join(dir, 'Containerfile'));
  if (!content) return undefined;
  const match = content.match(/EXPOSE\s+(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function detectDatabaseInDir(dir: string): string | undefined {
  // Check common config files for DB references
  const configFiles = [
    'docker-compose.yml', 'docker-compose.yaml',
    '.env', '.env.local', '.env.development',
    'config.yaml', 'config.yml', 'config.json',
    'application.yml', 'application.yaml', 'application.properties',
    'settings.py', 'database.yml',
  ];

  for (const file of configFiles) {
    const content = readFileSafe(join(dir, file));
    if (content) {
      const db = detectDatabaseFromContent(content);
      if (db) return db;
    }
  }

  // Check package.json dependencies
  const pkgContent = readFileSafe(join(dir, 'package.json'));
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['pg'] || allDeps['postgres'] || allDeps['knex'] || allDeps['typeorm'] || allDeps['prisma'] || allDeps['@prisma/client']) return 'postgresql';
      if (allDeps['mysql'] || allDeps['mysql2']) return 'mysql';
      if (allDeps['mongodb'] || allDeps['mongoose']) return 'mongodb';
      if (allDeps['redis'] || allDeps['ioredis']) return 'redis';
      if (allDeps['better-sqlite3'] || allDeps['sqlite3']) return 'sqlite';
    } catch { /* skip */ }
  }

  // Check pyproject.toml / requirements.txt
  const pyContent = readFileSafe(join(dir, 'requirements.txt'));
  if (pyContent) {
    const db = detectDatabaseFromContent(pyContent);
    if (db) return db;
  }

  return undefined;
}

// ── Scanners ─────────────────────────────────────────────────────────

function scanServiceDirs(dir: string): DiscoveredService[] {
  const services: DiscoveredService[] = [];
  const serviceDirs = ['services', 'packages', 'apps', 'modules'];

  for (const svcDir of serviceDirs) {
    const svcPath = join(dir, svcDir);
    if (!existsSync(svcPath)) continue;
    try {
      if (!statSync(svcPath).isDirectory()) continue;
    } catch { continue; }

    const subs = readdirSync(svcPath).filter(f => {
      try { return statSync(join(svcPath, f)).isDirectory(); } catch { return false; }
    });

    for (const sub of subs) {
      const subPath = join(svcPath, sub);
      const svc: DiscoveredService = {
        name: sub,
        language: detectLanguage(subPath),
        port: detectPortFromDockerfile(subPath),
        database: detectDatabaseInDir(subPath),
      };

      // Try to find port from package.json scripts (e.g., --port 3000)
      if (!svc.port) {
        const pkg = readFileSafe(join(subPath, 'package.json'));
        if (pkg) {
          try {
            const parsed = JSON.parse(pkg);
            const startScript = parsed.scripts?.start || parsed.scripts?.dev || '';
            const portMatch = startScript.match(/(?:--port|PORT=|-p)\s*(\d+)/);
            if (portMatch) svc.port = parseInt(portMatch[1], 10);
          } catch { /* skip */ }
        }
      }

      services.push(svc);
    }
  }

  return services;
}

function scanDockerCompose(dir: string): { services: DiscoveredService[]; dataFlow: string[] } {
  const services: DiscoveredService[] = [];
  const dataFlow: string[] = [];
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

  for (const file of composeFiles) {
    const content = readFileSafe(join(dir, file));
    if (!content) continue;

    const lines = content.split('\n');
    let inServices = false;
    let currentService: string | null = null;
    let currentIndent = 0;

    for (const line of lines) {
      if (/^services:\s*$/.test(line)) {
        inServices = true;
        continue;
      }

      if (inServices) {
        // New top-level key ends services section
        if (/^\S/.test(line) && line.trim() !== '' && !/^services:/.test(line)) {
          inServices = false;
          currentService = null;
          continue;
        }

        // Service name (2-space indent)
        const svcMatch = line.match(/^(\s{2})(\w[\w.-]*):\s*$/);
        if (svcMatch) {
          currentService = svcMatch[2];
          // Skip known infra services for architecture but still track dependencies
          const svc: DiscoveredService = { name: currentService };

          // Detect database services
          const lower = currentService.toLowerCase();
          if (/postgres/.test(lower)) svc.database = 'postgresql';
          else if (/mysql|mariadb/.test(lower)) svc.database = 'mysql';
          else if (/mongo/.test(lower)) svc.database = 'mongodb';
          else if (/redis/.test(lower)) svc.database = 'redis';
          else if (/elasticsearch|elastic/.test(lower)) svc.database = 'elasticsearch';

          services.push(svc);
          continue;
        }

        // Detect ports within a service
        if (currentService) {
          const portMatch = line.match(/["']?(\d+):(\d+)["']?/);
          if (portMatch) {
            const svc = services.find(s => s.name === currentService);
            if (svc && !svc.port) {
              svc.port = parseInt(portMatch[2], 10);
            }
          }

          // Detect depends_on
          const depMatch = line.match(/^\s+-\s+(\w[\w.-]*)\s*$/);
          if (depMatch && currentService) {
            const svc = services.find(s => s.name === currentService);
            if (svc) {
              svc.dependencies = svc.dependencies || [];
              svc.dependencies.push(depMatch[1]);
              dataFlow.push(`${currentService} -> ${depMatch[1]}`);
            }
          }
        }
      }
    }

    break; // Only process first found compose file
  }

  return { services, dataFlow };
}

function scanHelmCharts(dir: string): DiscoveredService[] {
  const services: DiscoveredService[] = [];
  const chartDirs = ['charts', 'helm'];

  for (const chartDir of chartDirs) {
    const chartsPath = join(dir, chartDir);
    if (!existsSync(chartsPath)) continue;
    try {
      if (!statSync(chartsPath).isDirectory()) continue;
    } catch { continue; }

    const subs = readdirSync(chartsPath).filter(f => {
      try { return statSync(join(chartsPath, f)).isDirectory(); } catch { return false; }
    });

    for (const sub of subs) {
      const chartYaml = readFileSafe(join(chartsPath, sub, 'Chart.yaml')) ||
                        readFileSafe(join(chartsPath, sub, 'Chart.yml'));
      if (chartYaml) {
        services.push({ name: sub });
      }
    }
  }

  // Single chart at root
  if (existsSync(join(dir, 'Chart.yaml')) || existsSync(join(dir, 'Chart.yml'))) {
    const name = basename(dir) || 'chart';
    if (!services.some(s => s.name === name)) {
      services.push({ name });
    }
  }

  return services;
}

function scanK8sManifests(dir: string): { services: DiscoveredService[]; dataFlow: string[] } {
  const services: DiscoveredService[] = [];
  const dataFlow: string[] = [];
  const k8sDirs = ['k8s', 'kubernetes', 'manifests', 'deploy'];

  for (const k8sDir of k8sDirs) {
    const k8sPath = join(dir, k8sDir);
    if (!existsSync(k8sPath)) continue;
    try {
      if (!statSync(k8sPath).isDirectory()) continue;
    } catch { continue; }

    const files = readdirSync(k8sPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      const content = readFileSafe(join(k8sPath, file));
      if (!content) continue;

      // Extract service/deployment names
      if (content.includes('kind: Deployment') || content.includes('kind: Service') || content.includes('kind: StatefulSet')) {
        const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          const existing = services.find(s => s.name === name);
          if (!existing) {
            const svc: DiscoveredService = { name };
            // Extract containerPort
            const portMatch = content.match(/containerPort:\s*(\d+)/);
            if (portMatch) svc.port = parseInt(portMatch[1], 10);
            services.push(svc);
          }
        }
      }
    }
  }

  return { services, dataFlow };
}

// ── Main ─────────────────────────────────────────────────────────────

export function extractArchitecture(dir: string): ArchitectureResult {
  const allServices = new Map<string, DiscoveredService>();
  const allDataFlow: string[] = [];

  // 1. Scan service directories
  for (const svc of scanServiceDirs(dir)) {
    allServices.set(svc.name, svc);
  }

  // 2. Scan docker-compose
  const compose = scanDockerCompose(dir);
  for (const svc of compose.services) {
    const existing = allServices.get(svc.name);
    if (existing) {
      // Merge: compose adds ports/deps, dir scan adds language
      existing.port = existing.port || svc.port;
      existing.database = existing.database || svc.database;
      existing.dependencies = existing.dependencies || svc.dependencies;
    } else {
      allServices.set(svc.name, svc);
    }
  }
  allDataFlow.push(...compose.dataFlow);

  // 3. Scan Helm charts
  for (const svc of scanHelmCharts(dir)) {
    if (!allServices.has(svc.name)) {
      allServices.set(svc.name, svc);
    }
  }

  // 4. Scan k8s manifests
  const k8s = scanK8sManifests(dir);
  for (const svc of k8s.services) {
    const existing = allServices.get(svc.name);
    if (existing) {
      existing.port = existing.port || svc.port;
    } else {
      allServices.set(svc.name, svc);
    }
  }
  allDataFlow.push(...k8s.dataFlow);

  // 5. If no services found, treat root as single service
  if (allServices.size === 0) {
    const lang = detectLanguage(dir);
    const port = detectPortFromDockerfile(dir);
    const db = detectDatabaseInDir(dir);
    if (lang || port || db) {
      allServices.set(basename(dir) || 'app', {
        name: basename(dir) || 'app',
        language: lang,
        port,
        database: db,
      });
    }
  }

  // 6. Try to detect root-level database if services don't have one
  const rootDb = detectDatabaseInDir(dir);
  if (rootDb) {
    for (const svc of allServices.values()) {
      if (!svc.database) {
        svc.database = rootDb;
      }
    }
  }

  return {
    services: Array.from(allServices.values()),
    dataFlow: allDataFlow.length > 0 ? allDataFlow : undefined,
  };
}
