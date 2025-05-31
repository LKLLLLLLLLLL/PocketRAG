const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos : (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo : (sessionId, repoName) => ipcRenderer.send('openRepo', sessionId, repoName),

  onRepoInitialized : (callback) => ipcRenderer.on('repoInitialized', callback),

  createRepo : () => ipcRenderer.send('createRepo'),

  search : (callbackId, query, accuracy) => ipcRenderer.send('search', callbackId, query, accuracy),

  createNewWindow : (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData : (callback) => ipcRenderer.on('kernelData', (_, result) => callback(result)),

  sendSessionPreparedReply : (reply) => ipcRenderer.send('sessionPreparedReply', reply),

  sendEmbeddingStatusReply : (reply) => ipcRenderer.send('embeddingStatusReply', reply),

  kernelReadyPromise : () => ipcRenderer.invoke('kernelReadyPromise'),

  sendSessionCrashed : (error) => ipcRenderer.send('sessionCrashed', error),

  restartSession : (repoName) => ipcRenderer.send('restartSession', repoName),

  beginConversation : (callbackId, modelName, conversationId, query) => ipcRenderer.send('beginConversation', callbackId, modelName, conversationId, query),

  stopConversation : (callbackId, conversationId) => ipcRenderer.send('stopConversation', callbackId, conversationId),

  deleteRepo : (repoName) => ipcRenderer.send('deleteRepo', repoName),

  pathJoin : (...paths) => ipcRenderer.invoke('pathJoin', ...paths),

  close : () => ipcRenderer.invoke('closeWindow'),

  maximize : () => ipcRenderer.invoke('maximizeWindow'),

  minimize : () => ipcRenderer.invoke('minimizeWindow'),

  showMessageBoxSync : (content) => ipcRenderer.invoke('showMessageBoxSync', content),

  getApiUsage : (callbackId) => ipcRenderer.send('getApiUsage', callbackId),
  
  getRepoFileTree : (repoPath) => ipcRenderer.invoke('getRepoFileTree', repoPath),

  updateFile : (action, path, title, treeData, selectNode) => ipcRenderer.send('updateFile', action, path, title, treeData, selectNode)

})
//expose apis to the renderer process 