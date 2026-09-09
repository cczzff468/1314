# 项目工作日志

---
Task ID: 1
Agent: Z.ai Code (主控)
Task: 将上传的 workspace.zip（两个项目：Vite React「信息」APP + 原生JS iOS桌面模拟器）合并进当前 Next.js 项目，内容零改动，让所有 APP 在同一个项目中运行

Work Log:
- 解压并分析 /home/z/my-project/upload/workspace.zip，识别出双项目结构：
  - 根目录 = Vite React 项目「Cove」（信息APP，微信式聊天应用，src/ 共50个源文件）
  - ios/ = 原生JS iOS桌面模拟器（锁屏/主屏/动态岛/多任务 + 15个应用模块，54个文件）
  - 原架构：`/` → React渲染 iframe → /ios/index.html → 桌面「信息」图标 → iframe /?as=app（回到React主体）
  - 原后端：Vite 代理 /api → localhost:3001（未上传，需在本项目内重建）
- 迁移方案（内容零改动）：
  - `ios/` → `public/ios/`（54文件原样静态服务，ES Module/CSS 相对路径全部原样生效）
  - 上传的 `public/`（icons/、manifest.webmanifest、sw.js）→ Next.js `public/`
  - 上传的 `src/` → `src/cove/`（50文件原样，仅排除 Vite 专属的 main.tsx / vite-env.d.ts）
  - 新增 `src/cove/CoveBoot.tsx`：等价复刻 main.tsx 启动逻辑（hydrate → seedIfEmpty → #root createRoot 渲染 StrictMode<App/> + SW注册）
  - 重写 `src/app/layout.tsx`：zh-CN、Cove 标题、原 index.html 的 viewport/themeColor/manifest/icons/appleWebApp meta、引入 cove/index.css（移除 Tailwind globals.css 以保证像素级一致）
  - 重写 `src/app/page.tsx`：client 组件 + next/dynamic ssr:false 加载 CoveBoot（App 依赖 window/IndexedDB）
  - 新增 `src/app/api/chat/route.ts`：z-ai-web-dev-sdk LLM，stream=true 时透传上游 OpenAI 兼容 SSE（与 ios/js/api/chat.js readSSE 协议完全一致）
  - 新增 `src/app/api/image/route.ts`：z-ai-web-dev-sdk VLM（createVision），返回 {content}
  - `bun add jsqr`（钱包扫码页依赖）
  - `eslint.config.mjs`：src/cove/** 关闭 React 19 新增风格类规则（set-state-in-effect/refs/immutability），ignores 增加 upload/public/ios/mini-services
- 验证（agent-browser + z-ai vision 截图分析 + dev.log）：
  - `/` 锁屏渲染 ✓ → 上滑解锁 ✓ → 主屏15个图标+天气小组件（真实天气）✓
  - 「信息」APP（iframe /?as=app）打开 ✓：消息/联系人/发现/我 Tab + 种子好友（林小夏/陈默/苏晴）
  - 聊天会话打开 ✓、发消息 → 原版未配置API时的错误提示行为一致 ✓
  - __closeApp 桥关闭回桌面 ✓；计算器 7+19=26 ✓；备忘录/音乐/设置 APP ✓
  - 设置→AI聊天API→测试连接：✓连接成功 344ms 内置AI（POST /api/chat 200）
  - 设置→图像识别API→测试识别：✓识别成功 717ms 内置视觉模型（POST /api/image 200）
  - 桌面视口居中手机框 ✓；390x844 移动端全屏 ✓；控制台零错误 ✓；lint 0 error ✓

Stage Summary:
- 两个项目已合并为一个 Next.js 16 项目：`/` = 完整 iPhone 体验（锁屏→桌面→所有APP）
- 「信息」APP 与其他原生JS APP 架构完全保留（互嵌 iframe + 同源桥接 __closeApp/__navBack/postMessage 均有效）
- 原缺失的 localhost:3001 后端已用 z-ai-web-dev-sdk 在同项目内等价重建（/api/chat 流式 + /api/image 视觉）
- 应用源码 104 个文件全部原样迁移，唯一新增文件：CoveBoot.tsx、api/chat/route.ts、api/image/route.ts、page.tsx/layout.tsx（Next.js 壳）
- 关键产物：public/ios/**（原生JS）、src/cove/**（React 信息APP）、src/app/api/{chat,image}/route.ts

---
Task ID: 2
Agent: Z.ai Code (主控)
Task: 修复用户报告的三个多任务/主屏交互 bug：①进入信息APP退出后主屏点击无反应 ②其他APP内多任务切换器中信息卡片显示一片空白 ③信息界面内上滑无法唤起多任务切换器

Work Log:
- 复现与根因定位（agent-browser 桌面 + 390x844 移动布局双会话，合成事件模拟真实触摸）：
  - Bug① 根因（确定性复现）：信息APP为 keepAlive 应用，closeApp 后窗口 display:none 驻留 #app-layer，
    层不再满足 `:empty` → 全屏 `#app-layer`(z-index:100) 的 pointer-events:auto 拦截了主屏(#home, z-index:1)所有点击，
    elementFromPoint 证实点击命中 #app-layer 而非图标
  - Bug③ 根因（触摸设备，合成 pointercancel 序列验证）：React 手势仅绑定 Pointer 事件；
    真机上浏览器接管列表滚动时派发 pointercancel → end() 复位 tracking → 手势被杀死，且无 touch 事件兜底 → 永远无法触发
  - Bug② 根因（真实设备场景加固）：切换器信息卡片为 srcdoc 静态快照，依赖 <link> 外链 CSS；
    部分 srcdoc 环境外链样式不加载时内容整体塌陷成"空白卡"；另有 iframe 重载中(#root为空)时快照也为空白
- 修复（共 4 处，均不改动应用内容，只动壳层系统机制）：
  - public/ios/css/phone.css：`#app-layer` 永远 pointer-events:none，`#app-layer > .app-window` pointerEvents:auto
    （窗口移入切换器卡片后不再是层的子元素，`.ts-snap .app-window` 的 none 规则继续生效，天然互斥不冲突）
  - src/cove/App.tsx：底部上滑手势改双流 —— 鼠标/笔走 Pointer 事件、触摸走 touch 事件（touchmove 在浏览器接管滚动后仍持续派发），
    begin 加 tracking 起点守卫防双流覆盖；与壳层 onSwipe 的双绑定策略对齐
  - public/ios/js/core/applayer.js frameSnapshotSrcdoc：快照自包含加固 —— ① #root 为空(未渲染/重载中)返回 null → 切换器降级图标占位卡；
    ② <link rel=stylesheet> 全部内联为 <style>（同源读 cssRules，相对 url() 按样式表地址改绝对）；③ 注入 <base href=原页面URL>；
    ④ 剥离 preload/preconnect 等无效链
  - public/ios/js/modules/info.js + phone.css：iframe 首次挂载到 load 完成前显示系统级 spinner 占位（.app-boot-mask），
    消除首载/重载的"一片空白"感；保活重开不触发 mount 不受影响，占位不在 iframe 文档内不进快照
- 回归验证（桌面 1200x900 + 移动 390x844 双会话）：
  - Bug①：开信息→返回键退出→点计算器图标 → 正常打开 ✓（修复前 elementFromPoint 命中 #app-layer，点击无效）
  - Bug③：合成触摸序列（pointerdown→pointercancel→touchstart/touchmove 上滑40px）→ 切换器正常唤起 ✓（修复前 msgCount=0 不触发）；鼠标流同样正常 ✓
  - Bug②：信息关闭态+计算器前台→切换器 → 信息卡片完整渲染（CSS 1133 条规则全部内联、.phone 正常布局、VLM 视觉确认聊天列表清晰）✓；
    #root 清空模拟重载中 → 降级为图标占位卡（非空白）✓
  - 无回归：切换器实时窗口卡片 pointer-events:none / 点卡片恢复窗口 auto / 恢复后计算器按键可交互（按7显示7）✓；
    home-bar 点击、onSwipe 上滑、锁屏解锁均正常 ✓；lint 0 error ✓；双会话控制台零错误 ✓；dev.log 全 200 ✓

Stage Summary:
- 三个 bug 全部修复并双端验证：主屏点击被 #app-layer 拦截（CSS 层穿透修复）、触摸设备 pointercancel 杀手势（touch 双流兜底）、
  信息卡片空白（快照 CSS 内联自包含 + base 注入 + 空内容降级占位卡 + 首载 spinner）
- 修改文件：public/ios/css/phone.css、public/ios/js/core/applayer.js、public/ios/js/modules/info.js、src/cove/App.tsx
- 关键决策：不动应用内容与交互文案，所有修复都收敛在 iOS 壳层系统机制（事件层穿透、手势双流、快照自包含）

---
Task ID: 3
Agent: Z.ai Code (主控)
Task: 会话续接后的全面回归验证 + 修复触摸手势残留缺陷（bug③真机场景下仍未完全修复的问题）

Work Log:
- 续接会话：核对 Task 2 的 4 处修复代码均已写入（phone.css 层穿透 / applayer.js 快照自包含 / info.js 启动占位 / App.tsx 触摸双流）
- agent-browser 端到端回归验证：
  - Bug① 复验：开信息 → 返回键退出 → 命中测试 calculator 图标 ✓ → 实际点击计算器正常打开（VLM 确认科学计算器界面）✓
  - Bug② 复验：计算器前台 + 信息保活 → 上滑唤起切换器 → 信息卡片 srcdoc 140KB、<style> 内联 ✓、<base> 注入 ✓、VLM 确认聊天列表内容完整非空白 ✓
  - Bug③ 复验（关键发现）：合成触摸序列带 pointercancel 时手势死亡（不触发 ios-open-switcher），不带 pointercancel 则正常触发
- 根因定位（残留缺陷）：App.tsx 触摸双流的 `onPu` 绑定在全局 `pointercancel` 上且不区分 pointerType ——
  真机上浏览器接管滚动时先发 pointercancel（pointerType:'touch'）→ onPu 执行 end() → tracking 复位 →
  后续 touchmove 全部无效 → 手势被杀死。壳层 utils.js 的 onSwipe 无此问题（根本不监听 pointercancel）。
- 修复（1 处，不改动任何内容文案）：src/cove/App.tsx 的 onPu 增加 pointerType==='touch' 守卫 ——
  触摸指针的 pointerup/pointercancel 不在 Pointer 流收尾，触摸流由 touchend/touchcancel 收尾，与壳层 onSwipe 双流策略完全对齐
- 修复后复验（全部通过）：
  - touchstart → pointercancel → touchmove×4 → touchend 完整真机序列 → 切换器打开 ✓、ios-open-switcher 消息到达壳层 ✓
  - 中途 pointercancel 杀入（已滑 12px 后接管）→ 手势仍触发 ✓
  - 鼠标流（桌面拖拽上滑）→ 正常触发 ✓（无回归）
  - 屏幕中部起手上滑 → 不误触发（delta=0）✓
  - home-bar 点击显式入口 → 切换器打开 ✓；点击卡片恢复信息应用 ✓；再次退出→再点计算器图标 ✓（Bug① 全周期）
  - 控制台零错误、dev.log 全 200、lint 0 error（3 条既有 warning 非本次改动引入）

Stage Summary:
- 三个 bug 最终全部修复并双端（触摸流+鼠标流）验证通过
- 本轮关键修复：App.tsx onPu 触摸守卫，堵住 pointercancel 杀死触摸流的最后泄漏（真机 bug③ 的实际残留根因）
- 修改文件：src/cove/App.tsx（仅手势机制，内容零改动）

---
Task ID: 4
Agent: Z.ai Code (主控)
Task: 设置APP删除"AI 聊天 API/图像识别 API"两项；把信息APP"我→设置"里的"API设置/识图模型/语音配置"三项移到设置APP

Work Log:
- 结构调研：原生设置APP（settings.js）的旧API页配置壳层存储（Settings 'api'/'imageApi'）；
  信息APP三项为React页面（ApiSettingPage/VisionApiPage/VoiceApiPage），读写 Cove 存储（IndexedDB ios-im / kv / im.api）
- 迁移方案：设置APP子页用 iframe 内嵌同源独立页 /?as=page&p=api|vision|voice —— React 页面组件与存储零改动，仅换承载位置
- React 侧改动：
  - src/cove/App.tsx：新增 standalonePage() 分流（/?as=page&p=…）→ .phone.embedded 包裹单页渲染（返回键隐藏由壳层fab统一接管，onBack 桥 window.parent.__covePageBack 兜底）；Settings 渲染移除三个 onOpen* 传参
  - src/cove/pages/Settings.tsx：删除 API设置/识图模型/语音配置 三行及相关 props/导入（仅保留原有静态行）
  - src/cove/store.ts：新增 refreshApiSetting()（重读 im.api 入内存）+ 模块级 message 监听 cove-refresh-api
- 原生侧改动（settings.js）：
  - 删除：groupAPI 旧行、bindGroups 旧值刷新、openApiPage(599-1257) + openModelSheet + SPARK_SVG、section 深链、
    chat.js 全部 API 导入、dialog/escapeAttr/sheet 死导入、BOOKMARK/PLUS/LINK/EYE/X/MORE_SVG、ICONS.wrench/eye
  - 新增：三行（API设置/识图模型/语音配置，图标沿用信息APP设置页原样式）+ loadCoveApi()（同源直开 ios-im 读 im.api，
    localStorage 兜底）+ refreshCoveApiRows()（预览文案与React页完全一致）+ openCovePage()（noNavbar 子页 + iframe +
    app-boot-mask 占位 + __covePageBack 桥 + onPop 清理/通知/刷新）+ notifyInfoRefreshApi()（getAliveWin('info') →
    postMessage cove-refresh-api）
  - 关键修正：makePage 不转发 onPop 选项 → 改为 page.onPop = fn 挂载（nav.pop() 才能触发）
- settings.css：删除 82-556 行全部死 CSS（api-*/atr-*/md-* 均无引用，含 .btn-fill.ghost.danger 组合无使用）；
  新增 .st-cove-host iframe 宿主样式
