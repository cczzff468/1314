/* ============ 世界书（Lorebook）：AI 聊天的世界观设定库 ============
   数据存 IndexedDB（AppleAI 库 worldbooks / wbentries 两张表），
   同源下「信息」APP 聊天时读取并按 范围/关键词 匹配注入 System Prompt。
   范围：全局=所有对话生效（无需关键词）；局部=命中关键词才触发（当前会话）；
        专属=命中关键词且需手动绑定到角色。
   界面：黑白灰极简风格 —— 统计面板（全局/局部/专属/已启用）+ 底部常驻范围筛选栏 +
        开关选择（书的启用、条目的启用均为 Switch），卡片「编辑/更多」与开关同行对齐。 */

import { el, uid, haptic, fmtSmartTime } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, confirmDialog, promptDialog, escapeHtml, escapeAttr, sheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;
/* 根页筛选状态：范围（all/global/local/exclusive）+ 是否仅看已启用 + 专属视角的联系人（空=全部） */
let curScope = 'all';
let onlyEnabled = false;
let curContact = '';

const PLUS_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4.6v14.8M4.6 12h14.8"/></svg>';
const MORE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const X_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const BOOK_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.2C10.5 4.9 8.7 4.3 6.9 4.3c-1.1 0-2.2.2-2.9.6v13.5c.7-.4 1.8-.6 2.9-.6 1.8 0 3.6.6 5.1 1.9 1.5-1.3 3.3-1.9 5.1-1.9 1.1 0 2.2.2 2.9.6V4.9c-.7-.4-1.8-.6-2.9-.6-1.8 0-3.6.6-5.1 1.3z"/><path d="M12 6.2V20" stroke-width="1.5"/></svg>';
const BOOK_BIG_SVG = '<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 6.2C10.5 4.9 8.7 4.3 6.9 4.3c-1.1 0-2.2.2-2.9.6v13.5c.7-.4 1.8-.6 2.9-.6 1.8 0 3.6.6 5.1 1.9 1.5-1.3 3.3-1.9 5.1-1.9 1.1 0 2.2.2 2.9.6V4.9c-.7-.4-1.8-.6-2.9-.6-1.8 0-3.6.6-5.1 1.3z"/><path d="M12 6.2V20" stroke-width="1.4"/></svg>';
const CHEV_DOWN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>';
const SCOPE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.6 2.4 4 5.4 4 8.6s-1.4 6.2-4 8.6c-2.6-2.4-4-5.4-4-8.6s1.4-6.2 4-8.6z"/></svg>';
const LINK_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l3.2-3.2a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4"/><path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-3.2 3.2a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4"/></svg>';
const DOC_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z"/><path d="M14 2.5V7.5H19M8.5 12h7M8.5 15.5h4.5"/></svg>';
/* 范围图标（新建对话框范围选择行） */
const GLOBE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.6 2.4 4 5.4 4 8.6s-1.4 6.2-4 8.6c-2.6-2.4-4-5.4-4-8.6s1.4-6.2 4-8.6z"/></svg>';
const TARGET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.4v3.2M12 17.4v3.2M3.4 12h3.2M17.4 12h3.2"/></svg>';
const USER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="7.6" r="4"/><path d="M4.6 20.4c1.3-3.5 4.1-5.3 7.4-5.3s6.1 1.8 7.4 5.3"/></svg>';

/* 范围说明（与产品定义一致） */
const SCOPES = {
  global: { label: '全局', desc: '所有对话都生效，无需关键词触发', usage: '适合世界观框架、基础设定' },
  local: { label: '局部', desc: '命中关键词才触发，仅在当前会话生效', usage: '适合特定角色、场景设定' },
  exclusive: { label: '专属', desc: '命中关键词才触发，且需手动绑定到角色', usage: '适合角色专属秘密、特殊设定' },
};

export default {
  id: 'worldbook',
  name: '世界书',
  icon: AppIcons.worldbook,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    curScope = 'all';
    onlyEnabled = false;
    curContact = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);
    const page = makeRootPage();
    nav.setRoot(page);
  },

  unmount() {
    root = null;
    nav = null;
  },
};

