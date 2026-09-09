/* ============ 设置 ============ */

import { el, uid, Bus, fmtBytes, downloadJSON, haptic } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, confirmDialog, promptDialog, escapeHtml, loading } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';
import { applyTheme } from '../core/theme.js';
import { getBackgroundWin, isAppOpen, Apps as Registry, frameSnapshotSrcdoc } from '../core/applayer.js';
import { WeatherEngine } from '../api/weather.js';

let root = null;
let nav = null;

const chevron = '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
const rowIconHTML = (color, path) => `<div class="row-icon" style="background:${color}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg></div>`;

/* Apple ID 账户头像（渐变底 + 人形剪影，仿 iCloud 账户卡） */
const PERSON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.2a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8zm0 2.3c-4.2 0-7.8 2.6-7.8 5.9 0 1 .7 1.6 1.9 1.6h11.8c1.2 0 1.9-.6 1.9-1.6 0-3.3-3.6-5.9-7.8-5.9z"/></svg>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
/* Apple 标志（页脚水印） */
const APPLE_MARK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" opacity=".45"><path d="M17.05 12.54c-.02-2.2 1.79-3.26 1.87-3.31-1.02-1.49-2.61-1.69-3.17-1.72-1.35-.14-2.63.79-3.31.79-.69 0-1.74-.77-2.86-.75-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.72 1.05 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.92-1.07 2.64-2.12.83-1.22 1.17-2.4 1.19-2.46-.03-.01-2.29-.88-2.31-3.53zM14.31 5.66c.6-.73 1-1.74.89-2.75-.86.04-1.91.57-2.53 1.3-.55.64-1.03 1.66-.9 2.65.96.07 1.94-.49 2.54-1.2z"/></svg>';

/* iCloud 小云图标（账户卡副标题前缀） */
const ICLOUD_MINI = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6.5 6.5 0 0 0 5.2 11.5 4 4 0 0 0 6 19.5h11.5z"/></svg>';