- 端到端验证（agent-browser + VLM）：
  - 设置APP根页：API 配置分组三行齐全、旧两行已消失 ✓（DOM + VLM 双确认）
  - API设置子页：完整渲染（标题/预设 OpenAI·Azure·Ollama/地址/Key/模型/温度/Token/超时），fab 返回正常 ✓
  - 识图模型/语音配置子页：标题与内容完整渲染 ✓；子页弹出后桥清理、根页预览刷新 ✓
  - 存储互通：独立页填 API Key → 返回后根页预览"没有配置→模型：gpt-4o-mini"（原生读 ios-im DB）✓
  - 保活同步：信息APP打开显示 gpt-4o-mini → 关闭（保活）→ 设置APP改模型 gpt-4o-interop-xyz → 弹出子页时
    cove-refresh-api 消息送达信息APP（探针捕获）→ 重开信息APP（iframe 未重载）记忆匣子显示 gpt-4o-interop-xyz ✓
  - 信息APP"我→设置"：三行已移除（DOM + VLM 双确认，其余行保留）✓
  - 回归：控制台零错误、lint 0 error、dev.log 全 200（含 /?as=page&p=api）、settings.js 解析通过、
    主屏/解锁/应用开关流程正常 ✓

Stage Summary:
- 设置APP现承载全部四项 API/语音配置入口（API设置/识图模型/语音配置），旧的"AI 聊天 API/图像识别 API"及其 740 行页面代码已删除
- 信息APP"我→设置"仅保留通用设置项；三项配置页通过 /?as=page&p=… 独立模式在设置APP内呈现，UI 与信息APP内完全一致
- 三项配置的存储与消费者完全不变（im.api / ios-im IndexedDB），设置APP与信息APP双向实时互通（含保活内存同步）
- 修改文件：src/cove/App.tsx、src/cove/pages/Settings.tsx、src/cove/store.ts、public/ios/js/modules/settings.js、public/ios/css/modules/settings.css

---
Task ID: 5
Agent: Z.ai Code (主控)
Task: ①设置APP打开API配置子页秒开（用户反馈"为什么还要加载"）②删除原生微信模块 wechat.js

Work Log:
- 根因定位：openCovePage 每次点击都新建 iframe 加载 /?as=page&p=… → 整个 React 应用重新引导（HTML+JS+hydrate）
  → 每次打开都显示 app-boot-mask 转圈；重复打开重复付费
- 秒开方案（常驻池 + 覆盖层 + 消息切页）：
  - src/cove/App.tsx：standalone 页模式支持 postMessage 切页（{type:'cove-page',p}→setPage）+ 就绪回执
    （{type:'cove-page-ready'}，防监听器晚于切页指令就绪丢消息）；页面组件与文案零改动
  - settings.js：单一 iframe 常驻 #app-layer（DOM 从不搬动→永不重载），设置APP mount 时即预载；
    openCovePage 改为推占位导航页 + 显示常驻覆盖层（z:60，高于窗口(z-auto)、低于返回键(z:300)，
    状态栏900/切换器860天然更高）；三页切换走 postMessage（同一 React 实例换组件）；
    入/离场动画复用全局 navEnter/navLeave 关键帧与 nav.push/pop 同步
  - 生命周期钩子：Bus app:closed → 立即隐藏+清 __covePageBack 桥+notifyInfoRefreshApi；
    MutationObserver 监听 #task-switcher class → 切换器开=隐藏（窗口搬入卡片时覆盖层不能叠在上层），
    收起=子页未退且设置仍前台则原位恢复（iframe 未动→内容与滚动全保留）
  - 切换器卡片内容：隐藏期间向占位宿主注入 frameSnapshotSrcdoc 静态快照（与信息APP卡片同源技术），
    恢复时移除——修复"正在使用"卡片空白问题
  - 验证中发现并修复：app:closed 处理器在"覆盖层已被切换器隐藏"路径早退 → 桥未清+刷新通知丢失 →
    改为 coveVisible/coveRestore/covePageEl 三态任一即收尾
- wechat.js 删除（1281行）+ wechat.css 删除（376行）：
  - 共享 CSS 选择器迁移 misc.css：.avatar.av-sil(.group)、.contacts-letter、.wx-d-*、.picker-grid、
    .wechat-green（仍被通讯录/朋友圈/主题使用）；--wechat 变量保留（misc/phone.css 在用）
  - index.html 去 wechat.css link；main.js 去 import+注册（16个应用）；icons.js 去 wechat 图标定义
    （所有图标使用点均有 Registry.get/typeof 守卫，安全）；home.js RETIRED_APPS 注释更新（过滤器保留
    兼容存量 homeLayout）
  - contacts.js「发消息」：改 openApp('info')，删除原生会话创建+sessionStorage openConv 桥（仅微信消费）
  - camera.js「发送给 AI 助手」：删除 wechat 动态导入；改为照片落相册（防丢失）+ 跳转信息APP；
    desc「跳转到微信聊天」→「跳转到信息聊天」
- 端到端验证（agent-browser 桌面 + 390x844 移动双会话 + VLM 截图分析）：
  - 秒开：点击后 0.7-1.8ms 覆盖层可见、无转圈、React 内容已渲染（VLM 确认 API表单/标题/状态栏完整）；
    api→vision→voice 切页实测 20.2ms；重开设置APP（池跨会话存活）依旧 0.7ms 秒开
  - 导航一致性：返回键（fab z:300 在覆盖层之上可点击）→ 根页恢复+预览刷新"没有配置"+桥清理；
    postMessage 切页内容逐页验证正确
  - 切换器：开=覆盖层隐藏+卡片显示 API 页静态快照（VLM：表单与标题、应用名脚注、无异常浮层）；
    点当前卡收起=快照移除+覆盖层恢复+页面内容/状态原样（iframe 从未重载）；底部上滑 dismissToHome=
    应用关闭、主屏显示、无覆盖层泄漏、桥已清
  - 互通回归：子页 pop → 信息APP（保活 iframe）探针收到 cove-refresh-api ✓；
    通讯录发消息 → 打开信息APP（React 聊天列表完整，VLM 确认）而非微信 ✓
  - 双端控制台零错误、lint 0 error（3条既有 warning）、dev.log 全 200（/、/?as=app、/?as=page&p=api）、
    移动端覆盖层 0,0,390,844 铺满（VLM 无错位）

Stage Summary:
- API配置/识图模型/语音配置三个子页打开零加载：常驻池预载 + 覆盖层显隐 + postMessage 切页，
  除首次预载竞态外永无转圈；池跨设置APP会话存活，切换器往返不重载
- 原生微信模块彻底删除：文件+注册+图标+样式链接+两处跳转引用全清理，共享样式迁 misc.css，
  通讯录/相机的跳转入口改指「信息」APP