/* ============ 根页面：世界书管理（黑白灰 · 统计 + 筛选 + 开关列表） ============ */
function makeRootPage() {
  const page = nav.makePage({
    title: '世界书',
    className: 'wb-page',
    right: [navBtn(PLUS_SVG, () => newBook(), 'pill-btn')],
    async build(body, pageEl) {
      body.classList.add('wb-body');
      body.innerHTML = `
        <div class="wb-hero">
          <div class="wb-hero-row">
            <div class="wb-hero-title">我的世界书库</div>
            <button type="button" class="wb-ctbtn" id="wb-ctbtn" style="display:none" aria-label="选择角色查看专属世界书">
              <span class="wb-ct-name">全部角色</span>${CHEV_DOWN_SVG}
            </button>
          </div>
          <div class="wb-hero-sub" id="wb-stat"></div>
        </div>
        <div class="wb-stats" id="wb-stats">
          <button type="button" class="wb-stat" data-st="global">
            <span class="wb-stat-num">0</span><span class="wb-stat-label">全局</span>
          </button>
          <button type="button" class="wb-stat" data-st="local">
            <span class="wb-stat-num">0</span><span class="wb-stat-label">局部</span>
          </button>
          <button type="button" class="wb-stat" data-st="exclusive">
            <span class="wb-stat-num">0</span><span class="wb-stat-label">专属</span>
          </button>
          <button type="button" class="wb-stat" data-st="enabled">
            <span class="wb-stat-num">0</span><span class="wb-stat-label">已启用</span>
          </button>
        </div>
        <div id="wb-list"></div>`;

      /* 专属视角：联系人下拉胶囊（与「我的世界书库」标题同行、右对齐） */
      body.querySelector('#wb-ctbtn').onclick = () => { haptic(4); pickContact(); };

      /* 范围筛选：常驻页面底部（跟随根页，不随内容滚动） */
      const filterbar = el('div', 'wb-filterbar');
      filterbar.id = 'wb-filter';
      filterbar.innerHTML = `
          <button type="button" class="wb-chip" data-f="all">全部</button>
          <button type="button" class="wb-chip" data-f="global">全局</button>
          <button type="button" class="wb-chip" data-f="local">局部</button>
          <button type="button" class="wb-chip" data-f="exclusive">专属</button>`;
      pageEl.appendChild(filterbar);

      /* 统计格点击 = 快捷筛选：全局/局部/专属切换范围（再点回全部）；已启用 = 仅看已启用开关 */
      body.querySelectorAll('.wb-stat').forEach(c => {
        c.onclick = () => {
          haptic(4);
          const k = c.dataset.st;
          if (k === 'enabled') onlyEnabled = !onlyEnabled;
          else curScope = (curScope === k) ? 'all' : k;
          if (curScope !== 'exclusive') curContact = '';
          loadBooks(body);
        };
      });
      /* 范围筛选 chips（底部栏） */
      filterbar.querySelectorAll('.wb-chip').forEach(c => {
        c.onclick = () => {
          if (curScope === c.dataset.f) return;
          haptic(4);
          curScope = c.dataset.f;
          if (curScope !== 'exclusive') curContact = '';
          loadBooks(body);
        };
      });
      await loadBooks(body);
    },
  });
  /* 从条目页返回时刷新卡片统计（条目数/关键词数/最后更新） */
  page.onShow = async () => {
    const body = page.body;
    if (body && body.querySelector('#wb-list')) await loadBooks(body);
  };
  return page;
}

