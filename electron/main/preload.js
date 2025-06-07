const { ipcMain } = require('electron')
const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos : (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo : (sessionId, repoName, repoPath) => ipcRenderer.send('openRepo', sessionId, repoName, repoPath),

  onRepoInitialized : (callback) => ipcRenderer.on('repoInitialized', callback),
  //listen repoInitialized event

  createRepo : () => ipcRenderer.send('createRepo'),

  search : (callbackId, query, accuracy) => ipcRenderer.send('search', callbackId, query, accuracy),

  createNewWindow : (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData : (callback) => ipcRenderer.on('kernelData', (_, result) => callback(result)),
  //receive data from kernel

  sendSessionPreparedReply : (reply) => ipcRenderer.send('sessionPreparedReply', reply),

  sendEmbeddingStatusReply : (reply) => ipcRenderer.send('embeddingStatusReply', reply),

  kernelReadyPromise : () => ipcRenderer.invoke('kernelReadyPromise'),
  //get kernelReadyPromise

  sendSessionCrashed : (error) => ipcRenderer.send('sessionCrashed', error),

  restartSession : (repoName) => ipcRenderer.send('restartSession', repoName),

  beginConversation : (callbackId, modelName, conversationId, query) => ipcRenderer.send('beginConversation', callbackId, modelName, conversationId, query),

  stopConversation : (callbackId, conversationId) => ipcRenderer.send('stopConversation', callbackId, conversationId),

  deleteRepo : (repoName) => ipcRenderer.send('deleteRepo', repoName),

  pathJoin : (...paths) => ipcRenderer.invoke('pathJoin', ...paths),
  //expose path.join

  close : () => ipcRenderer.invoke('closeWindow'),

  maximize : () => ipcRenderer.invoke('maximizeWindow'),

  minimize : () => ipcRenderer.invoke('minimizeWindow'),

  showMessageBoxSync : (content) => ipcRenderer.invoke('showMessageBoxSync', content),

  getApiUsage : (callbackId) => ipcRenderer.send('getApiUsage', callbackId),
  
  getRepoFileTree : (repoPath) => ipcRenderer.invoke('getRepoFileTree', repoPath),

  openRepoCheck : (repoName) => ipcRenderer.invoke('openRepoCheck', repoName),

  repoListCheck : () => ipcRenderer.invoke('repoListCheck'),

  watchRepoDir : (repoPath) => ipcRenderer.send('watchRepoDir', repoPath),

  onRepoFileChanged : (callback) => ipcRenderer.on('repoFileChanged', callback),

  getConversation : (repoPath) => ipcRenderer.invoke('getConversation', repoPath),

  updateFile : (path, data) => ipcRenderer.send('updateFile', path, data),

  getFile : (filePath) => ipcRenderer.invoke('getFile', filePath),
  //get the file content

  deleteRepoCheck : (repoName) => ipcRenderer.invoke('deleteRepoCheck', repoName),

  checkSettings : (callbackId, settings) => ipcRenderer.send('checkSettings', callbackId, settings),

  updateSettings : (settings) => ipcRenderer.send('updateSettings', settings),

  setApiKey : (modelName, apiKey) => ipcRenderer.send('setApiKey', modelName, apiKey),

  getApiKey : (modelName) => ipcRenderer.send('getApiKey', callbackId, modelName),

  testApi : (callbackId, modelName, url, api) => ipcRenderer.send('testApi', callbackId, modelName, url, api),

  getChunksInfo : (callbackId) => ipcRenderer.send('getChunksInfo', callbackId),
  
  getAvailableHardware : (callbackId) => ipcRenderer.send('getAvailableHardware', callbackId),

  updateHardwareSettings : (settings) => ipcMain.invoke('updateHardwareSettings', settings),

  getSettings : () => ipcMain.invoke('getSettings'),

  openDir : () => ipcMain.invoke('openDir')
  // get the directory the user selected

})
//expose apis to the renderer process 