- 修改文件：src/cove/App.tsx、public/ios/js/modules/settings.js、public/ios/css/modules/settings.css、
  public/ios/css/modules/misc.css、public/ios/index.html、public/ios/js/main.js、
  public/ios/js/core/icons.js、public/ios/js/core/home.js、public/ios/js/modules/contacts.js、
  public/ios/js/modules/camera.js；删除：public/ios/js/modules/wechat.js、public/ios/css/modules/wechat.css

---
Task ID: 6
Agent: Z.ai Code (主控)
Task: 性能优化：①刷新网页后进入太慢（锁屏出现前要等整个 React 应用引导）②进入信息界面仍有加载转圈（iframe 冷启动）

Work Log:
- 根因定位（两条独立瓶颈）：
  - 瓶颈①：`/` 是 'use client' 页面 + dynamic(ssr:false) 加载整个 Cove React 应用（50 源文件全量模块图
    + IndexedDB hydrate）——而默认模式最终只渲染一个 `<iframe src="/ios/index.html">`，
    React 全量下载/解析/引导对首屏是纯开销，锁屏被阻塞
  - 瓶颈②：点「信息」图标时 info.js mount 才创建 /?as=app iframe → 冷启动（Next render + 全量客户端
    模块 + hydrate + render），app-boot-mask 转圈 1-2 秒
- 修复①（首屏零 React 直出）：
  - src/app/page.tsx 重写为 server component：searchParams 分流——无 `as` 参数直接 SSR 输出
    黑底全屏 iframe /ios/index.html（与 App.tsx 默认分支 JSX 完全一致）+ 内联 SW 注册脚本；
    generateMetadata 无 as 时 title='主屏幕'（对齐原 React document.title 行为）
  - 新增 src/app/CoveApp.tsx（'use client' + dynamic ssr:false）承载 as=app / as=page 模式，
    行为与原 page.tsx 完全一致；CoveBoot/App 零改动（iframe 内仍按 window.location.search 分流）
  - 效果：HTML 一到浏览器，壳层静态资源立即并行加载，锁屏 44-63ms HTML / 135-205ms DCL 出现
- 修复②（信息APP后台预热）：
  - applayer.js 新增 prewarmedWins 池 + prewarm(id)：壳层启动时预创建 .app-window（display:none 挂
    #app-layer，不进 keepAliveWins/最近任务 → 不出现在切换器、不挡主屏）并调用 app.mount（iframe 在
    用户解锁期间后台完成加载与 React 引导，load 后 mask 自移除）
  - openApp 三分支：保活恢复（原样）/ 预热转正（display:'' 接管，不重复 mount、iframe 不重载，享
    图标缩放入场）/ 新建（原路径兜底，预热失败自动回退）；backFab 提取 ensureBackFab 幂等补建
  - 新增 getBackgroundWin(id)（保活优先、预热实例也算运行中）——settings.js notifyInfoRefreshApi
    改用之：预热期间设置APP改配置也能实时同步到预热实例内存，转正后不陈旧
  - main.js boot() 尾部（Lock.show + Settings 预载之后、app:ready 之前）prewarm('info')
- 修复过程中发现并修掉自身引入的 bug：公共路径 layer.appendChild(win) 对非末位子元素是 DOM 搬动 →
  iframe 重载（设置APP常驻池 st-cove-pool 在层内时预热窗口被从队首搬到队尾、探针丢失+内容清空）——
  改为仅新建窗口分支内挂载，保活/预热窗口原位不动
- 端到端验证（agent-browser 桌面 + 390x844 移动 + VLM 截图分析 + 探针哨兵变量防重载检测）：
  - 刷新进入：HTML 44-63ms、DCL 135-205ms、锁屏即显、title=主屏幕、/ 无 React root（零 Cove 模块下载）
  - 信息秒开：点击图标 0.5-10ms 窗口转正（探针哨兵存活=iframe 零重载）、boot-mask 不存在、消息列表
    立即完整渲染（VLM 双端确认）；解锁前预热已完成（React root 已渲染、mask 已移除）
  - 预热与常驻池共存场景（曾触发重载 bug 的场景）修复后：解锁→设置→API子页→返回→关闭→点信息
    → 1.2ms 秒开、哨兵存活、内容立即完整
  - 保活链路回归：返回键关闭→窗口 display:none 驻留→重开 0.6ms 哨兵存活；切换器信息卡 140KB srcdoc
    + 内联 <style>（Bug② 无回归）；信息内触摸上滑唤起切换器（Bug③ 无回归）；关闭信息后主屏计算器
    可点击（Bug① 无回归）
  - 互通回归：设置子页弹出/关闭 → cove-refresh-api 分别送达保活实例与预热实例（getBackgroundWin
    覆盖）；设置API子页 1.3ms 秒开（Task 5 无回归）
  - 移动端 390x844：iframe 390x844 铺满、秒开、VLM 确认布局无错位；控制台零错误、页面零错误、
    lint 0 error（3条既有 warning）、dev.log 全 200

Stage Summary:
- 刷新后进入速度：`/` 首屏不再下载/引导整个 React 应用（服务端直出壳层 iframe），锁屏 HTML 级秒出
- 进入信息界面零加载：壳层启动即后台预热信息APP窗口（display:none 驻留、不进切换器），
  点击图标直接转正（0.5-10ms、无转圈、iframe 从未重载）；预热期间配置变更经 getBackgroundWin 实时同步
- 关键教训：appendChild 对非末位子元素是 DOM 移动（会重载 iframe）——保活/预热窗口绝不重复挂载
- 修改文件：src/app/page.tsx（重写）、src/app/CoveApp.tsx（新增）、
  public/ios/js/core/applayer.js、public/ios/js/main.js、public/ios/js/modules/settings.js

---
Task ID: 7
Agent: Z.ai Code (主控)
Task: 世界书模块完整开发：主屏入口 + 世界书管理/新建/条目列表/条目编辑四层 UI + 范围逻辑（全局/局部/专属）+ AI聊天关键词检测与 System Prompt 注入，数据存 IndexedDB

Work Log:
- 数据层：public/ios/js/core/db.js 版本 3→4，新增 worldbooks（key:id, idx:updatedAt）与
  wbentries（key:id, idx:bookId）两张表；React 侧 openWbDb 不带版本打开（壳层建库/升级，
  万一库不存在 onupgradeneeded 补建两表，绝不与壳层版本冲突）
- 壳层模块 public/ios/js/modules/worldbook.js（新建 659 行）：
  - 根页面「我的世界书库」：统计行（共N个·最后更新）、书卡片（名称/范围彩色chip/启用开关/
    条目·关键词统计/编辑+更多按钮）、空态引导；nav onShow 返回时刷新卡片统计
  - 新建世界书：居中对话框（✕关闭/名称输入/范围三段选择+动态说明/取消·创建），
    创建后直进条目管理；更多菜单：停用启用/重命名/复制(连条目,默认停用)/删除(连条目)
  - 条目列表页：书名+范围说明头、范围行(actionSheet切换)、启用开关、
    专属范围「绑定角色」行、＋新建条目虚线按钮、条目卡片(启用圆点/名称/优先级徽标/
    关键词/插入位置)，条目按优先级降序
  - 编辑条目页：启用开关、条目名称(注明不发送给AI)、插入位置二段(角色定义之前/之后)、
    关键词输入(逗号分隔+说明)、优先级(数字越大越优先)、正文textarea、保存校验、删除
  - 绑定角色：底部 sheet 多选（好友列表从信息APP ios-im 库 kv/im.friends 同源直读，
    localStorage 兜底），勾选即改书.bound，完成保存
- icons.js 新增 worldbook 图标（绿渐变翻开书本+书页横线）；main.js 注册（17个应用）；
  home.js GRID_ORDER 末尾追加 worldbook（存量布局经兼容循环自动补到网格末尾）；
  index.html 引入 worldbook.css；worldbook.css 全套样式（复用 .row/.switch/.segmented/
  .inset-card/.dialog-mask/.sheet 等系统组件变量，深浅色自动适配）
- React 侧注入链路：
  - src/cove/utils/worldbook.ts（新建）：collectWorldbook(friendName, scanTexts) ——
    读 AppleAI 库两张表，范围语义：global=直出；local=关键词命中近期会话(扫描窗口)；
    exclusive=书.bound 含当前角色名+关键词命中；命中条目按优先级降序、上限24条/6000字，
    按插入位置聚合为 before/after 两个【世界书设定】文本块
  - src/cove/utils/ai.ts：systemPrompt/aiStream 增加 lore 参数——before 块置于 System
    Prompt 最前（LOCK_PROMPT 之前），after 块紧跟角色定义块（记忆/规则之前）
  - src/cove/pages/Chat.tsx：respond() 调 aiStream 前 collectWorldbook(friend.name,
    history.slice(-6))，try/catch 包裹失败不阻断聊天
- 端到端验证（agent-browser + fetch 探针拦截请求体 + VLM 截图分析）：
  - 主屏「世界书」图标渲染（网格末位第13个，存量布局自动补齐）✓；VLM 确认绿书图标位置正常
  - 四层 UI 全链路：新建对话框(名称+范围)→创建直进条目页→新建条目(名称/关键词/优先级/
    插入位置)→保存回列表→返回根页统计刷新(条目:1·关键词:3) ✓；数据跨刷新持久 ✓
  - 绑定角色：sheet 显示林小夏/陈默/苏晴（读信息APP好友）、勾选苏晴→完成→
    UI 与 DB bound 一致 ✓
  - AI 注入（林小夏/陈默两聊天会话 + 请求体探针）：
    local+关键词命中 → lore 注入且在角色定义之前 ✓；local+全新会话无关键词 → 不注入 ✓；
    local+前一条消息含关键词 → 注入（会话扫描窗口语义）✓；global+无关键词 → 注入 ✓；
    exclusive+未绑定角色+关键词命中 → 不注入 ✓；exclusive+绑定陈默+关键词 → 注入 ✓；
    position=after → 注入在 LOCK_PROMPT 与「你是陈默」之后 ✓
  - VLM 四屏确认：条目列表页、编辑条目页(全部字段)、根页、新建对话框、390x844 移动端
    （窗口铺满无错位）均无布局问题；控制台零模块错误（仅测试脚本伪造事件的2条探测报错）；
    lint 0 error（3条既有 warning）；dev.log 全 200

