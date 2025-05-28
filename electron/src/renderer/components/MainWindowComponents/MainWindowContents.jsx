import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React from "react";
import Doclist from "../../templates/Doclist/Doclist";
import LeftBar from "../../templates/LeftBar/LeftBar";
import "./MainWindowContents.css";
export default function MainWindowContents() {
    return (
        <div style = {{flex: 1, display: 'flex'}}>
            <LeftBar></LeftBar>
            <div style ={{flex: 1, display: 'flex'}}>
                <PanelGroup direction="horizontal" className="panelgroup-container">
                    <Panel minSize={20} maxSize={70} defaultSize={30}>
                        <Doclist></Doclist>
                    </Panel>
                    <PanelResizeHandle></PanelResizeHandle>
                    <Panel minSize={30} maxSize={80} defaultSize={70}>
                        <MainDemo></MainDemo>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}
const MainDemo = () => {
    return (
        <div className="main-demo-container">
            <h1>Main Demo</h1>
            <p>This is the main demo area.</p>
        </div>
    );
}