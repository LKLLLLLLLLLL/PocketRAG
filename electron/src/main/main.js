const { app, BrowserWindow, ipcMain, dialog, screen} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const EventEmitter = require('events')
const fs = require('node:fs')
//import electron and node modules

const userDataPath = /*app.getPath('userData')*/ path.join(__dirname, '..', '..', '..', 'tests')
const stateFile = path.join(userDataPath, 'windowState.json')
const platform = process.platform
const dateNow = Date.now()
const windows = new Map()
const callbacks = new Map()
const eventEmitter = new EventEmitter()
const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || !app.isPackaged
console.log('stateFile is: ', stateFile)

let kernelPath
if (platform === 'win32') {
  kernelPath = path.join(__dirname, '..','..','..','kernel','bin','PocketRAG_kernel.exe')
} else if (platform === 'darwin') {
  kernelPath = path.join(__dirname, '..','..','..','kernel','bin','PocketRAG_kernel')
} else {
  kernelPath = path.join(__dirname, '..','..','..','kernel','bin','PocketRAG_kernel')
}
let restartTime = 0
let kernel
let isKernelRunning
let isKernelManualKill = false
let hasShownErrorDialog = false
let readyPromise = new Promise((resolve, reject) => {
  const kernelReadyListener = () => {
    eventEmitter.off('kernelReady', kernelReadyListener)
    resolve()
  }
  eventEmitter.on('kernelReady', kernelReadyListener)
})


function restartKernel (isKernelError){
  restartTime++
  if(BrowserWindow.getAllWindows().length === 0 && !isKernelError){
    app.quit()
    return
  }
  console.log('restarting kernel...', 'restartTime: ', restartTime)
  if(restartTime > 3){
    if(!hasShownErrorDialog) {
      hasShownErrorDialog = true
      dialog.showMessageBox({
        type: 'error',
        title : 'restart failed',
        message : 'kernel restarted too many times, so the program is about to shut'
      }).then(() => {
        app.quit()
      })
    }
    return
  }
  if(kernel){
    isKernelManualKill = true
    kernel.kill()
  }
  kernel = spawn(kernelPath, [], {
    cwd: path.dirname(kernelPath),
    env: {
      POCKETRAG_USERDATA_PATH: userDataPath
    }
  })
  isKernelRunning = true
  readyPromise = new Promise((resolve, reject) => {
    eventEmitter.removeAllListeners('kernelReady') // remove all previous listeners
    const kernelReadyListener = () => {
      eventEmitter.off('kernelReady', kernelReadyListener)
      resolve()
    }
    eventEmitter.on('kernelReady', kernelReadyListener)
  })

  kernel.stdout.on('data', stdoutListener)
  kernel.stderr.on('data', (err) => {
    console.error(err.toString())
  })
  kernel.on('error', (err) => {
    console.error('Failed to start kernel:', err)
    isKernelRunning = false
    restartKernel(true)    
  })
  kernel.on('exit', (code, signal) => {
    console.log(`Kernel exited with code ${code} and signal ${signal}`)
    isKernelRunning = false    
    if(!isKernelManualKill){
      if(code !== 0){
        restartKernel(false)
      }
      else {
        app.quit()
      }
    }
    isKernelManualKill = false
  })

  restartAllRepos()
}


async function restartAllRepos() {
  for(const [id, window] of windows.entries()){
    const repoName = await window.webContents.executeJavaScript('window.repoName')
    if(repoName){
      console.log('restarting window with id: ', id, ' and repoName: ', repoName)
      const callbackId = callbackRegister(() => {})
      const openRepo = {
        sessionId : -1,
        toMain : true,

        callbackId : callbackId,
        isReply : false,

        message : {
          type : 'openRepo',
          repoName : repoName,
          sessionId : id
        }
      }
      await readyPromise
      kernel.stdin.write(JSON.stringify(openRepo) + '\n')
      console.log(JSON.stringify(openRepo) + '\n')
    }
  }
}


const callbackRegister = (callback) => {
  const callbackId = Date.now() - dateNow
  callbacks.set(callbackId, callback)
  return callbackId
}