Stage Summary:
- 世界书功能完整落地：壳层原生JS四层管理界面 + IndexedDB(worldbooks/wbentries) 存储 +
  信息APP聊天发送时读取匹配并按「角色定义之前/之后」注入 System Prompt
- 范围三语义（全局直出/局部关键词+当前会话扫描/专属绑定角色）全部端到端实测通过；
  优先级排序、24条/6000字上限、注入失败不阻断聊天
- 修改文件：public/ios/js/core/db.js、core/icons.js、core/home.js、js/main.js、index.html、
  css/modules/worldbook.css（新）、js/modules/worldbook.js（新）、
  src/cove/utils/worldbook.ts（新）、src/cove/utils/ai.ts、src/cove/pages/Chat.tsx

---
Task ID: 8
Agent: Z.ai Code (主控)
Task: 世界书界面微调（编辑/更多与开关对齐、分类筛选移底部、右上+号改黑、新建对话框范围文字变灰）+ 信息APP聊天设置新增「专属世界书」选择

Work Log:
- worldbook.js 卡片布局：bookCard 的「编辑」「更多(⋯)」按钮从底部 wb-card-actions 上移到
  wb-card-head 头部行，与启用开关同一行垂直居中对齐；删除 wb-card-actions 区块；
  空间优化（头部 gap 10→8px，编辑按钮紧凑化 28px 高、更多按钮改纯图标无底色）
- 分类筛选移到底部：makeRootPage 不再在滚动区内渲染 wb-filter，改为 build(body, pageEl)
  里向 .nav-page 追加 .wb-filterbar 常驻底部栏（flex:none + 毛玻璃 nav-bg + 上分隔线 +
  22px 底部留白避开 home-bar）；applyStats 的 chip 高亮改经 body.closest('.nav-page') 查找；
  .wb-body 底部 padding 46px→14px；子页面（条目页/编辑页）不受影响，仅根页有筛选栏
- 右上角 + 号改黑色：所有世界书页面 makePage 增加 className:'wb-page'，
  worldbook.css 新增 .wb-page .nav-btn.pill-btn{color:var(--text)} 覆写 notes.css 的
  accent 蓝（同时条目页 + 号与编辑页「保存」按钮一并变黑，深色模式自动近白）
- 新建世界书对话框「范围后面的字」变灰：.wb-sp-name 由 var(--text)(黑) 改为 #8E8E93
  （iOS systemGray，深色模式 rgba(235,235,245,.55)），.wb-sp-desc 由 text-2 改为 text-3，
  范围选择区整体灰阶化；选中项仅靠边框+勾选标识
- src/cove/utils/worldbook.ts 新增导出：ExclusiveBook 接口、listExclusiveBooks(friendName)
  （列出全部专属书并标注 bound/boundCount/entryCount）、setExclusiveBound(bookId, friendName, on)
  （把角色名加入/移出书.bound 并回写 DB，附 updatedAt）；WbBook 补 updatedAt 字段
- src/cove/pages/ChatSettings.tsx 新增「专属世界书」分组（自动翻译之下）：
  useEffect 加载列表（组件每次进入重挂载即刷新），每本书一行（名称+状态预览+Switch），
  开关乐观更新+DB 回写+失败回滚+toast 提示；预览含 未启用提示/条目数/绑定情况；空态引导去世界书APP
- 端到端验证（agent-browser + 像素取样 + VLM 截图分析）：
  - 主界面：VLM 确认 + 号黑色、四格统计(0/1/1/2)、底部筛选栏固定底部、卡片 编辑/⋯/开关同一行对齐、黑白灰风格 ✓
  - 底部筛选交互：点「全局」→ chip+统计格高亮、列表过滤为空态；点「全部」恢复 ✓；更多(⋯)菜单正常弹出 ✓
  - 新建对话框：计算样式+截图像素双重验证 .wb-sp-name = rgb(142,142,147)（真灰色）✓
  - 条目列表页：+ 号黑色 ✓、无筛选栏（仅根页）✓、创建专属书「苏晴专属设定」直进条目页+绑定角色行 ✓
  - 聊天设置：苏晴会话 → 聊天设置 → 「专属世界书」分组显示该书（已启用·命中关键词时注入），
    开关打开 → toast「已绑定」+预览更新+DB bound=["苏晴"] ✓；世界书APP侧绑定角色同步显示「苏晴」✓
  - 注入链路回归：专属书建条目（关键词「暗号」）→ 聊天发送含关键词消息 → fetch 探针捕获
    /api/chat 请求体 → System Prompt 含【世界书设定】块及条目内容「玫瑰」、位于角色定义之后 ✓
  - 390x844 移动端：铺满无错位、卡片同行不溢出、底部筛选栏正常 ✓；深色模式：分层协调、
    文字清晰、+号白色 ✓；控制台零错误、lint 0 error（3条既有 warning）、dev.log 全 200

Stage Summary:
- 世界书卡片操作上移对齐 + 底部常驻筛选栏 + 导航按钮黑化 + 对话框范围文字灰化，四项视觉调整全部落地
- 信息APP聊天设置 ↔ 世界书APP 数据完全互通：聊天设置绑定专属书直写 worldbooks.bound，
  世界书APP绑定角色页同步可见，注入链路端到端实测命中
- 修改文件：public/ios/js/modules/worldbook.js、public/ios/css/modules/worldbook.css、
  src/cove/utils/worldbook.ts、src/cove/pages/ChatSettings.tsx

---
Task ID: 9
Agent: Z.ai Code (主控)
Task: 世界书界面第二轮细化：编辑/⋯ 移到开关右侧 + 图标线条化 + 统计条缩小 + 专属筛选联系人下拉 + 弹层蓝色黑灰化 + 聊天设置专属世界书分组可收缩

Work Log:
- worldbook.js 卡片头布局：DOM 顺序改为 图标→名称→范围chip→开关→编辑→更多(⋯)（开关在前，编辑/⋯ 在开关右面）；
  .wb-card .switch margin-left:auto 使开关+编辑+更多整组靠右
- 前置图标全部线条化（去填充底）：.wb-card-icon（书卡）、.wb-ri-scope/doc/link（条目页行图标）、
  .wb-sp-icon（新建对话框范围行）、.wb-dialog-hero-icon（对话框图标头）→ 透明底 + inset 1.4px 描边 +
  var(--text-2) 线条图标（选中态 .on 用 var(--text)）
- 统计条缩小：padding 13/12→8/7.5px、数字 21.5→16px、标签 11→10px、圆角 15→12px、指示条 2.5→2px
- 专属视角联系人下拉：根页导航右新增 .wb-ctbtn 胶囊（「全部角色」+ 下箭头），仅 curScope==='exclusive'
  时显示（applyStats 控制 display + 同步标签）；点击弹 actionSheet（全部角色/信息APP好友，当前项 ✓ 前缀），
  选择后 loadBooks 按 book.bound.includes(联系人) 过滤；离开专属筛选自动重置 curContact；
  联系人无书时空态「「X」暂无专属世界书」
- ui.js 弹层组件加可选 cls 参数（dialog/confirmDialog/promptDialog/sheet/actionSheet → mask 加类）；
  worldbook.js 所有弹层调用传 cls:'wb-mono'；worldbook.css 新增
  .wb-mono .action-sheet-btn:not(.danger)/.dialog-btns button:not(.danger) → var(--text)（原蓝 accent）、
  .wb-mono .sheet-actions .btn-fill → 黑底白字（危险红保留）
- 返回键黑色：.wb-page .nav-btn.chev.only{color:var(--text)}（原蓝）；条目页可点值（范围/绑定角色）
  .wb-page .row-val.tappable → var(--text-2)（原蓝）
- 新建世界书对话框复查：.wb-sp-name #8E8E93 灰、.wb-sp-desc text-3 灰（像素实测 rgb(142,142,147) ✓）
- ChatSettings.tsx 专属世界书分组可收缩：表头行改 button（lore-collapse-head）+ Chevron 旋转指示
  （lore-chev open=rotate90，.open）；默认展开；收缩时预览显示「共 N 本 · 已绑定 M 本」汇总
- 端到端验证（agent-browser 桌面 + 390x844 移动 + VLM 截图分析 + 计算样式像素级断言）：
  - 卡片顺序（DOM + VLM 双确认）：图标→名称→chip→开关→编辑→⋯ ✓；无横向溢出（桌面+移动）✓
  - 统计条紧凑（VLM 确认）✓；+ 黑色 ✓；返回键 rgb(0,0,0) ✓（深色近白 ✓）
  - 线条图标：计算样式 background rgba(0,0,0,0) + inset 描边 + VLM 确认「线条描边样式」✓
  - 专属下拉：点底部「专属」chip → 下拉出现（display:flex、标签「全部角色」、黑色）→ 弹层含
    全部角色/林小夏/陈默/苏晴（黑字）→ 选苏晴 → 标签=苏晴、列表过滤只剩「苏晴专属设定」✓；
    选林小夏 → 空态「「林小夏」暂无专属世界书」✓；切回「全部」→ 下拉隐藏、curContact 重置 ✓
  - 弹层黑灰化：更多菜单/范围切换菜单/联系人下拉 actionSheet 全部 rgb(0,0,0)（删除保留红）✓
  - 新建对话框：范围名 rgb(142,142,147) 灰 ✓、图标头透明底+描边 ✓
  - 聊天设置（React /?as=app）：专属世界书分组展开（2 本书）→ 点表头收缩（chevron 归位、
    预览「共 2 本 · 已绑定 1 本」、书行隐藏）→ 再点展开 ✓；绑定开关回归（滚动后点击 →
    on=true + toast 已绑定 + DB bound 写入，再关回原状）✓
  - 移动端 390x844：卡片同行不溢出、筛选栏贴底 844、专属下拉可开可选 ✓；
    深色模式：黑白灰协调无蓝色、下拉/加号白色清晰、开关近白轨道 ✓
  - lint 0 error（3条既有 warning）；dev.log 全 200；双会话控制台零错误

Stage Summary:
- 八项调整全部落地：编辑/⋯ 在开关右面、前置图标线条样式、统计条缩小、专属筛选右上角联系人下拉、
  新建对话框范围文字灰（复查通过）、返回键黑色、聊天设置专属世界书可收缩、世界书所有蓝色（返回键/
  可点值/动作菜单/对话框按钮/底部面板完成键）全部黑灰化
