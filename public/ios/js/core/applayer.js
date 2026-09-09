/* ============ 应用注册表 + 窗口管理（打开/关闭动画）+ 全局返回键 ============ */

import { el, haptic, Bus } from './utils.js';
import { Statusbar } from './statusbar.js';
import { resetNavs, navBack } from './nav.js';

const registry = {};
let current = null; // { app, win, content, offNav, offSb }

/* iframe 应用后台保活：关闭后窗口原位隐藏但继续运行（iframe 不重载），
   重开时恢复现场（界面/滚动/输入状态全保留）；上滑关闭卡片时才真正销毁 */
const keepAliveWins = new Map(); // id -> { app, win, content }

/* ---- 后台预热窗口池：壳层启动时预创建的 iframe 应用窗口 ----
   窗口提前挂入 #app-layer（display:none），iframe 在用户解锁浏览主屏期间
   完成加载与 React 引导；不注册进 keepAliveWins/最近任务 → 不出现在
   多任务切换器、不挡主屏交互；openApp 时直接转正（不重新 mount、
   iframe 不重载），首次打开零加载 */
const prewarmedWins = new Map(); // id -> { app, win, content }

/* 后台预热 iframe 应用窗口（当前用于信息APP冷启动优化） */
export function prewarm(id) {
  if (current || keepAliveWins.has(id) || prewarmedWins.has(id)) return;
  const app = registry[id];
  if (!app || !app.keepAlive) return; // 仅 iframe 保活应用值得预热（DOM 应用挂载瞬时完成）
  const layer = document.getElementById('app-layer');
  if (!layer) return;
  const win = el('div', 'app-window');
  win.dataset.app = id;
  win.style.display = 'none'; // 隐藏驻留：不渲染不拦截事件，iframe 照常加载执行
  const content = app.fullscreen ? el('div', 'app-fullscreen') : el('div', 'app-root');
  win.appendChild(content);
  layer.appendChild(win);
  try {
    app.mount(content, { close: () => {}, openApp: () => {}, setSbStyle: () => {}, win, section: null });
  } catch (e) {
    console.error('[prewarm]', id, e);
    win.remove(); // 失败清理 → openApp 走新建路径兑底
    return;
  }
  prewarmedWins.set(id, { app, win, content });
}

/* 应用快照缓存：关闭应用时保存最终界面 DOM，供多任务切换器显示“实时界面”卡片。
   克隆时清除 id（防双 id 冲突）与媒体元素（canvas/video 克隆后无内容） */
export const Snapshots = {
  _store: new Map(),
  save(id, contentEl) {
    try {
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      clone.querySelectorAll('canvas, video, audio, iframe').forEach(n => n.remove());
      clone.style.pointerEvents = 'none';
      this._store.set(id, clone);
      if (this._store.size > 12) {
        this._store.delete(this._store.keys().next().value); // 淘汰最旧
      }
    } catch (e) { /* 快照失败 → 切换器降级为图标卡片 */ }
  },
  get(id) { return this._store.get(id) || null; },
  clear(id) { this._store.delete(id); },
};

export const Apps = {
  register(app) { registry[app.id] = app; },
  get(id) { return registry[id]; },
  all() { return Object.values(registry); },
  currentId() { return current ? current.app.id : null; },
};

/* 当子页面/应用自带返回按钮时，隐藏全局返回键避免双按钮 */
const OWN_BACK_SEL = [
  '.nav-page:not(.leave) .nav-btn.chev', // 导航栏自带返回的子页面
  '.nav-page:not(.leave) .pl-back',      // 音乐播放器自带返回
  '.nav-page:not(.leave) #mo-back',      // 朋友圈自带返回
  '.nav-page:not(.leave) [data-own-back]', // 通用：页面自带返回键（天气返回/扫一扫等）
  '#cp-back',                             // 指南针自带返回
  '#cam-back',                            // 相机自带返回
].join(', ');

