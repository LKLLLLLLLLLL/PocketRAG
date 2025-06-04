import {useState,useEffect} from "react";
import './StartWindowContainer.css';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import { DeleteOutlined } from "@ant-design/icons";
import {Button} from 'antd';
import Option from './Option/Option.jsx';
import PocketRAG from './PocketRAG/PocketRAG.jsx';
export default function StartWindowContainer(){
    const [demo,setDemo] = useState(true);
    const [others,setOthers] = useState(false);
    const [repolist,setRepolist] = useState([]);
    const [selectedRepo,setSelectedRepo] = useState(null);
    const [lastClickTime,setLastClickTime] = useState(0);

    //get the repolist from the backend
    const receiveRepolist = async()=>{
        try {
            let repolist = await window.getRepos();
            setRepolist(repolist);
        } catch (e) {
            console.error('获取仓库列表失败', e);
        }
    }

    //dynamically refresh the repolist when changing the repolist
    useEffect(() => {
        receiveRepolist();
        const handleCreateRepoSuccess =()=>{
            receiveRepolist();
        }
        const handleDeleteRepoSuccess =()=>{
            receiveRepolist();
        }
        window.addEventListener('createRepoSuccess', handleCreateRepoSuccess);
        window.addEventListener('deleteRepoSuccess', handleDeleteRepoSuccess);
        return () => {
            window.removeEventListener('createRepoSuccess', handleCreateRepoSuccess);
            window.removeEventListener('deleteRepoSuccess', handleDeleteRepoSuccess);
        };
    }, []);

    //single click to highlight the selected repo, double click to open the repo
    const handleRepoClick = (repo) => {
        const now = Date.now();
        if (now - lastClickTime < 300) {
            window.openRepo(repo.name);
            setSelectedRepo(null);
            return;
        }
        setLastClickTime(now);
        setSelectedRepo(prev => 
        prev?.path === repo.path ? null : repo
        );
    };

    //demonstrate the repolist
    const repolistItem = repolist.map((repo)=>{
        return(
            <li key = {repo.path} 
                className = {`repo-item ${selectedRepo?.path === repo.path ? 'selected' : ''}`} 
                onClick = {()=>handleRepoClick(repo)}>
                <div className = 'repo-item-container'>
                    <div className = 'repo-item-info'>
                        <span className = 'repo-name'>{repo.name}</span>
                        <span className = 'repo-path'>{repo.path}</span>
                    </div>
                    <div className = 'repo-delete-container'>
                        <Button className = 'repo-delete' 
                                icon = {<DeleteOutlined style = {{fontSize:20}}/>}
                                onClick = {async (e)=>{e.stopPropagation();window.deleteRepo(repo.name);}}>
                        </Button>
                    </div>
                </div>
            </li>
        )
    })

    return(
        <PanelGroup direction = "horizontal" className = 'startwindow-container'>
            <Panel defaultSize = {33} minSize = {30} maxSize = {50} className = 'sw-left'>
                { demo &&
                    <div className = 'repolist-container'>
                        <ul className = 'repolist'>
                            {repolistItem}
                        </ul>
                    </div>
                }
            </Panel>
            <PanelResizeHandle className="sw-resize"></PanelResizeHandle>
            <Panel defaultSize = {67} className = 'sw-right'>
                <PocketRAG></PocketRAG>
                <Option setDemo = {setDemo} 
                        others = {others} 
                        setOthers = {setOthers} 
                        receiveRepolist = {receiveRepolist}>
                </Option>
            </Panel>
        </PanelGroup>
    )
}