- 关键机制：ui.js 弹层组件新增 cls 通道（向后兼容），世界书弹层经 wb-mono 标记实现单色调覆写，
  不影响其他 APP 的弹层配色
- 修改文件：public/ios/js/core/ui.js、js/modules/worldbook.js、css/modules/worldbook.css、
  src/cove/pages/ChatSettings.tsx、src/cove/index.css

---
Task ID: 10
Agent: Z.ai Code (主控)
Task: 专属界面联系人下拉与「我的世界书库」标题同行右对齐 + 世界书注入 System Prompt 改为规范格式（使用规则块 + 条目标题 + 优先级）

Work Log:
- worldbook.js：联系人下拉从导航栏 right 移入 wb-hero（新增 .wb-hero-row 包裹标题+下拉胶囊），
  仅专属筛选时显示；applyStats 改在 body 内查找 .wb-ctbtn（原 nav 侧查询作废）；
  按钮绑定 haptic + pickContact()，aria-label 保留
- worldbook.css：.wb-hero-row flex/space-between（标题左、胶囊右、垂直居中）；
  .wb-ctbtn 从 nav-btn 附属样式改为独立胶囊（30px 高、15px 圆角、rgba(120,120,128,.14) 灰底、
  0.5px 内描边、按压 scale(.94)，深浅色模式通用）；补回误删的 .wb-hero-sub
- src/cove/utils/worldbook.ts：注入格式重构 —— 新增 WB_RULES 常量（【世界书使用规则】
  四条规则：优先参考/不复述解释/自然融入/以用户最新发言为准）；fmt 改为
  「WB_RULES + 空行 + 逐条条目」结构，每条带标题【世界书条目 - 名称】（无名称退化为
  【世界书条目】）；matched 补 name 字段；保留高优先级在前排序与 24条/6000字上限
- 端到端验证（agent-browser + fetch 探针 + VLM + 真模型回放）：
  - 标题行对齐：专属筛选 → 下拉出现于「我的世界书库」右侧同行（桌面 sameRow=true、
    右缘=行右缘；390x844 移动端标题 x=20 / 下拉右缘 370=390-20 对称、无溢出）✓
  - 下拉交互：选「苏晴」→ 标签+列表过滤只剩「苏晴专属设定」；选「林小夏」→ 空态
    「「林小夏」暂无专属世界书」；切回「全部」→ 下拉隐藏 ✓
  - VLM 截图确认：胶囊与标题同行垂直居中、无错位溢出、全黑白灰无蓝色；深色模式
    下拉白字 rgb(255,255,255) + 灰底正常 ✓
  - 注入格式探针：React 信息APP（/?as=app）苏晴会话发送含「上海+暗号」消息 →
    捕获 /api/chat 请求体 → System Prompt 含完整【世界书使用规则】块 +
    【世界书条目 - 城市设定】(优先级200) 在 【世界书条目 - 秘密暗号】(优先级100) 之前 +
    位置在角色定义之后 ✓；第二次发送回归同样命中 ✓
  - 真模型行为回放：把捕获的 System Prompt+消息直接 POST /api/chat（内置AI）→
    回复「玫瑰啊！你怎么突然要上海来…」——自然使用设定、不追问出处、不复述设定 ✓
  - 控制台零错误、dev.log 全 200、lint 0 error（3条既有 warning）

Stage Summary:
- 联系人下拉移到标题行右对齐（含移动端/深色适配），专属视角过滤交互回归通过
- 世界书 System Prompt 注入格式与用户规范完全一致：使用规则块 + 带标题条目 + 优先级排序，
  经 fetch 探针（线上格式）与真实模型（行为自然融入设定）双重验证
- 修改文件：public/ios/js/modules/worldbook.js、public/ios/css/modules/worldbook.css、
  src/cove/utils/worldbook.ts

---
Task ID: 11
Agent: Z.ai Code (主控)
Task: 电量低电量外框不变红 + 钱包页零钱区改灰底居中带充值提现 + 服务图标线条化 + 银行卡实体卡片与详情页 + 零钱通开通界面

Work Log:
- phone.css：删除 .sb-batt.low 的 border-color 与 ::after（正极凸点）红色覆写，
  低电量仅 .sb-batt-fill 电量条变红，外框/凸点保持 40% currentColor
- WalletHome.tsx：零钱区重构 —— 新 .wallet-balance-block（灰底 #e3e3e6、金额居中、
  下方「充值/提现」白底按钮），替换原白底左对齐+箭头卡片；服务列表（零钱/零钱通/
  亲属卡/银行卡/账单）图标全部改线条样式（.wi-line-icon：透明底+1.4px 内描边+
  currentColor 描边 SVG，¥币/菱形/卡+心/卡+芯片/票据）
- App.tsx：openWalletPage 增加 mode 参数、View 增加 walletChange.mode；
  WalletHome 充值/提现按钮直达零钱页并预开对应弹窗（Change 接 initialMode prop）
- types.ts/store.ts：BankCard 增 cardNo（完整卡号）；WalletState 增 fundOpened
  （loadWallet 显式读取，未开通=先展示开通界面）
- BankCards.tsx：银行卡改实体卡片视觉（.bankcard-vis：银行色渐变卡面+圆形行徽+
  卡类型 chip+芯片图形+分组卡号+持卡人，1.586 宽高比+卡面高光+按压缩放），
  列表项点击进入「银行卡详情」页（大卡+所属银行/卡类型/卡号/持卡人/预留手机号/
  可用余额/绑定时间 7 行 + 解绑银行卡按钮 + Modal 确认）；保存卡时存完整卡号
- ChangeFund.tsx：新增开通界面（fundOpened=false 时渲染）—— 零钱通品牌头 +
  收益卡（七日年化 1.9860% 大字 + 7 根橙色收益柱状图 + 能赚又能花标语）+
  三个卖点行（随时转出/天天有收益/消费付款，线条图标）+ 协议勾选行（圆形 checkbox，
  未勾选开通时 toast 拦截）+ 橙色「开通零钱通」大按钮 → 点击写入 fundOpened=true
  并进入零钱通主页；1分钱起转入说明
- index.css：新增 .wallet-balance-block/.wallet-op-btn/.wi-line-icon、
  .bankcard-vis 系列/.bank-detail-*、.fund-open-* 系列（含收益柱、协议勾选、
  开通按钮）；移除废弃 .bank-card*/.bank-card-bal、.wallet-balance-card 旧样式
- 端到端验证（agent-browser + VLM + 计算样式断言，桌面 1280x800 + 移动 390x844）：
  - 电量：手动加 .low（去 charging）→ 边框/凸点 color(srgb 0 0 0 / 0.4)（非红）、
    电量条 rgb(255,59,48) 红 ✓；VLM 确认「外框黑灰、仅电量条红」✓
  - 钱包：零钱块灰底 rgb(227,227,230)+金额居中（中心偏差<2px）+充值/提现白按钮 ✓；
    5 个服务图标透明底+内描边（无彩色渐变）✓；VLM 双确认 ✓；390 宽无溢出、
    按钮各 159px ✓
  - 充值按钮 → 零钱页 +「从银行卡充值」弹窗自动打开（initialMode 生效）✓
  - 零钱通：进入（未开通）→ 开通界面（收益率/7 柱/三卖点/协议/开通按钮）✓；
    取消勾选 → 点开通 → toast「请先阅读并同意相关协议」拦截 ✓；勾选 → 开通 →
    toast「零钱通已开通」+ 主页余额 ¥1,288.07 ✓；VLM 确认界面结构 ✓
  - 银行卡：添加（自动生成卡号 6225 80xx…）→ 保存 → 实体卡片（CMB 招商银行红渐变、
    宽高比 1.59、卡号/持卡人/下方可用余额）✓ → 点卡片 → 详情页 7 行信息（所属银行/
    卡类型/完整卡号/持卡人/手机号/可用余额/绑定时间）✓ → 解绑 → Modal 确认 →
    卡删除回空态 ✓；VLM 确认实体卡片视觉 ✓
  - 控制台零错误、dev.log 全 200、lint 0 error（3条既有 warning）

Stage Summary:
- 五项需求全部落地：电量低电量外框不再变红；钱包零钱区灰底居中+充值/提现直达弹窗；
  服务图标线条化；银行卡实体卡片+详情页（余额/卡号/持卡人/银行等）；零钱通微信式
  开通界面（协议勾选+开通按钮+收益展示）
- 修改文件：public/ios/css/phone.css、src/cove/types.ts、src/cove/store.ts、
  src/cove/App.tsx、src/cove/pages/wallet/WalletHome.tsx、Change.tsx、
  BankCards.tsx、ChangeFund.tsx、src/cove/index.css

---
Task ID: 12
Agent: Z.ai Code (主控)
Task: 钱包第四轮细化：①零钱后面的灰色加深 ②付款码/收款码/扫一扫图标线条化
③开通零钱通界面再美化（仿微信）④银行卡卡片再美化 + 添加时可选卡面颜色

Work Log:
- index.css：.wallet-balance-block 灰底 #e3e3e6 → #d1d1d6（明显加深）、label 同步
  #55555a；.change-hero 从透明改为同款 #d1d1d6 圆角灰卡（margin 10/14、radius 14），
  .change-title 变灰 —— 钱包页与零钱页的余额区形成统一灰底设计语言
- WalletHome.tsx + index.css：付款码/收款码/扫一扫三个图标去彩色渐变底（绿/橙/蓝），
  改 .wallet-pay-icon 线条样式（透明底 + 1.4px inset 描边 #d9d9de + currentColor 描边
  SVG，与服务列表 .wi-line-icon 同语言）
- ChangeFund.tsx + index.css 开通页美化：
  - .fund-open-page 专属柔和暖渐变（#ffbd59→#ffd98a→#f4f4f5，与主页饱和橙区分）
  - 品牌头放大（38px 白底 logo 带投影、21px 标题）、.fund-card 暖色投影
  - 收益率 38px；7 柱图：常态浅金渐变、末柱 .hot 高亮橙 + 顶部辉光；新增走势说明行
    （近7日收益率走势 · 低风险 + 橙色图例块）
  - 新增「收益试算」行（¥10,000 → 每日 ¥0.54 橙色数字，灰底圆角条）
  - 开通按钮加 box-shadow 橙色投影 + :active scale；新增底部「了解零钱通 · 常见问题」
    链接行；CALC_DAILY 常量按利率程序化计算
