import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    background: '#2a2a2a',
                    border: '1px solid #f44336',
                    borderRadius: '4px',
                    color: '#ff6b6b',
                    textAlign: 'center'
                }}>
                    <h3>组件渲染出错</h3>
                    <p>错误信息: {this.state.error?.message}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            padding: '8px 16px',
                            background: '#00b0b0',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        重试
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;