/* 统计 + 筛选渲染列表 */
async function loadBooks(body) {
  const listEl = body.querySelector('#wb-list');
  const statEl = body.querySelector('#wb-stat');
  if (!listEl) return;
  const books = await DB.all('worldbooks');
  const entries = await DB.all('wbentries');
  const byBook = new Map();
  entries.forEach(e => {
    if (e && e.bookId) {
      if (!byBook.has(e.bookId)) byBook.set(e.bookId, []);
      byBook.get(e.bookId).push(e);
    }
  });
  books.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  applyStats(body, books, entries, statEl);

  /* 筛选：范围 + 专属视角联系人 + 仅看已启用 */
  let shown = books;
  if (curScope !== 'all') shown = shown.filter(b => b.scope === curScope);
  if (curScope === 'exclusive' && curContact) shown = shown.filter(b => Array.isArray(b.bound) && b.bound.includes(curContact));
  if (onlyEnabled) shown = shown.filter(b => b.enabled);

  listEl.innerHTML = '';
  if (!books.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        ${BOOK_SVG.replace('width="19" height="19"', 'width="52" height="52"')}
        <div class="es-title">没有世界书</div>
        <div>点右上角 + 新建一个世界书</div>
      </div>`;
    return;
  }
  if (!shown.length) {
    const ctTitle = curScope === 'exclusive' && curContact
      ? `「${curContact}」暂无专属世界书`
      : (onlyEnabled && curScope === 'all' ? '没有已启用的世界书' : '该范围下暂无世界书');
    const ctSub = curScope === 'exclusive' && curContact
      ? '在该角色的聊天设置里，或书籍的「绑定角色」里绑定后才会出现'
      : (onlyEnabled && curScope === 'all' ? '打开卡片上的开关后，会出现在这里' : '切换范围筛选，或点 + 新建一个');
    listEl.innerHTML = `
      <div class="empty-state">
        ${SCOPE_SVG.replace('width="15" height="15"', 'width="44" height="44"')}
        <div class="es-title">${escapeHtml(ctTitle)}</div>
        <div>${escapeHtml(ctSub)}</div>
      </div>`;
    return;
  }
  shown.forEach(b => listEl.appendChild(bookCard(b, byBook.get(b.id) || [], body)));
}

/* 更新统计面板数字 + 高亮 + 头部统计行（不重绘列表） */
function applyStats(body, books, entries, statEl) {
  const cnt = { global: 0, local: 0, exclusive: 0, enabled: 0 };
  books.forEach(b => {
    if (b.scope === 'global' || b.scope === 'local' || b.scope === 'exclusive') cnt[b.scope]++;
    if (b.enabled) cnt.enabled++;
  });
  ['global', 'local', 'exclusive'].forEach(k => {
    const cell = body.querySelector(`.wb-stat[data-st="${k}"]`);
    if (cell) {
      cell.querySelector('.wb-stat-num').textContent = cnt[k];
      cell.classList.toggle('on', curScope === k);
    }
  });
  const enCell = body.querySelector('.wb-stat[data-st="enabled"]');
  if (enCell) {
    enCell.querySelector('.wb-stat-num').textContent = cnt.enabled;
    enCell.classList.toggle('on', onlyEnabled);
  }
  const pageEl = body.closest('.nav-page') || body;
  pageEl.querySelectorAll('.wb-chip').forEach(c => c.classList.toggle('on', c.dataset.f === curScope));

  /* 专属视角：标题行右侧联系人下拉（仅专属筛选时显示；同步当前选择名） */
  const ctBtn = body.querySelector('.wb-ctbtn');
  if (ctBtn) {
    ctBtn.style.display = curScope === 'exclusive' ? '' : 'none';
    const nm = ctBtn.querySelector('.wb-ct-name');
    if (nm) nm.textContent = curContact || '全部角色';
  }

  if (statEl) {
    if (books.length) {
      let last = 0;
      books.forEach(b => { last = Math.max(last, b.updatedAt || 0); });
      entries.forEach(e => { last = Math.max(last, e.updatedAt || 0); });
      statEl.textContent = `共 ${books.length} 个世界书 · 最后更新 ${fmtSmartTime(last)}`;
    } else {
      statEl.textContent = '还没有任何世界书';
    }
  }
}

/* 开关切换后仅刷新统计（避免整表重绘打断开关动画；若被筛出列表则整表刷新） */
async function refreshStatsOnly(body) {
  const statEl = body.querySelector('#wb-stat');
  if (!statEl) return;
  const books = await DB.all('worldbooks');
  const entries = await DB.all('wbentries');
  applyStats(body, books, entries, statEl);
}

function bookCard(book, entries, body) {
  const kwCount = entries.reduce((n, e) => n + (Array.isArray(e.keywords) ? e.keywords.length : 0), 0);
  const scope = SCOPES[book.scope] || SCOPES.global;
  const card = el('div', 'wb-card' + (book.enabled ? '' : ' off'));
  /* 启用开关在前，「编辑」「更多(⋯)」在开关右侧（同一行垂直对齐） */
  card.innerHTML = `
    <div class="wb-card-head">
      <div class="wb-card-icon s-${book.scope}">${BOOK_SVG}</div>
      <div class="wb-card-name ellipsis">${escapeHtml(book.name || '未命名')}</div>
      <div class="wb-scope-chip s-${book.scope}">${scope.label}</div>
      <div class="switch ${book.enabled ? 'on' : ''}" role="switch" aria-label="启用世界书"></div>
      <button class="wb-act-btn edit">编辑</button>
      <button class="wb-act-btn more" aria-label="更多操作">${MORE_SVG}</button>
    </div>
    <div class="wb-card-meta">
      <div class="ellipsis">${entries.length} 个条目 · ${kwCount} 个关键词</div>
      <div class="ellipsis">${scope.label}范围 · 更新于 ${fmtSmartTime(book.updatedAt)}</div>
    </div>`;

  card.querySelector('.switch').addEventListener('click', async (e) => {
    e.stopPropagation();
    haptic(4);
    book.enabled = !book.enabled;
    book.updatedAt = Date.now();
    await DB.put('worldbooks', book);
    e.currentTarget.classList.toggle('on', book.enabled);
    card.classList.toggle('off', !book.enabled);
    await refreshStatsOnly(body);
    if (onlyEnabled && !book.enabled) await loadBooks(body);
    toast(book.enabled ? '已启用' : '已停用');
  });
  card.querySelector('.wb-act-btn.edit').onclick = (e) => { e.stopPropagation(); haptic(4); openBookEntries(book); };
  card.querySelector('.wb-act-btn.more').onclick = (e) => { e.stopPropagation(); haptic(4); bookMenu(book); };
  /* 卡片其余区域点击 = 进入编辑 */
  card.addEventListener('click', (e) => {
    if (e.target.closest('.switch') || e.target.closest('.wb-act-btn')) return;
    haptic(4);
    openBookEntries(book);
  });
  return card;
}

async function bookMenu(book) {
  const v = await actionSheet([
    { text: book.enabled ? '停用世界书' : '启用世界书', value: 'toggle' },
    { text: '重命名', value: 'rename' },
    { text: '复制世界书', value: 'copy' },
    { text: '删除世界书', value: 'del', danger: true },
  ], { cls: 'wb-mono' });
  if (!v) return;
  if (v === 'toggle') {
    book.enabled = !book.enabled;
    book.updatedAt = Date.now();
    await DB.put('worldbooks', book);
    toast(book.enabled ? '已启用' : '已停用');
  }
  if (v === 'rename') {
    const name = await promptDialog('重命名世界书', '', { value: book.name || '', okText: '好', cls: 'wb-mono' });
    if (name && name.trim()) {
      book.name = name.trim();
      book.updatedAt = Date.now();
      await DB.put('worldbooks', book);
      toast('已重命名');
    }
  }
  if (v === 'copy') {
    const nid = uid('wb');
    await DB.put('worldbooks', { ...book, id: nid, name: (book.name || '未命名') + ' 副本', enabled: false, createdAt: Date.now(), updatedAt: Date.now() });
    const entries = await DB.byIndex('wbentries', 'bookId', book.id);
    const copies = entries.map(e => ({ ...e, id: uid('wbe'), bookId: nid, updatedAt: Date.now() }));
    if (copies.length) await DB.bulkPut('wbentries', copies);
    toast('已复制（默认停用）');
  }
  if (v === 'del') {
    const ok = await confirmDialog('删除世界书', `删除「${book.name || '未命名'}」及其全部条目？`, { okText: '删除', danger: true, cls: 'wb-mono' });
    if (!ok) return;
    const entries = await DB.byIndex('wbentries', 'bookId', book.id);
    for (const e of entries) await DB.del('wbentries', e.id);
    await DB.del('worldbooks', book.id);
    toast('已删除');
  }
  const body = root && root.querySelector('.page-body');
  if (body && body.querySelector('#wb-list')) await loadBooks(body);
}

/* 专属视角：右上角下拉选择联系人（信息APP好友），筛选该角色绑定的专属世界书 */
async function pickContact() {
  const friends = await loadChatFriends();
  const opts = [{ text: '全部角色', value: '', desc: '查看所有专属世界书' }];
  friends.forEach(f => {
    const on = f.name === curContact;
    opts.push({ text: (on ? '✓ ' : '') + f.name, value: f.name, desc: on ? '当前视角' : '查看绑定给 TA 的专属世界书' });
  });
  const v = await actionSheet(opts, { cls: 'wb-mono', title: '选择角色查看专属世界书' });
  if (v === undefined || v === null) return;
  if (v === curContact) return;
  curContact = v || '';
  haptic(4);
  const body = root && root.querySelector('.page-body');
  if (body && body.querySelector('#wb-list')) await loadBooks(body);
}

/* ============ 新建世界书（黑白灰对话框：图标头 + 名称 + 范围选择行） ============ */
function newBookDialog() {
  return new Promise((resolve) => {
    const mask = el('div', 'dialog-mask');
    const d = el('div', 'dialog wb-dialog');
    d.innerHTML = `
      <button class="wb-dialog-x" aria-label="关闭">${X_SVG}</button>
      <div class="wb-dialog-hero">
        <div class="wb-dialog-hero-icon">${BOOK_BIG_SVG}</div>
        <div class="wb-dialog-title">新建世界书</div>
        <div class="wb-dialog-sub">为 AI 聊天准备的世界观设定库</div>
      </div>
      <div class="wb-dialog-body">
        <div class="wb-field">
          <div class="wb-field-label">名称</div>
          <input class="wb-input" id="wbn-name" maxlength="30" placeholder="例如：现代都市背景">
        </div>
        <div class="wb-field">
          <div class="wb-field-label">范围</div>
          <div class="wb-scope-pick" id="wbn-scope">
            <button type="button" data-s="global" class="wb-sp-row on">
              <span class="wb-sp-icon">${GLOBE_SVG}</span>
              <span class="wb-sp-info">
                <span class="wb-sp-name">全局</span>
                <span class="wb-sp-desc">所有对话生效 · 无需关键词</span>
              </span>
              <span class="wb-sp-check"></span>
            </button>
            <button type="button" data-s="local" class="wb-sp-row">
              <span class="wb-sp-icon">${TARGET_SVG}</span>
              <span class="wb-sp-info">
                <span class="wb-sp-name">局部</span>
                <span class="wb-sp-desc">命中关键词 · 当前会话生效</span>
              </span>
              <span class="wb-sp-check"></span>
            </button>
            <button type="button" data-s="exclusive" class="wb-sp-row">
              <span class="wb-sp-icon">${USER_SVG}</span>
              <span class="wb-sp-info">
                <span class="wb-sp-name">专属</span>
                <span class="wb-sp-desc">绑定角色 · 命中关键词生效</span>
              </span>
              <span class="wb-sp-check"></span>
            </button>
          </div>
          <div class="wb-field-note" id="wbn-desc">${SCOPES.global.desc}，${SCOPES.global.usage}</div>
        </div>
      </div>
      <div class="wb-dialog-foot">
        <button type="button" class="wb-btn ghost" data-cancel>取消</button>
        <button type="button" class="wb-btn fill" data-ok>创建世界书</button>
      </div>`;
    let scope = 'global';
    mask.appendChild(d);
    document.getElementById('screen').appendChild(mask);

    const close = (val) => { mask.remove(); resolve(val); };
    d.querySelector('.wb-dialog-x').onclick = () => close(null);
    d.querySelector('[data-cancel]').onclick = () => close(null);
    d.querySelector('[data-ok]').onclick = () => close({ name: d.querySelector('#wbn-name').value.trim(), scope });
    d.querySelectorAll('#wbn-scope button').forEach(b => {
      b.onclick = () => {
        haptic(4);
        scope = b.dataset.s;
        d.querySelectorAll('#wbn-scope button').forEach(x => x.classList.toggle('on', x === b));
        d.querySelector('#wbn-desc').textContent = `${SCOPES[scope].desc}，${SCOPES[scope].usage}`;
      };
    });
    mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
    const inp = d.querySelector('#wbn-name');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.querySelector('[data-ok]').click(); });
    setTimeout(() => inp.focus(), 90);
  });
}

async function newBook() {
  const r = await newBookDialog();
  if (!r) return;
  if (!r.name) { toast('请输入世界书名称'); return; }
  const book = { id: uid('wb'), name: r.name, scope: r.scope, enabled: true, bound: [], createdAt: Date.now(), updatedAt: Date.now() };
  await DB.put('worldbooks', book);
  haptic(8);
  toast('已创建「' + book.name + '」');
  const body = root && root.querySelector('.page-body');
  if (body && body.querySelector('#wb-list')) await loadBooks(body);
  openBookEntries(book);
}

/* ============ 条目列表页（编辑世界书） ============ */
function openBookEntries(book) {
  const page = nav.makePage({
    title: '世界书',
    chevBack: true,
    className: 'wb-page',
    right: [navBtn(PLUS_SVG, () => openEntryEditor(book, null), 'pill-btn')],
    async build(body, pageEl) {
      body.classList.add('wb-body');
      const scope = SCOPES[book.scope] || SCOPES.global;
      body.innerHTML = `
        <div class="wb-book-head">
          <div class="wb-book-name-row">
            <div class="wb-book-name ellipsis">${escapeHtml(book.name || '未命名')}</div>
            <div class="wb-scope-chip s-${book.scope}">${scope.label}</div>
          </div>
          <div class="wb-book-sub">${escapeHtml(scope.desc)}</div>
        </div>
        <div class="inset-group wb-fi-group">
          <div class="inset-card">
            <div class="row static">
              <div class="row-icon wb-ri-scope">${SCOPE_SVG}</div>
              <div class="row-label">范围</div>
              <div class="row-val tappable" id="wbe-scope-val">${scope.label}</div>
              <div class="row-chevron"></div>
            </div>
            <div class="row static">
              <div class="row-icon wb-ri-doc">${DOC_SVG}</div>
              <div class="row-label">启用</div>
              <div class="switch ${book.enabled ? 'on' : ''}" id="wbe-enabled" role="switch" aria-label="启用世界书"></div>
            </div>
            ${book.scope === 'exclusive' ? `
            <div class="row" id="wbe-bound-row">
              <div class="row-icon wb-ri-link">${LINK_SVG}</div>
              <div class="row-label">绑定角色</div>
              <div class="row-val" id="wbe-bound-val"></div>
              <div class="row-chevron"></div>
            </div>` : ''}
          </div>
          <div class="wb-form-note">${escapeHtml(scope.usage)}</div>
        </div>
        <button class="wb-new-entry" id="wbe-new">＋ 新建条目</button>
        <div id="wbe-list"></div>`;

      /* 范围切换（弹选择） */
      const scopeRow = body.querySelector('#wbe-scope-val').closest('.row');
      scopeRow.addEventListener('click', async () => {
        haptic(4);
        const v = await actionSheet([
          { text: `全局 — ${SCOPES.global.desc}`, value: 'global' },
          { text: `局部 — ${SCOPES.local.desc}`, value: 'local' },
          { text: `专属 — ${SCOPES.exclusive.desc}`, value: 'exclusive' },
        ], { cls: 'wb-mono' });
        if (!v || v === book.scope) return;
        book.scope = v;
        if (v !== 'exclusive') book.bound = [];
        book.updatedAt = Date.now();
        await DB.put('worldbooks', book);
        toast('范围已改为' + SCOPES[v].label);
        nav.pop();
        openBookEntries(book);
      });

      /* 启用开关 */
      const sw = body.querySelector('#wbe-enabled');
      sw.addEventListener('click', async () => {
        haptic(4);
        book.enabled = !book.enabled;
        book.updatedAt = Date.now();
        await DB.put('worldbooks', book);
        sw.classList.toggle('on', book.enabled);
        const stat = pageEl.querySelector('.wb-book-sub');
        if (stat) stat.textContent = (book.enabled ? '' : '（已停用，聊天时不注入）') + (SCOPES[book.scope] || SCOPES.global).desc;
      });

      /* 绑定角色（专属范围） */
      const boundRow = body.querySelector('#wbe-bound-row');
      if (boundRow) {
        boundRow.addEventListener('click', () => { haptic(4); openBindPicker(book, pageEl); });
      }

      body.querySelector('#wbe-new').onclick = () => { haptic(4); openEntryEditor(book, null); };
      await loadEntries(book, body);
    },
  });
  nav.push(page);
}

/* 刷新当前条目列表页（取 DOM 中最后一个 #wbe-list：栈顶页优先，避开退场中的旧页） */
async function refreshEntriesView(book) {
  const lists = root ? root.querySelectorAll('#wbe-list') : [];
  const listEl = lists.length ? lists[lists.length - 1] : null;
  if (listEl) await loadEntries(book, listEl.closest('.page-body'));
}

async function loadEntries(book, body) {
  const listEl = body.querySelector('#wbe-list');
  if (!listEl) return;
  const boundVal = body.querySelector('#wbe-bound-val');
  if (boundVal) {
    const names = Array.isArray(book.bound) ? book.bound.filter(Boolean) : [];
    boundVal.textContent = names.length ? names.join('、') : '未绑定';
    boundVal.classList.toggle('tappable', !names.length);
  }
  const entries = await DB.byIndex('wbentries', 'bookId', book.id);
  entries.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  listEl.innerHTML = '';
  if (!entries.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        ${DOC_SVG.replace('width="17" height="17"', 'width="46" height="46"')}
        <div class="es-title">还没有条目</div>
        <div>条目是发送给 AI 的世界观设定</div>
      </div>`;
    return;
  }
  entries.forEach(e => listEl.appendChild(entryCard(book, e)));
}

