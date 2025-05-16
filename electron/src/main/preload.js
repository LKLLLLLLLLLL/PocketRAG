const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos: (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo: (sessionId, RepoName) => ipcRenderer.send('openRepo', sessionId, RepoName),

  onRepoInitialized: (callback) => ipcRenderer.on('repoInitialized', callback()),

  createRepo: (callbackId) => ipcRenderer.send('createRepo', callbackId),

  search: (callbackId, query, accuracy) => ipcRenderer.send('search', callbackId, query, accuracy),

  createNewWindow: (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData: (callback) => ipcRenderer.on('kernelData', (_, result) => callback(result)),

  sendSessionPreparedReply : (reply) => ipcRenderer.send('sessionPreparedReply', reply),

  kernelReadyPromise : () => ipcRenderer.invoke('kernelReadyPromise')
})
//expose apis to the renderer process 