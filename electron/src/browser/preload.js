const { contextBridge, ipcRenderer} = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  selectRepo: () => ipcRenderer.invoke('selectRepo'),
  addFile: (repoPath) => ipcRenderer.invoke('addFile', repoPath),
  removeFile: (repoPath) => ipcRenderer.invoke('removeFile', repoPath),
  selectEmbeddingModel: (embeddingModel) => ipcRenderer.invoke('selectEmbeddingModel', embeddingModel),
  query: (query) => ipcRenderer.send('query', query),
  oncequeryResult: (callback) => ipcRenderer.once('queryResult', (_, result) => callback(result)),
  onembedding: (callback) => ipcRenderer.on('embedding', (_, result) => callback(result)),
  createNewWindow: () => ipcRenderer.invoke('createNewWindow')
})