/* 条目卡片：开关选择（直接切换启用） + 优先级徽标 + 关键词/插入位置 */
function entryCard(book, entry) {
  const kws = Array.isArray(entry.keywords) ? entry.keywords.filter(Boolean) : [];
  const card = el('div', 'wb-entry' + (entry.enabled ? '' : ' off'));
  card.innerHTML = `
    <div class="wb-entry-head">
      <div class="wb-entry-name ellipsis">${escapeHtml(entry.name || '未命名条目')}</div>
      <div class="wb-entry-pri">${entry.priority ?? 0}</div>
      <div class="switch ${entry.enabled ? 'on' : ''}" role="switch" aria-label="启用条目"></div>
      <button class="wb-entry-more" aria-label="更多操作">${MORE_SVG}</button>
    </div>
    <div class="wb-entry-meta">
      <div class="ellipsis">关键词: ${kws.length ? escapeHtml(kws.join('、')) : '（无关键词，按书范围生效）'}</div>
      <div>插入: ${entry.position === 'before' ? '角色定义之前' : '角色定义之后'} · 优先级: ${entry.priority ?? 0}</div>
    </div>`;
  const sw = card.querySelector('.switch');
  sw.addEventListener('click', async (e) => {
    e.stopPropagation();
    haptic(4);
    entry.enabled = !entry.enabled;
    entry.updatedAt = Date.now();
    book.updatedAt = Date.now();
    await DB.put('wbentries', entry);
    await DB.put('worldbooks', book);
    sw.classList.toggle('on', entry.enabled);
    card.classList.toggle('off', !entry.enabled);
    toast(entry.enabled ? '条目已启用' : '条目已停用');
  });
  card.addEventListener('click', (e) => {
    if (e.target.closest('.switch') || e.target.closest('.wb-entry-more')) return;
    haptic(4);
    openEntryEditor(book, entry);
  });
  card.querySelector('.wb-entry-more').onclick = (e) => {
    e.stopPropagation();
    haptic(4);
    entryMenu(book, entry);
  };
  return card;
}