const ICONS = {
  info: rowIconHTML('#8E8E93', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'),
  lang: rowIconHTML('#8E8E93', '<path d="M3 5.5h8M7 3.5v2M9.5 5.5c-.5 4-3 7.5-6.5 9.5M5 10.5c1 2 3 3.5 5 4.5M13.5 20.5l4-10 4 10M15 17h5"/>'),
  theme: rowIconHTML('#007AFF', '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>'),
  wall: rowIconHTML('#34AADC', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/>'),
  lockWall: rowIconHTML('#5BC0EB', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8 4V2.5M16 4V2.5M3 9h18"/>'),
  /* 信息APP移入的三项（图标沿用其“我→设置”页原样式） */
  coveApi: rowIconHTML('#34C759', '<rect x="4.5" y="7" width="15" height="11" rx="3"/><circle cx="9.5" cy="12.5" r="1.3" fill="#fff" stroke="none"/><circle cx="14.5" cy="12.5" r="1.3" fill="#fff" stroke="none"/><path d="M12 7V4.5"/><circle cx="12" cy="3.6" r="1.1" fill="#fff" stroke="none"/>'),
  coveVision: rowIconHTML('#5856D6', '<rect x="3.5" y="6" width="17" height="12" rx="3"/><circle cx="12" cy="12" r="3"/><circle cx="17.4" cy="9" r="1" fill="#fff" stroke="none"/>'),
  coveVoice: rowIconHTML('#FF9500', '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'),
  notify: rowIconHTML('#FF3B30', '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>'),
  camera: rowIconHTML('#8E8E93', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  location: rowIconHTML('#007AFF', '<path d="M20.5 10.5c0 6.5-8.5 12-8.5 12s-8.5-5.5-8.5-12a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.5" r="3"/>'),
  storage: rowIconHTML('#8E8E93', '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.5M7 16.5h.5"/>'),
  upload: rowIconHTML('#34C759', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 14l5-5 5 5M12 9v12"/>'),
  download: rowIconHTML('#34C759', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  weather: rowIconHTML('#007AFF', '<circle cx="12" cy="9" r="4"/><path d="M12 2.5v2M12 16v2M5 9H3M21 9h-2M6.4 3.6l1.4 1.4M16.2 13.2l1.4 1.4M6.4 14.4l1.4-1.4M16.2 4.8l1.4-1.4M9 20h6M11 22h2"/>'),
  city: rowIconHTML('#007AFF', '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.5M9 13h.5M9 17h.5M14 9h1M14 13h1M14 17h1"/>'),
  cloud: rowIconHTML('#007AFF', '<path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6.5 6.5 0 0 0 5.2 11.5 4 4 0 0 0 6 19.5h11.5z"/>'),
  media: rowIconHTML('#8E8E93', '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>'),
  server: rowIconHTML('#007AFF', '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.5M7 17h.5"/>'),
  cpu: rowIconHTML('#5E5CE6', '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v2M15 2.5v2M9 19.5v2M15 19.5v2M2.5 9h2M2.5 15h2M19.5 9h2M19.5 15h2"/>'),
  hapticIcon: rowIconHTML('#FF9500', '<rect x="8" y="2.5" width="8" height="19" rx="4"/><path d="M12 7.5v.5M12 11.5v.5M12 15.5v.5"/>'),
  lockPass: rowIconHTML('#007AFF', '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  lockKey: rowIconHTML('#5E5CE6', '<rect x="3" y="10" width="9" height="11" rx="2"/><path d="M12 10V6a3.5 3.5 0 0 1 7 0v4M6.5 14.5v2"/>'),
};

export default {
  id: 'settings',
  name: '设置',
  icon: AppIcons.settings,
  sbStyle: 'light',

  mount(rootEl, ctx, opts) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);
    /* 常驻配置页预载 + 生命周期钩子（池跨会话存活，此处仅幂等确保） */
    ensureCovePool();
    setupCoveHooks();

    const page = nav.makePage({
      title: '设置',
      large: true,
      build(body) {
        body.innerHTML = `
          ${searchBarHTML()}
          ${accountCard()}
          ${group1()}
          ${groupPasscode()}
          ${groupWallpaper()}
          ${groupAPI()}
          ${groupPrivacy()}
          ${groupStorage()}
          ${groupWeather()}
          ${footerHTML()}`;
        bindGroups(body);
        bindSearch(body);
      },
    });
    nav.setRoot(page);
  },

  unmount() { },
};

/* ---------- Apple ID 账户卡（仿 iOS 设置顶部） ---------- */
function accountCard() {
  return `
    <div class="inset-group st-account-group">
      <div class="inset-card">
        <div class="row st-account-row" data-nav="account">
          <div class="st-avatar">${PERSON_SVG}</div>
          <div class="row-label">
            <div class="st-account-name" id="st-account-name">Apple ID</div>
            <div class="st-account-sub">${ICLOUD_MINI}iCloud · 媒体与购买项目</div>
          </div>
          <div class="row-chevron">${chevron}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 搜索栏（支持实时过滤设置项） ---------- */
function searchBarHTML() {
  return `
    <div class="searchbar st-search">
      ${SEARCH_SVG}
      <input id="st-search" placeholder="搜索" autocomplete="off" enterkeyhint="search">
    </div>`;
}

function footerHTML() {
  return `
    <div class="st-footer">
      <div class="st-footer-mark">${APPLE_MARK}</div>
      <div>AppleAI Web 1.0</div>
      <div>纯前端 · 数据仅存于本机 IndexedDB</div>
    </div>`;
}

/* ---------- 分组 ---------- */
function group1() {
  return `
    <div class="inset-group">
      <div class="inset-card">
        <div class="row" data-nav="theme">${ICONS.theme}<div class="row-label">外观</div><div class="row-val" id="st-theme-val">自动</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="lang">${ICONS.lang}<div class="row-label">语言</div><div class="row-val">简体中文</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="about">${ICONS.info}<div class="row-label">关于本机</div><div class="row-val">AppleAI Web 1.0</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

/* ---------- 锁屏密码（安全分组） ---------- */
function groupPasscode() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">安全</div>
      <div class="inset-card">
        <div class="row" id="st-pass-sw-row">${ICONS.lockPass}<div class="row-label">锁屏密码</div><div class="switch" id="st-pass-sw"></div></div>
        <div class="row" id="st-pass-change-row">${ICONS.lockKey}<div class="row-label">更改密码</div><div class="row-val" id="st-pass-val">未设置</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupWallpaper() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">壁纸</div>
      <div class="inset-card">
        <div class="row" data-app="themes">${ICONS.wall}<div class="row-label">主屏幕壁纸</div><div class="row-val">点按更换</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-app="themes">${ICONS.lockWall}<div class="row-label">锁屏壁纸</div><div class="row-val">点按更换</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupAPI() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">API 配置</div>
      <div class="inset-card">
        <div class="row" data-nav="coveapi">${ICONS.coveApi}<div class="row-label">API设置</div><div class="row-val" id="st-cove-api-val">—</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="covevision">${ICONS.coveVision}<div class="row-label">识图模型</div><div class="row-val" id="st-cove-vision-val">—</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="covevoice">${ICONS.coveVoice}<div class="row-label">语音配置</div><div class="row-val" id="st-cove-voice-val">—</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupPrivacy() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">通用</div>
      <div class="inset-card">
        <div class="row" id="st-haptic-row">${ICONS.hapticIcon}<div class="row-label">触感反馈</div><div class="switch" id="st-haptic-sw"></div></div>
      </div>
    </div>
    <div class="inset-group">
      <div class="inset-group-title">隐私与权限</div>
      <div class="inset-card">
        <div class="row" data-act="perm-notify">${ICONS.notify}<div class="row-label">通知权限</div><div class="switch" id="pv-notify-sw"></div></div>
        <div class="row" data-act="perm-camera">${ICONS.camera}<div class="row-label">相机权限</div><div class="row-val" id="pv-camera">检查中…</div></div>
        <div class="row" data-act="perm-location">${ICONS.location}<div class="row-label">地理位置权限</div><div class="row-val" id="pv-location">检查中…</div></div>
      </div>
    </div>`;
}

function groupStorage() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">存储</div>
      <div class="inset-card">
        <div class="row" data-nav="storage">${ICONS.storage}<div class="row-label">存储空间</div><div class="row-val" id="st-storage-val">—</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-act="export">${ICONS.upload}<div class="row-label">导出全部数据 (JSON)</div></div>
        <div class="row" data-act="import">${ICONS.download}<div class="row-label">导入数据备份</div></div>
      </div>
    </div>`;
}

function groupWeather() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">天气</div>
      <div class="inset-card">
        <div class="row" data-act="weather-city">${ICONS.city}<div class="row-label">城市</div><div class="row-val" id="st-city-val">—</div></div>
        <div class="row" data-act="weather-unit">${ICONS.weather}<div class="row-label">温度单位</div><div class="row-val" id="st-unit-val">摄氏度 °C</div></div>
      </div>
    </div>`;
}

/* ---------- 绑定 ---------- */
async function bindGroups(body) {
  const theme = await Settings.load('theme', 'auto');
  const themeVal = body.querySelector('#st-theme-val');
  if (themeVal) themeVal.textContent = { light: '浅色', dark: '深色', auto: '自动' }[theme] || '自动';

  const nickname = await Settings.load('nickname', '我');
  const nameNode = body.querySelector('#st-account-name');
  if (nameNode && nickname) nameNode.textContent = nickname;

  refreshCoveApiRows(body);

  /* 触感反馈开关（全局，utils.haptic 尊重该设置） */
  const hapticOn = await Settings.load('haptics', true);
  const hapticSw = body.querySelector('#st-haptic-sw');
  if (hapticSw) {
    hapticSw.classList.toggle('on', !!hapticOn);
    const { setHaptics } = await import('../core/utils.js');
    setHaptics(!!hapticOn);
    body.querySelector('#st-haptic-row').onclick = async () => {
      const next = !hapticSw.classList.contains('on');
      hapticSw.classList.toggle('on', next);
      await Settings.set('haptics', next);
      setHaptics(next);
      if (next) haptic(8);
      toast('触感反馈已' + (next ? '开启' : '关闭'));
    };
  }

  /* 锁屏密码：开启 / 关闭 / 更换（密码盘复用 core/passcode.js） */
  const { Passcode } = await import('../core/passcode.js');
  const passSw = body.querySelector('#st-pass-sw');
  const passVal = body.querySelector('#st-pass-val');
  if (passSw) {
    const syncPassUI = () => {
      passSw.classList.toggle('on', Passcode.isOn());
      if (passVal) passVal.textContent = Passcode.isOn() ? '已开启' : Passcode.hasCode() ? '已关闭' : '未设置';
    };
    body.querySelector('#st-pass-sw-row').onclick = async () => {
      haptic(4);
      if (Passcode.isOn()) {
        /* 关闭需验证当前密码（iOS 行为） */
        const ok = await Passcode.ask({ title: '输入密码以关闭', verify: true });
        if (!ok) return;
        await Passcode.disable();
        syncPassUI();
        toast('锁屏密码已关闭');
      } else if (Passcode.hasCode()) {
        const ok = await Passcode.ask({ title: '输入密码以开启', verify: true });
        if (!ok) return;
        await Passcode.enable();
        syncPassUI();
        toast('锁屏密码已开启');
      } else {
        const code = await Passcode.ask({ title: '设置新密码', confirmSecond: true });
        if (!code) return;
        await Passcode.setCode(code);
        syncPassUI();
        toast('锁屏密码已开启');
      }
    };
    body.querySelector('#st-pass-change-row').onclick = async () => {
      haptic(4);
      if (Passcode.hasCode()) {
        const ok = await Passcode.ask({ title: '输入旧密码', verify: true });
        if (!ok) return;
      }
      const code = await Passcode.ask({ title: '设置新密码', confirmSecond: true });
      if (!code) return;
      await Passcode.setCode(code);
      syncPassUI();
      toast('密码已设置并开启');
    };
    syncPassUI();
  }

  const city = await WeatherEngine.getCity();
  const cityVal = body.querySelector('#st-city-val');
  if (cityVal) cityVal.textContent = city.city || '北京市';

  const unit = Settings.get('weatherUnit', 'c');
  const unitVal = body.querySelector('#st-unit-val');
  if (unitVal) unitVal.textContent = unit === 'c' ? '摄氏度 °C' : '华氏度 °F';

  // 存储估算
  try {
    const est = await navigator.storage?.estimate?.();
    const sv = body.querySelector('#st-storage-val');
    if (sv && est?.usage != null) sv.textContent = `${fmtBytes(est.usage)} / ${fmtBytes(est.quota)}`;
  } catch (e) { /* noop */ }

  // 权限状态
  refreshPerm(body, 'pv-camera', 'camera');
  refreshPerm(body, 'pv-location', 'geolocation');
  syncNotifySwitch(body);

  body.querySelectorAll('[data-nav]').forEach(row => {
    row.onclick = () => {
      const t = row.dataset.nav;
      if (t === 'about') openAbout();
      if (t === 'lang') toast('当前版本仅支持简体中文');
      if (t === 'theme') openThemePicker();
      if (t === 'coveapi') openCovePage('api');
      if (t === 'covevision') openCovePage('vision');
      if (t === 'covevoice') openCovePage('voice');
      if (t === 'storage') openStoragePage();
      if (t === 'account') openAccountPage();
    };
  });
  body.querySelectorAll('[data-app]').forEach(row => {
    row.onclick = async () => {
      const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
      if (isAppOpen()) { closeApp(); setTimeout(() => openApp('themes'), 360); }
      else openApp('themes');
    };
  });
  body.querySelectorAll('[data-act]').forEach(row => {
    row.onclick = async () => {
      const t = row.dataset.act;
      if (t === 'perm-notify') {
        const sw = body.querySelector('#pv-notify-sw');
        const cur = sw?.classList.contains('on');
        if (cur) {
          /* 浏览器无法编程式撤销已授权权限 → 引导到系统设置 */
          toast('已授权，如需关闭请在浏览器站点设置中撤销');
          return;
        }
        const p = await requestNotifyPerm();
        toast('通知权限：' + permText(p));
        if (sw) sw.classList.toggle('on', p === 'granted');
      }
      if (t === 'perm-camera') {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true });
          s.getTracks().forEach(x => x.stop());
          toast('相机权限：已授权 ✓');
          body.querySelector('#pv-camera').textContent = '已授权';
        } catch (e) {
          toast('相机权限：' + (e.name === 'NotAllowedError' ? '被拒绝' : '不可用'));
          body.querySelector('#pv-camera').textContent = '未授权';
        }
      }
      if (t === 'perm-location') {
        try {
          await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
          toast('位置权限：已授权 ✓');
          body.querySelector('#pv-location').textContent = '已授权';
        } catch (e) {
          toast('位置权限：' + (e.code === 1 ? '被拒绝' : '获取失败'));
          body.querySelector('#pv-location').textContent = '未授权';
        }
      }
      if (t === 'export') {
        const data = await DB.exportAll();
        downloadJSON(data, `AppleAI备份_${new Date().toISOString().slice(0, 10)}.json`);
        toast('全部数据已导出');
      }
      if (t === 'import') {
        const input = el('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = async () => {
          try {
            const data = JSON.parse(await input.files[0].text());
            const ok = await confirmDialog('导入数据', '将清空当前数据并恢复备份，确定继续？', { okText: '导入', danger: true });
            if (!ok) return;
            const ld = loading('正在导入…');
            await DB.importAll(data);
            ld();
            toast('导入完成，即将刷新');
            setTimeout(() => location.reload(), 1200);
          } catch (e) { toast('导入失败：' + e.message); }
        };
        input.click();
      }
      if (t === 'weather-city') {
        const name = await promptDialog('设置城市', '输入城市名（如：上海）', { value: city.city || '', okText: '保存' });
        if (name) {
          try {
            const list = await WeatherEngine.searchCity(name);
            if (list.length) {
              await WeatherEngine.setCity(list[0]);
              body.querySelector('#st-city-val').textContent = list[0].city;
              toast('已切换到 ' + list[0].city);
            } else toast('未找到该城市');
          } catch (e) { toast('城市查询失败'); }
        }
      }
      if (t === 'weather-unit') {
        const next = Settings.get('weatherUnit', 'c') === 'c' ? 'f' : 'c';
        await Settings.set('weatherUnit', next);
        body.querySelector('#st-unit-val').textContent = next === 'c' ? '摄氏度 °C' : '华氏度 °F';
        Bus.emit('weather:unit-changed', next);
        toast('已切换为 ' + (next === 'c' ? '摄氏度' : '华氏度'));
      }
    };
  });
}

async function requestNotifyPerm() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
/* 通知权限 → iOS 开关状态 */
function syncNotifySwitch(body) {
  const sw = body.querySelector('#pv-notify-sw');
  if (!sw) return;
  const on = 'Notification' in window && Notification.permission === 'granted';
  sw.classList.toggle('on', on);
}
function permText(p) {
  return { granted: '已授权', denied: '被拒绝', default: '未决定', unsupported: '不支持' }[p] || p;
}
async function refreshPerm(body, id, name) {
  const node = body.querySelector('#' + id);
  if (!node) return;
  try {
    const st = await navigator.permissions?.query({ name });
    node.textContent = permText(st.state);
    st.onchange = () => { node.textContent = permText(st.state); };
  } catch (e) {
    if (name === 'notifications') node.textContent = ('Notification' in window) ? permText(Notification.permission) : '不支持';
    else node.textContent = '点击检查';
  }
}

/* ---------- 搜索：实时过滤设置项（仿 iOS 设置搜索） ---------- */
function bindSearch(body) {
  const input = body.querySelector('#st-search');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    body.querySelectorAll('.inset-group .row').forEach(r => {
      const label = r.querySelector('.row-label');
      const val = r.querySelector('.row-val');
      const text = ((label ? label.textContent : '') + ' ' + (val ? val.textContent : '')).toLowerCase();
      r.style.display = !q || text.includes(q) ? '' : 'none';
    });
    body.querySelectorAll('.inset-group').forEach(g => {
      const any = [...g.querySelectorAll('.row')].some(r => r.style.display !== 'none');
      g.style.display = any ? '' : 'none';
    });
  });
}

/* ---------- Apple ID 账户页 ---------- */
async function openAccountPage() {
  const nickname = await Settings.load('nickname', '我');
  let pct = 8, used = '—', quota = '—';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && est.usage != null && est.quota) {
      pct = Math.min(100, (est.usage / est.quota) * 100);
      used = fmtBytes(est.usage);
      quota = fmtBytes(est.quota);
    }
  } catch (e) { /* 保持默认 */ }

  const page = nav.makePage({
    title: 'Apple ID', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="st-acct-hero">
          <div class="st-avatar big">${PERSON_SVG}</div>
          <div class="st-acct-name">${escapeHtml(nickname || '我')}</div>
          <div class="st-acct-sub">Apple ID · 本地账户 · iCloud</div>
        </div>
        <div class="inset-group">
          <div class="inset-group-title">个人资料</div>
          <div class="inset-card">
            <div class="row" id="st-name-row">${ICONS.info}<div class="row-label">姓名</div><div class="row-val" id="st-name-val">${escapeHtml(nickname || '我')}</div><div class="row-chevron">${chevron}</div></div>
            <div class="row static">${ICONS.media}<div class="row-label">头像</div><div class="row-val">本地账户默认头像</div></div>
          </div>
        </div>
        <div class="inset-group">
          <div class="inset-group-title">iCloud</div>
          <div class="inset-card">
            <div class="row static" style="display:block;padding:15px 16px 13px">
              <div class="st-bar"><div style="width:${Math.max(2, pct).toFixed(1)}%"></div></div>
              <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-2);margin-top:7px">
                <span>已用 ${used}</span><span>共 ${quota}</span>
              </div>
            </div>
            <div class="row" data-acct="icloud">${ICONS.cloud}<div class="row-label">iCloud</div><div class="row-val">已开启</div><div class="row-chevron">${chevron}</div></div>
            <div class="row" data-acct="media">${ICONS.media}<div class="row-label">媒体与购买项目</div><div class="row-chevron">${chevron}</div></div>
            <div class="row" data-acct="find">${ICONS.location}<div class="row-label">查找我的 AppleAI</div><div class="row-val">开</div><div class="row-chevron">${chevron}</div></div>
          </div>
        </div>
        <div class="inset-group">
          <div class="inset-card">
            <div class="row" id="st-signout"><div class="row-label danger" style="flex:1;text-align:center">退出登录</div></div>
          </div>
        </div>
        <div class="st-footer"><div>AppleAI Web 1.0</div><div>账户信息仅存于本机浏览器</div></div>`;

      body.querySelectorAll('[data-acct]').forEach(r => {
        r.onclick = () => toast('演示界面：未接入真实服务');
      });

      /* 姓名编辑（同步微信个人页 / 朋友圈署名 / 设置账户卡） */
      body.querySelector('#st-name-row').onclick = async () => {
        const name = await promptDialog('姓名', '将显示在 Apple ID、微信与朋友圈', { value: nickname, okText: '保存' });
        if (name === null) return;
        const v = name.trim() || '我';
        await Settings.set('nickname', v);
        body.querySelector('.st-acct-name').textContent = v;
        body.querySelector('#st-name-val').textContent = v;
        const cardNode = root.querySelector('#st-account-name');
        if (cardNode) cardNode.textContent = v;
        toast('姓名已更新');
      };

      body.querySelector('#st-signout').onclick = async () => {
        const ok = await confirmDialog('退出登录？', '退出后 iCloud 相关功能将不可用（演示）。', { okText: '退出', danger: true });
        if (ok) toast('已退出登录（演示）');
      };
    },
  });
  nav.push(page);
}

/* ---------- 关于本机 ---------- */
function openAbout() {
  const page = nav.makePage({
    title: '关于本机', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:36px 20px 20px">
          <div style="width:74px;height:74px;border-radius:18px;overflow:hidden">${AppIcons.settings()}</div>
          <div style="font-size:24px;font-weight:700;margin-top:14px">AppleAI Web</div>
          <div style="font-size:13px;color:var(--text-2);margin-top:2px">版本 1.0.0 (Build 100)</div>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">机型</div><div class="row-val">iPhone（Web 模拟）</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">系统</div><div class="row-val">iOS 风格 Web 1.0</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">浏览器引擎</div><div class="row-val" id="ab-engine"></div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">存储引擎</div><div class="row-val">IndexedDB（本地）</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">应用数量</div><div class="row-val">16 个原生模块</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">屏幕</div><div class="row-val">393 × 852</div></div>
        </div></div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">隐私声明</div><div class="row-val" style="max-width:58%;font-size:13px;white-space:normal">所有数据仅存于本机浏览器，不上传任何服务器</div></div>
        </div></div>`;
      const ua = navigator.userAgent;
      const engine = /Chrome\/([\d.]+)/.test(ua) ? 'Blink ' + ua.match(/Chrome\/([\d.]+)/)[1]
        : /Firefox\/([\d.]+)/.test(ua) ? 'Gecko ' + ua.match(/Firefox\/([\d.]+)/)[1]
        : /Safari/.test(ua) ? 'WebKit' : '未知';
      body.querySelector('#ab-engine').textContent = engine;
    },
  });
  nav.push(page);
}

/* ---------- 主题选择 ---------- */
async function openThemePicker() {
  const v = await actionSheet([
    { text: '跟随系统（自动）', value: 'auto' },
    { text: '浅色模式', value: 'light' },
    { text: '深色模式', value: 'dark' },
  ], { title: '外观' });
  if (!v) return;
  await applyTheme(v);
  const tv = root.querySelector('#st-theme-val');
  if (tv) tv.textContent = { light: '浅色', dark: '深色', auto: '自动' }[v];
  toast('主题已切换');
}

/* ---------- 信息APP设置子页（原「我 → 设置」内三项移入此处） ----------
   页面组件与存储（im.api，IndexedDB ios-im）与信息APP完全同一份：此处改了配置，
   信息APP聊天即时生效；反之亦然。
   秒开机制：承载 iframe 常驻 #app-layer（DOM 从不搬动 → 永不重载），设置APP打开时
   即预载；子页弹出只是覆盖层入场（与导航页同款滑动动画），三页切换通过 postMessage
   通知 React 换组件 —— 除首次预载未完成外，打开零加载 */

/* 常驻池状态（模块级：跨设置APP会话存活） */
let covePool = null;      // { host, frame, boot, loaded, page, cbs, hideTimer }
let coveVisible = false;  // 覆盖层当前是否展示
let coveRestore = false;  // 切换器收起时应否恢复覆盖层
let covePageEl = null;    // 当前子页 nav-page 元素（恢复判定用）
let coveHooksReady = false;

function ensureCovePool() {
  if (covePool && covePool.host.isConnected) return covePool;
  const layer = document.getElementById('app-layer');
  if (!layer) return null;
  const host = el('div', 'st-cove-pool');
  host.setAttribute('aria-hidden', 'true');
  const frame = document.createElement('iframe');
  frame.src = '/?as=page&p=api'; // 预载任意一页即可，切页由 postMessage 驱动
  frame.title = 'API设置';
  frame.setAttribute('scrolling', 'no');
  /* 麦克风权限策略：语音配置页测试语音输入（getUserMedia 录音）需要 allow 传递 */
  frame.setAttribute('allow', 'microphone');
  /* 首次挂载到 iframe load 完成前显示加载占位（与信息APP一致） */
  const boot = el('div', 'app-boot-mask');
  boot.innerHTML = '<div class="spinner"></div>';
  const pool = { host, frame, boot, loaded: false, page: 'api', cbs: [], hideTimer: 0 };
  frame.addEventListener('load', () => {
    pool.loaded = true;
    boot.remove();
    const cbs = pool.cbs; pool.cbs = [];
    cbs.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
  }, { once: true });
  host.append(frame, boot);
  layer.appendChild(host);
  covePool = pool;
  return pool;
}

/* 通知常驻页切换目标组件（幂等）；首载未完成时挂起，载完补发（防监听器未就绪丢消息） */
function sendCovePage(pool, p) {
  pool.page = p;
  const send = () => {
    try { pool.frame.contentWindow.postMessage({ type: 'cove-page', p }, window.location.origin); } catch (e) { /* noop */ }
  };
  if (pool.loaded) send();
  else pool.cbs.push(send);
}

function showCoveOverlay(pool) {
  clearTimeout(pool.hideTimer);
  coveVisible = true;
  const host = pool.host;
  host.classList.add('show');
  host.setAttribute('aria-hidden', 'false');
  /* 入场动画与 nav.push 同步同款（同帧加/移类，共用 navEnter 关键帧） */
  host.classList.add('enter');
  requestAnimationFrame(() => host.classList.remove('enter'));
  setTimeout(() => { host.style.animation = ''; }, 420);
}

function hideCoveOverlay(animate) {
  const pool = covePool;
  if (!pool || !coveVisible) return;
  coveVisible = false;
  const host = pool.host;
  host.setAttribute('aria-hidden', 'true');
  host.classList.remove('enter');
  if (animate) {
    /* 离场动画与 nav.pop 同款（leave 类保留至动画结束再隐藏） */
    host.classList.add('leave');
    pool.hideTimer = setTimeout(() => {
      host.classList.remove('leave', 'show');
      host.style.animation = '';
    }, 400);
  } else {
    host.classList.remove('leave', 'show');
    host.style.animation = '';
  }
}

/* 覆盖层独立于应用窗口存在，需显式跟随应用/切换器生命周期收起：
   ① 任意应用关闭时立即隐藏（防止浮在主屏上）
   ② 多任务切换器打开时隐藏（窗口会被搬入卡片，覆盖层不能叠在切换器上），
     收起后若设置APP仍在前台且子页未退，则原位恢复（iframe 未动 → 秒回） */
function setupCoveHooks() {
  if (coveHooksReady) return;
  coveHooksReady = true;
  Bus.on('app:closed', () => {
    /* 子页曾开（直接关闭 或 经切换器路径已临时隐藏）都需收尾：隐藏覆盖层、清桥、通知刷新 */
    if (!coveVisible && !coveRestore && !covePageEl) return;
    hideCoveOverlay(false);
    coveRestore = false;
    covePageEl = null;
    delete window.__covePageBack;
    notifyInfoRefreshApi();
  });
  const sw = document.getElementById('task-switcher');
  if (sw && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const open = sw.classList.contains('show');
      if (open && coveVisible) {
        hideCoveOverlay(false);
        coveRestore = true;
        /* 切换器卡片内容：占位宿主内嵌当前页静态快照（与信息APP卡片同源技术），恢复时移除 */
        try {
          if (covePool && covePool.loaded && covePageEl && covePageEl.isConnected) {
            const srcdoc = frameSnapshotSrcdoc(covePool.host);
            const hostEl = covePageEl.querySelector('.st-cove-host');
            if (srcdoc && hostEl) {
              const fr = el('iframe', 'st-cove-snap');
              fr.setAttribute('scrolling', 'no');
              fr.setAttribute('aria-hidden', 'true');
              fr.srcdoc = srcdoc;
              hostEl.appendChild(fr);
            }
          }
        } catch (e) { /* noop */ }
      }
      else if (!open && coveRestore) {
        coveRestore = false;
        const ok = covePageEl && covePageEl.isConnected && !covePageEl.classList.contains('leave')
          && isAppOpen() && Registry.currentId() === 'settings';
        if (ok && covePool) {
          if (covePageEl) covePageEl.querySelectorAll('.st-cove-snap').forEach(n => n.remove());
          coveVisible = true;
          covePool.host.classList.add('show');
          covePool.host.setAttribute('aria-hidden', 'false');
        }
      }
    }).observe(sw, { attributes: true, attributeFilter: ['class'] });
  }
  /* 常驻页就绪回执：据此补发当前目标页（防 React 监听器晚于切页消息就绪） */
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    const pool = covePool;
    if (!pool || !pool.host.isConnected || e.source !== pool.frame.contentWindow) return;
    if (e.data && e.data.type === 'cove-page-ready') {
      try { pool.frame.contentWindow.postMessage({ type: 'cove-page', p: pool.page }, window.location.origin); } catch (err) { /* noop */ }
    }
  });
}

/* 读取信息APP共享的 API 配置（ios-im / kv / im.api），同源直开其 IndexedDB */
function loadCoveApi() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = indexedDB.open('ios-im', 1);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const get = db.transaction('kv', 'readonly').objectStore('kv').get('im.api');
          get.onsuccess = () => {
            db.close();
            if (get.result) return finish(get.result);
            /* IndexedDB 无记录时兜底查 localStorage（旧数据迁移路径） */
            try { finish(JSON.parse(localStorage.getItem('im.api') || 'null')); }
            catch { finish(null); }
          };
          get.onerror = () => { db.close(); finish(null); };
        } catch (e) { db.close(); finish(null); }
      };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch (e) { finish(null); }
  });
}

/* 三个配置行右侧预览值（与信息APP设置页原展示文案一致） */
async function refreshCoveApiRows(body) {
  const cfg = await loadCoveApi();
  const apiVal = body.querySelector('#st-cove-api-val');
  if (apiVal) apiVal.textContent = (cfg && cfg.apiKey) ? ('模型：' + (cfg.model || '')) : '没有配置';
  const visVal = body.querySelector('#st-cove-vision-val');
  if (visVal) visVal.textContent = (cfg && cfg.vision && cfg.vision.enabled) ? ('已启用 · ' + (cfg.vision.model || '')) : '未启用，发图片不让 AI 识别';
  const voiceVal = body.querySelector('#st-cove-voice-val');
  if (voiceVal) {
    let sub = '语音输入与播报均未开启';
    if (cfg && cfg.voice) {
      const list = Array.isArray(cfg.voice.configs) ? cfg.voice.configs : [];
      const sel = list.find((c) => c.id === cfg.voice.selectedId) || list.find((c) => c.enabled);
      const parts = [];
      if (cfg.voice.sttEnabled) parts.push('语音输入已开启');
      if (sel && sel.enabled) parts.push('播报：' + sel.name);
      if (parts.length) sub = parts.join('，');
    }
    voiceVal.textContent = sub;
  }
}

/* 弹出子页：占位导航页 + 常驻覆盖层承载真实内容（React 页自带标题栏；其返回键按信息APP惯例隐藏，
   由壳层全局返回键统一收起；页面内 onBack 桥 __covePageBack 作安全兜底） */
function openCovePage(which) {
  const titles = { api: 'API设置', vision: '识图模型', voice: '语音配置' };
  const pool = ensureCovePool();
  if (!pool) return;
  pool.frame.title = titles[which];
  const page = nav.makePage({
    title: titles[which],
    noNavbar: true,
    build(body) {
      body.style.overflow = 'hidden';
      /* 占位宿主：真实界面在常驻覆盖层（iframe 不可搬入子页——DOM 搬动即重载） */
      body.appendChild(el('div', 'st-cove-host'));
      /* React 页内返回桥接（页面自身返回键隐藏时为兜底通道） */
      window.__covePageBack = () => nav.pop();
    },
  });
  /* 子页弹出时：清理返回桥、通知信息APP重读配置、刷新主页预览值 */
  page.onPop = () => {
    covePageEl = null;
    hideCoveOverlay(true);
    delete window.__covePageBack;
    notifyInfoRefreshApi();
    if (root) {
      const pageEl = root.querySelector('.page-body');
      if (pageEl) refreshCoveApiRows(pageEl);
    }
  };
  nav.push(page);
  covePageEl = page.el;
  showCoveOverlay(pool);
  sendCovePage(pool, which);
}

/* 通知信息APP重读 API 配置内存缓存（后台保活实例优先，预热实例同样在运行，
   覆盖“壳层启动预热的窗口尚未被打开”阶段，避免转正后内存配置陈旧） */
function notifyInfoRefreshApi() {
  try {
    const win = getBackgroundWin('info');
    const frame = win && win.querySelector('iframe');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'cove-refresh-api' }, window.location.origin);
    }
  } catch (e) { /* noop */ }
}

/* ---------- 存储详情页 ---------- */
async function openStoragePage() {
  const page = nav.makePage({
    title: '存储空间', chevBack: true,
    build(body) {
      body.innerHTML = '<div style="display:flex;justify-content:center;padding:30px"><div class="spinner"></div></div>';
      (async () => {
        const est = await navigator.storage?.estimate?.().catch(() => null);
        const counts = {};
        for (const s of ['photos', 'music', 'recordings', 'messages', 'conversations', 'notes', 'events', 'contacts', 'moments', 'bookmarks', 'history']) {
          counts[s] = await DB.count(s);
        }
        const photoBytes = (await DB.all('photos')).reduce((s, p) => s + (p.size || 0), 0);
        const musicBytes = (await DB.all('music')).reduce((s, m) => s + (m.data?.byteLength || 0), 0);
        const recBytes = (await DB.all('recordings')).reduce((s, r) => s + (r.data?.byteLength || 0), 0);
        const used = est?.usage ?? (photoBytes + musicBytes + recBytes);
        const quota = est?.quota ?? 0;
        const pct = quota ? Math.min(100, (used / quota) * 100) : 0;

        const row = (label, val, color) => `<div class="row static"><div class="st-legend" style="--lc:${color}"></div><div class="row-label" style="color:var(--text-2)">${label}</div><div class="row-val">${val}</div></div>`;

        /* iOS 式分段存储条：按数据类型真实占比渲染 */
        const chatBytes = counts.messages * 620;              // 文本估算
        const miscBytes = Math.max(0, used - photoBytes - musicBytes - recBytes - chatBytes);
        const segs = [
          { label: '照片', bytes: photoBytes, color: '#FF9500' },
          { label: '音乐', bytes: musicBytes, color: '#FF2D55' },
          { label: '录音', bytes: recBytes, color: '#5E5CE6' },
          { label: '聊天', bytes: chatBytes, color: '#34C759' },
          { label: '系统与缓存', bytes: Math.max(1, miscBytes), color: '#8E8E93' },
        ].filter(s => s.bytes > 0).sort((a, b) => b.bytes - a.bytes);
        const segTotal = segs.reduce((s, x) => s + x.bytes, 0) || 1;
        const segBar = `<div class="st-segbar">${segs.map(s =>
          `<i style="width:${Math.max(0.8, s.bytes / segTotal * 100).toFixed(2)}%;background:${s.color}"></i>`).join('')}</div>`;

        body.innerHTML = `
          <div class="inset-group">
            <div class="inset-group-title">浏览器分配空间</div>
            <div class="inset-card" style="padding:18px 16px">
              ${segBar}
              <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-top:8px">
                <span>已用 ${fmtBytes(used)}</span><span>共 ${fmtBytes(quota)}</span>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-group-title">数据占用明细</div>
            <div class="inset-card">
              ${row('照片', `${counts.photos} 张 · ${fmtBytes(photoBytes)}`, '#FF9500')}
              ${row('音乐', `${counts.music} 首 · ${fmtBytes(musicBytes)}`, '#FF2D55')}
              ${row('录音', `${counts.recordings} 条 · ${fmtBytes(recBytes)}`, '#5E5CE6')}
              ${row('聊天消息', `${counts.messages} 条 · ${counts.conversations} 个会话`, '#34C759')}
              ${row('备忘录', `${counts.notes} 条`, '#32ADE6')}
              ${row('日历事件', `${counts.events} 个`, '#FF3B30')}
              ${row('联系人 / 朋友圈', `${counts.contacts} / ${counts.moments}`, '#007AFF')}
              ${row('浏览器足迹', `${counts.bookmarks} 书签 · ${counts.history} 历史`, '#5856D6')}
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-group-title">清理</div>
            <div class="inset-card">
              <div class="row" data-clean="history"><div class="row-label danger">清除浏览器历史</div><div class="row-val">${counts.history} 条</div></div>
              <div class="row" data-clean="cache"><div class="row-label danger">清除浏览器缓存</div><div class="row-val">重新加载页面</div></div>
            </div>
            <div class="inset-group-title" style="color:var(--danger)">危险区域</div>
            <div class="inset-card">
              <div class="row" data-clean="all"><div class="row-label danger">抹掉所有内容和设置</div></div>
            </div>
          </div>`;
        body.querySelectorAll('[data-clean]').forEach(r => {
          r.onclick = async () => {
            const t = r.dataset.clean;
            if (t === 'history') {
              const ok = await confirmDialog('清除历史', '删除全部浏览器历史记录？', { okText: '清除', danger: true });
              if (ok) { await DB.clear('history'); openStoragePage(); toast('已清除'); }
            }
            if (t === 'cache') { toast('正在刷新…'); setTimeout(() => location.reload(), 600); }
            if (t === 'all') {
              const v = await promptDialog('抹掉所有数据', '输入「删除」以确认', { placeholder: '删除' });
              if (v === '删除') {
                const ld = loading('正在抹掉数据…');
                for (const s of ['messages', 'conversations', 'photos', 'music', 'recordings', 'notes', 'events', 'contacts', 'moments', 'bookmarks', 'history', 'settings', 'stickers']) {
                  await DB.clear(s);
                }
                localStorage.clear();
                ld();
                toast('已抹掉，即将重启');
                setTimeout(() => location.reload(), 1000);
              }
            }
          };
        });
      })();
    },
  });
  nav.push(page);
}
