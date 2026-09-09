/* ============ 世界书（Lorebook）：React 侧读取与匹配 ============
   世界书由 iOS 壳层「世界书」APP 管理，存 IndexedDB（AppleAI 库
   worldbooks / wbentries 两张表）；信息APP 与壳层同源，聊天发送时
   读取并按 范围/关键词 匹配，命中的条目按插入位置注入 System Prompt。

   范围语义：
   - 全局（global）：所有对话都生效，无需关键词触发
   - 局部（local）：命中关键词才触发（扫描当前会话最近消息）
   - 专属（exclusive）：命中关键词才触发，且书需绑定当前聊天角色 */

export interface LoreContext {
  /** 插入在角色定义之前的内容（已在头部拼装好） */
  before: string
  /** 插入在角色定义之后的内容 */
  after: string
}

const WB_DB_NAME = 'AppleAI'
const WB_BOOKS = 'worldbooks'
const WB_ENTRIES = 'wbentries'

/* 单次注入上限：防止世界书过大撑爆上下文 */
const MAX_ENTRIES = 24
const MAX_TOTAL_CHARS = 6000

interface WbBook {
  id: string
  name?: string
  scope?: 'global' | 'local' | 'exclusive'
  enabled?: boolean
  bound?: string[]
  updatedAt?: number
}

interface WbEntry {
  id: string
  bookId?: string
  name?: string
  enabled?: boolean
  position?: 'before' | 'after'
  keywords?: string[]
  priority?: number
  content?: string
}

let dbPromise: Promise<IDBDatabase | null> | null = null

/* 打开壳层数据库（不指定版本：正常流程壳层启动时已建好 v4；
   万一库尚不存在，onupgradeneeded 会补建两张世界书表，绝不影响壳层后续升级） */
function openWbDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(WB_DB_NAME)
        req.onupgradeneeded = () => {
          try {
            const db = req.result
            if (!db.objectStoreNames.contains(WB_BOOKS)) db.createObjectStore(WB_BOOKS, { keyPath: 'id' })
            if (!db.objectStoreNames.contains(WB_ENTRIES)) db.createObjectStore(WB_ENTRIES, { keyPath: 'id' })
          } catch {
            /* ignore */
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

function getAll(db: IDBDatabase, store: string): Promise<WbBook[] | WbEntry[]> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll()
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/**
 * 收集本次对话应注入的世界书内容。
 * @param friendName 当前聊天角色名（用于专属范围绑定判断）
 * @param scanTexts  近期会话消息文本（用于局部/专属关键词触发，建议传最近几条）
 */
export async function collectWorldbook(friendName: string, scanTexts: string[]): Promise<LoreContext> {
  const empty: LoreContext = { before: '', after: '' }
  try {
    const db = await openWbDb()
    if (!db) return empty
    if (!db.objectStoreNames.contains(WB_BOOKS) || !db.objectStoreNames.contains(WB_ENTRIES)) return empty
    const [books, entries] = (await Promise.all([getAll(db, WB_BOOKS), getAll(db, WB_ENTRIES)])) as [
      WbBook[],
      WbEntry[],
    ]

    const hay = scanTexts.join('\n').toLowerCase()
    const hit = (entry: WbEntry): boolean => {
      const kws = (Array.isArray(entry.keywords) ? entry.keywords : [])
        .map((k) => String(k ?? '').trim().toLowerCase())
        .filter(Boolean)
      if (kws.length === 0) return false
      return kws.some((k) => hay.includes(k))
    }

    const matched: { priority: number; position: 'before' | 'after'; content: string }[] = []
    for (const book of books) {
      if (!book || !book.id || book.enabled === false) continue
      const scope = book.scope === 'local' || book.scope === 'exclusive' ? book.scope : 'global'
      if (scope === 'exclusive') {
        const bound = Array.isArray(book.bound) ? book.bound : []
        if (!bound.some((n) => typeof n === 'string' && n.trim() === friendName)) continue
      }
      for (const e of entries) {
        if (!e || e.bookId !== book.id || e.enabled === false) continue
        if (scope === 'global' || hit(e)) {
          const content = String(e.content ?? '').trim()
          if (!content) continue
          matched.push({
            priority: Number(e.priority) || 0,
            position: e.position === 'before' ? 'before' : 'after',
            content,
          })
        }
      }
    }

    if (matched.length === 0) return empty
    matched.sort((a, b) => b.priority - a.priority)

    /* 按优先级截断 */
    const picked: typeof matched = []
    let chars = 0
    for (const m of matched) {
      if (picked.length >= MAX_ENTRIES || chars + m.content.length > MAX_TOTAL_CHARS) break
      picked.push(m)
      chars += m.content.length
    }

    const fmt = (list: typeof matched): string =>
      list.length
        ? `【世界书设定】以下是本对话的世界观背景设定，与角色设定同属真实设定，必须严格遵守：\n${list
            .map((m) => m.content)
            .join('\n\n')}`
        : ''

    return {
      before: fmt(picked.filter((p) => p.position === 'before')),
      after: fmt(picked.filter((p) => p.position === 'after')),
    }
  } catch {
    return empty
  }
}

/* ============ 专属世界书：聊天设置选择（绑定/解绑当前角色） ============ */

export interface ExclusiveBook {
  id: string
  name: string
  /** 书本身是否启用（未启用时不注入，需去「世界书」APP 开启） */
  enabled: boolean
  /** 是否已绑定当前角色 */
  bound: boolean
  /** 已绑定的角色总数 */
  boundCount: number
  /** 书内条目数 */
  entryCount: number
}

function getOne(db: IDBDatabase, id: string): Promise<WbBook | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(WB_BOOKS, 'readonly').objectStore(WB_BOOKS).get(id)
      req.onsuccess = () => resolve((req.result as WbBook) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function putOne(db: IDBDatabase, book: WbBook): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(WB_BOOKS, 'readwrite').objectStore(WB_BOOKS).put(book)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/** 列出全部专属世界书，并标注是否已绑定 friendName */
export async function listExclusiveBooks(friendName: string): Promise<ExclusiveBook[]> {
  try {
    const db = await openWbDb()
    if (!db || !db.objectStoreNames.contains(WB_BOOKS)) return []
    const [books, entries] = (await Promise.all([getAll(db, WB_BOOKS), getAll(db, WB_ENTRIES)])) as [
      WbBook[],
      WbEntry[],
    ]
    return books
      .filter((b) => b && b.id && b.scope === 'exclusive')
      .map((b) => {
        const bound = (Array.isArray(b.bound) ? b.bound : []).filter(
          (n) => typeof n === 'string' && n.trim(),
        )
        return {
          id: b.id,
          name: String(b.name ?? '未命名'),
          enabled: b.enabled !== false,
          bound: bound.some((n) => n.trim() === friendName),
          boundCount: bound.length,
          entryCount: entries.filter((e) => e && e.bookId === b.id).length,
        }
      })
  } catch {
    return []
  }
}

/** 绑定/解绑：把 friendName 加入/移出书的 bound 列表，返回更新后的书信息 */
export async function setExclusiveBound(
  bookId: string,
  friendName: string,
  on: boolean,
): Promise<ExclusiveBook | null> {
  try {
    const db = await openWbDb()
    if (!db || !db.objectStoreNames.contains(WB_BOOKS)) return null
    const book = await getOne(db, bookId)
    if (!book) return null
    const list = (Array.isArray(book.bound) ? book.bound : []).filter(
      (n) => typeof n === 'string' && n.trim(),
    )
    const i = list.indexOf(friendName)
    if (on && i < 0) list.push(friendName)
    if (!on && i >= 0) list.splice(i, 1)
    book.bound = list
    book.updatedAt = Date.now()
    await putOne(db, book)
    return {
      id: book.id,
      name: String(book.name ?? '未命名'),
      enabled: book.enabled !== false,
      bound: on,
      boundCount: list.length,
      entryCount: 0,
    }
  } catch {
    return null
  }
}
