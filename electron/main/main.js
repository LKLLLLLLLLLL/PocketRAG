const { app, BrowserWindow, ipcMain, dialog, screen} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const EventEmitter = require('events')
const fs = require('node:fs')
const {generateInstallationId} = require('./getInstallationId.js')
//import electron and node modules and self-defined modules

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || !app.isPackaged
const userDataPath = isDev
  ? path.join(__dirname, '..', '..', 'tests')
  : app.getPath('userData')
const stateFile = path.join(userDataPath, 'windowState.json')
const platform = process.platform
const dateNow = Date.now()
const windows = new Map()
const callbacks = new Map()
const eventEmitter = new EventEmitter()
const installationId = generateInstallationId()
// define global constants such as isDev -- is developer mode, dateNow -- to generate timestamp, callbacks -- to manage callbacks(may be redundant), windows -- to manage electron windows, installationId -- to avoid opening windows out-of-date and eventEmitter -- to communicate with main.js itself

if(!isDev) {
  //only on developer mode can console.log and console.error be used
  console.log = () => {}
  console.error = () => {}
}

function getBackendPath() {
  const exeName = process.platform === 'win32' ? 'PocketRAG_kernel.exe' : 'PocketRAG_kernel'

  if (isDev) {
    return path.join(__dirname, '..', '..', 'kernel', 'bin', exeName)
  } else {
    return path.join(process.resourcesPath, 'bin', exeName)
  }
}

