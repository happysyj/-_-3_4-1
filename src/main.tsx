import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#03030a] text-white p-6 text-center">
          <div className="max-w-md p-6 bg-slate-900 border-2 border-red-500 rounded-3xl shadow-2xl">
            <h1 className="text-2xl font-black text-rose-400 mb-3">화면 로딩 중 오류가 발생했습니다</h1>
            <p className="text-sm text-slate-300 mb-6">
              일시적인 리소스 로드 문제일 수 있습니다. 아래 버튼을 눌러 다시 시도해 주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-base transition-all cursor-pointer"
            >
              새로고침하여 다시 시작
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