let buffer = ''
async function stdoutListener (data) {
  buffer += data.toString()
  let lines = buffer.split('\n')
  buffer = lines.pop()
  console.log('the buffer is: ', buffer)

  for(const line of lines){
    if(line.trim()){
      try{
        console.log(line)
        const result = JSON.parse(line)
        console.log(result)
        if(result.toMain){
          switch(result.message.type) {
            case 'stopAll':
              if(result.isReply){
                if(result.status.code === 'SUCCESS'){
                  callbacks.delete(result.callbackId)
                }
                else {
                  console.error(result.status.message)
                  callbacks.delete(result.callbackId)
                }                
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'getRepos':
              if(result.isReply){
                const window = windows.get(result.message.sessionId)
                if(!window){
                  console.error('Window not found from sessionId: ' + result.message.sessionId + ', the whole message is: ' + result)
                }
                else {
                  window.webContents.send('kernelData', result)
                }                
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'openRepo':
              if(result.isReply){
                if(result.status.code === 'SUCCESS'){
                  const callback = callbacks.get(result.callbackId)
                  callback(result.data.repoName, result.data.path)
                  callbacks.delete(result.callbackId)
                }
                else {
                  console.error(result.status.message)
                  callbacks.delete(result.callbackId)
                }                
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'closeRepo':
              if(result.isReply){
                if(result.status.code === 'SUCCESS'){
                callbacks.delete(result.callbackId)
                }
                else {
                  console.error(result.status.message)
                  callbacks.delete(result.callbackId)
                }                
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'createRepo':
              if(result.isReply){
                if(result.status.code === 'SUCCESS'){
                  const window = windows.get(result.message.sessionId)
                  if(!window){
                    console.error('Window not found from sessionId: ' + result.message.sessionId + ', the whole message is: ' + result)
                  }
                  else {
                    window.webContents.send('kernelData', result)
                  }
                  callbacks.delete(result.callbackId)
                }
                else {
                  console.error(result.status.message)
                  callbacks.delete(result.callbackId)
                }                
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'ready':
              if(!result.isReply){
                let reply = result
                eventEmitter.emit('kernelReady')
                reply.isReply = true
                reply.status = {
                  code : 'SUCCESS',
                  message : ''
                }
                kernel.stdin.write(JSON.stringify(reply) + '\n')
                console.log(JSON.stringify(reply) + '\n')                
              }
              else {
                console.error('isReply may be wrong, expected: false, but the result is: ', result)
              }
              break
            case 'deleteRepo':
              if(result.isReply){
                if(result.status.code === 'SUCCESS'){
                  const window = windows.get(result.message.sessionId)
                  if(!window){
                    console.error('Window not found from sessionId: ' + result.message.sessionId + ', the whole message is: ' + result)
                  }
                  else {
                    window.webContents.send('kernelData', result)
                  }
                  callbacks.delete(result.callbackId)
                }
                else{
                  console.error(result.status.message)
                  callbacks.delete(result.callbackId)
                }
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'kernelServerCrashed':
              if(!result.isReply){
                console.error(result.message.error)
                isKernelRunning = false
                restartKernel(false)
              }
              else {
                console.error('isReply may be wrong, expected: false, but the result is: ', result)
              }
              break

          }
        }
        else {
          const window = windows.get(result.sessionId)

          if(!window) {
            console.error('Window not found from sessionId: ' + result.sessionId + ', the whole message is: ', result)
          }
          else {
            window.webContents.send('kernelData', result)
          } 
        }
      } catch(err){
        console.error(err)
      }
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
      sessionId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(getRepos) + '\n')
  console.log(JSON.stringify(getRepos) + '\n')
}


function openRepo (event, sessionId, repoName){
  const callbackId = callbackRegister(async (repoName, repoPath) => {
    BrowserWindow.fromWebContents(event.sender).close()
    await initializeRepo(sessionId, repoName, repoPath)
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
  console.log(JSON.stringify(openRepo) + '\n')
}


async function initializeRepo (sessionId, repoName, repoPath){
  const window = windows.get(sessionId)
  if(window){
    await window.webContents.executeJavaScript(`
      window.repoName = ${JSON.stringify(repoName)};
      window.repoPath = ${JSON.stringify(repoPath)};
      `)
    window.webContents.send('repoInitialized')    
  }
  else {
    console.error('Window not found from sessionId: ', sessionId)
  }
}


async function createRepo (event) {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))

  if (!canceled) {
    const callbackId = callbackRegister(() => {})
    const createRepo = {
      sessionId : -1,
      toMain : true,

      callbackId : callbackId,
      isReply : false,

      message : {
        type : 'createRepo',
        repoName : path.basename(filePaths[0]),
        path : filePaths[0],
        sessionId : windowId
      }
    }
    kernel.stdin.write(JSON.stringify(createRepo) + '\n')    
    console.log(JSON.stringify(createRepo) + '\n')
  }
}



function search(event, callbackId, query, accuracy) {
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const search = {
    sessionId : sessionId,
    toMain : false,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'search',
      query : query,
      accuracy : accuracy
    }
  }
  kernel.stdin.write(JSON.stringify(search) + '\n')
  console.log(JSON.stringify(search) + '\n')
}


function sessionPreparedReply(event, reply){
  kernel.stdin.write(JSON.stringify(reply) + '\n')
  console.log(JSON.stringify(reply) + '\n')
}


function embeddingStatusReply(event, reply){
  kernel.stdin.write(JSON.stringify(reply) + '\n')
  console.log(JSON.stringify(reply) + '\n')
}


function sessionCrashedHandler(event, error){
  const window = BrowserWindow.fromWebContents(event.sender)
  dialog.showMessageBoxSync(window, {
    type : 'error',
    title : 'session crashed',
    message : error,
    modal : true
  })
  window.close()
}


function restartSession(event, repoName){
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const callbackId = callbackRegister(() => {})
  const restartSession = {
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
  kernel.stdin.write(JSON.stringify(restartSession) + '\n')
  console.log(JSON.stringify(restartSession) + '\n')
}


function beginConversation(event, callbackId, modelName, conversationId, query){
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const beginConversation = {
    sessionId : sessionId,
    toMain : false,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'beginConversation',
      modelName: modelName,
      conversationId : conversationId,
      query : query
    }
  }
  kernel.stdin.write(JSON.stringify(beginConversation) + '\n')
  console.log(JSON.stringify(beginConversation) + '\n')
}


function stopConversation(event, callbackId, conversationId){
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const stopConversation = {
    sessionId : sessionId,
    toMain : false,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'stopConversation',
      conversationId : conversationId
    }
  }
  kernel.stdin.write(JSON.stringify(stopConversation) + '\n')
  console.log(JSON.stringify(stopConversation) + '\n')
}


function deleteRepo (event, repoName){
  const callbackId = callbackRegister(() => {})
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const deleteRepo = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'deleteRepo',
      repoName : repoName,
      sessionId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(deleteRepo) + '\n')
  console.log(JSON.stringify(deleteRepo) + '\n')
}

function getApiUsage(event, callbackId) {
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const getApiUsage = {
    sessionId : sessionId,
    toMain : false,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'getApiUsage'
    }
  }
  kernel.stdin.write(JSON.stringify(getApiUsage) + '\n')
  console.log(JSON.stringify(getApiUsage) + '\n')
}


async function saveWindowState(window, windowType) {
  if (!window) return
  const bounds = window.getBounds()
  const repoName = await window.webContents.executeJavaScript('window.repoName')
  const repoPath = await window.webContents.executeJavaScript('window.repoPath')
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
    windowType : windowType,
    repoName: repoName,
    repoPath: repoPath
  }
  fs.writeFileSync(stateFile, JSON.stringify(state))
  console.log('Window state saved:', state)  
}


function createWindow (event, windowType = 'repoList', windowState = null) {
  const {width: srceenWidth, height: screenHeight} = screen.getPrimaryDisplay().workAreaSize
  const windowId = Date.now() - dateNow// use timestamp as windowId
  let window
  switch(windowType){
    case 'main':
      let mainOptions = {
        width: Math.floor(srceenWidth * 0.8),
        height: Math.floor(screenHeight * 0.9),     
        frame: false,
        autoHideMenuBar: true,   
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      }
      if(windowState && !windowState.isMaximized) {
        mainOptions.x = windowState.x
        mainOptions.y = windowState.y
        mainOptions.width = windowState.width
        mainOptions.height = windowState.height
      }
      if(platform === 'win32') {
        mainOptions.titleBarOverlay = {
          color: '#2f3241',
          symbolColor: '#74b1be',
          height: 20
        }
        mainOptions.titleBarStyle = 'hidden'        
      }
      else {
        mainOptions.titleBarStyle = 'hiddenInset'
        mainOptions.trafficLightPosition = { x: 10, y: 10 }
      }
      window = new BrowserWindow(mainOptions)
      if(windowState && windowState.isMaximized) {
        window.maximize()
      }
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
        console.log(JSON.stringify(closeRepo) + '\n')
        windows.delete(windowId)
      })
    break
    
    case 'repoList':
      let repoListOptions = {
        width: Math.floor(srceenWidth * 0.4),
        height: Math.floor(srceenWidth * 0.3),
        frame: false,
        maximizable: false,
        fullscreenable: false,
        resizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      }
      if(windowState) {
        repoListOptions.x = windowState.x
        repoListOptions.y = windowState.y
        repoListOptions.width = windowState.width
        repoListOptions.height = windowState.height
      }
      if(platform === 'win32') {
        repoListOptions.titleBarOverlay = {
          color: '#2f3241',
          symbolColor: '#74b1be',
          height: 20
        }
        repoListOptions.titleBarStyle = 'hidden'
      }
      else {
        repoListOptions.titleBarStyle = 'hiddenInset'
        repoListOptions.trafficLightPosition = { x: 10, y: 10 }
      }
      window = new BrowserWindow(repoListOptions)
      window.on('closed', () => {
        windows.delete(windowId)
      })
      break

    case 'settings':
      let settingsOptions = {
        x: Math.floor(srceenWidth * 0.25),
        y: Math.floor(screenHeight * 0.1),
        width: Math.floor(srceenWidth * 0.5),
        height: Math.floor(screenHeight * 0.85),
        frame: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        resizable: false,
        autoHideMenuBar: true,
        parent : BrowserWindow.fromWebContents(event.sender),
        modal: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }        
      }
      window = new BrowserWindow(settingsOptions)
      window.on('closed', () => {
        windows.delete(windowId)
      })
      break 

  }

  window.on('close', async () => {
    saveWindowState(window, windowType)
    const windowCallbacks = await window.webContents.executeJavaScript('window.callbacks')
    console.log('windowCallbacks\' final size: ', windowCallbacks.size)
  })
  console.log('create window with windowId: ', windowId, ' and windowType: ', windowType)

  const startUrl = isDev
      ? `http://localhost:3000?windowType=${windowType}&windowId=${windowId}`
      : `file://${path.join(__dirname, '..','..','build','index.html')}?windowType=${windowType}&windowId=${windowId}`  

  windows.set(windowId, window)//add the window to the map

  window.loadURL(startUrl)

  return windowId
}


