const { app, BrowserWindow, ipcMain, dialog} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')
const fs = require('node:fs')

const kernelPath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
const kernel = spawn(kernelPath)
kernel.on('error', (err) => {
  console.error('Failed to start kernel:', err)
  app.quit()
})


async function selectRepo () {
  const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
  
  const result = {
    type : 'selectRepo',
    repoPath : filePaths[0]
  }

  if (!canceled) {
    if(kernel.pid && !kernel.killed) {
      // kernel.stdin.write(JSON.stringify(result) + '\n')
      return result.repoPath
    }
  }
}


async function addFile (_, repoPath) {
  const {canceled, filePaths} = await dialog.showOpenDialog({})
  let isexist = false

  if(!canceled){
    if(kernel.pid && !kernel.killed) {
      const destPath = path.join(repoPath, path.basename(filePaths[0]))
      // console.log(destPath, filePaths[0])
      try{
        fs.accessSync(destPath, fs.constants.F_OK)
        isexist = true
      }catch (err){
        isexist = false
      }
      if(isexist) {
        return '文件已存在，请重命名'
      }
      else {
        try {
          fs.copyFileSync(filePaths[0], destPath)
          console.log('add success')
          const result = {
            type : 'addFile',
            filePath : destPath
          }
          // kernel.stdin.write(JSON.stringify(result) + '\n')
          return result.filePath
        }catch(err) {
          return '文件添加失败'
        }
      }
    }
  }
}


async function removeFile (_, repoPath) {
  const {canceled, filePaths} = await dialog.showOpenDialog({defaultPath : repoPath})
  // console.log(path.dirname(filePaths[0]))
  if(!canceled) {
    if(path.dirname(filePaths[0]) !== repoPath){
      return '文件不在当前仓库中，请重新选择'
    }
    else {
      if(kernel.pid && !kernel.killed) {
        try {
          fs.unlinkSync(filePaths[0])
          console.log('remove success')
          const result = {
            type : 'removeFile',
            filePath : filePaths[0]
          }
          // kernel.stdin.write(JSON.stringify(result) + '\n')
          return result.filePath
        }catch(err) {
          return '文件删除失败'
        }
      }
    }
  }
}


async function selectEmbeddingModel(_, embeddingModel) {
  const result = {
    type : 'selectEmbeddingModel',
    embeddingModelPath : embeddingModel
  }
  if(kernel.pid && !kernel.killed) {
    try{
      //kernel.stdin.write(JSON.stringify(result) + '\n')
      console.log('select embedding model: ' + embeddingModel)
    }catch(err) {
      return '模型选择失败'
    }
  }
}

async function query(_, query) {
  const result = {
    type : 'query',
    content : query
  }
  if(kernel.pid && !kernel.killed) {
    try{
      // kernel.stdin.write(JSON.stringify(result) + '\n')
      // const data = await new Promise((resolve, reject) => {
      //   const listener = (data) => {
      //     resolve(data.toString())
      //   }
      //   const errListener = (err) => {reject(err)}
      //   kernel.stdout.once('data',listener)
      //   kernel.stderr.once('data', errListener)
      //   kernel.stdout.once('error', errListener)
      //   kernel.stderr.once('error', errListener)
      // })
      // return data
      return '查询成功'
    }catch(err) {
      return '查询失败'
    }
  }
}


function createWindow () {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
  mainWindow.loadFile('electron/src/renderer/index.html')
}


app.whenReady().then(() => {
  ipcMain.handle('selectRepo', selectRepo)
  ipcMain.handle('addFile', addFile)
  ipcMain.handle('removeFile', removeFile)
  ipcMain.handle('selectEmbeddingModel', selectEmbeddingModel)
  ipcMain.handle('query', query)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
  })
})


app.on('quit', () => {
  if (kernel.pid && !kernel.killed) {
    kernel.kill();
    kernel.removeAllListeners('error')
    console.log('Kernel process killed and listeners removed')
  }
})
