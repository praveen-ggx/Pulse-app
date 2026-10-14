#!/usr/bin/env node
/**
 * No-regression gate for known tech debt.
 *   node scripts/ci-baseline.js <lint|typecheck|cycles|lib-files>
 * Passes when current count <= baseline in .github/ci-baseline.json, fails when it grows.
 * When a cleanup PR lowers a count, lower the baseline in the same PR.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.github', 'ci-baseline.json');

function run(cmd, args, okCodes) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: false });
  if (r.error) throw r.error;
  if (!okCodes.includes(r.status)) {
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status} (tool crashed, count not trustworthy)`);
  }
  return r;
}

const metrics = {
  // Same scope as `npm run lint -- --quiet` (errors only).
  lint() {
    const out = path.join(ROOT, '.eslint-ci.json');
    run('npx', ['eslint', '.', '--ext', '.js,.jsx,.ts,.tsx', '--quiet', '-f', 'json', '-o', out], [0, 1]);
    const results = JSON.parse(fs.readFileSync(out, 'utf8'));
    fs.unlinkSync(out);
    for (const f of results) {
      for (const m of f.messages) {
        if (m.severity === 2) console.log(`${path.relative(ROOT, f.filePath)}:${m.line}:${m.column} ${m.ruleId} ${m.message}`);
      }
    }
    return results.reduce((n, f) => n + f.errorCount, 0);
  },
  // Same command as `npm run typecheck`. Exit 0/1/2 = finished; anything else (e.g. OOM) fails.
  typecheck() {
    const r = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], [0, 1, 2]);
    const lines = (r.stdout + r.stderr).split('\n').filter((l) => /error TS\d+/.test(l));
    lines.forEach((l) => console.log(l));
    return lines.length;
  },
  cycles() {
    const r = run(
      'npx',
      ['madge', '--circular', '--json', '--extensions', 'ts,tsx', '--exclude', 'node_modules|dist|\\.expo|\\.metro-cache|playwright-report', '--ts-config', 'tsconfig.json', '.'],
      [0, 1],
    );
    const cycles = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
    cycles.forEach((c, i) => console.log(`${i + 1}) ${c.join(' > ')}`));
    return cycles.length;
  },
  'lib-files'() {
    return fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => /\.tsx?$/.test(f)).length;
  },
};

const name = process.argv[2];
if (!metrics[name]) {
  console.error(`usage: node scripts/ci-baseline.js <${Object.keys(metrics).join('|')}>`);
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))[name];
if (typeof baseline !== 'number') {
  console.error(`No numeric baseline for "${name}" in .github/ci-baseline.json`);
  process.exit(2);
}
const current = metrics[name]();
console.log(`\n${name}: current ${current}, baseline ${baseline}`);
if (current > baseline) {
  console.error(`FAIL: ${name} went up by ${current - baseline}. Fix the new ones (listed above) before merging.`);
  process.exit(1);
}
if (current < baseline) console.log(`PASS, and it went down by ${baseline - current}: lower "${name}" to ${current} in .github/ci-baseline.json in this PR.`);
else console.log('PASS (no regression)');
