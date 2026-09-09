'use client'

/* ============ 信息APP 启动引导（Next.js 版 main.tsx） ============
   原 Vite 入口 src/main.tsx 的等价实现：
   1. hydrate()：从 IndexedDB / localStorage 恢复内存数据
   2. seedIfEmpty()：首次使用时写入演示数据
   3. 在 #root 上 createRoot 渲染 <App />（保留 StrictMode，与原版一致）
   4. 注册 Service Worker（/sw.js，PWA）
   App 组件本身零改动：默认渲染 iPhone 桌面（iframe → /ios/index.html），
   /?as=app 时渲染项目主体（由桌面「信息」图标内嵌打开）。 */

import React, { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import { hydrate, seedIfEmpty } from './store'
import './index.css'

export default function CoveBoot() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let root: Root | null = null

    hydrate().then(() => {
      seedIfEmpty()
      if (disposed || !host.isConnected || host.dataset.booted === '1') return
      host.dataset.booted = '1'
      root = createRoot(host)
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      )
    })

    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
      if (document.readyState === 'complete') register()
      else window.addEventListener('load', register, { once: true })
    }

    return () => {
      disposed = true
      /* 页面级组件，正常不会卸载；防御性清理避免重复挂载 */
      if (root) setTimeout(() => root?.unmount(), 0)
    }
  }, [])

  return <div id="root" ref={hostRef} />
}
