const { contextBridge, ipcRenderer} = require('electron/renderer')
const path = require('node:path')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos : (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo : (sessionId, repoName) => ipcRenderer.send('openRepo', sessionId, repoName),

  onRepoInitialized : (callback) => ipcRenderer.on('repoInitialized', callback()),

  createRepo : () => ipcRenderer.send('createRepo'),

  search : (callbackId, query, accuracy) => ipcRenderer.send('search', callbackId, query, accuracy),

  createNewWindow : (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData : (callback) => ipcRenderer.on('kernelData', (_, result) => callback(result)),

  sendSessionPreparedReply : (reply) => ipcRenderer.send('sessionPreparedReply', reply),

  sendEmbeddingStatusReply : (reply) => ipcRenderer.send('embeddingStatusReply', reply),

  kernelReadyPromise : () => ipcRenderer.invoke('kernelReadyPromise'),

  dateNow : () => ipcRenderer.invoke('dateNow'),

  sendSessionCrashed : (error) => ipcRenderer.send('sessionCrashed', error),

  restartSession : (repoName) => ipcRenderer.send('restartSession', repoName),

  beginConversation : (callbackId, modelName, conversationId, query) => ipcRenderer.send('beginConversation', callbackId, modelName, conversationId, query),

  stopConversation : (callbackId, conversationId) => ipcRenderer.send('stopConversation', callbackId, conversationId),

  deleteRepo : (repoName) => ipcRenderer.send('deleteRepo', repoName),

  pathJoin : path.join
})
//expose apis to the renderer process 