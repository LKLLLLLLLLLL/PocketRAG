const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const useCuda = args.includes('--cuda');
const kernelArgs = useCuda ? ['--cuda'] : [];

// 保留传递给electron-builder的参数
const electronBuilderArgs = args.filter(arg => arg !== '--cuda');

// 构建
async function build() {
  console.log('📦 构建前端...');
  await runCommand('npm', ['run', 'build:vite']);
  
  console.log('📦 构建内核' + (useCuda ? ' (CUDA支持)' : '') + '...');
  await runCommand('node', [path.join(__dirname, 'buildKernel.js'), ...kernelArgs]);
  
  console.log('📦 打包应用...');
  await runCommand('electron-builder', electronBuilderArgs);
  
  console.log('✅ 构建完成!');
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, args, { stdio: 'inherit', shell: true });
    
    process.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`命令失败: ${cmd} ${args.join(' ')}`));
    });
  });
}

build().catch(err => {
  console.error('❌ 构建失败:', err);
  process.exit(1);
});