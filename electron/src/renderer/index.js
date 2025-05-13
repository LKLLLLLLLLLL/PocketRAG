import React from 'react';
import ReactDOM from 'react-dom/client';
import MainWindow from './views/MainWindow/MainWindow';
import StartWindow from './views/StartWindow/StartWindow';

// 获取当前窗口类型
// const urlParams = new URLSearchParams(window.location.search);
// const windowType = urlParams.get('windowType') || 'main';
const windowType = 'main';

// 根据窗口类型选择不同的组件
const getWindowRenderFunc = () => {
    switch (windowType) {
        case 'start':{
            return StartWindow();
        }
        case 'main':{
            return MainWindow();
        }
        default:{
            return StartWindow();
        }
    }
};

const renderWindow = getWindowRenderFunc();

// 渲染窗口
ReactDOM.createRoot(document.getElementById('root')).render(
    renderWindow()
);


// const newWindowBtn = document.getElementById('newWindow')
// const repo = document.getElementById('repo')
// const querybtn = document.getElementById('querybtn')
// let currentRepo = undefined
// let currentEmbeddingModel = undefined
// const callbacks = new Map()


// window.electronAPI.onKernelData((data) => {
//   const type = data.type
//   switch(type) {
//     case 'embedding':
//       const embeddingEvent = new CustomEvent('embedding', {detail : data})
//       window.dispatchEvent(embeddingEvent)
//       break
//     case 'queryResult':
//       const queryResultEvent = new CustomEvent('queryResult', {detail : data})
//       window.dispatchEvent(queryResultEvent)
//       break
//   }
// })


// window.addEventListener('embedding',(event) => {
//   console.log(event.detail)
// })


// newWindowBtn.addEventListener('click', async () => {
//   await window.electronAPI.createNewWindow()
// })


// repo.addEventListener('click', async () => {
//   let temp = await window.electronAPI.selectRepo()
//   if(temp !== undefined) currentRepo = temp
//   console.log(currentRepo)
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