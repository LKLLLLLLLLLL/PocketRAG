const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 检测平台
const isWin = process.platform === 'win32';

binDir = path.join(__dirname, '..', 'kernel', 'bin');

// 清理 bin 目录
function cleanBinDirectory() {
    console.log('Cleaning bin directory...');

    if (fs.existsSync(binDir)) {
        // 删除 bin 目录中的所有内容
        const files = fs.readdirSync(binDir);
        files.forEach(file => {
            const filePath = path.join(binDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(filePath);
            }
        });
        console.log('Cleaned bin directory successfully.');
    } else {
        // 创建 bin 目录
        fs.mkdirSync(binDir, { recursive: true });
        console.log('Created bin directory.');
    }
}

// CMake 构建命令
const buildCmd = "cmake -B build --preset release && cmake --build build";

console.log('Building kernel...');

try {
    cleanBinDirectory();
    // 切换到 kernel 目录并执行构建命令
    process.chdir(path.join(__dirname, '..', 'kernel'));
    execSync(buildCmd, { stdio: 'inherit' });
  
    console.log('Build completed successfully!');

} catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exit(1);
}