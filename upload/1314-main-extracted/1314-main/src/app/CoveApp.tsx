'use client'

import dynamic from 'next/dynamic'

/* ============ 嵌入模式客户端入口 ============
   /?as=app（桌面「信息」图标内嵌打开）与 /?as=page（设置APP内嵌子页）时加载：
   App 依赖 window / IndexedDB，仅在客户端渲染。
   默认 /（iPhone 桌面）不经过本组件 —— 由 page.tsx 服务端直出壳层 iframe，零 React 引导。 */
const CoveBoot = dynamic(() => import('@/cove/CoveBoot'), {
  ssr: false,
  loading: () => null,
})

export default function CoveApp() {
  return <CoveBoot />
}
