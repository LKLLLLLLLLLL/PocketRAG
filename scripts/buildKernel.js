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

const version = require('../package.json').version;

// Directory and version configuration
const binDir = path.join(__dirname, '..', 'kernel', 'bin');
const buildDir = path.join(__dirname, '..', 'kernel', 'build');
const externalDir = path.join(__dirname, '..', 'kernel', 'external');
const onnxruntimeDir = path.join(externalDir, 'onnxruntime');
const cudnnDir = path.join(externalDir, 'cudnn');

const ONNXRUNTIME_VERSION = '1.21.0';
const ONNXRUNTIME_BASE_URL = 'https://github.com/microsoft/onnxruntime/releases/download';
const CUDNN_VERSION = '9.8.0.87';
const CUDNN_CUDA_VERSION = '12';

// Format download speed display
function formatSpeed(bytes) {
    if (bytes === 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

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

function getCudnnInfo() {
    if (!enableCuda || !isWin || process.arch !== 'x64') return null;

    return {
        filename: `cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive.zip`,
        extractDir: `cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive`,
        url: `https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/windows-x86_64/cudnn-windows-x86_64-${CUDNN_VERSION}_cuda${CUDNN_CUDA_VERSION}-archive.zip`,
        isZip: true
    };
}

function isInstalled(dir) {
    return fs.existsSync(path.join(dir, 'lib')) && fs.existsSync(path.join(dir, 'include'));
}

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
        progressBar = new ProgressBar('Downloading [:bar] :speed :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: totalLength
        });
    }

    const writer = fs.createWriteStream(filePath);

    if (progressBar) {
        response.data.on('data', (chunk) => {
            progressBar.tick(chunk.length, {
                speed: formatSpeed(Math.round(progressBar.curr / ((Date.now() - progressBar.start) / 1000)))
            });
        });
    }

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('\nDownload completed');
            resolve();
        });
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

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

    console.log('Extraction completed');
}

function removeDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
}

async function installDependency(name, getInfo, targetDir) {
    if (isInstalled(targetDir)) {
        console.log(`[INFO] ${name} already installed, skipping download.`);
        return true;
    }

    const info = getInfo();
    if (!info) {
        console.log(`[INFO] ${name} not available for this platform`);
        return false;
    }

    console.log(`[INFO] ${name} not found, downloading...`);

    const downloadPath = path.join(externalDir, info.filename);
    fs.mkdirSync(externalDir, { recursive: true });

    try {
        await downloadFile(info.url, downloadPath);
        await extractFile(downloadPath, externalDir);

        const extractedPath = path.join(externalDir, info.extractDir);
        removeDirectory(targetDir);
        fs.renameSync(extractedPath, targetDir);
        fs.unlinkSync(downloadPath);

        console.log(`[SUCCESS] ${name} installed successfully`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to install ${name}:`, error.message);

        if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
        removeDirectory(targetDir);

        if (name === 'CUDNN') {
            console.log('[INFO] Manual installation steps:');
            console.log('1. Visit: https://developer.nvidia.com/cudnn');
            console.log(`2. Download CUDNN v${CUDNN_VERSION} for CUDA ${CUDNN_CUDA_VERSION}.x`);
            console.log('3. Extract to: ' + targetDir);
            console.log('[WARNING] Continuing build without CUDNN');
            return false;
        }

        throw error;
    }
}

function getBuildCommand() {
    const versionArgs = `-DAPP_VERSION="${version}"`
    if (isWin) {
        const preset = enableCuda ? 'release-windows-cuda' : 'release-windows';
        return `cmake -B build --preset ${preset} ${versionArgs} && cmake --build build`;
    } else {
        return `cmake -B build --preset release-mac ${versionArgs} && cmake --build build`;
    }
}

async function main() {
    console.log('[INFO] Starting kernel build process...');
    console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);

    if (!isWin && !isMac) {
        console.log('[ERROR] Unsupported platform. Only Windows and macOS are supported.');
        process.exit(1);
    }

    if (enableCuda) {
        if (isMac) {
            console.log('[WARNING] CUDA not supported on macOS, using CPU version');
        } else if (process.arch !== 'x64') {
            console.log('[WARNING] CUDA requires x64 architecture, using CPU version');
        } else {
            console.log('[INFO] CUDA support enabled (using pre-compiled ONNX Runtime GPU)');
        }
    }

    try {
        await installDependency('ONNX Runtime', getOnnxRuntimeInfo, onnxruntimeDir);
        await installDependency('CUDNN', getCudnnInfo, cudnnDir);

        console.log('[INFO] Cleaning bin directory...');
        removeDirectory(binDir);
        removeDirectory(buildDir);
        fs.mkdirSync(binDir, { recursive: true });

        const kernelDir = path.join(__dirname, '..', 'kernel');
        process.chdir(kernelDir);

        if (enableCuda && isInstalled(cudnnDir)) {
            process.env.CUDNN_ROOT = cudnnDir;
            console.log(`[INFO] Set CUDNN_ROOT: ${cudnnDir}`);
        }

        const buildCmd = getBuildCommand();
        console.log('[INFO] Building kernel...');
        console.log(`Executing: ${buildCmd}`);

        execSync(buildCmd, { stdio: 'inherit' });
        console.log('[SUCCESS] Build completed successfully');

    } catch (error) {
        console.error(`[ERROR] Build failed: ${error.message}`);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n[WARNING] Build interrupted by user');
    process.exit(1);
});

main().catch((error) => {
    console.error('[ERROR] Unexpected error:', error);
    process.exit(1);
});