async function createFirstWindow() {
  try {
    const data = fs.readFileSync(stateFile, 'utf-8')
    let lastState = JSON.parse(data)
    console.log('lastState is: ', lastState)
    const windowType = lastState.windowType
    const repoName = lastState.repoName
    const repoPath = lastState.repoPath
    if(windowType !== 'main' && windowType !== 'repoList' && windowType !== 'settings') {
      throw new Error('cannot get windowType')
    }
    if(windowType === 'main' && (!repoName || !repoPath)) {
      throw new Error('cannot get repoName or repoPath')
    }
    const windowId = createWindow(null, windowType, lastState)
    if(windowType === 'main') {
      const callbackId = callbackRegister(async () => {
        await initializeRepo(windowId, repoName, repoPath)
      })
      const openRepo = {
        sessionId : -1,
        toMain : true,

        callbackId : callbackId,
        isReply : false,

        message : {
          type : 'openRepo',
          repoName : repoName,
          sessionId : windowId
        }
      }
      await readyPromise
      kernel.stdin.write(JSON.stringify(openRepo) + '\n')
      console.log(JSON.stringify(openRepo) + '\n')
    }
  } catch(err) {
    console.log(err)
    createWindow()
  }
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


async function getReadyPromise() {
  return readyPromise
}

async function pathJoin(event, ...paths) {
  return path.join(...paths)
}

function closeWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  window.close()
}

function maximizeWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  if(window.isMaximized()){
    window.unmaximize()
  }
  else {
    window.maximize()
  }
}

function minimizeWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  window.minimize()
}

function showMessageBoxSync(event, content) {
  const window = BrowserWindow.fromWebContents(event.sender)
  dialog.showMessageBoxSync(window, content)
}

function generateTree(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true }).filter(item => !item.name.startsWith('.'))
    return items.map((item) => {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          return {
            title: item.name,
            key: fullPath,
            children: generateTree(fullPath)
          }
        } else if (item.isFile()) {
          return {
            title: item.name,
            key: fullPath,
            isLeaf: true
          }
        }
      }).filter(Boolean)
}

function getRepoFileTree(event, repoPath) {
  let fileTreeData = generateTree(repoPath)
  fileTreeData = [
    {
      title: path.basename(repoPath),
      key: repoPath,
      children: fileTreeData
    }
  ]
  return fileTreeData
}

/*function updateFile(event, action, filePath, title, treeData, selectNode) {
  switch(action) {
    case 'create':

  }
}*/

app.whenReady().then(async () => {
  ipcMain.handle('createNewWindow', createWindow)
  ipcMain.on('getRepos', getRepos)
  ipcMain.on('openRepo', openRepo)
  ipcMain.on('createRepo', createRepo)
  ipcMain.on('search', search)
  ipcMain.on('sessionPreparedReply', sessionPreparedReply)
  ipcMain.handle('kernelReadyPromise', getReadyPromise)
  ipcMain.on('embeddingStatusReply', embeddingStatusReply)
  ipcMain.on('sessionCrashed', sessionCrashedHandler)
  ipcMain.on('beginConversation', beginConversation)
  ipcMain.on('stopConversation', stopConversation)
  ipcMain.on('deleteRepo', deleteRepo)
  ipcMain.on('restartSession', restartSession)
  ipcMain.handle('pathJoin', pathJoin)
  ipcMain.handle('closeWindow', closeWindow)
  ipcMain.handle('maximizeWindow', maximizeWindow)
  ipcMain.handle('minimizeWindow', minimizeWindow)
  ipcMain.handle('showMessageBoxSync', showMessageBoxSync)
  ipcMain.on('getApiUsage', getApiUsage)
  ipcMain.handle('getRepoFileTree', getRepoFileTree)
  // ipcMain.on('updateFile', updateFile)
  //add the event listeners before the window is created

  kernel = spawn(kernelPath, [], {
    cwd: path.dirname(kernelPath), // set work directory to the same as the kernel path
    env: {
      POCKETRAG_USERDATA_PATH: userDataPath
    }
  })
  isKernelRunning = true
  kernel.on('error', (err) => {
    console.error('Failed to start kernel:', err)
    isKernelRunning = false
    restartKernel(true)
  })
  kernel.on('exit', (code, signal) => {
    console.log(`Kernel exited with code ${code} and signal ${signal}`)
    isKernelRunning = false
    if(!isKernelManualKill){
      if(code !== 0){
        restartKernel(false)
      }
      else {
        app.quit()
      }    
    }
    isKernelManualKill = false
  })
  kernel.stdout.on('data', stdoutListener)//kernel stdout listener
  kernel.stderr.on('data', (err) => {
    console.error(err.toString())
  })

  createFirstWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })// for macOS

  app.on('window-all-closed', function () {
    if (platform !== 'darwin') app.quit()
  })// for macOS
})


app.on('will-quit', (event) => {
  console.log('isKernelRunning: ', isKernelRunning)
  if (isKernelRunning) {
    const callbackId = Date.now() - dateNow
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
    console.log(JSON.stringify(stopAll) + '\n')
    event.preventDefault()
  }
  console.log('callbacks\' final size: ', callbacks.size)
  console.log('windows\' final size: ', windows.size)
})


