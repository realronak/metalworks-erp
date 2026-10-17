import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🚀 Starting MetalWorks ERP Development Environment...');

// Start Backend Express Server
const serverProcess = spawn('node', ['src/index.js'], {
  cwd: path.join(rootDir, 'server'),
  stdio: 'inherit',
  env: { ...process.env, PORT: '5000' }
});

// Start Frontend Vite Dev Server
const clientProcess = spawn('npx', ['vite'], {
  cwd: path.join(rootDir, 'client'),
  stdio: 'inherit',
  env: process.env
});

const cleanup = () => {
  console.log('\n🛑 Shutting down MetalWorks ERP servers...');
  serverProcess.kill();
  clientProcess.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
