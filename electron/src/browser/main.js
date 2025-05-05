const { app, BrowserWindow, ipcMain, dialog} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const fs = require('node:fs')

const kernelPath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
const kernel = spawn(kernelPath)
kernel.on('error', (err) => {
  console.error('Failed to start kernel:', err)
  app.quit()
})
kernel.stdout.on('data', stdoutListener)
const windows = new Map()


async function stdoutListener (data) {
  const result = JSON.parse(data.toString())
  const window = windows.get(result.windowId)

  if(!window) {
    throw new Error('Window not found from windowId: ' + result.windowId)
  }
  else {
    switch(result.type) {
      case 'query':
        window.webContents.send('queryResult', result.result)
        break
      case 'embedding':
        window.webContents.send('embedding', result.result)
        break
    }
  }
}


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


async function addFile (event, repoPath) {
  const {canceled, filePaths} = await dialog.showOpenDialog({})
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  let isexist = false

  if(!canceled){
    if(kernel.pid && !kernel.killed) {
      const destPath = path.join(repoPath, path.basename(filePaths[0]))
      try{
        fs.accessSync(destPath, fs.constants.F_OK)
        isexist = true
      }catch (err){
        isexist = false
      }
      if(isexist) {
        return '文件已存在，请重命名'
      }
      else {
        try {
          fs.copyFileSync(filePaths[0], destPath)
          console.log('add success')
          const result = {
            type : 'addFile',
            callback : false,
            windowId : windowId,
            filePath : destPath
          }
          console.log(JSON.stringify(result))
          // kernel.stdin.write(JSON.stringify(result) + '\n')
          return result.filePath
        }catch(err) {
          return '文件添加失败'
        }
      }
    }
  }
}


async function removeFile (event, repoPath) {
  const {canceled, filePaths} = await dialog.showOpenDialog({defaultPath : repoPath})
  if(!canceled) {
    if(path.dirname(filePaths[0]) !== repoPath){
      return '文件不在当前仓库中，请重新选择'
    }
    else {
      if(kernel.pid && !kernel.killed) {
        try {
          fs.unlinkSync(filePaths[0])
          console.log('remove success')
          const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
          const result = {
            type : 'removeFile',
            callback : false,
            windowId : windowId,
            filePath : filePaths[0]
          }
          console.log(JSON.stringify(result))
          // kernel.stdin.write(JSON.stringify(result) + '\n')
          return result.filePath
        }catch(err) {
          return '文件删除失败'
        }
      }
    }
  }
}


async function selectEmbeddingModel(event, embeddingModel) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const result = {
    type : 'selectEmbeddingModel',
    callback : false,
    windowId : windowId,
    embeddingModelPath : embeddingModel
  }
  if(kernel.pid && !kernel.killed) {
    try{
      console.log(JSON.stringify(result))
      //kernel.stdin.write(JSON.stringify(result) + '\n')
    }catch(err) {
      return '模型选择失败'
    }
  }
}

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


function createWindow () {
  const windowId = Date.now()
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('electron/src/renderer/index.html')

  windows.set(windowId, mainWindow)

  mainWindow.on('closed', () => {
    windows.delete(windowId)
  })
}


function getWindowId (window) {
  for(const [id, win] of windows.entries()) {
    if(win === window) {
      return id
    }
  }
  return null
}


app.whenReady().then(() => {
  ipcMain.handle('createNewWindow', createWindow)
  ipcMain.handle('selectRepo', selectRepo)
  ipcMain.handle('addFile', addFile)
  ipcMain.handle('removeFile', removeFile)
  ipcMain.handle('selectEmbeddingModel', selectEmbeddingModel)
  ipcMain.on('query', query)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
  })
})


app.on('quit', () => {
  if (kernel.pid && !kernel.killed) {
    kernel.kill();
    kernel.removeAllListeners('error')
    console.log('Kernel process killed and listeners removed')
  }
})
