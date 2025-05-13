const { app, BrowserWindow, ipcMain, dialog} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
//import electron and node modules


const kernelPath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
const kernel = spawn(kernelPath, [], {
  cwd: path.dirname(kernelPath) // set work directory to the same as the kernel path
});
let isKernelRunning = true
kernel.on('error', (err) => {
  console.error('Failed to start kernel:', err)
  isKernelRunning = false
  app.quit()
})
kernel.on('exit', (code, signal) => {
  console.log(`Kernel exited with code ${code} and signal ${signal}`)
  isKernelRunning = false
  app.quit()
})
kernel.stdout.on('data', stdoutListener)//kernel stdout listener
kernel.stderr.on('data', (err) => {
  console.error(err)
})

const windows = new Map()
const callbacks = new Map()

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || !app.isPackaged


const callbackRegister = (callback) => {
  const callbackId = Date.now()
  callbacks.set(callbackId, callback)
  return callbackId
}


async function stdoutListener (data) {
  const result = JSON.parse(data.toString())
  console.log(result)
  if(result.toMain){
    switch(result.message.type) {
      case 'stopAll':
        if(result.status.code === 'SUCCESS'){
          callbacks.delete(result.callbackId)
        }
        else {
          console.error(result.status.message)
          callbacks.delete(result.callbackId)
        }
        break
      case 'getRepos':
        const window = windows.get(result.message.windowId)
        if(!window){
          console.error('Window not found from windowId: ' + result.message.windowId)
        }
        else {
          window.webContents.send('kernelData', result)
        }
        break
      case 'openRepo':
        if(result.status.code === 'SUCCESS'){
          const callback = callbacks.get(result.callbackId)
          callback(result.data.repoName, result.data.path)
          callbacks.delete(result.callbackId)
        }
        else {
          console.error(result.status.message)
          callbacks.delete(result.callbackId)
        }
        break
      case 'closeRepo':
        if(result.status.code === 'SUCCESS'){
          callbacks.delete(result.callbackId)
        }
        else {
          console.error(result.status.message)
          callbacks.delete(result.callbackId)
        }
        break
      case 'createRepo':
        if(result.status.code === 'SUCCESS'){
          callbacks.delete(result.callbackId)
        }
        else {
          console.error(result.status.message)
          callbacks.delete(result.callbackId)
        }
        break
      
    }
  }
  else {
    const window = windows.get(result.windowId)

    if(!window) {
      console.error('Window not found from windowId: ' + result.windowId)
    }
    else {
     window.webContents.send('kernelData', result)
    } 
  }

}
//define the stdout listener for the kernel process


function getRepos (event, callbackId) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const getRepos = {
    sessionId : -1,
    toMain : true,
  
    callbackId : callbackId,
    isReply : false,
  
    message : {
      type : 'getRepos',
      windowId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(getRepos) + '\n')
}


function openRepo (event, sessionId, repoName){
  const callbackId = callbackRegister(async (repoName, repoPath) => {
    await initializeRepo(sessionId, repoName, repoPath)
    const sessionWindow = windows.get(sessionId)
    sessionWindow.close()
  })

  const openRepo = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'openRepo',
      repoName : repoName,
      sessionId : sessionId
    }
  }
  kernel.stdin.write(JSON.stringify(openRepo) + '\n')
}


async function initializeRepo (sessionId, repoName, repoPath){
  const window = windows.get(sessionId)
  await window.webContents.executeJavaScript(`
    window.repoName = ${repoName};
    window.repoPath = ${repoPath};
    `)
  window.webContents.send('repoInitialized')
}


async function createRepo (event, callbackId) {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})

  if (!canceled) {
    const createRepo = {
      sessionId : -1,
      toMain : true,

      callbackId : callbackId,
      isReply : false,

      message : {
        type : 'createRepo',
        repoName : path.basename(filePaths[0]),
        path : filePaths[0]
      }
    }
    kernel.stdin.write(JSON.stringify(createRepo) + '\n')    
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


function createWindow (event, windowType = 'repoList') {
  const windowId = Date.now()// use timestamp as windowId
  let window
  switch(windowType){
    case 'main':
      window = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      })
      windows.set(windowId, window)
      window.on('closed', () => {
        const callbackId = callbackRegister(() => {})
        const closeRepo = {
          sessionId : -1,
          toMain : true, 

          callbackId : callbackId,
          isReply : false,

          message : {
            type : 'closeRepo',
            sessionId : windowId,
          }
        }
        kernel.stdin.write(JSON.stringify(closeRepo) + '\n')
        windows.delete(windowId)
      })
    break
    
    case 'repoList':
      window = new BrowserWindow({
        width: 600,
        height: 700,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      })
  }

  const startUrl = isDev
      ? `http://localhost:3000?windowType=${windowType}&windowId=${windowId}`
      : `file://${path.join(__dirname, '../../build/index.html')}?windowType=${windowType}&windowId=${windowId}`  

  windows.set(windowId, window)//add the window to the map
  window.on('closed', () => {
    windows.delete(windowId)
  })//delete the window from the map when closed

  window.loadURL(startUrl)

  return windowId
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
  ipcMain.on('getRepos', getRepos)
  ipcMain.on('openRepo', openRepo)
  ipcMain.on('createRepo', createRepo)
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


app.on('will-quit', (event) => {
  if (kernel.pid && isKernelRunning) {
    const callbackId = Date.now()
    const stopAll = {
      sessionId : -1,
      toMain : true,

      callbackId : callbackId,
      isReply : false,

      message : {
        type : 'stopAll'
      }
    }
    kernel.stdin.write(JSON.stringify(stopAll) + '\n')
    event.preventDefault()
  }
})


