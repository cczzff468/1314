/* ============ 信息（内嵌我们的项目 = WeChat 克隆 App） ============ */

/* 在 iPhone 桌面里以应用窗口形式打开同源页面 /?as=app，
   即本项目主体。与其他 App 一致：共用系统状态栏 + 全局返回键（毛玻璃圆钮）。
   全局返回键点击时优先桥接 iframe 内部导航（__navBack），
   iframe 内已在根页面时返回 false → 关闭应用回主屏。 */

let frame = null;

export default {
  id: 'info',
  name: '信息',
  sbStyle: 'light',
  keepAlive: true, // iframe 应用后台保活：关闭后继续运行，重开恢复现场（iframe 不重载）

  mount(content) {
    frame = document.createElement('iframe');
    frame.setAttribute('src', '/?as=app');
    frame.setAttribute('title', '信息');
    frame.setAttribute('scrolling', 'yes');
    frame.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#fff;';
    content.appendChild(frame);
  },

  onBack() {
    try {
      const w = frame && frame.contentWindow;
      if (w && typeof w.__navBack === 'function') return w.__navBack() === true;
    } catch (e) { /* 同源 iframe 不会抛错，保险处理 */ }
    return false;
  },
};