async function entryMenu(book, entry) {
  const v = await actionSheet([
    { text: '编辑条目', value: 'edit' },
    { text: entry.enabled ? '停用条目' : '启用条目', value: 'toggle' },
    { text: '删除条目', value: 'del', danger: true },
  ], { cls: 'wb-mono' });
  if (!v) return;
  if (v === 'edit') { openEntryEditor(book, entry); return; }
  if (v === 'toggle') {
    entry.enabled = !entry.enabled;
    entry.updatedAt = Date.now();
    book.updatedAt = Date.now();
    await DB.put('wbentries', entry);
    await DB.put('worldbooks', book);
    toast(entry.enabled ? '条目已启用' : '条目已停用');
  }
  if (v === 'del') {
    const ok = await confirmDialog('删除条目', `删除「${entry.name || '未命名条目'}」？`, { okText: '删除', danger: true, cls: 'wb-mono' });
    if (!ok) return;
    await DB.del('wbentries', entry.id);
    book.updatedAt = Date.now();
    await DB.put('worldbooks', book);
    toast('已删除');
  }
  await refreshEntriesView(book);
}

/* ============ 绑定角色（专属范围：多选信息APP好友） ============ */
function openBindPicker(book, pageEl) {
  sheet({
    title: '绑定角色',
    cls: 'wb-mono',
    build(body, close) {
      body.classList.add('wb-bind-body');
      const tip = el('div', 'wb-bind-tip');
      tip.textContent = '专属世界书仅在与绑定角色的对话中生效';
      body.appendChild(tip);
      loadChatFriends().then(friends => {
        if (!friends.length) {
          const empty = el('div', 'wb-bind-empty');
          empty.textContent = '还没有角色，去「信息」APP 添加好友后再来绑定';
          body.appendChild(empty);
          return;
        }
        friends.forEach(f => {
          const on = (Array.isArray(book.bound) ? book.bound : []).includes(f.name);
          const row = el('div', 'wb-bind-row' + (on ? ' on' : ''));
          row.innerHTML = `<div class="wb-bind-check"></div><div class="wb-bind-name ellipsis">${escapeHtml(f.name)}</div>`;
          row.onclick = () => {
            haptic(4);
            const list = Array.isArray(book.bound) ? book.bound : [];
            const i = list.indexOf(f.name);
            if (i >= 0) list.splice(i, 1); else list.push(f.name);
            book.bound = list;
            row.classList.toggle('on', list.includes(f.name));
          };
          body.appendChild(row);
        });
      });
      const actions = el('div', 'sheet-actions');
      actions.style.paddingTop = '12px';
      const done = el('button', 'btn-fill');
      done.type = 'button';
      done.textContent = '完成';
      done.onclick = () => close();
      actions.appendChild(done);
      body.appendChild(actions);
    },
    onClose: async () => {
      book.updatedAt = Date.now();
      await DB.put('worldbooks', book);
      await refreshEntriesView(book);
      toast('绑定已保存');
    },
  });
}

