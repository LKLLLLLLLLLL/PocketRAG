const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');
const tar = require('tar');
const ProgressBar = require('progress');

const enableCuda = process.argv.includes('--cuda');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// 目录配置
const binDir = path.join(__dirname, '..', 'kernel', 'bin');
const externalDir = path.join(__dirname, '..', 'kernel', 'external');
const onnxruntimeDir = path.join(externalDir, 'onnxruntime');
const cudnnDir = path.join(externalDir, 'cudnn');

// 版本配置
const ONNXRUNTIME_VERSION = '1.21.0';
const ONNXRUNTIME_BASE_URL = 'https://github.com/microsoft/onnxruntime/releases/download';
const CUDNN_VERSION = '8.9.7';
const CUDNN_CUDA_VERSION = '12';

// 获取ONNX Runtime下载信息
function getOnnxRuntimeInfo() {
    if (isWin) {
        const arch = process.arch === 'x64' ? 'x64' : 'x86';
        const gpuSuffix = enableCuda && arch === 'x64' ? '-gpu' : '';
        return {
            filename: `onnxruntime-win-${arch}${gpuSuffix}-${ONNXRUNTIME_VERSION}.zip`,
            extractDir: `onnxruntime-win-${arch}${gpuSuffix}-${ONNXRUNTIME_VERSION}`,
            url: `${ONNXRUNTIME_BASE_URL}/v${ONNXRUNTIME_VERSION}/onnxruntime-win-${arch}${gpuSuffix}-${ONNXRUNTIME_VERSION}.zip`,
            isZip: true
        };
    } else {
        const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
        return {
            filename: `onnxruntime-osx-${arch}-${ONNXRUNTIME_VERSION}.tgz`,
            extractDir: `onnxruntime-osx-${arch}-${ONNXRUNTIME_VERSION}`,
            url: `${ONNXRUNTIME_BASE_URL}/v${ONNXRUNTIME_VERSION}/onnxruntime-osx-${arch}-${ONNXRUNTIME_VERSION}.tgz`,
            isZip: false
        };
    }
}

// 获取CUDNN下载信息
function getCudnnInfo() {
    if (!enableCuda || !isWin || process.arch !== 'x64') return null;
    
    return {
        filename: `cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive.zip`,
        extractDir: `cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive`,
        url: `https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/windows-x86_64/cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive.zip`,
        isZip: true
    };
}

// 检查是否已安装
function isInstalled(dir) {
    return fs.existsSync(path.join(dir, 'lib')) && fs.existsSync(path.join(dir, 'include'));
}

// 下载文件
async function downloadFile(url, filePath) {
    console.log(`Downloading from: ${url}`);

    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 600000,
        headers: { 'User-Agent': 'PocketRAG-Build-Script/1.0' }
    });

    const totalLength = parseInt(response.headers['content-length'], 10);
    let progressBar;
    
    if (totalLength) {
        progressBar = new ProgressBar('Downloading [:bar] :rate/bps :percent :etas', {
            complete: '=', incomplete: ' ', width: 40, total: totalLength
        });
    }

    const writer = fs.createWriteStream(filePath);
    
    if (progressBar) {
        response.data.on('data', (chunk) => progressBar.tick(chunk.length));
    }

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('\nDownload completed!');
            resolve();
        });
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

// 解压文件
async function extractFile(filePath, extractTo) {
    fs.mkdirSync(extractTo, { recursive: true });

    if (filePath.endsWith('.zip')) {
        console.log(`Extracting ZIP: ${filePath}`);
        const zip = new AdmZip(filePath);
        zip.extractAllTo(extractTo, true);
    } else {
        console.log(`Extracting TAR: ${filePath}`);
        await tar.extract({ file: filePath, cwd: extractTo, strip: 0 });
    }
    
    console.log('Extraction completed!');
}

// 清理目录
function removeDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
}

// 安装依赖
async function installDependency(name, getInfo, targetDir) {
    if (isInstalled(targetDir)) {
        console.log(`✅ ${name} already installed, skipping download.`);
        return true;
    }

    const info = getInfo();
    if (!info) {
        console.log(`⏭️  ${name} not available for this platform`);
        return false;
    }

    console.log(`📦 ${name} not found, downloading...`);
    
    const downloadPath = path.join(externalDir, info.filename);
    fs.mkdirSync(externalDir, { recursive: true });

    try {
        await downloadFile(info.url, downloadPath);
        await extractFile(downloadPath, externalDir);

        const extractedPath = path.join(externalDir, info.extractDir);
        removeDirectory(targetDir);
        fs.renameSync(extractedPath, targetDir);
        fs.unlinkSync(downloadPath);

        console.log(`✅ ${name} installed successfully!`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to install ${name}:`, error.message);
        
        // 清理
        if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
        removeDirectory(targetDir);
        
        if (name === 'CUDNN') {
            console.log('💡 Manual installation steps:');
            console.log('1. Visit: https://developer.nvidia.com/cudnn');
            console.log(`2. Download CUDNN v${CUDNN_VERSION} for CUDA ${CUDNN_CUDA_VERSION}.x`);
            console.log('3. Extract to: ' + targetDir);
            console.log('⚠️  Continuing build without CUDNN');
            return false;
        }
        
        throw error;
    }
}

// 构建命令
function getBuildCommand() {
    if (isWin) {
        const preset = enableCuda ? 'release-windows-cuda' : 'release-windows';
        return `cmake -B build --preset ${preset} && cmake --build build`;
    } else {
        return 'cmake -B build --preset release-mac && cmake --build build';
    }
}

// 主流程
async function main() {
    console.log('🚀 Starting kernel build process...');
    console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);

    // 平台检查
    if (!isWin && !isMac) {
        console.log('❌ Unsupported platform. Only Windows and macOS are supported.');
        process.exit(1);
    }

    // CUDA检查
    if (enableCuda) {
        if (isMac) {
            console.log('⚠️  CUDA not supported on macOS, using CPU version');
        } else if (process.arch !== 'x64') {
            console.log('⚠️  CUDA requires x64 architecture, using CPU version');
        } else {
            console.log('🔥 CUDA support enabled (using pre-compiled ONNX Runtime GPU)');
        }
    }

    try {
        // 安装依赖
        await installDependency('ONNX Runtime', getOnnxRuntimeInfo, onnxruntimeDir);
        await installDependency('CUDNN', getCudnnInfo, cudnnDir);

        // 清理构建目录
        console.log('Cleaning bin directory...');
        removeDirectory(binDir);
        fs.mkdirSync(binDir, { recursive: true });

        // 切换到kernel目录
        const kernelDir = path.join(__dirname, '..', 'kernel');
        process.chdir(kernelDir);

        // 设置CUDNN环境变量
        if (enableCuda && isInstalled(cudnnDir)) {
            process.env.CUDNN_ROOT = cudnnDir;
            console.log(`📍 Set CUDNN_ROOT: ${cudnnDir}`);
        }

        // 执行构建
        const buildCmd = getBuildCommand();
        console.log('🔨 Building kernel...');
        console.log(`Executing: ${buildCmd}`);
        
        execSync(buildCmd, { stdio: 'inherit' });
        console.log('🎉 Build completed successfully!');

    } catch (error) {
        console.error(`❌ Build failed: ${error.message}`);
        process.exit(1);
    }
}

// 错误处理
process.on('SIGINT', () => {
    console.log('\n⚠️  Build interrupted by user');
    process.exit(1);
});

// 运行
main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});