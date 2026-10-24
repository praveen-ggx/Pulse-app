#!/usr/bin/env node
/**
 * Parallel production build orchestrator.
 *
 * Ordering constraint (verified experimentally): `expo export` WIPES dist/.
 * A canary file placed in dist/ does not survive the export. Therefore the
 * `cp` of each subproject's output into dist/ must happen strictly AFTER the
 * export completes — but the subproject *builds* themselves touch only their
 * own directories and can run fully concurrently with it.
 *
 * Do NOT move the copy phase before the Promise.all barrier: the export would
 * delete dist/oms and dist/ops-9f3a2c, and those routes would 404 in
 * production with no build-time error.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('./netlifyDeployPreviewSupabase.cjs').applyDeployPreviewSupabaseEnv(process.env);

/**
 * Live children, so a SIGINT/SIGTERM can tear down the whole tree. Without
 * this, Ctrl+C killed only the orchestrator and left expo/metro/vite running,
 * still burning CPU and holding .metro-cache file handles.
 */
const children = new Set();
let terminating = false;

function run(cmd, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    // detached:true puts the child in its own process group so we can signal
    // the whole group (npm -> node -> metro workers), not just the shell.
    const p = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: process.env,
      detached: true,
    });
    children.add(p);
    p.on('exit', (code, signal) => {
      children.delete(p);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      // During teardown children die by signal; that is expected, not a failure.
      if (terminating) return;
      if (code === 0) {
        console.log(`[build-ci] ${label} ok in ${secs}s`);
        resolve();
      } else {
        reject(new Error(`${label} failed (exit ${code ?? signal}) after ${secs}s`));
      }
    });
    p.on('error', (err) => {
      children.delete(p);
      reject(err);
    });
  });
}

/** Signal an entire child process group, ignoring races with natural exit. */
function killGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal); // negative pid => the whole group
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}

function shutdown(signal) {
  if (terminating) return;
  terminating = true;
  console.error(`[build-ci] ${signal} received — terminating ${children.size} child process(es)`);
  for (const c of children) killGroup(c, 'SIGTERM');

  // Escalate for anything that ignores SIGTERM, then exit with the
  // conventional 128+signum so CI still sees a cancellation. The timer is
  // deliberately NOT unref'd: it must keep the loop alive long enough to
  // SIGKILL, since the pending run() promises never settle once terminating.
  setTimeout(() => {
    for (const c of children) killGroup(c, 'SIGKILL');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/** Fail loudly if a subproject's output never made it into dist/. */
function assertExists(rel) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    throw new Error(`expected build output missing: ${rel}`);
  }
}

(async () => {
  const t0 = Date.now();

  // Phase 1 — concurrent. Disjoint output dirs: dist/, analytics/dist, oms/dist.
  const web = run('npx', ['expo', 'export', '--platform', 'web'], ROOT, 'expo export');
  const admin = run('npm', ['ci', '--prefer-offline'], path.join(ROOT, 'analytics'), 'analytics install')
    .then(() => run('npm', ['run', 'build'], path.join(ROOT, 'analytics'), 'analytics build'));
  const oms = run('npm', ['ci', '--prefer-offline', '--legacy-peer-deps'], path.join(ROOT, 'oms'), 'oms install')
    .then(() => run('npm', ['run', 'build'], path.join(ROOT, 'oms'), 'oms build'));

  // Barrier: all three must finish before any copy into dist/.
  await Promise.all([web, admin, oms]);

  // Phase 2 — copy now that dist/ is final and will not be wiped again.
  await run('cp', ['-r', 'analytics/dist', 'dist/ops-9f3a2c'], ROOT, 'copy admin');
  await run('cp', ['-r', 'oms/dist', 'dist/oms'], ROOT, 'copy oms');

  assertExists('dist/index.html');
  assertExists('dist/ops-9f3a2c/index.html');
  assertExists('dist/oms/index.html');

  // Phase 3 — compress the finished bundle.
  await run('node', ['scripts/compress-dist.js'], ROOT, 'compress');

  console.log(`[build-ci] total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch((err) => {
  console.error(`[build-ci] ${err.message}`);
  process.exit(1);
});