let kernelPath = getBackendPath()
let restartTime = 0 // once > 3, quit the whole app
let kernel
let isKernelRunning
let isKernelManualKill = false // avoid kernel.kill() method in restartKernel method quitting the whole app
let hasShownErrorDialog = false // avoid showing error dialog more than once
let readyPromise = new Promise((resolve, reject) => {
  const kernelReadyListener = () => {
    eventEmitter.off('kernelReady', kernelReadyListener)
    resolve()
  }
  eventEmitter.on('kernelReady', kernelReadyListener)
}) // define variables to manage the kernel process


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
      const callbackId = callbackRegister()
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
                  callbacks.delete(result.callbackId)
                }
                else {
                  console.error(result.status.message)
                  const window = windows.get(result.message.sessionId)
                  if(!window) {
                    console.error('Window not found from sessionId: ' + result.message.sessionId + ', the whole message is: ' + result)
                  }
                  else {
                    dialog.showMessageBoxSync(window, {
                      type : 'error',
                      title : result.status.code,
                      message : result.status.message,
                      modal : true
                    })
                    window.close()
                    createWindow()
                  }
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
            case 'checkSettings':
              if(result.isReply) {
                const window = windows.get(result.message.windowId)
                if(!window) {
                  console.error('Window not found from sessionId: ' + result.message.windowId + ', the whole message is: ' + result)
                }
                else {
                  window.webContents.send('kernelData', result)
                }
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'updateSettings':
              if(result.isReply) {
                if(result.status.code === 'SUCCESS') {
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
            case 'setApiKey':
              if(result.isReply) {
                if(result.status.code === 'SUCCESS') {
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
            case 'getApiKey':
              if(result.isReply) {
                const window = windows.get(result.message.windowId)
                if(!window) {
                  console.error('Window not found from sessionId: ' + result.message.windowId + ', the whole message is: ' + result)
                }
                else {
                  window.webContents.send('kernelData', result)
                }
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'testApi':
              if(result.isReply) {
                const window = windows.get(result.message.windowId)
                if(!window) {
                  console.error('Window not found from sessionId: ' + result.message.windowId + ', the whole message is: ' + result)
                }
                else {
                  window.webContents.send('kernelData', result)
                }
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
              }
              break
            case 'getAvailableHardware':
              if(result.isReply) {
                const window = windows.get(result.message.windowId)
                if(!window) {
                  console.error('Window not found from sessionId: ' + result.message.windowId + ', the whole message is: ' + result)
                }
                else {
                  window.webContents.send('kernelData', result)
                }
              }
              else {
                console.error('isReply may be wrong, expected: true, but the result is: ', result)
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
//define the stdout listener for the kernel process and communicate with the renderer process if necessary


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


async function openRepoCheck(event, repoName) {
  for(const [id, window] of windows.entries()) {
    const opendedRepoName = await window.webContents.executeJavaScript('window.repoName')
    if(opendedRepoName === repoName) {
      window.focus()
      return true
    }
  }
  return false
}// avoid opening the window opened


async function openRepo (event, sessionId, repoName, repoPath){
  const callbackId = callbackRegister()
  BrowserWindow.fromWebContents(event.sender).close()
  await initializeRepo(sessionId, repoName, repoPath)// initialize repo before session preparation
  
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
}// add repoName and repoPath attributes to the window


async function createRepo (event) {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))

  if (!canceled) {
    const callbackId = callbackRegister()
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
  const callbackId = callbackRegister()
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


async function deleteRepoCheck(event, repoName) {
  for(const win of windows.values()) {
    const currentRepoName = await win.webContents.executeJavaScript('window.repoName')
    if(currentRepoName === repoName) {
      const repoListWindow = BrowserWindow.fromWebContents(event.sender)
      dialog.showMessageBoxSync(repoListWindow, {
        type: 'warning',
        title: 'delete opened repo',
        message: `The repo "${repoName}" is currently opened, please close it before deleting.`,
        modal: true
      })
      return true
    }
  }
  return false
}// avoid deleting the opened window


function deleteRepo (event, repoName){
  const callbackId = callbackRegister()
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


function checkSettings(event, callbackId, settings) {
  try {
    fs.writeFileSync(path.join(userDataPath, 'settings-modified.json'), JSON.stringify(settings))
    const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
    const checkSettings = {
      sessionId : -1,
      toMain : true,

      callbackId : callbackId,
      isReply : false,

      message : {
        type : 'checkSettings',
        windowId : windowId
      }
    }
    kernel.stdin.write(JSON.stringify(checkSettings) + '\n')
    console.log(JSON.stringify(checkSettings) + '\n')
  }catch(err) {
    console.error('writing settings-modified.json failed: ', err)
  }
}


function updateSettings(event, settings) {
  try {
    fs.writeFileSync(path.join(userDataPath, 'settings.json'), JSON.stringify(settings))
    const callbackId = callbackRegister()
    const updateSettings = {
      sessionId : -1,
      toMain : true,

      callbackId : callbackId,
      isReply : false,

      message : {
        type : 'updateSettings'
      }
    }
    kernel.stdin.write(JSON.stringify(updateSettings) + '\n')
    console.log(JSON.stringify(updateSettings) + '\n')
  }catch(err) {
    console.error('writing settings.json failed: ', err)
  }
}


function setApiKey(event, modelName, apiKey) {
  const callbackId = callbackRegister()
  const setApiKey = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'setApiKey',
      name : modelName,
      apiKey : apiKey
    }
  }
  kernel.stdin.write(JSON.stringify(setApiKey) + '\n')
  console.log(JSON.stringify(setApiKey) + '\n')
}


function getApiKey(event, callbackId, modelName) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const getApiKey = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'getApiKey',
      name : modelName,
      windowId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(getApiKey) + '\n')
  console.log(JSON.stringify(getApiKey) + '\n')
}


function testApi(event, callbackId, modelName, url, api) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const testApi = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'testApi',
      modelName : modelName,
      url : url,
      api : api,
      windowId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(testApi) + '\n')
  console.log(JSON.stringify(testApi) + '\n')
}


function getChunksInfo(event, callbackId) {
  const sessionId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const getChunksInfo = {
    sessionId : sessionId,
    toMain : false,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'getChunksInfo'
    }
  }
  kernel.stdin.write(JSON.stringify(getChunksInfo) + '\n')
  console.log(JSON.stringify(getChunksInfo) + '\n')
}


function getAvailableHardware(event, callbackId) {
  const windowId = getWindowId(BrowserWindow.fromWebContents(event.sender))
  const getAvailableHardware = {
    sessionId : -1,
    toMain : true,

    callbackId : callbackId,
    isReply : false,

    message : {
      type : 'getAvailableHardware',
      windowId : windowId
    }
  }
  kernel.stdin.write(JSON.stringify(getAvailableHardware) + '\n')
  console.log(JSON.stringify(getAvailableHardware) + '\n')
}


function updateHardwareSettings(event, settings_) {
  try {
    const data = fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf-8')
    let settings = JSON.parse(data)
    settings.performance = settings_
    fs.writeFileSync(path.join(userDataPath, 'settings.json'), JSON.stringify(settings))
  }catch(err) {
    console.error('update hardware settings failed: ', err)
  }
}


function getSettings(event) {
  try {
    const data = fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf-8')
    let settings = JSON.parse(data)
    return settings
  }catch(err) {
    console.error('getting settings failed: ', err)
    throw err
  }
}


function AreSettingsRight() {
  const settings = getSettings()
  // 顶层对象
  if (typeof settings !== 'object' || settings === null) return false

  // searchSettings
  const ss = settings.searchSettings
  if (!ss || typeof ss !== 'object') return false
  if (typeof ss.searchLimit !== 'number') return false

  // embeddingConfig
  if (!ss.embeddingConfig || typeof ss.embeddingConfig !== 'object') return false
  if (!Array.isArray(ss.embeddingConfig.configs)) return false
  // unique name 检查
  const embeddingNames = new Set()
  for (const cfg of ss.embeddingConfig.configs) {
    if (typeof cfg.name !== 'string' || !cfg.name) return false
    if (embeddingNames.has(cfg.name)) return false // unique name
    embeddingNames.add(cfg.name)
    if (typeof cfg.modelName !== 'string' || !cfg.modelName) return false
    if (typeof cfg.inputLength !== 'number') return false
    if (typeof cfg.selected !== 'boolean') return false
  }

  // rerankConfig
  if (!ss.rerankConfig || typeof ss.rerankConfig !== 'object') return false
  if (!Array.isArray(ss.rerankConfig.configs)) return false
  let rerankSelectedCount = 0
  for (const cfg of ss.rerankConfig.configs) {
    if (typeof cfg.modelName !== 'string' || !cfg.modelName) return false
    if (typeof cfg.selected !== 'boolean') return false
    if (cfg.selected) rerankSelectedCount++
  }
  // 只能有一个被选中（如果数组非空）
  if (ss.rerankConfig.configs.length > 0 && rerankSelectedCount !== 1) return false

  // localModelManagement
  const lm = settings.localModelManagement
  if (!lm || typeof lm !== 'object') return false
  if (!Array.isArray(lm.models)) return false
  // unique name 检查
  const modelNames = new Set()
  for (const model of lm.models) {
    if (typeof model.name !== 'string' || !model.name) return false
    if (modelNames.has(model.name)) return false // unique name
    modelNames.add(model.name)
    if (typeof model.path !== 'string' || !model.path) return false
    // 路径必须存在
    if (!fs.existsSync(model.path) || !fs.statSync(model.path).isDirectory()) return false
    if (!['embedding', 'rerank', 'generation'].includes(model.type)) return false
    if (typeof model.fileSize !== 'number') return false
  }

  // embeddingConfig.modelName 必须 refer to localModelManagement.name
  for (const cfg of ss.embeddingConfig.configs) {
    if (cfg.modelName && !modelNames.has(cfg.modelName)) return false
  }
  // rerankConfig.modelName 必须 refer to localModelManagement.name
  for (const cfg of ss.rerankConfig.configs) {
    if (cfg.modelName && !modelNames.has(cfg.modelName)) return false
  }

  // conversationSettings
  const cs = settings.conversationSettings
  if (!cs || typeof cs !== 'object') return false
  if (!Array.isArray(cs.generationModel)) return false
  // unique name 检查
  const genNames = new Set()
  let lastUsedCount = 0
  for (const gm of cs.generationModel) {
    if (typeof gm.name !== 'string' || !gm.name) return false
    if (genNames.has(gm.name)) return false // unique name
    genNames.add(gm.name)
    if (typeof gm.modelName !== 'string' || !gm.modelName) return false
    if (typeof gm.url !== 'string' || !gm.url) return false
    if (typeof gm.setApiKey !== 'boolean') return false
    if (typeof gm.lastUsed !== 'boolean') return false
    if (gm.lastUsed) lastUsedCount++
  }
  // 只能有一个 lastUsed 为 true（如果数组非空）
  if (cs.generationModel.length > 0 && lastUsedCount !== 1) return false
  if (typeof cs.historyLength !== 'number') return false

  // performance
  const pf = settings.performance
  if (!pf || typeof pf !== 'object') return false
  if (typeof pf.maxThreads !== 'number') return false
  if (typeof pf['cuda available'] !== 'boolean') return false
  if (typeof pf.useCuda !== 'boolean') return false
  if (typeof pf['coreML available'] !== 'boolean') return false
  if (typeof pf.useCoreML !== 'boolean') return false

  return true
}// check if the user needs default settings


async function saveWindowState(window, windowType) {
  if (!window) return
  const bounds = window.getBounds()
  const repoName = await window.webContents.executeJavaScript('window.repoName')
  const repoPath = await window.webContents.executeJavaScript('window.repoPath')
  const state = {
    installationId: installationId,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
    windowType : windowType,
    repoName: repoName,
    repoPath: repoPath
  }
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state))
    console.log('Window state saved:', state)
  }catch(err) {
    console.error(err)
  }
}// record the last opened repo


