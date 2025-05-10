const { contextBridge, ipcRenderer} = require('electron/renderer')
//import electron modules

contextBridge.exposeInMainWorld('electronAPI', {
  selectRepo: () => ipcRenderer.invoke('selectRepo'),
  // select the repository path
  query: (query) => ipcRenderer.send('query', query),
  // send a query
  createNewWindow: () => ipcRenderer.invoke('createNewWindow'),
  // create a new window
  onKernelData: (callback) =>ipcRenderer.on('kernelData', (_, result) => callback(result))
  // receive data from the kernel
})
//expose apis to the renderer process 