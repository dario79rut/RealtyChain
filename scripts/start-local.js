#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const children = new Set();
let stopping = false;

function log(message) {
  console.log(`\n[local] ${message}`);
}

function spawnOptions(options = {}) {
  return {
    cwd: root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: !isWindows,
    // Node 20+ on Windows rejects .cmd/.bat without a shell (spawn EINVAL).
    shell: isWindows,
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, spawnOptions(options));
    children.add(child);

    let output = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text);
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stderr.write(text);
      });
    }

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${signal || `code ${code}`}`));
    });
  });
}

function start(command, args, options = {}) {
  const child = spawn(command, args, spawnOptions(options));
  children.add(child);
  child.once('error', (error) => {
    console.error(`[local] Could not start ${command}:`, error.message);
    shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[local] ${command} stopped unexpectedly (${signal || `code ${code}`}).`);
      shutdown(code || 1);
    }
  });
  return child;
}

function terminate(child) {
  if (!child.pid || child.killed) return;
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // The process may already have exited.
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) terminate(child);
  setTimeout(() => process.exit(code), 250);
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Stop the existing process and run npm start again.`));
      } else {
        reject(error);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(resolve);
    });
  });
}

async function findFreePort(start, attempts = 20) {
  for (let port = start; port < start + attempts; port += 1) {
    try {
      await assertPortFree(port);
      return port;
    } catch (error) {
      if (!String(error.message).includes('already in use')) throw error;
    }
  }
  throw new Error(`No free API port found between ${start} and ${start + attempts - 1}.`);
}

function writeEnv(values) {
  const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const lines = existing ? existing.replace(/\r\n/g, '\n').split('\n') : [];

  for (const [key, value] of Object.entries(values)) {
    const prefix = `${key}=`;
    const index = lines.findIndex((line) => line.startsWith(prefix));
    if (index >= 0) lines[index] = `${prefix}${value}`;
    else lines.push(`${prefix}${value}`);
  }

  fs.writeFileSync(envFile, `${lines.filter(Boolean).join('\n')}\n`, 'utf8');
}

async function main() {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) {
    throw new Error(`Node.js 22 or newer is required (found ${process.version}). Run "nvm use 22".`);
  }

  await assertPortFree(3000);
  const apiPort = await findFreePort(4000);
  if (apiPort !== 4000) {
    log(`Port 4000 is busy; the API will use port ${apiPort} instead.`);
  }

  if (!fs.existsSync(path.join(root, 'node_modules', 'vite'))) {
    log('Dependencies are missing. Running npm install…');
    await run(npm, ['install']);
  }

  const values = {
    VITE_DEMO_MODE: 'true',
    DEMO_MODE: 'true',
    PORT: String(apiPort),
    API_PORT: String(apiPort),
  };
  writeEnv(values);

  log('Starting API and frontend. Press Ctrl+C to stop everything.');
  console.log('[local] App: http://localhost:3000');
  console.log(`[local] API: http://localhost:${apiPort}/health\n`);

  start(npm, ['run', 'dev'], { env: values });
}

main().catch((error) => {
  console.error(`\n[local] Startup failed: ${error.message}`);
  shutdown(1);
});