async function checkRepoList() {
  for(const win of windows.values()) {
    const windowType = await win.webContents.executeJavaScript('window.windowType')
    if(windowType === 'repoList') {
      win.focus()
      return true
    }
  }
  return false
} // check if the repoList has been opened


function createWindow (event, windowType = 'repoList', windowState = null) {
  const {width: srceenWidth, height: screenHeight} = screen.getPrimaryDisplay().workAreaSize
  const windowId = Date.now() - dateNow// use timestamp as windowId
  let window
  switch(windowType){
    case 'main':
      let mainOptions = {
        width: Math.floor(srceenWidth * 0.8),
        height: Math.floor(screenHeight * 0.9),
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#222222',
        frame: false,
        autoHideMenuBar: true,
        show: false,   
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          devTools: isDev
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
          color: '#444444',
          symbolColor: '#ffffff',
          height: 35
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
        const callbackId = callbackRegister()
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
        width: 700,
        height: 600,
        backgroundColor: '#222222',
        frame: false,
        maximizable: false,
        fullscreenable: false,
        resizable: false,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          devTools: isDev
        }
      }
      if(platform === 'win32') {
        repoListOptions.titleBarOverlay = {
          color: '#222222',
          symbolColor: '#ffffff',
          height: 35
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
        width: 1000,
        height: 800,
        backgroundColor: '#222222',
        frame: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        resizable: false,
        autoHideMenuBar: true,
        show: false,
        parent : BrowserWindow.fromWebContents(event.sender),
        modal: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          devTools: isDev
        }        
      }
      window = new BrowserWindow(settingsOptions)
      window.on('closed', () => {
        windows.delete(windowId)
      })
      break 

  }

  window.on('close', async (event) => {
    event.preventDefault() // prevent window closing immediately 
    saveWindowState(window, windowType)
    const repoPath = await window.webContents.executeJavaScript('window.repoPath')
    if(repoPath) {
      unwatchRepoDir(repoPath)
    }
    const windowCallbacks = await window.webContents.executeJavaScript('window.callbacks')
    console.log('windowCallbacks\' final size: ', windowCallbacks.size)
    window.destroy() // skip close event and trigger closed event
  })
  console.log('create window with windowId: ', windowId, ' and windowType: ', windowType)

  const startUrl = isDev
      ? `http://localhost:3000?windowType=${windowType}&windowId=${windowId}`
      : `file://${path.join(__dirname, '..','build','index.html')}?windowType=${windowType}&windowId=${windowId}`  

  windows.set(windowId, window)//add the window to the map

  window.loadURL(startUrl)

  let timeout = setTimeout(() => {
    if(!window.isVisible()) {
      window.removeAllListeners('ready-to-show')
      console.log('time-to-show')
      window.show()
    }
  }, 500)
  window.once('ready-to-show', () => {
    if(!window.isVisible()) {
      clearTimeout(timeout)
      console.log('ready-to-show')
      window.show()
    }
  })

  return windowId
}


