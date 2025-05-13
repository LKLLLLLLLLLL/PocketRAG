import React from 'react'
import ReactDOM from 'react-dom/client'
import MainWindow from './views/MainWindow/MainWindow.jsx'

// 获取当前窗口类型
const urlParams = new URLSearchParams(window.location.search)
const windowType = urlParams.get('windowType') || 'main'

// 根据窗口类型选择不同的组件
const getWindowRenderFunc = () => {
  switch (windowType) {
      case 'main':
        return MainWindow()
      // case 'repoList':
      //   return RepoListWindow()
      default:
        return MainWindow()
    }
}

const renderWindow = getWindowRenderFunc()

// 渲染窗口
ReactDOM.createRoot(document.getElementById('root')).render(
    renderWindow()
)


const callbacks = new Map()


const callbackRegister = (callback) => {
  const callbackId = Date.now()
  callbacks.set(callbackId, callback)
  return callbackId
}


window.electronAPI.onKernelData((data) => {
  const type = data.message.type
  switch(type) {
    case 'getRepos':
      if(data.status.code === 'SUCCESS'){
        const getReposResultEvent = new CustomEvent('getReposResult', {detail : data.data.repoList})
        window.dispatchEvent(getReposResultEvent)
      }
      else {
        console.error(data.status.message)
      }
      break
    case 'embedding':
      const embeddingEvent = new CustomEvent('embedding', {detail : data})
      window.dispatchEvent(embeddingEvent)
      break
    case 'queryResult':
      const queryResultEvent = new CustomEvent('queryResult', {detail : data})
      window.dispatchEvent(queryResultEvent)
      break
  }
})


// window.addEventListener('embedding',(event) => {
//   console.log(event.detail)
// })


// const queryHandler = async () => {
//   querybtn.removeEventListener('click', queryHandler)
  
//   const query = document.getElementById('query').value

//   if(currentRepo !== undefined && currentEmbeddingModel !== undefined && query !== '') {
//     const result = await new Promise((resolve, reject) => {
//       let timeout
//       const callbackId = 1
//       if(!callbacks.has(callbackId)){
//         const listener = (result) =>{
//           clearTimeout(timeout)
//           resolve(result)
//         }
//         callbacks.set(callbackId, listener)
//       }

//       window.addEventListener('queryResult', callbacks.get(callbackId), {once: true})

//       window.electronAPI.query(query)

//       timeout = setTimeout(() => {
//         window.removeEventListener('queryResult', callbacks.get(callbackId))
//         reject(new Error('查询超时'))
//       }, 10000)
//     })
//     .catch((err) => {
//       console.error(err)
//     })
    
//     console.log(result)
//   }
//   else if(currentRepo === undefined) alert('请先选择一个仓库')
//   else if(currentEmbeddingModel === undefined) alert('请先选择一个嵌入模型')
//   else alert('查询不能为空')

//   querybtn.addEventListener('click', queryHandler)
// }

// querybtn.addEventListener('click', queryHandler)


switch(windowType){
  case 'main':
    const repoInitializePromise = new Promise((resolve, reject) => {
      window.electronAPI.onRepoInitialized(() => {
        resolve()
      })
    }).then()


    const createNewWindow = async () => {
      await window.electronAPI.createNewWindow()
    }

    const openRepoListWindow = async () => {
      await window.electronAPI.createNewWindow('repoList')
    }

    break
  

  case 'repoList':
    const getRepos = async () => {
      const callbackId = callbackRegister(() => {})
      try{
        const repoList = await new Promise((resolve, reject) => {
          let timeout
          const listener = (event) => {
            clearTimeout(timeout)
            resolve(event.detail)
          }
          window.addEventListener('getReposResult', listener, {once : true})
          window.electronAPI.getRepos(callbackId)
          timeout = setTimeout(() => {
            window.removeEventListener('getReposResult', listener)
            reject(new Error('getRepos Failed'))
          }, 10000)
        })          
      } 
      catch(err){
        console.error(err)
      }
      finally {
        callbacks.delete(callbackId)
      }
    }

    const openRepo = async (repoName) => {
      const sessionId = await window.electronAPI.createNewWindow('main')
      window.electronAPI.openRepo(sessionId, repoName)
    }

    const createRepo = () =>{
      const callbackId = callbackRegister(() => {})
      window.electronAPI.createRepo(callbackId)
    }
    // console.log(await getRepos())
    // openRepo('123')
    // createRepo()
    break
}