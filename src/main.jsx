import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 严格不导入外部 index.css 避免编译报错，直接依赖 index.html 里的 Tailwind CDN
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
