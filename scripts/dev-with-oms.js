#!/usr/bin/env node
/**
 * Start Pulse web (Expo) + the Vite side-apps together.
 * Both Vite servers must be listening before Expo — Metro proxies
 * /oms/*   → :3004 (Commerce)
 * /admin/* → :3002 (Ops / analytics console)
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const OMS_DEV_PORT = Number(process.env.OMS_DEV_PORT || 3004);
const OMS_DEV_HOST = process.env.OMS_DEV_HOST || '127.0.0.1';
const OMS_HEALTH_URL = `http://${OMS_DEV_HOST}:${OMS_DEV_PORT}/oms/`;
const ADMIN_DEV_PORT = Number(process.env.ADMIN_DEV_PORT || 3002);
const ADMIN_DEV_HOST = process.env.ADMIN_DEV_HOST || '127.0.0.1';
const ADMIN_HEALTH_URL = `http://${ADMIN_DEV_HOST}:${ADMIN_DEV_PORT}/admin/`;

const children = [];

function spawnNamed(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[dev] ${name} exited (${signal})`);
    } else if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }
    shutdown(code ?? (signal ? 1 : 0));
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function waitForReady(name, healthUrl, maxAttempts = 40, delayMs = 250) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryOnce = () => {
      attempt += 1;
      const req = http.get(healthUrl, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (attempt >= maxAttempts) {
          reject(new Error(`${name} returned HTTP ${res.statusCode}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
      req.on('error', () => {
        if (attempt >= maxAttempts) {
          reject(new Error(`${name} not reachable at ${healthUrl}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };

    tryOnce();
  });
}

async function main() {
  const productionBlock = require('./supabaseProject.cjs').devServerProductionBlock(projectRoot);
  if (productionBlock) {
    console.error(`\n[dev] ${productionBlock}\n`);
    process.exit(1);
  }

  console.log('[dev] Starting Commerce (Vite :%s)…', OMS_DEV_PORT);
  spawnNamed('oms', 'npm', ['run', 'dev', '--prefix', 'oms']);

  console.log('[dev] Starting Ops console (Vite :%s)…', ADMIN_DEV_PORT);
  spawnNamed('admin', 'npm', ['run', 'dev', '--prefix', 'analytics']);

  const targets = [
    { name: 'Commerce', url: OMS_HEALTH_URL, port: OMS_DEV_PORT, fix: 'npm run oms:dev' },
    { name: 'Ops console', url: ADMIN_HEALTH_URL, port: ADMIN_DEV_PORT, fix: 'npm run admin:dev' },
  ];

  for (const target of targets) {
    try {
      await waitForReady(target.name, target.url);
      console.log('[dev] %s ready at %s', target.name, target.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[dev] %s failed to start: %s', target.name, message);
      console.error(
        '[dev] Fix: free port %s or run `%s` and check errors.',
        target.port,
        target.fix,
      );
      shutdown(1);
      return;
    }
  }

  console.log('[dev] Starting Pulse web (Expo)…');
  spawnNamed(
    'web',
    'npm',
    ['run', 'web'],
    {
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
      METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS || '4',
      CI: 'false',
    },
  );
}

void main();
