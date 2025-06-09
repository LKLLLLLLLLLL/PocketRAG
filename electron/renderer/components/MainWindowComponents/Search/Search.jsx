import React, { useState } from 'react';
import { Input } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import './Search.css';

const Search = ({
    className,
    inputValue,
    onChange,
    onKeyDown,
    onSearchClick,
    isLoading,
    isTimeout,
    showResult,
    resultItem
}) => {
    return(
        <div style={{ flexDirection: 'column' }} className={className}>
            <div className='maindemo-content'>
                <div className='searchinput-container'>
                    <Input.Search
                        type='text'
                        placeholder='请输入内容，按回车或点击搜索'
                        className='searchinput'
                        value={inputValue}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        onSearch={onSearchClick}
                        enterButton
                        size="large"
                        loading={isLoading}
                        disabled={isLoading}
                    />
                </div>
                <div className='searchresult-container'>
                    <div className='explanation-container'>
                        <div className="explanation">
                            {isTimeout ? <div>请求超时</div>
                                : isLoading ? <div><LoadingOutlined /> 搜索中...</div>
                                    : showResult ? <div>结果如下</div>
                                        : <div>请进行搜索</div>}
                        </div>
                    </div>
                    <div className='result-ul-container'>
                        {!isLoading && showResult &&
                            <ul className='result-ul'>
                                {resultItem.length > 0 ? resultItem : <li>未找到结果</li>}
                            </ul>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Search;