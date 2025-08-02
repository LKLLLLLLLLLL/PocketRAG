const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const useCuda = args.includes('--cuda');
const kernelArgs = useCuda ? ['--cuda'] : [];

// Keep arguments passed to electron-builder
const electronBuilderArgs = args.filter(arg => arg !== '--cuda');

const pkgPath = path.resolve(__dirname, '../package.json');
const cudaConfigPath = path.resolve(__dirname, '../electron-builder-cuda.json');

function generateCudaConfig() {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const build = { ...pkg.build };

  // Add -cuda suffix to artifactName for each platform
  function addCudaSuffix(obj, key) {
    if (obj && obj[key]) {
      // Replace ${ext} with -cuda.${ext}
      obj[key] = obj[key].replace(/\.(\$\{ext\})$/, '-cuda.$1');
    }
  }

  if (build.mac) addCudaSuffix(build.mac, 'artifactName');
  if (build.nsis) addCudaSuffix(build.nsis, 'artifactName');
  if (build.msi) addCudaSuffix(build.msi, 'artifactName');
  if (build.portable) addCudaSuffix(build.portable, 'artifactName');

  // Create a temporary configuration file
  fs.writeFileSync(cudaConfigPath, JSON.stringify(build, null, 2));
}

// Build
async function build() {
  try {
    if (useCuda) {
      console.log('\n🔧 Generating CUDA build configuration...\n');
      generateCudaConfig();
      electronBuilderArgs.push('--config', cudaConfigPath);
    }

    console.log('\n📦 Building frontend...\n');
    await runCommand('npm', ['run', 'build:vite']);
    
    console.log('\n📦 Building kernel' + (useCuda ? ' (CUDA support)' : '') + '...\n');
    await runCommand('node', [path.join(__dirname, 'buildKernel.js'), ...kernelArgs]);
    
    console.log('\n📦 Packaging application...\n');
    await runCommand('electron-builder', electronBuilderArgs);
    
    console.log('\n✅ Build completed!\n');
  } finally {
    // Clean up the temporary configuration file
    if (useCuda && fs.existsSync(cudaConfigPath)) {
      fs.unlinkSync(cudaConfigPath);
      console.log('🧹 Cleaned up temporary configuration file');
    }
  }
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