async function createFirstWindow() {
  try {
    const data = fs.readFileSync(stateFile, 'utf-8')
    let lastState = JSON.parse(data)
    console.log('lastState is: ', lastState)
    if(lastState.installationId !== installationId){
      throw new Error('installationId wrong!')
    }
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
      const callbackId = callbackRegister()
      await initializeRepo(windowId, repoName, repoPath)

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
  }catch(err) {
    console.log(err)
    createWindow()
  }
}// read the windowState file to open the last opened repo if it exactly is a repo


function getWindowId (window) {
  for(const [id, win] of windows.entries()) {
    if(win === window) {
      return id
    }
  }
  return null
}
//get the windowId from the BrowserWindow object


async function getReadyPromise() {
  return readyPromise
}


async function pathJoin(event, ...paths) {
  return path.join(...paths)
}// expose path.join to the renderer process


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
}// expose showMessageBoxSync to the renderer process


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
}// to generate the tree of files in the repo


function getRepoFileTree(event, repoPath) {
  try {
    let fileTreeData = generateTree(repoPath)
    return fileTreeData
  }catch(err) {
    console.error(err)
    return []
  }
} // packaging generateTree function


const repoWatchers = new Map()
function watchRepoDir(event, repoPath) {
  if(repoWatchers.has(repoPath)) {
    repoWatchers.get(repoPath).close()
    console.log('防止重复监听', repoPath)
  }
  try {
    const watcher = fs.watch(repoPath, { recursive: true}, async (eventType, filename) => {
      console.log('文件变化:', eventType, filename)
      for(const win of windows.values()) {
        const currentRepoPath = await win.webContents.executeJavaScript('window.repoPath')
        if(currentRepoPath === repoPath){
          win.webContents.send('repoFileChanged')
        }
      }
    })
    repoWatchers.set(repoPath, watcher)
    console.log('已监听:', repoPath)
  }catch(err) {
    console.log('监听失败', err)
  }
}// listen the change of the repo files