- types.ts：BankCard 新增 colorIdx?: number（-1/缺省=经典跟随银行主色）
- BankCards.tsx + index.css 银行卡美化 + 选色：
  - CARD_COLORS 六色色板（曜石黑/深海蓝/翡翠绿/酒红/香槟金/暮紫）+「经典」（跟随银行）
  - 添加表单：顶部「卡面预览」实时预览卡（随银行/类型/卡号/持卡人/颜色联动）+
    「卡片颜色」mini 卡式色板（4列网格、选中白圈+黑描边+白勾、按压缩放）
  - CardVisual：colorIdx 选中时用双色渐变（125deg），经典走银行主色；新增 NFC 非接触
    波纹图标（芯片行右侧）；UNIONPAY 银联标识改为全尺寸显示（原仅大卡）
  - .bankcard-vis 质感升级：16px 圆角、0 10px 26px 深投影、::before 左上径向高光
    （原有 ::after 斜向光带保留）；save() 写入 colorIdx，列表/详情共用 CardVisual 自动生效
- 端到端验证（agent-browser 390x844 + 计算样式断言 + VLM 截图审查 + 壳层集成冒烟）：
  - 钱包页：零钱块 rgb(209,209,214)=#d1d1d6 ✓ label rgb(85,85,90) ✓；
    三个付款图标 background rgba(0,0,0,0) + inset 1.4px rgb(217,217,222) +
    color rgb(58,58,60) ✓（VLM 确认线条描边无彩色底）
  - 零钱页：hero 灰底 14px 圆角、金额居中 ✓（VLM 确认圆角灰卡）
  - 零钱通开通页：暖渐变/38px 收益率/7柱+末柱高亮/走势说明/收益试算 ¥0.54/
    CTA 投影/底部链接全部渲染 ✓（VLM 确认无重叠溢出）；协议取消勾选→开通→
    toast 拦截「请先阅读并同意相关协议」✓；勾选→开通→「零钱通已开通」+主页
    ¥1,288.07 ✓（重置 fundOpened 走 IndexedDB + reload）
  - 银行卡：添加表单 7 色板（经典+6色）4+3 网格、选中勾选+外圈 ✓（VLM 确认）；
    选翡翠绿→预览卡即变绿渐变 ✓；切深海蓝→生成卡号→保存→列表卡
    rgb(18,58,117)→rgb(49,107,181) 渐变 + NFC + UNIONPAY + 16px 圆角 ✓；
    点卡→详情页大卡同色 + 7 行信息（所属银行/卡类型/卡号/持卡人/手机号/余额/绑定时间）✓
  - 壳层集成（/ 路由）：解锁→点信息图标→APP 内恢复银行卡页（视图持久化）→
    深海蓝卡正常渲染 → 返回钱包页零钱块/线条图标同 /?as=app 一致 ✓
  - VLM 五屏 + 表单屏全部「无布局问题」；控制台零错误、dev.log 全 200、
    lint 0 error（3条既有 warning）

Stage Summary:
- 四项需求全部落地：零钱余额区灰底加深（钱包页+零钱页统一 #d1d1d6 灰卡）；
  付款码/收款码/扫一扫线条化（与服务图标统一黑白灰语言）；零钱通开通页仿微信精修
  （柔和暖渐变+高亮柱图+收益试算+投影CTA+底部链接）；银行卡六色可选卡面
  （实时预览+NFC+全尺寸银联标+质感升级）
- 关键机制：BankCard.colorIdx 持久化选色（-1=经典），CardVisual 单点渲染列表/预览/详情；
  开通页与主页用 .fund-open-page 类区分渐变基调
- 修改文件：src/cove/types.ts、src/cove/pages/wallet/WalletHome.tsx、ChangeFund.tsx、
  BankCards.tsx、src/cove/index.css（Change.tsx 结构未动，仅 CSS）

---
Task ID: 13
Agent: Z.ai Code (主控)
Task: 钱包第五轮修正：①删除零钱页「我的零钱」后误加的灰卡（上轮误解）②钱包页零钱块改
深灰底白字 ③开通零钱通界面换微信式折线面积图 ④修复「开通后又要再开通」（fundOpened
持久化丢失）

Work Log:
- index.css：.change-hero 回滚上轮改动（去 bg/margin/圆角，恢复 padding 26px 0 10px 透明），
  .change-title 恢复 #1a1a1a —— 零钱页金额区直接放在页面浅灰底上（无灰卡）
- index.css：.wallet-balance-block 灰底 #d1d1d6 → #3a3a3c 深灰，label → rgba(255,255,255,.72)、
  amount → #fff（深灰底白字，充值/提保持白按钮，对比强烈）
- ChangeFund.tsx + index.css 开通页再美化（仿微信）：
  - 柱状图换 SVG 平滑折线面积图：chartPts/chartLine（三次贝塞尔平滑）/chartArea 程序化生成，
    橙色 2.2px 折线 + 线性渐变面积填充（#ffb400 .26→0）+ 末端白描边圆点
  - 新增 7 格日期轴（近7日实际日期 M/D，末位橙色加粗，flex space-between + 底部分隔线）
  - 基金 pill 旁新增「低风险」pill（.fund-open-pills）；删除原柱图/图例说明 CSS
- store.ts 持久化加固（「开通后又要再开通」根因修复）：
  - 根因：store 模块在 Fast Refresh/HMR 重新求值时 memory Map 被清空且不重新 hydrate →
    loadWallet 回落默认值（fundOpened=false 弹开通页），且此后任何钱包写入会把默认数据
    回写 IndexedDB（连银行卡一起抹掉）
  - 修复①：memory Map 与 dbPromise 挂 globalThis（window.__coveStoreMemory/__coveStoreDb
    单例，模块重载复用，HMR 不丢状态）
  - 修复②：钱包写入同步镜像 localStorage 'im.wallet.mirror2'（新 key，避开 hydrate 的
    legacy 'im.wallet' 兜底读旧数据），loadWallet 以镜像合并兜底（镜像每次保存同步刷新、
    永不旧于 IndexedDB）
- 端到端验证（agent-browser 390x844 + 计算样式 + VLM + HMR 实测）：
  - 零钱页：hero 背景透明 rgba(0,0,0,0)、标题 #1a1a1a（VLM 确认无灰卡）✓
  - 钱包页：零钱块 rgb(58,58,60)=#3a3a3c、金额白色（VLM 确认深灰块对比强烈、布局无问题）✓
  - 开通页：SVG 折线 #ff9d00 + 面积渐变 + 末点圆点 + 日期 9/3…9/9（末位橙）+ 双 pill
    （易方达…/低风险）+ 0 根旧柱 ✓；VLM 确认布局协调无重叠溢出 ✓
  - 持久化（关键路径）：重置 fundOpened → 开通（toast「零钱通已开通」+ 主页 + 镜像
    fundOpened:true）→ **reload 后直接进零钱通主页（不再弹开通页）** ✓；会话内返回钱包
    再进零钱通 → 主页 ✓
  - HMR 实测：开通后 touch ChangeFund.tsx 触发 Fast Refresh（store 模块重载）→
    fund 主页保持、开通页未复现、__coveStoreMemory 存活、镜像 intact ✓
  - 控制台零错误、dev.log 全 200、lint 0 error（3条既有 warning）

Stage Summary:
- 三项视觉修正落地：零钱页灰卡删除（恢复微信式透明底）、钱包零钱块深灰底白字、
  零钱通开通页换平滑折线面积图+日期轴（更接近微信观感）
- 关键 bug 修复：fundOpened 持久化 —— globalThis 单例防 HMR 状态清空（同时保护银行卡
  等全部钱包数据不被默认值覆盖回写）+ localStorage 同步镜像双保险；重载/HMR/会话内
  三种路径均不再重复弹开通页
- 修改文件：src/cove/index.css、src/cove/pages/wallet/ChangeFund.tsx、src/cove/store.ts

---
Task ID: 14
Agent: Z.ai Code (主控)
Task: 修复两处钱包 UI 回归：①零钱通开通页底部「开通零钱通」按钮变成长方形 ②账单页筛选 chips 被挡住（横向溢出截断）

Work Log:
- 问题①定位：`.fund-page .page-body` 全局规则（index.css ~6774）把开通页滚动容器设为
  纵向 flex；开通按钮 `btn-orange-big fund-open-btn` 自带 `flex:1`（本为 fund-actions
  横排双按钮设计），在纵向容器里 flex-basis:0% → 按钮被压缩成 362×21 扁长条（实测
  height=21px），且其余子项被默认 flex-shrink 压扁
- 问题①修复（index.css）：新增 `.fund-open-page .page-body { display: block }`（恢复
  文档流，子项不再被压扁，内容超高走滚动）+ `.fund-open-page .fund-open-btn
  { display:block; width:100%; border-radius:999px }`（全宽胶囊形仿微信；因
  .btn-orange-big 在文件后部同优先级会覆盖，用 .fund-open-page 前缀提高优先级）；
  均放在全局 flex 规则之后确保级联生效
- 问题②定位：账单页 `.bills-filter` 7 个 chips 总宽 519px > 视口 390px，
  `overflow-x:auto + nowrap` 导致「亲属卡」「充值提现」两个选项被挡在屏幕外
  （实测 right=417/505 均超出 390）
- 问题②修复（index.css）：`.bills-filter` 改 `flex-wrap: wrap`，删除
  `overflow-x:auto / white-space:nowrap` → chips 自动换行为两行（5+2）全部可见
- 端到端验证（agent-browser 390x844 + 计算样式 + VLM + 壳层冒烟）：
  - 开通按钮：362×46、radius 999px、完全可见（top788-bottom834）✓；VLM 确认
    「全宽圆角胶囊形（药丸形），符合要求，无重叠溢出」✓
  - 开通流程回归：取消勾选协议→开通→toast 拦截「请先阅读并同意相关协议」✓；
    勾选→开通→toast「零钱通已开通」+主页 ¥1,288.07 ✓；主页转出/转入按钮
    159×46 不受影响（fund-actions 横排 flex 保留）✓
  - 账单筛选：7 chips 全部可见（两行：全部/红包/转账/收付款/零钱通 + 亲属卡/
    充值提现），filter 区 108-196 ✓；VLM 确认「7 个选项均完整可见，无截断」✓
  - chip 交互：点「充值提现」→ 高亮+过滤空态 ✓；点「全部」→ 恢复 1 组 ✓
  - iOS 壳层集成（/ 根路由 → 信息 APP iframe /?as=app）：账单页在 390px 内嵌
    iframe 中 7 chips 全部可见、wrap 生效 ✓
  - 控制台零错误（仅 HMR 日志）、dev.log 全 200、lint 0 error（3条既有 warning）

