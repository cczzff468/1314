/* ============ Next.js 壳：单路由承载双形态 ============
   默认 /：服务端直接输出全屏 iframe /ios/index.html（iPhone 桌面）。
   HTML 一到浏览器，壳层静态资源立即并行加载 —— 不再等待 React 应用
   引导（默认模式本就只渲染这个 iframe，React 全量下载/解析/IndexedDB
   恢复对首屏是纯开销），刷新后锁屏即刻可见。
   /?as=app：桌面「信息」图标内嵌打开 → 客户端加载 React 信息APP主体。
   /?as=page&p=…：设置APP内嵌的独立设置页（API设置/识图模型/语音配置）。 */

import type { Metadata } from 'next'
import CoveApp from './CoveApp'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams
  /* 对齐原 React 引导行为：默认模式页面标题「主屏幕」，嵌入模式沿用 layout 标题 */
  if (!('as' in sp)) return { title: '主屏幕' }
  return {}
}

/* PWA Service Worker 注册（与 CoveBoot 内逻辑一致、幂等；
   嵌入模式由 CoveBoot 注册，此处覆盖默认直出模式） */
const SW_REGISTER =
  "if('serviceWorker' in navigator){try{navigator.serviceWorker.register('/sw.js').catch(function(){})}catch(e){}}"

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  if (!('as' in sp)) {
    return (
      <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', background: '#000' }}>
        <iframe
          title="主屏幕"
          src="/ios/index.html"
          allow="microphone"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </div>
    )
  }
  return <CoveApp />
}