/* 应用窗口内全局返回键（保活/预热窗口可能尚未创建，幂等补建） */
function ensureBackFab(win, app) {
  let f = win.querySelector('.app-back-fab');
  if (!f) {
    f = el('button', 'app-back-fab' + (app.sbStyle === 'dark' ? ' on-dark' : ''));
    f.type = 'button';
    f.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg>`;
    f.setAttribute('aria-label', '返回上级或主屏幕');
    win.appendChild(f);
  }
  return f;
}

export function openApp(id, opts) {
  if (current) return; // 同一时间只允许一个应用
  const app = registry[id];
  if (!app) return;
  haptic(8);
  resetNavs(); // 清空上一应用的导航栈注册

  const iconEl = opts instanceof Element ? opts : (opts && opts.icon);
  const section = opts && opts.section;

  const layer = document.getElementById('app-layer');
  const alive = keepAliveWins.get(id);
  const warm = prewarmedWins.get(id);
  let win, content, backFab;
  let mounted = false; // 窗口内容已在运行（保活恢复/预热转正）→ 不重复 mount
  let restored = false; // 保活恢复：沿用原版中心入场，不重设 transformOrigin

  if (alive && alive.win.isConnected) {
    /* ---- 后台保活恢复：窗口原样回前台（不重挂载、iframe 不重载） ---- */
    win = alive.win;
    content = alive.content;
    keepAliveWins.delete(id);
    win.classList.remove('anim-close');
    win.style.display = '';
    mounted = true;
    restored = true;
  } else if (warm && warm.win.isConnected) {
    /* ---- 预热窗口转正：壳层启动时已后台挂载（iframe 已在加载/引导），
       原样接管显示——不重新 mount、iframe 不重载，首载占位若仍在
       则随 load 事件自然移除；与新建窗口同享图标缩放入场 ---- */
    keepAliveWins.delete(id);
    prewarmedWins.delete(id);
    win = warm.win;
    content = warm.content;
    win.style.display = '';
    mounted = true;
  } else {
    keepAliveWins.delete(id); // 清理已失联的残留记录
    prewarmedWins.delete(id);
    win = el('div', 'app-window');
    win.dataset.app = id; // 供应用级 CSS 定向覆盖（如微信去除返回键毛玻璃）
    content = app.fullscreen ? el('div', 'app-fullscreen') : el('div', 'app-root');
    win.appendChild(content);
    /* 仅新建窗口挂入应用层：预热/保活窗口已在层内，appendChild 搬动
       会触发 iframe 重载（层内还有 st-cove-pool 等后续兄弟节点时
       非末位元素会被移动），故绝不重复挂载 */
    layer.appendChild(win);
  }

  /* 从图标位置缩放打开（预热转正是首次打开，与新建同享图标入场） */
  if (iconEl && !restored) {
    const r = iconEl.getBoundingClientRect();
    const sr = document.getElementById('screen').getBoundingClientRect();
    win.style.transformOrigin = `${((r.left + r.width / 2 - sr.left) / sr.width * 100).toFixed(1)}% ${((r.top + r.height / 2 - sr.top) / sr.height * 100).toFixed(1)}%`;
  }
  /* 挂入应用层仅限新建窗口（见上分支内）；保活/预热窗口原位不动，
     避免任何 DOM 搬动导致 iframe 重载丢状态 */
  /* ---- 全局返回键：所有应用左上角常驻（毛玻璃圆钮，纯图标） ----
     点击优先级：应用自定义覆盖层返回 → 应用内子页面返回 → 关闭应用回主屏 */
  backFab = ensureBackFab(win, app);

  win.classList.add('anim-open');
  setTimeout(() => { win.classList.remove('anim-open'); win.style.transformOrigin = ''; }, 520);
  backFab.onclick = () => {
    haptic(6);
    if (app.onBack && app.onBack() === true) return; // 1. 相册查看器/相机预览等自定义覆盖层
    if (navBack()) return;                           // 2. 导航栈子页面退一级
    closeApp();                                      // 3. 根页面 → 回主屏幕
  };
  const updateBackFab = () => {
    backFab.classList.toggle('hide', !!win.querySelector(OWN_BACK_SEL));
  };
  const offNav = Bus.on('nav:changed', updateBackFab);

  document.getElementById('home').classList.remove('show');
  /* 状态栏：先按应用声明样式立即上色，随后自动采样真实背景亮度修正 */
  const initStyle = app.sbStyle === 'dark' ? 'dark' : 'light';
  Statusbar.setStyle(initStyle);
  Statusbar.auto(initStyle, 480);
  /* 采样结果变化时同步返回键深浅变体 */
  const offSb = Bus.on('sb:style', ({ style }) => backFab.classList.toggle('on-dark', style === 'dark'));

  current = { app, win, content, offNav, offSb };
  if (app.immersive) {
    document.body.dataset.immersive = id;
  } else {
    /* 必须移除属性：置空字符串仍会命中 body[data-immersive] 选择器，导致系统状态栏永久隐藏 */
    document.body.removeAttribute('data-immersive');
  }
  Statusbar.clearIframeStyle();

  if (!mounted) {
    const ctx = {    close: () => closeApp(),
      openApp: (id2, opts2) => { closeApp(); setTimeout(() => openApp(id2, opts2), 380); },
      setSbStyle: (s) => Statusbar.setStyle(s === 'dark' ? 'dark' : 'light'),
      win, section,
    };
    try {
      app.mount(content, ctx);
    } catch (e) {
      console.error('[mount]', id, e);
      content.innerHTML = `<div class="empty-state"><div class="es-title">应用启动失败</div><div>${String(e.message || e)}</div></div>`;
    }
  }
  updateBackFab(); // 挂载后立即校正（兼容朋友圈/指南针/相机/天气等自带返回键的应用）
  Bus.emit('app:opened', id);
}

export function closeApp() {
  if (!current) return;
  const { app, win, content, offNav, offSb } = current;
  if (offNav) offNav();
  if (offSb) offSb();
  resetNavs();
  if (app.keepAlive) {
    /* iframe 应用：后台保活（快照不可用——iframe 克隆即丢失），收起动画后原位隐藏 */
    keepAliveWins.set(app.id, { app, win, content });
    win.classList.add('anim-close');
    setTimeout(() => {
      win.classList.remove('anim-close');
      if (keepAliveWins.get(app.id) && keepAliveWins.get(app.id).win === win) win.style.display = 'none';
    }, 400);
  } else {
    Snapshots.save(app.id, content); // 先存快照再 unmount（防 unmount 清理 DOM）
    try { app.unmount && app.unmount(); } catch (e) { console.error('[unmount]', e); }
    win.classList.add('anim-close');
    setTimeout(() => { win.remove(); }, 400);
  }
  current = null;
  document.body.removeAttribute('data-immersive');
  Statusbar.clearIframeStyle();
  document.getElementById('home').classList.add('show');
  Statusbar.setStyle('dark'); // 主屏过渡色：'app:closed' 事件后自动采样壁纸亮度修正
  Bus.emit('app:closed', app.id);
}

export function isAppOpen() { return !!current; }

/* 当前应用实时 DOM 根（切换器 live 卡片克隆用） */
export function getLiveContent() { return current ? current.content : null; }

/* 当前应用窗口（切换器取当前实例用；app-layer 里可能存在保活隐藏窗口，不能按选择器查） */
export function getCurrentWin() { return current ? current.win : null; }

/* 后台保活窗口（切换器 iframe 应用卡片预览用） */
export function getAliveWin(id) {
  const a = keepAliveWins.get(id);
  return a && a.win.isConnected ? a.win : null;
}

/* 运行中的 iframe 应用实例窗口（保活优先，预热实例同样在运行）——
   设置APP等外部模块向其发送跨页通知（如 API 配置刷新）用 */
export function getBackgroundWin(id) {
  const alive = keepAliveWins.get(id);
  if (alive && alive.win.isConnected) return alive.win;
  const warm = prewarmedWins.get(id);
  return warm && warm.win.isConnected ? warm.win : null;
}

/* 真正退出保活实例（多任务卡片上滑关闭）：销毁窗口与运行状态 */
export function killAlive(id) {
  const a = keepAliveWins.get(id);
  if (!a) return;
  keepAliveWins.delete(id);
  try { a.app.unmount && a.app.unmount(); } catch (e) { /* noop */ }
  a.win.remove();
}

/* 读取 iframe 应用当前界面，生成 srcdoc 静态快照（剥离脚本，保留样式与内容；
   窗口不能搬动——DOM 移动会导致 iframe 重载，故用快照展示）。
   原文档中已滚动到底的容器（如聊天消息列表）打标记，快照加载后由内联脚本恢复置底。
   快照自包含加固：
   ① 应用尚未渲染完成（#root 为空，如 iframe 重载中）→ 返回 null，切换器降级为图标占位卡
   ② <link rel=stylesheet> 全部内联为 <style>（同源读取 cssRules）——srcdoc 文档在部分
     浏览器/环境下外链样式可能不加载，一旦样式缺失内容会整体塌陷成"空白卡片"；
     相对 url() 按样式表地址改写为绝对地址，保证解析一致
   ③ 注入 <base href=原页面地址>：剩余相对资源按原页面解析，规避 srcdoc 基址继承差异 */
export function frameSnapshotSrcdoc(win) {
  try {
    const frame = win.querySelector('iframe');
    const doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return null;
    const root = doc.getElementById('root');
    if (root && root.childElementCount === 0) return null; // ① 未渲染完成 → 占位卡兜底
    const atBottom = [];
    doc.querySelectorAll('*').forEach(n => {
      if (n.scrollHeight > n.clientHeight + 4 && n.scrollHeight - n.scrollTop - n.clientHeight < 8) {
        n.setAttribute('data-ts-bottom', '1');
        atBottom.push(n);
      }
    });
    const clone = doc.documentElement.cloneNode(true);
    atBottom.forEach(n => n.removeAttribute('data-ts-bottom'));
    clone.querySelectorAll('script').forEach(n => n.remove());

    /* ② 样式表内联（防 srcdoc 外链失效 → 内容塌陷空白） */
    const sheetCSS = (sheet) => {
      let css = '';
      for (const r of sheet.cssRules) css += r.cssText + '\n';
      if (sheet.href) {
        css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
          if (/^(data:|blob:|https?:|#|\/\/)/i.test(u)) return m;
          try { return `url("${new URL(u, sheet.href).href}")`; } catch (e) { return m; }
        });
      }
      return css;
    };
    clone.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      try {
        const href = new URL(l.getAttribute('href') || '', doc.baseURI).href;
        const sheet = [...doc.styleSheets].find(s => s.href === href);
        if (sheet) {
          const st = doc.createElement('style');
          st.textContent = sheetCSS(sheet);
          l.replaceWith(st);
        } else {
          l.setAttribute('href', href); // 兜底：至少用绝对地址外链
        }
      } catch (e) { /* 保留原样 */ }
    });
    /* 快照无需预取资源 */
    clone.querySelectorAll('link[rel="preload"], link[rel="modulepreload"], link[rel="preconnect"], link[rel="dns-prefetch"]').forEach(n => n.remove());

    /* ③ 显式基址：剩余相对资源按原页面地址解析 */
    const base = doc.createElement('base');
    base.href = frame.contentWindow.location.href;
    const head = clone.querySelector('head');
    if (head) head.prepend(base);

    const resume = '<script>(function(){var l=document.querySelectorAll("[data-ts-bottom]");for(var i=0;i<l.length;i++){l[i].scrollTop=l[i].scrollHeight;l[i].removeAttribute("data-ts-bottom")}})()<\/script>';
    return '<!DOCTYPE html>' + clone.outerHTML + resume;
  } catch (e) { return null; }
}

/* 全局桥接（供相册等模块跳转使用，避免循环导入） */
window.__openApp = openApp;
window.__isAppOpen = isAppOpen;
window.__currentAppId = () => (current ? current.app.id : null);
window.__closeApp = closeApp;

/* 底部 Home 手势区上滑交互由 switcher.js 接管（多任务卡片流） */
