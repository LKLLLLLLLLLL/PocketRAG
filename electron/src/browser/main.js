const { app, BrowserWindow, ipcMain, dialog, Menu} = require('electron/main')
const path = require('node:path')
const {spawn} = require('node:child_process')

let childProcess

function startEXE() {
  const exePath = path.join(__dirname, '../../../kernel/bin/PocketRAG_kernel.exe')
  console.log(`exePath: ${exePath}`)
  childProcess = spawn(exePath)

  childProcess.on('error', (err) => {
    console.error('Failed to start child process:', err.message)
    throw err;
  })

  childProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
  })

  childProcess.stdout.on('end', () =>{
    childProcess.kill()
    console.log(`the child process has ended`)
  })

  childProcess.stderr.on('data', (err) => {
    console.error('stderr:', err.toString())
  })

  childProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`)
  })
}


//pattern1:Renderer to main (one-way)
function handleSetTitle (event, title) {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    win.setTitle(title)
}

//Pattern 2: Renderer to main (two-way)
async function handleFileOpen () {
  const { canceled, filePaths } = await dialog.showOpenDialog({})
  if (!canceled) {
    startEXE()
    if(childProcess && !childProcess.killed) {
      childProcess.stdin.write(`${filePaths[0]}\n`)
    }
    return filePaths[0]
  }
}

function createWindow () {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  //Pattern 3: Main to Renderer
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: () => mainWindow.webContents.send('update-counter', 1),
          label: 'Increment'
        },
        {
          click: () => mainWindow.webContents.send('update-counter', -1),
          label: 'Decrement'
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  mainWindow.loadFile('electron/src/renderer/index.html')
}

app.whenReady().then(() => {
  ipcMain.on('set-title', handleSetTitle)
  ipcMain.handle('dialog:openFile', handleFileOpen)
  ipcMain.on('counter-value', (_event, value) => {
    console.log(value) // will print value to Node console
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})