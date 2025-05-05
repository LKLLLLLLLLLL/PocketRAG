const newWindowBtn = document.getElementById('newWindow')
const repo = document.getElementById('repo')
const add = document.getElementById('add')
const remove = document.getElementById('remove')
const embeddingModelSelect = document.getElementById('embeddingModelSelect')
const querybtn = document.getElementById('querybtn')
let currentRepo = undefined
let currentEmbeddingModel = undefined

window.electronAPI.onembedding((result) => {
  console.log(result)
})


newWindowBtn.addEventListener('click', async () => {
  await window.electronAPI.createNewWindow()
})


repo.addEventListener('click', async () => {
  let temp = await window.electronAPI.selectRepo()
  if(temp !== undefined) currentRepo = temp
  console.log(currentRepo)
})


add.addEventListener('click', async () => {
  if(currentRepo !== undefined) {
    let file = await window.electronAPI.addFile(currentRepo)
    if(file === '文件已存在，请重命名'){
      alert(file)
      file = undefined
    }
    else if (file === '文件添加失败'){
      alert(file)
      file = undefined
    }
    console.log(file)
  }
  else {
    alert('请先选择一个仓库')
  }
})


remove.addEventListener('click', async() => {
  if(currentRepo !== undefined) {
    let file = await window.electronAPI.removeFile(currentRepo)
    if(file === '文件不在当前仓库中，请重新选择' || file === '文件删除失败'){
      alert(file)
      file = undefined
    }
    console.log(file)
  }
  else {
    alert('请先选择一个仓库')
  }
})


embeddingModelSelect.addEventListener('click', async() => {
  if(currentRepo !== undefined) {
    const embeddingModel = document.getElementById('embeddingModel')
    let err = await window.electronAPI.selectEmbeddingModel(embeddingModel.value)
    if(err) alert(err)
    else currentEmbeddingModel = embeddingModel.innerText
    console.log(currentEmbeddingModel)
  }
  else {
    alert('请先选择一个仓库')
  }
})


const queryHandler = async () => {
  querybtn.removeEventListener('click', queryHandler)
  
  const query = document.getElementById('query').value

  if(currentRepo !== undefined && currentEmbeddingModel !== undefined && query !== '') {
    window.electronAPI.query(query)
    window.electronAPI.onqueryResult((result) => {
      console.log(result)
    })
  }
  else if(currentRepo === undefined) alert('请先选择一个仓库')
  else if(currentEmbeddingModel === undefined)alert('请先选择一个嵌入模型')
  else alert('查询不能为空')

  querybtn.addEventListener('click', queryHandler)
}

querybtn.addEventListener('click', queryHandler)