Stage Summary:
- 双 bug 根因均为 CSS 级：纵向 flex 容器 + flex:1 按钮冲突；横向溢出 + nowrap 截断
- 修复仅动 src/cove/index.css 两处（.bills-filter 换行、.fund-open-page 专属
  page-body 文档流 + 胶囊按钮），钱包其他页面（零钱/收款码/扫码 rp-sheet 按钮等
  flex:1 用法均在横排容器内）不受影响
- 修改文件：src/cove/index.css

---
Task ID: 15
Agent: Z.ai Code (主控)
Task: 钱包页入口重排：账单移到导航右上角（文字按钮），支付密码移到页底「微信安全支付」下方

Work Log:
- WalletHome.tsx：
  - 导航 right 由支付密码锁图标按钮改为「账单」文字按钮（wallet-bills-btn，
    onClick onOpen('bills')，aria-label=账单）
  - 服务列表删除账单行（原5行 → 4行：零钱/零钱通/亲属卡/银行卡），票据图标随之移除
  - 页脚「微信安全支付」下方新增 wallet-pwd-link 按钮（12px 锁图标 currentColor
    描边 + 「支付密码」文字，onClick onOpenPassword）
- index.css：
  - 新增 .wallet-bills-btn（覆盖 .nav-btn 36×36 圆形：width/height auto、
    radius 8px、padding 3px 6px、15px/500 字重、#576b95 蓝灰——与原锁图标同色系）
  - 新增 .wallet-pwd-link（居中小入口：12px 字号 #9aa4b2 与页脚同色、
    margin 2px auto、:active 浅灰底反馈）+ 注释
  - 删除废弃 .wallet-pwd-btn（padding:4px，已无引用）
- 端到端验证（agent-browser 390x844，iOS 壳层内嵌 iframe + /?as=app 直开双路径）：
  - 右上角「账单」：42×25、right=378 右对齐、rgb(87,107,149) ✓；
    点击 → 账单页打开（7 chips 全部可见，换行修复保持）✓
  - 服务列表：4 行、无账单行 ✓
  - 「支付密码」：位于微信安全支付正下方（footer.bottom < pwd.top）✓；
    点击 → 支付密码设置页（「开启支付密码」）✓ → 返回钱包 ✓
  - VLM 截图审查四项全部确认：右上角账单按钮位置合适无重叠、列表严格4行、
    底部支付密码入口存在、整页无重叠溢出错位
  - 控制台零错误、dev.log 全 200、lint 0 error（3条既有 warning）

Stage Summary:
- 钱包页信息架构微调完成：账单升为导航级入口（右上角文字按钮，微信蓝灰），
  支付密码下沉为页脚附属入口（安全支付语下方，低调灰），服务列表精简为 4 行
- 修改文件：src/cove/pages/wallet/WalletHome.tsx、src/cove/index.css

---
Task ID: 16
Agent: Z.ai Code (主控)
Task: ①删除钱包页「微信安全支付」页脚文字 ②修复矮视口下部分服务选择被裁剪看不见、页面无法滚动的问题（钱包下界面可滑动）

Work Log:
- WalletHome.tsx：删除 .wallet-footer 块（盾图标 + 微信安全支付文字），服务列表下方
  直接接「支付密码」入口；.wallet-footer/.wallet-shield CSS 保留（PayPasswordSet 页
  仍在用），.wallet-pwd-link 上边距 2→8px 补偿页脚移除后的间距
- 裁剪根因定位（375x667 实测复现）：.wallet-page .page-body 为纵向 flex（6774 全局组
  规则），矮视口下内容超高时子项默认 flex-shrink:1 被压缩 —— .wallet-services
  clientH 180 vs scrollH 242，「银行卡」整行被 overflow:hidden 裁掉完全不可见，且
  收缩吞掉溢出（overflow=0）导致 page-body 无法滚动；与 Task 14 开通按钮属同一 bug 族
- 修复（index.css）：flex 纵向 page-body 的直接子项统一 flex-shrink:0
  （覆盖 paycode/receivecode/scan/rp/fund/wallet/change 七页）—— 子项保持自然高度，
  超高时由 page-body 的 overflow-y:auto 正常滚动；change 页 .change-bottom 的
  margin-top:auto 底部锚定不受影响
- 逐页实测（agent-browser 375x667 + 390x844 双视口 + 滚动验证 + VLM）：
  - 钱包页 375x667：列表 0 裁剪、页面可滚 62px、滚动后银行卡行/支付密码完全可见 ✓；
    390x844：无溢出无裁剪、4 行 + 支付密码全部直接可见、布局不变 ✓
  - 零钱页：充值/提现按钮可见（overflow 0 无裁剪）✓；零钱通主页：overflow 4px
    可滚动、页脚可达 ✓；付款码/收款码：无裁剪 ✓；银行卡表单页（block 布局）：
    262px 滚动正常、颜色盘/保存可达 ✓；亲属卡「选择对象」弹窗：好友列表 162px
    全可见（自带 max-height 滚动）✓
  - 交互回归：右上角账单 → 账单页 7 chips 全可见 ✓；支付密码 → 密码设置页 ✓
  - VLM 四项确认：无微信安全支付字样、账单按钮正常、4 行完整无裁剪、无重叠溢出
  - 控制台零错误、lint 0 error（3条既有 warning）、dev.log 全 200

Stage Summary:
- 钱包页脚「微信安全支付」删除，支付密码入口上移直接跟随服务列表
- 关键修复：七类 flex 纵向 page-body 子项禁 flex-shrink —— 彻底解决矮视口下
  服务行/底部内容被裁剪且不可滚动的 bug 族（含 Task 14 同根因的泛化收尾）
- 修改文件：src/cove/pages/wallet/WalletHome.tsx、src/cove/index.css

---
Task ID: 17
Agent: main (Z.ai Code)
Task: 转账卡片颜色对齐真实微信转账橙（用户：让转账卡片颜色跟微信转账颜色一样）

Work Log:
- 定位现状：聊天转账卡片 .tf-card 与回执卡 .receipt-card.tf 均用 Ant Design 橙
  #fa8c16（偏深橙红），真实微信为柔和金橙
- 取证真实色值：image-search 搜真实微信截图（第1张腾讯来源为转账记录列表非目标，
  换关键词后命中荆楚网真实聊天截图，含转账1680元消息卡片）
- z-ai vision 对真实截图精确取色：主色 #F09A45、垂直微渐变顶部 #F7A85C →
  底部 #ED8E35、¥圆圈 rgba(255,255,255,.25) 白边白符、白字、圆角 8px
- 修改 src/cove/index.css 两处：
  - .tf-card：background #fa8c16 → linear-gradient(180deg,#f7a85c,#ed8e35)
  - .receipt-card.tf：同步渐变 + box-shadow 颜色改 rgba(237,142,53,.28)
  - 其余不动（.tf-claim-ok 确认收款按钮为微信绿 #07c160 本就正确）
- agent-browser 实测（390x844）：进苏晴聊天 → +面板 → 转账 88.88（备注测试转账）
  → 转账成功 → 返回聊天，.tf-card 计算样式 backgroundImage=
  linear-gradient(rgb(247,168,92),rgb(237,142,53))、radius 8px、210x80 ✓
- z-ai vision 复查截图：橙色 ≈#F09A45 柔和金橙与真实微信高度一致、文字清晰、
  与气泡布局协调 ✓
- lint 0 error（3 条既有 warning 基线不变）、dev.log 全 200 无错误

Stage Summary:
- 转账卡片（含已收款回执卡）颜色由 Ant 橙 #fa8c16 换为真实微信转账金橙渐变
  #F7A85C→#ED8E35（主色 #F09A45），经真实截图 VLM 取色 + 双重 VLM 视觉确认
- 修改文件：src/cove/index.css（2 处）

---
Task ID: 18
Agent: main (Z.ai Code)
Task: 转账卡片整体结构对齐真实微信（用户：让转账卡片跟微信一样）

Work Log:
- 取证（多源交叉验证）：
  - 真实聊天截图（荆楚网，含¥1680转账）canvas 像素级测量：卡片宽 65.6% 屏宽、
    橙体 68pt + 白色底条 ~30pt、橙色实色 #FBA03E≈WeUI #FA9D3B、底条白底 #FFF +
    #B2B2B2 灰字左对齐
  - GitHub 高仿微信项目 LiangNiang/fake-world 源码：两段式结构、状态图标
    （待收款=圆环双向箭头/已收款=对勾/已退还=返回箭头，SVG 直接复刻）、
    状态色 wechatOrange-3 #FA9D3B → wechatOrange-5 #FDE1C4 褪色、
    状态文案矩阵（你发起了一笔转账/请收款/已收款/已被退还）
  - VLM 无锚定记忆 ×2 + 双方案强制二选一测试：均裁定底条为「白底灰字」
    （fake-world 源码的同色橙底条方案被否，其红包渲染色亦偏离真微信，采信度降权）
- 实现两段式卡片（src/cove/pages/Chat.tsx + index.css）：
  - .tf-card：230px、圆角 10px、overflow hidden；.tf-card-body 橙 #FA9D3B
    （图标 34px SVG + ¥金额 17px/600 + 状态行 12px）；.tf-card-strip 白底
    11px #B2B2B2「微信转账」左对齐
  - 状态驱动：待收款=箭头图标+自定义备注(无则 你发起了一笔转账/请收款)、
    已收款=对勾+「已收款」、已退还=返回箭头+「已被退还」；已处理整卡褪色
    #FDE1C4 + 文字 #C87E2F（transferNote 辅助函数 + tf-done 类）
  - .receipt-card.tf 同步为 #FA9D3B 纯色（Task 17 渐变收编为官方橙）
- 端到端实测（agent-browser 390x844）：
  - 待收款：发 ¥13.14（备注请收下）→ body #FA9D3B + 备注正常显示 ✓
  - 已退还：AI 自动退还 ¥88.88/66.60 → #FDE1C4 褪色 + 已被退还 ✓
  - 收款链路：IndexedDB 注入好友 ¥52 转账 → 点卡弹确认收款 → 确认后卡片
    褪色「已收款」+ 回执消息出现 + 跳转账详情 ✓
  - VLM 两态四项检查（两段结构/图标/颜色/无布局问题）全部通过 ✓
