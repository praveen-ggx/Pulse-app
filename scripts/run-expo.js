#!/usr/bin/env node
/**
 * Unified Expo CLI launcher — always applies dev memory + worker limits.
 * Use via npm scripts (`npm start`, `npm run web`) so `npx expo start` alone
 * does not OOM during large graph bundles.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

require('./expo-env');
require('./supabaseProject.cjs').loadSupabaseProject(projectRoot);

require('dotenv').config({
  path: path.join(projectRoot, '.env'),
  quiet: true,
});

const expoBin = path.join(projectRoot, 'node_modules/expo/bin/cli');
const args = process.argv.slice(2);

const child = spawn(
  process.execPath,
  ['--max-old-space-size=8192', '-r', 'dotenv/config', expoBin, ...args],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('exit', (code, signal) => {
  if (code === 134 || signal === 'SIGABRT') {
    console.error(
      '\n[expo] Process aborted (OOM or native crash). Use npm scripts (not raw npx expo):\n' +
        '  npm run start:clean\n' +
        '  npm start\n',
    );
  }
  process.exit(code ?? (signal ? 1 : 0));
});
