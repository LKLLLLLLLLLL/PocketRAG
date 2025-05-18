const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos : (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo : (sessionId, RepoName) => ipcRenderer.send('openRepo', sessionId, RepoName),

  onRepoInitialized : (callback) => ipcRenderer.on('repoInitialized', callback()),

  createRepo : (callbackId) => ipcRenderer.send('createRepo', callbackId),

  search : (callbackId, query, accuracy) => ipcRenderer.send('search', callbackId, query, accuracy),

  createNewWindow : (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData : (callback) => ipcRenderer.on('kernelData', (_, result) => callback(result)),

  sendSessionPreparedReply : (reply) => ipcRenderer.send('sessionPreparedReply', reply),

  sendEmbeddingStatusReply : (reply) => ipcRenderer.send('embeddingStatusReply', reply),

  kernelReadyPromise : () => ipcRenderer.invoke('kernelReadyPromise'),

  dateNow : () => ipcRenderer.invoke('dateNow'),

  sendSessionCrushed : (error) => ipcRenderer.send('sessionCrushed', error),

  beginConversation : (callbackId, modelName, conversationId, query) => ipcRenderer.send('beginConversation', callbackId, modelName, conversationId, query),

  stopConversation : (callbackId, conversationId) => ipcRenderer.send('stopConversation', callbackId, conversationId)
})
//expose apis to the renderer process 