- 测试数据清理：删 9 条测试消息（4转账+3退还+1回执+1文本）、7 条测试账单、
  余额 718.66→666.66 恢复、苏晴会话摘要恢复（消息 22→13、账单 8→1）
- lint 0 error（3 条既有 warning）、dev.log 全 200（1 条 AI 404 为未配置
  API key 的既有行为）

Stage Summary:
- 转账卡片完全重构为真实微信两段式：橙体（WeUI 官方橙 #FA9D3B、圆环状态图标、
  状态文案）+ 白底灰字「微信转账」条；已收款/已退还自动褪色 #FDE1C4
- 修改文件：src/cove/pages/Chat.tsx（卡片 JSX + transferNote 辅助函数）、
  src/cove/index.css（.tf-card 全家族样式重写 + .receipt-card.tf）

---
Task ID: 19
Agent: main (Z.ai Code)
Task: 转账卡片删除白色底条改为统一颜色，「微信转账」改为「转账」

Work Log:
- 用户需求：删除转账卡片下方白色区域、整卡统一颜色；「微信转账」文字改为「转账」
- 定位当前结构（Task 18 的两段式）：.tf-card 白底容器 + .tf-card-body 橙体
  #FA9D3B + .tf-card-strip 白底灰字(#B2B2B2)「微信转账」
- 修改 src/cove/pages/Chat.tsx（1 处）：条带文字「微信转账」→「转账」
- 修改 src/cove/index.css（3 处规则）：
  - .tf-card：background #fff → #fa9d3b（整卡统一橙）
  - .tf-card-body：删除自身 background（继承容器橙）、padding 底 16→7px
  - .tf-card-strip：padding 8px 12px 9px → 0 14px 13px、color #b2b2b2 →
    rgba(255,255,255,.85)（橙底半透明白字）
  - .tf-done 褪色态：.tf-card.tf-done { background:#fde1c4 }（整卡褪色）、
    strip 褪色色 rgba(200,126,47,.72)
- agent-browser 实测（390x844，/?as=app）：
  - 真实链路发两笔转账（¥8.88、¥66.60）均被 AI 苏晴秒退 → 意外获得两笔
    已退还褪色态样本：cardBg=rgb(253,225,196) 整卡统一、strip「转账」、无白区 ✓
  - IndexedDB(ios-im/kv) 注入好友 ¥52 待收款消息 → reload 后：
    cardBg=rgb(250,157,59)（#FA9D3B 统一橙）、230x91、strip=「转账」、
    stripColor=rgba(255,255,255,.85)、note=「请收款」✓
  - VLM 双态视觉审查：待收款「统一橙色无白色底条、布局正常」；已退还
    「统一浅橙、文字依次 ¥66.60/已被退还/转账、无布局异常」✓
- 测试数据清理：删 5 条测试消息（2 转账+2 退还回执+1 注入）、4 条测试账单，
  余额 718.66 未变（两笔均被退还自动回补）、消息 18→13、账单 5→1
- lint 0 error（3 条既有 warning 基线不变）、dev.log 全 200、页面无 console error

Stage Summary:
- 转账卡片由「橙体+白底灰字微信转账条」两段式改为单段统一橙色 #FA9D3B
  （已收款/已退还整卡褪色 #FDE1C4），底部小字改为「转账」白字 85% 透明度
- 修改文件：src/cove/pages/Chat.tsx（1 处）、src/cove/index.css（3 处规则）

---
Task ID: 20
Agent: main (Z.ai Code)
Task: 排查并修复「识别语音用不了」

Work Log:
- 诊断（agent-browser 实测）：浏览器 SpeechRecognition/mediaDevices/secureContext 均可用，
  点击语音输入提示「语音输入未开启，请在 设置-语音配置 中打开」→ 根因是
  store.ts 中 sttEnabled 默认 false（sttEnabled === true），开关藏在
  设置-语音配置 二级页面，新用户难以发现
- 次因排查：预览面板为 iframe 嵌入，Chrome 语音识别在 iframe 内无法访问麦克风；
  VoiceApiPage.testStt 已有 iframe 检测但 Chat.tsx 没有
- 修复 src/cove/store.ts（1 处）：sttEnabled 默认值 true（voice.sttEnabled !== false，
  仅显式关闭时保持关闭，尊重已关闭用户的选择）
- 修复 src/cove/pages/Chat.tsx startVoice（2 处）：
  - 新增 iframe 检测：预览框架内提示「请点预览面板上方 Open in New Tab 在新标签页
    打开后使用」
  - onerror 错误分类细化：network→识别服务网络异常、audio-capture→麦克风不可用
    或被占用（原统一显示「识别出错请再试」）
- 验证（agent-browser）：
  - 顶层窗口点击语音输入：不再提示未开启，SpeechRecognition 实际启动，headless
    无麦克风正确触发「麦克风权限被拒绝」提示（错误链路正常）✓
  - 注入 iframe 模拟预览面板：点击语音输入 → 正确提示「预览框架内无法使用
    麦克风，请点 Open in New Tab…」✓
  - 页面恢复正常渲染、无 console error ✓
- lint 0 error（3 条既有 warning）、dev.log 全 200

Stage Summary:
- 语音识别用不了的根因是开关默认关闭 + 预览面板 iframe 限制；已改默认开启并对
  iframe/网络/麦克风错误给出明确引导文案
- 修改文件：src/cove/store.ts（1 处）、src/cove/pages/Chat.tsx（2 处）

---
Task ID: 21
Agent: main (Z.ai Code)
Task: 优化 iframe 内语音功能提示为「一键新标签页打开」（用户遇到提示：
「页面正嵌在框架里运行，请在浏览器中用新标签页直接打开本页再测试」）

Work Log:
- 定位：该提示来自 VoiceApiPage.testStt 的 iframe 检测（设置-语音配置-测试连接）；
  用户在预览面板（iframe）内操作，麦克风权限不可用，旧提示只给文字引导，
  用户需手动找 Open in New Tab 按钮
- 优化方案：iframe 检测命中时直接 window.open(location.href, '_blank')
  自动弹新标签页（点击链路内不会被弹窗拦截；返回 null 时回退文字引导）
- 修改 src/cove/pages/VoiceApiPage.tsx testStt（1 处）：iframe 分支改为
  window.open + 「已在新标签页打开本页，请在新打开的页面里继续测试语音识别」
- 修改 src/cove/pages/Chat.tsx startVoice（1 处）：同样升级为 window.open +
  「已在新标签页打开，语音输入请在新打开的页面中使用」
- 验证（agent-browser）：
  - 语音配置页：注入嵌套 iframe → 点「测试连接」→ 真实弹出 2 个新标签页
    （tab t3/t4，URL=location.href）✓；stub window.open 同步验证：openedUrl
    正确、toast 文案「已在新标签页打开本页…」✓
  - 聊天页：iframe 内进林小夏聊天 → 点语音输入 → stub 验证 openedUrl=
    /?as=app、toast「已在新标签页打开，语音输入请在新打开的页面中使用」✓
  - 页面恢复正常、多余 tab 已清理 ✓
- lint 0 error（3 条既有 warning）、dev.log 全 200

Stage Summary:
- 预览面板内点击语音测试/语音输入时自动在新标签页打开应用（window.open），
  配 toast 引导；被弹窗拦截时回退文字提示
- 修改文件：src/cove/pages/VoiceApiPage.tsx（1 处）、src/cove/pages/Chat.tsx（1 处）

---
Task ID: 22
Agent: main (Z.ai Code)
Task: 语音识别改为后端 ASR（不弹新标签页、项目内直接测试、彻底修复识别不管用）

Work Log:
- 用户需求：① 不要自动弹新标签页，在项目内测试；② 语音识别不管用
- 根因分析：浏览器原生 SpeechRecognition 依赖 Google 语音服务（国内网络不可达），
  且预览 iframe 受权限策略限制——旧方案在真实部署环境也基本不可用
- 新方案：MediaRecorder 录音 → 前端解码降采样 16kHz 单声道 WAV → POST /api/asr →
  z-ai-web-dev-sdk（服务端）audio.asr.create 识别，完全不依赖浏览器语音服务
- 新增 src/app/api/asr/route.ts：POST { audio: base64 } → { text }，
  runtime nodejs、错误处理对齐 /api/chat 风格
- 新增 src/cove/utils/asr.ts：VoiceRecorder 类（getUserMedia + MediaRecorder 录音、
  60 秒上限在 Chat 层控制）、blobToWavBase64（decodeAudioData → 线性插值降采样
  16k → 16bit PCM + 44 字节 WAV 头 → base64）、recognizeBase64（fetch /api/asr）
- 改造 src/cove/pages/Chat.tsx：recogRef→recRef(VoiceRecorder)、新增 recognizing
  状态、startVoice 改 getUserMedia+MediaRecorder（无 iframe 预检、无 window.open）、
  stopVoice 停止→后端识别→文字追加输入框、语音条 UI 支持「正在识别…」态
- 改造 src/cove/pages/VoiceApiPage.tsx：testStt 重写为录 5 秒→后端识别→
  「测试通过，识别到：XXX」；移除 iframe 检测与 window.open；错误分类新增
  NotFound（未检测到麦克风设备）；表单说明改「录音后由服务端识别…页面内直接测试」
- 端到端验证：
  - z-ai tts 生成「今天天气真不错，我们一起去公园散步吧」→ curl POST /api/asr
    → 返回 {"text":"今天天气真不错，我们一起去公园散步吧"} 100% 准确 ✓
  - agent-browser：聊天页点语音输入（headless 无麦克风）→「无法启动录音，
    请检查麦克风后重试」不弹窗 ✓；语音配置页点测试连接 →「未检测到麦克风
    设备：请插入麦克风或检查系统设置」页面内直接提示 ✓；GET /api/asr 端点 ✓
  - dev.log POST /api/asr 全 200（识别 300-560ms）、lint 0 error
- 测试产物已清理（/tmp wav 与请求 JSON）

Stage Summary:
- 语音识别链路重构：浏览器 SpeechRecognition（Google 依赖，国内不可用）→
  MediaRecorder + 后端 z-ai ASR，项目页面内直接可用，不再弹新标签页
- 新增文件：src/app/api/asr/route.ts、src/cove/utils/asr.ts；
  修改文件：src/cove/pages/Chat.tsx、src/cove/pages/VoiceApiPage.tsx
