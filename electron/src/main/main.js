const { app, BrowserWindow, ipcMain, dialog, screen} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const EventEmitter = require('events')
//import electron and node modules


const kernelPath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
let restartTime = 0
let kernel = spawn(kernelPath, [], {
  cwd: path.dirname(kernelPath) // set work directory to the same as the kernel path
})
let isKernelRunning = true
let isKernelManualKill = false
kernel.on('error', (err) => {
  console.error('Failed to start kernel:', err)
  isKernelRunning = false
  restartKernel()
})
kernel.on('exit', (code, signal) => {
  console.log(`Kernel exited with code ${code} and signal ${signal}`)
  isKernelRunning = false
  if(!isKernelManualKill){
    if(code !== 0){
      restartKernel()
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

const dateNow = Date.now()
const windows = new Map()
const callbacks = new Map()
const eventEmitter = new EventEmitter()
const readyPromise = new Promise((resolve, reject) => {
  eventEmitter.on('kernelReady', () => {
    resolve()
  })
})
const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || !app.isPackaged


function restartKernel (){
  restartTime++
  if(restartTime > 3){
    dialog.showMessageBox({
      type: 'error',
      title : 'restart failed',
      message : 'kernel restarted too many times, so the program is about to shut'
    }).then(() => {
      app.quit()
    })
    return
  }
  if(kernel){
    isKernelManualKill = true
    kernel.kill()
  }
  kernel = spawn(kernelPath, [], {
    cwd: path.dirname(kernelPath)
  })
  isKernelRunning = true
  kernel.stdout.on('data', stdoutListener)
  kernel.stderr.on('data', (err) => {
    console.error(err.toString())
  })
  kernel.on('error', (err) => {
    console.error('Failed to start kernel:', err)
    isKernelRunning = false
    restartKernel()    
  })
  kernel.on('exit', (code, signal) => {
    console.log(`Kernel exited with code ${code} and signal ${signal}`)
    isKernelRunning = false    
    if(!isKernelManualKill){
      if(code !== 0){
        restartKernel()
      }
      else {
        app.quit()
      }
    }
    isKernelManualKill = false
  })
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
                  console.error('Window not found from sessionId: ' + result.message.sessionId)
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
                restartKernel()
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
    await initializeRepo(sessionId, repoName, repoPath)
    BrowserWindow.fromWebContents(event.sender).close()
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
  const callbackId = callbackRegister(() => {})

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
    message : error
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
  const deleteRepo = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'deleteRepo',
      repoName : repoName,
    }
  }
  kernel.stdin.write(JSON.stringify(deleteRepo) + '\n')
  console.log(JSON.stringify(deleteRepo) + '\n')
}


function createWindow (event, windowType = 'repoList') {
  const {width: srceenWidth, height: screenHeight} = screen.getPrimaryDisplay().workAreaSize
  const windowId = Date.now() - dateNow// use timestamp as windowId
  let window
  switch(windowType){
    case 'main':
      window = new BrowserWindow({
        width: Math.floor(srceenWidth * 0.8),
        height: Math.floor(screenHeight * 0.9),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      })
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
      window = new BrowserWindow({
        width: Math.floor(srceenWidth * 0.5),
        height: Math.floor(srceenWidth * 0.5),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      })
      window.on('closed', () => {
        windows.delete(windowId)
      })
      break

    case 'settings':
      window = new BrowserWindow({
        width: Math.floor(srceenWidth * 0.6),
        height: Math.floor(srceenWidth * 0.6),
        autoHideMenuBar: true,
        parent : BrowserWindow.fromWebContents(event.sender),
        modal: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js')
        }
      })
      window.on('closed', () => {
        windows.delete(windowId)
      })
      break 

  }

  const startUrl = isDev
      ? `http://localhost:3000?windowType=${windowType}&windowId=${windowId}`
      : `file://${path.join(__dirname, '../../build/index.html')}?windowType=${windowType}&windowId=${windowId}`  

  windows.set(windowId, window)//add the window to the map

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


async function getReadyPromise (){
  return readyPromise
}

async function getDateNow (){
  return dateNow
}

app.whenReady().then(async () => {
  ipcMain.handle('createNewWindow', createWindow)
  ipcMain.on('getRepos', getRepos)
  ipcMain.on('openRepo', openRepo)
  ipcMain.on('createRepo', createRepo)
  ipcMain.on('search', search)
  ipcMain.on('sessionPreparedReply', sessionPreparedReply)
  ipcMain.handle('kernelReadyPromise', getReadyPromise)
  ipcMain.on('embeddingStatusReply', embeddingStatusReply)
  ipcMain.handle('dateNow', getDateNow)
  ipcMain.on('sessionCrashed', sessionCrashedHandler)
  ipcMain.on('beginConversation', beginConversation)
  ipcMain.on('stopConversation', stopConversation)
  ipcMain.on('deleteRepo', deleteRepo)
  ipcMain.on('restartSession', restartSession)
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


