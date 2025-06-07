const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const useCuda = args.includes('--cuda');
const kernelArgs = useCuda ? ['--cuda'] : [];

// Keep arguments passed to electron-builder
const electronBuilderArgs = args.filter(arg => arg !== '--cuda');

// Build
async function build() {
  console.log('\n📦 Building frontend...\n');
  await runCommand('npm', ['run', 'build:vite']);
  
  console.log('\n📦 Building kernel' + (useCuda ? ' (CUDA support)' : '') + '...\n');
  await runCommand('node', [path.join(__dirname, 'buildKernel.js'), ...kernelArgs]);
  
  console.log('\n📦 Packaging application...\n');
  await runCommand('electron-builder', electronBuilderArgs);
  
  console.log('\n✅ Build completed!\n');
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, args, { stdio: 'inherit', shell: true });
    
    process.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd} ${args.join(' ')}`));
    });
  });
}

build().catch(err => {
  console.error('\n❌ Build failed:', err + '\n');
  process.exit(1);
});