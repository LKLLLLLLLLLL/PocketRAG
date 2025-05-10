const { app, BrowserWindow, ipcMain, dialog} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const fs = require('node:fs')
//import electron and node modules


const kernelPath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
const kernel = spawn(kernelPath, [], {
  cwd: path.dirname(kernelPath) // set work directory to the same as the kernel path
});
kernel.on('error', (err) => {
  console.error('Failed to start kernel:', err)
  app.quit()
})
kernel.stdout.on('data', stdoutListener)//kernel stdout listener
const windows = new Map()
//define the child process and windows map for the kernel and windows


const isDev = process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true' ||
    !app.isPackaged


async function stdoutListener (data) {
  const result = JSON.parse(data.toString())
  const window = windows.get(result.windowId)

  if(!window) {
    throw new Error('Window not found from windowId: ' + result.windowId)
  }
  else {
    window.webContents.send('kernelData', result)
  }
}
//define the stdout listener for the kernel process


async function selectRepo (event) {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  
  const result = {
    type : 'selectRepo',
    callback : false,
    windowId : windowId,
    repoPath : filePaths[0]
  }

  if (!canceled) {
    if(kernel.pid && !kernel.killed) {
      console.log(JSON.stringify(result))
      // kernel.stdin.write(JSON.stringify(result) + '\n')
      return result.repoPath
    }
  }
}
//select the repository path


function query(event, query) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const result = {
    type : 'query',
    callback : true,
    windowId : windowId,
    content : query
  }
  if(kernel.pid && !kernel.killed) {
    console.log(JSON.stringify(result))
    // kernel.stdin.write(JSON.stringify(result) + '\n')
  }
}
//send a query to the kernel


function createWindow () {
  const windowId = Date.now()// use timestamp as windowId
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  const startUrl = isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../../build/index.html')}`  

  mainWindow.loadURL(startUrl)

  windows.set(windowId, mainWindow)//add the window to the map

  mainWindow.on('closed', () => {
    windows.delete(windowId)
  })//delete the window from the map when closed
}



function getWindowId (window) {
  for(const [id, win] of windows.entries()) {
    if(win === window) {
      return id
    }
  }
  return null
}
//get the windowId from the window object


app.whenReady().then(() => {
  ipcMain.handle('createNewWindow', createWindow)
  ipcMain.handle('selectRepo', selectRepo)
  ipcMain.on('query', query)
  //add the event listeners before the window is created

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })// for macOS

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
  })// for macOS
})


app.on('quit', () => {
  if (kernel.pid && !kernel.killed) {
    kernel.kill();
    kernel.removeAllListeners('error')
    console.log('Kernel process killed and listeners removed')
  }
})//kill the kernel process when the app is closed