function unwatchRepoDir(repoPath) {
  if(repoWatchers.has(repoPath)) {
    repoWatchers.get(repoPath).close()
    repoWatchers.delete(repoPath)
    console.log('已停止监听:', repoPath)
  }
}


function getConversation(event, repoPath) {
  const convDir = path.join(repoPath, '.PocketRAG', 'conversation')
  try {
    if(!fs.existsSync(convDir)) return []
    return fs.readdirSync(convDir).filter(name => name.endsWith('.json') && !name.includes('_full')).map(name => {
      const match = name.match(/^conversation-(\d+)\.json$/)
      return match ? match[1] : null
    }).filter(Boolean)
  }catch(err) {
    console.error('getConversation failed: ', err)
    return []
  }
}// get conversation history


function updateFile(event, path, data) {
  try {
    console.log('更新文件内容')
    fs.writeFileSync(path, data, {encoding: 'utf-8'})
  }catch (err) {
    console.error('更新文件失败:', err)
  }
}// expose it to the renderer process


function getFile(event, filePath) {
  try {
    const res = fs.readFileSync(filePath, {encoding: 'utf-8'})
    return res
  }catch(err) {
    console.error('读取文件失败:', err)
  }
}// expose it to the renderer process


async function openDir(event) {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
  if(!canceled) {
    return filePaths[0]
  }
}// expose it to the renderer process


function getVersion(event) {
  try {
    const versionPath = path.join(__dirname, '..', 'public', 'version.json')
    const data = fs.readFileSync(versionPath, 'utf-8')
    const version = JSON.parse(data)
    return version.version
  }catch(err) {
    console.error('getVersion failed', err)
    return "0.0.0"
  }
}// get app version


function getDirSize(event, dir) {
  // 初始化总大小为0
  let totalSize = 0

  // 递归函数用于遍历目录
  const walk = (currentDir) => {
    fs.readdirSync(currentDir).forEach((item) => {
      const itemPath = path.join(currentDir, item)
      const stats = fs.statSync(itemPath)

      if (stats.isFile()) {
        // 累加文件大小（字节）
        totalSize += stats.size
      } else if (stats.isDirectory()) {
        // 递归处理子目录
        walk(itemPath)
      }
    })
  }

  // 开始遍历目录
  walk(dir)

  // 转换大小为MB并返回
  return Math.floor(totalSize / (1024 * 1024))
}// compute the directory size


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
  ipcMain.handle('openRepoCheck', openRepoCheck)
  ipcMain.handle('repoListCheck', checkRepoList)
  ipcMain.on('watchRepoDir', watchRepoDir)
  ipcMain.handle('getConversation', getConversation)
  ipcMain.on('updateFile', updateFile)
  ipcMain.handle('getFile', getFile)
  ipcMain.handle('deleteRepoCheck', deleteRepoCheck)
  ipcMain.on('checkSettings', checkSettings)
  ipcMain.on('updateSettings', updateSettings)
  ipcMain.on('setApiKey', setApiKey)
  ipcMain.on('getApiKey', getApiKey)
  ipcMain.on('testApi', testApi)
  ipcMain.on('getChunksInfo', getChunksInfo)
  ipcMain.on('getAvailableHardware', getAvailableHardware)
  ipcMain.handle('updateHardwareSettings', updateHardwareSettings)
  ipcMain.handle('getSettings', getSettings)
  ipcMain.handle('openDir', openDir)
  ipcMain.handle('getVersion', getVersion)
  ipcMain.handle('getDirSize', getDirSize)
  //add the event listeners before the window is created

  const defaultSettingsPath = isDev
    ? path.join(__dirname, '..', 'public', 'defaultSettings.json')
    : path.join(process.resourcesPath, 'public', 'defaultSettings.json')
  const settingsPath = path.join(userDataPath, 'settings.json')
  console.log('settings path: ', settingsPath)
  console.log('default settings path: ', defaultSettingsPath)
  try {
    if(!fs.existsSync(settingsPath)) {
      console.log('no settings.json, copying default settings...')
      fs.copyFileSync(defaultSettingsPath, settingsPath)
      console.log('copy done')
    }
    else if(!AreSettingsRight()) {
      console.log('settings format wrong, copying default settings...')
      fs.copyFileSync(defaultSettingsPath, settingsPath)
    }
  }catch(err) {
    console.log(err)
    console.log('copying default settings due to error...')
    fs.copyFileSync(defaultSettingsPath, settingsPath)
  }
  // use default settings if needed

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
// quitting action

