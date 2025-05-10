const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true' ||
    !app.isPackaged;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 加载应用 - 开发环境使用 Vite 开发服务器，生产环境使用构建文件
    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../../build/index.html')}`;

    mainWindow.loadURL(startUrl);

    // 开发环境下打开开发者工具
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});