/* 读取「信息」APP 好友列表（ios-im 库 kv 表 im.friends，localStorage 兜底；同源可直读） */
function loadChatFriends() {
  const fromLS = () => {
    try {
      const raw = localStorage.getItem('im.friends');
      const arr = raw ? JSON.parse(raw) : [];
      return (Array.isArray(arr) ? arr : []).filter(f => f && f.name).map(f => ({ id: f.id, name: f.name }));
    } catch (e) { return []; }
  };
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = indexedDB.open('ios-im');
      req.onupgradeneeded = () => {
        try { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); } catch (e) { /* noop */ }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const r = db.transaction('kv', 'readonly').objectStore('kv').get('im.friends');
          r.onsuccess = () => {
            const arr = Array.isArray(r.result) ? r.result : null;
            const list = (arr || []).filter(f => f && f.name).map(f => ({ id: f.id, name: f.name }));
            finish(list.length ? list : fromLS());
          };
          r.onerror = () => finish(fromLS());
        } catch (e) { finish(fromLS()); }
      };
      req.onerror = () => finish(fromLS());
      setTimeout(() => finish(fromLS()), 1500); /* 兜底超时 */
    } catch (e) { finish(fromLS()); }
  });
}

/* ============ 新建 / 编辑条目 ============ */
function openEntryEditor(book, entry) {
  const isNew = !entry;
  const data = entry || {
    id: uid('wbe'), bookId: book.id, name: '', enabled: true,
    position: 'after', keywords: [], priority: 100, content: '', updatedAt: Date.now(),
  };

  const page = nav.makePage({
    title: isNew ? '新建条目' : '编辑条目',
    chevBack: true,
    className: 'wb-page',
    /* 保存函数在 build 内赋值到 page._save（build 作用域） */
    right: [navBtn('<span class="wb-save-btn">保存</span>', () => page._save && page._save(), 'pill-btn pill-text')],
    build(body, pageEl) {
      body.classList.add('wb-body', 'wb-editor-body');
      body.innerHTML = `
        <div class="inset-group wb-fi-group">
          <div class="inset-card">
            <div class="row static">
              <div class="row-label">启用</div>
              <div class="switch ${data.enabled ? 'on' : ''}" id="wbe-en" role="switch" aria-label="启用条目"></div>
            </div>
            <div class="wb-form-col">
              <div class="wb-form-label">条目名称</div>
              <input class="wb-input" id="wbe-name" maxlength="30" placeholder="例如：城市设定" value="${escapeAttr(data.name || '')}">
            </div>
          </div>
          <div class="wb-form-note">条目名称不会发送给AI，仅用于管理</div>
        </div>

        <div class="inset-group wb-fi-group">
          <div class="wb-form-label">插入位置</div>
          <div class="segmented wb-seg" id="wbe-pos">
            <button type="button" data-p="before" class="${data.position === 'before' ? 'on' : ''}">角色定义之前</button>
            <button type="button" data-p="after" class="${data.position !== 'before' ? 'on' : ''}">角色定义之后</button>
          </div>
        </div>

        <div class="inset-group wb-fi-group">
          <div class="wb-form-label">关键词</div>
          <div class="inset-card">
            <input class="wb-input wb-kw-input" id="wbe-kw" placeholder="上海, 北京, 深圳" value="${escapeAttr((data.keywords || []).join(', '))}">
          </div>
          <div class="wb-form-note">用逗号分隔，命中任意关键词即触发该条目</div>
        </div>

        <div class="inset-group wb-fi-group">
          <div class="wb-form-label">优先级</div>
          <div class="inset-card">
            <input class="wb-input wb-pri-input" id="wbe-pri" type="number" inputmode="numeric" min="0" max="9999" step="1" value="${Number(data.priority ?? 0)}">
          </div>
          <div class="wb-form-note">数字越大越优先</div>
        </div>

        <div class="inset-group wb-fi-group">
          <div class="wb-form-label">正文内容</div>
          <div class="inset-card">
            <textarea class="wb-textarea" id="wbe-content" placeholder="命中后发送给AI的设定内容…">${escapeHtml(data.content || '')}</textarea>
          </div>
          <div class="wb-form-note">命中后该内容将插入 System Prompt${(SCOPES[book.scope] || SCOPES.global).label === '全局' ? '' : '（' + (SCOPES[book.scope] || SCOPES.global).label + '范围按关键词触发）'}</div>
        </div>

        ${isNew ? '' : `
        <div class="inset-group wb-fi-group">
          <div class="inset-card">
            <div class="row danger" id="wbe-del">删除条目</div>
          </div>
        </div>`}`;

      let position = data.position === 'before' ? 'before' : 'after';
      body.querySelector('#wbe-en').addEventListener('click', function () {
        haptic(4);
        data.enabled = !data.enabled;
        this.classList.toggle('on', data.enabled);
      });
      body.querySelectorAll('#wbe-pos button').forEach(b => {
        b.onclick = () => {
          haptic(4);
          position = b.dataset.p;
          body.querySelectorAll('#wbe-pos button').forEach(x => x.classList.toggle('on', x === b));
        };
      });

      const doSave = async () => {
        const name = body.querySelector('#wbe-name').value.trim();
        const content = body.querySelector('#wbe-content').value.trim();
        if (!name) { toast('请输入条目名称'); return; }
        if (!content) { toast('请输入正文内容'); return; }
        const kws = body.querySelector('#wbe-kw').value
          .split(/[,，、\n]/)
          .map(k => k.trim())
          .filter(Boolean);
        let pri = parseInt(body.querySelector('#wbe-pri').value, 10);
        if (!Number.isFinite(pri) || pri < 0) pri = 0;
        if (pri > 9999) pri = 9999;
        data.name = name;
        data.content = content;
        data.keywords = kws;
        data.priority = pri;
        data.position = position;
        data.enabled = body.querySelector('#wbe-en').classList.contains('on');
        data.updatedAt = Date.now();
        await DB.put('wbentries', data);
        book.updatedAt = Date.now();
        await DB.put('worldbooks', book);
        haptic(8);
        toast(isNew ? '条目已创建' : '条目已保存');
        nav.pop();
        await refreshEntriesView(book);
      };
      page._save = doSave;

      if (!isNew) {
        body.querySelector('#wbe-del').onclick = async () => {
          haptic(4);
          const ok = await confirmDialog('删除条目', `删除「${data.name || '未命名条目'}」？`, { okText: '删除', danger: true, cls: 'wb-mono' });
          if (!ok) return;
          await DB.del('wbentries', data.id);
          book.updatedAt = Date.now();
          await DB.put('worldbooks', book);
          toast('已删除');
          nav.pop();
          await refreshEntriesView(book);
        };
      }
    },
  });
  nav.push(page);
}
