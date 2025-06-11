import React from 'react';
import './CustomTable.css';

const CustomTable = ({
    columns = [],
    dataSource = [],
    pagination = {},
    scroll = {},
    locale = {},
    bordered = false,
    size = 'default',
    className = '',
    onRow,
    rowKey = 'key'
}) => {
    // 移除分页逻辑，直接使用所有数据
    const displayData = dataSource;

    // 获取行的key
    const getRowKey = (record, index) => {
        if (typeof rowKey === 'function') {
            return rowKey(record, index);
        }
        return record[rowKey] || index;
    };

    if (dataSource.length === 0) {
        return (
            <div className={`custom-table-container ${className} ${size} ${bordered ? 'bordered' : ''}`}>
                <div className="custom-table-wrapper" style={{ 
                    maxWidth: scroll.x
                }}>
                    <table className="custom-table">
                        <thead>
                            <tr>
                                {columns.map((column, index) => (
                                    <th
                                        key={column.key || index}
                                        style={{
                                            width: column.width,
                                            textAlign: column.align || 'left'
                                        }}
                                    >
                                        {column.title}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    </table>
                </div>
                <div className="custom-table-empty">
                    {locale.emptyText || '暂无数据'}
                </div>
            </div>
        );
    }

    return (
        <div className={`custom-table-container ${className} ${size} ${bordered ? 'bordered' : ''}`}>
            <div className="custom-table-wrapper" style={{ 
                maxWidth: scroll.x
            }}>
                <table className="custom-table">
                    <thead>
                        <tr>
                            {columns.map((column, index) => (
                                <th
                                    key={column.key || index}
                                    style={{
                                        width: column.width,
                                        textAlign: column.align || 'left'
                                    }}
                                >
                                    {column.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((record, rowIndex) => {
                            const key = getRowKey(record, rowIndex);
                            const rowProps = onRow ? onRow(record, rowIndex) : {};
                            
                            return (
                                <tr key={key} {...rowProps}>
                                    {columns.map((column, colIndex) => {
                                        let cellContent;
                                        
                                        if (column.render) {
                                            cellContent = column.render(record[column.dataIndex], record, rowIndex);
                                        } else {
                                            cellContent = record[column.dataIndex];
                                        }

                                        return (
                                            <td
                                                key={column.key || colIndex}
                                                style={{
                                                    width: column.width,
                                                    textAlign: column.align || 'left'
                                                }}
                                                className={column.ellipsis ? 'ellipsis' : ''}
                                            >
                                                {cellContent}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CustomTable;
