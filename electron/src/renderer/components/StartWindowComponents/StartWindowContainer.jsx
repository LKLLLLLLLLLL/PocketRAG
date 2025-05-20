import React,{useState} from "react";
import './StartWindowContainer.css';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import Option from './Option/Option.jsx';
import PocketRAG from './PocketRAG/PocketRAG.jsx';
import Top from './Top/Top.jsx';
export default function StartWindowContainer(){
    const [demo,setDemo] = useState(false);
    const [others,setOthers] = useState(false);
    const [repolist,setRepolist] = useState(null);
    const receiveRepolist = async()=>{
        let repolist = await window.getRepos();
        setRepolist(repolist);
    }
    return(
        <PanelGroup direction = "horizontal" className = 'startwindow-container'>
            <Panel defaultSize = {33} minSize = {20} maxSize = {60} className = 'sw-left'>
                { demo &&
                    <div className = 'repolist-container'>
                        <div className = 'repolist'>
                            {repolist ? JSON.stringify(repolist):"仓库列表为空，请创建仓库"}
                        </div>
                    </div>
                }
                左侧面板
            </Panel>
            <PanelResizeHandle className="sw-resize"></PanelResizeHandle>
            <Panel defaultSize = {67} className = 'sw-right'>
                <Top></Top>
                <PocketRAG></PocketRAG>
                <Option setDemo = {setDemo} others = {others} setOthers = {setOthers} receiveRepolist = {receiveRepolist}></Option>
            </Panel>
        </PanelGroup>
    )
}