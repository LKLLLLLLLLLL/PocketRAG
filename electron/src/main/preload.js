const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  getRepos: (callbackId) => ipcRenderer.send('getRepos', callbackId),

  openRepo: (sessionId, RepoName) => ipcRenderer.send('openRepo', sessionId, RepoName),

  onRepoInitialized: (callback) => ipcRenderer.on('repoInitialized', callback()),

  createRepo: (callbackId) => ipcRenderer.send('createRepo', callbackId),

  query: (query) => ipcRenderer.send('query', query),

  createNewWindow: (windowType) => ipcRenderer.invoke('createNewWindow', windowType),

  onKernelData: (callback) =>ipcRenderer.on('kernelData', (_, result) => callback(result)),

})
//expose apis to the renderer process 