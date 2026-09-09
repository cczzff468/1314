import { useEffect, useRef, useState } from 'react'
import Messages from './pages/Messages'
import Contacts from './pages/Contacts'
import Discover from './pages/Discover'
import Me from './pages/Me'
import AddFriend from './pages/AddFriend'
import AddPersona from './pages/AddPersona'
import Chat from './pages/Chat'
import FriendDetail from './pages/FriendDetail'
import Moments from './pages/Moments'
import MyProfile from './pages/MyProfile'
import Settings from './pages/Settings'
import ApiSettingPage from './pages/ApiSettingPage'
import VisionApiPage from './pages/VisionApiPage'
import VoiceApiPage from './pages/VoiceApiPage'
import MemoryPage from './pages/MemoryPage'
import ChatSettings from './pages/ChatSettings'
import ChatSearch from './pages/ChatSearch'
import ChatBackground from './pages/ChatBackground'
import TranslateLang from './pages/TranslateLang'
import StickerPage from './pages/StickerPage'
import LocationPage from './pages/LocationPage'
import WalletHome from './pages/wallet/WalletHome'
import Change from './pages/wallet/Change'
import ChangeFund from './pages/wallet/ChangeFund'
import PayCode from './pages/wallet/PayCode'
import ReceiveCode from './pages/wallet/ReceiveCode'
import Scan from './pages/wallet/Scan'
import Bills, { BillDetail } from './pages/wallet/Bills'
import type { BillFilter } from './pages/wallet/Bills'
import RedPacket, { RedPacketRecords } from './pages/wallet/RedPacket'
import Transfer from './pages/wallet/Transfer'
import RelativeGift from './pages/wallet/RelativeGift'
import RelativeCardPage from './pages/wallet/RelativeCard'
import { RedPacketDetail, TransferDetail, RelativeCardDetail } from './pages/wallet/WalletDetail'
import BankCards from './pages/wallet/BankCards'
import { ChatIcon, ContactsIcon, DiscoverIcon, MeIcon } from './components/icons'
import { formatMoney } from './utils/qr'
import { checkAmount, deduct, payLabel } from './utils/pay'
import PaySuccess from './pages/wallet/PaySuccess'
import type { PaySuccessData } from './pages/wallet/PaySuccess'
import PayPasswordSet from './pages/wallet/PayPasswordSet'
import { addBill, appendMessage, loadBills, loadFriends, loadMessages, loadUiState, loadWallet, patchFriendMsg, saveFriends, saveMessages, saveUiState, updateWallet, uid } from './store'
import type { Friend, Message, RelativeCard } from './types'

type Tab = 'messages' | 'contacts' | 'discover' | 'me'
type View =
  | { name: 'tabs' }
  | { name: 'addFriend'; friendId?: string }
  | { name: 'chat'; friendId: string; jumpTo?: string }
  | { name: 'friendDetail'; friendId: string }
  | { name: 'moments' }
  | { name: 'myProfile' }
  | { name: 'addPersona'; personaId?: string }
  | { name: 'settings' }
  | { name: 'apiSetting' }
  | { name: 'visionApi' }
  | { name: 'voiceApi' }
  | { name: 'memory'; friendId?: string }
  | { name: 'chatSettings'; friendId: string }
  | { name: 'chatSearch'; friendId: string }
  | { name: 'chatBg'; friendId: string }
  | { name: 'translateLang'; friendId: string }
  | { name: 'stickers' }
  | { name: 'location'; friendId: string }
  | { name: 'wallet' }
  | { name: 'walletChange'; mode?: '充值' | '提现' }
  | { name: 'walletFund' }
  | { name: 'payCode' }
  | { name: 'receiveCode' }
  | { name: 'scan' }
  | { name: 'bills'; filter?: BillFilter }
  | { name: 'billDetail'; billId: string }
  | { name: 'redPacket'; friendId?: string; fromChat?: boolean }
  | { name: 'redPacketRecords' }
  | { name: 'transfer'; friendId?: string; fromChat?: boolean }
  | { name: 'relativeCard' }
  | { name: 'relativeGift'; friendId?: string; fromChat?: boolean }
  | { name: 'rpDetail'; friendId: string; msgId: string }
  | { name: 'tfDetail'; friendId: string; msgId: string }
  | { name: 'relativeCardDetail'; cardId: string; friendId?: string; fromChat?: boolean }
  | { name: 'payPwd' }
  | { name: 'paySuccess'; data: PaySuccessData }
  | { name: 'bankcards' }

const WALLET_VIEWS = ['wallet', 'walletChange', 'walletFund', 'payCode', 'receiveCode', 'scan', 'bills', 'redPacket', 'redPacketRecords', 'transfer', 'relativeCard', 'relativeGift', 'rpDetail', 'tfDetail', 'relativeCardDetail', 'bankcards', 'payPwd', 'paySuccess']

const TABS: { key: Tab; label: string; icon: (active: boolean) => JSX.Element }[] = [
  { key: 'messages', label: '信息', icon: (a) => <ChatIcon active={a} /> },
  { key: 'contacts', label: '联系人', icon: (a) => <ContactsIcon active={a} /> },
  { key: 'discover', label: '发现', icon: (a) => <DiscoverIcon active={a} /> },
  { key: 'me', label: '我', icon: (a) => <MeIcon active={a} /> },
]

function initialState(): { tab: Tab; view: View } {
  const saved = loadUiState<{ tab?: Tab; view?: View }>({})
  const tab: Tab = TABS.some((t) => t.key === saved.tab) ? (saved.tab as Tab) : 'messages'
  const savedView = saved.view as View | undefined
  let view: View = { name: 'tabs' }
  if (savedView && typeof savedView.name === 'string') {
    if (savedView.name === 'chat') {
      view = loadFriends().some((f) => f.id === savedView.friendId) ? savedView : { name: 'tabs' }
    } else if (savedView.name === 'stickers') {
      view = savedView
    } else if (savedView.name === 'billDetail') {
      view = loadBills().some((b) => b.id === (savedView as { billId: string }).billId) ? savedView : { name: 'tabs' }
    } else if (savedView.name === 'redPacket' || savedView.name === 'transfer') {
      view = savedView.friendId && loadFriends().some((f) => f.id === savedView.friendId) ? savedView : { name: 'tabs' }
    } else if (WALLET_VIEWS.includes(savedView.name)) {
      view = savedView
    } else if (
      ['moments', 'myProfile', 'settings', 'apiSetting', 'visionApi', 'voiceApi', 'memory', 'chatSettings', 'chatSearch', 'chatBg', 'translateLang'].includes(
        savedView.name
      ) &&
      loadFriends().some((f) => f.id === (savedView as { friendId: string }).friendId)
    ) {
      view = savedView
    }
  }
  return { tab, view }
}

function AppView() {
  const [init] = useState(initialState)
  const [friends, setFriends] = useState<Friend[]>(() => loadFriends())
  const [messages, setMessages] = useState<Message[]>(() => loadMessages())
  const [tab, setTab] = useState<Tab>(init.tab)
  const [view, setView] = useState<View>(init.view)
  const [pendingLocation, setPendingLocation] = useState<{ name: string; address?: string } | null>(null)

  /* 壳层内嵌（iPhone 桌面打开）：页面内返回键隐藏，由壳层全局返回键统一接管 */
  const [embedded] = useState(() => {
    try {
      return window.parent !== window && typeof (window.parent as Window).__closeApp === 'function'
    } catch {
      return false
    }
  })

  /* 底部上滑手势（仅壳层内嵌时生效）：在屏幕底部 Home 区上滑 → 上报壳层打开多任务切换器，
     与壳层里其他原生 App 的上滑唤起切换器体验保持一致（iframe 内手势无法冒泡到壳层页面）
     判定策略：以轨迹最高点（minY）衡量上滑进度，只在其明显回落时才判定为列表滚动而取消，
     避免起手抖动、慢速滑动被误杀
     事件绑定（双流，tracking 标志天然去重）：
     - 鼠标/触控笔：Pointer 事件（桌面可拖拽测试）
     - 触摸：touch 事件 —— 真机上浏览器接管列表滚动时会派发 pointercancel 而不再派发
       pointermove，但 touchmove 始终触发；触摸流不走 Pointer 事件，防止被 pointercancel 中止 */
  useEffect(() => {
    if (!embedded) return
    const EDGE = 84 // 底部起手区高度
    const MIN_UP = 24 // 有效上滑位移（相对轨迹最高点）
    const BACK_GIVE = 30 // 冲高后回落超过该值 → 视为向下滑动，放弃
    const MAX_DX = 110 // 允许的横向偏移
    const MAX_MS = 1100 // 手势时间窗
    let sx = 0
    let sy = 0
    let minY = 0
    let st = 0
    let tracking = false
    let fired = false

    const begin = (x: number, y: number, t: number) => {
      if (fired || tracking) return
      if (y < window.innerHeight - EDGE) return
      tracking = true
      sx = x
      sy = y
      minY = y
      st = t
    }
    const move = (x: number, y: number, t: number) => {
      if (!tracking || fired) return
      if (y < minY) minY = y
      if (y - minY > BACK_GIVE) {
        tracking = false
        return
      }
      const dx = Math.abs(x - sx)
      if (sy - minY > MIN_UP && dx < MAX_DX && t - st < MAX_MS) {
        fired = true
        tracking = false
        try {
          window.parent.postMessage({ type: 'ios-open-switcher' }, window.location.origin)
        } catch {
          /* 跨域忽略 */
        }
        window.setTimeout(() => {
          fired = false
        }, 200)
      }
    }
    const end = () => {
      tracking = false
    }

    /* 鼠标/触控笔流：Pointer 事件 */
    const onPd = (e: PointerEvent) => {
      if (e.isPrimary && (e.pointerType === 'mouse' || e.pointerType === 'pen')) begin(e.clientX, e.clientY, e.timeStamp)
    }
    const onPm = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') move(e.clientX, e.clientY, e.timeStamp)
    }
    /* 触摸指针的 pointerup/pointercancel 不在此收尾：浏览器接管滚动时会先发 pointercancel
       （此时 touch 流仍在继续，touchmove 仍持续派发），触摸流由 touchend/touchcancel 收尾
       —— 与壳层 onSwipe 的双流策略完全对齐（壳层根本不监听 pointer 流的触摸事件） */
    const onPu = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      end()
    }

    /* 触摸流：touch 事件（浏览器接管滚动后仍持续派发，pointercancel 不影响本流） */
    const onTs = (e: TouchEvent) => {
      if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp)
    }
    const onTm = (e: TouchEvent) => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp)
    }
    const onTe = () => end()

    window.addEventListener('pointerdown', onPd)
    window.addEventListener('pointermove', onPm)
    window.addEventListener('pointerup', onPu)
    window.addEventListener('pointercancel', onPu)
    window.addEventListener('touchstart', onTs, { passive: true })
    window.addEventListener('touchmove', onTm, { passive: true })
    window.addEventListener('touchend', onTe, { passive: true })
    window.addEventListener('touchcancel', onTe, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onPd)
      window.removeEventListener('pointermove', onPm)
      window.removeEventListener('pointerup', onPu)
      window.removeEventListener('pointercancel', onPu)
      window.removeEventListener('touchstart', onTs)
      window.removeEventListener('touchmove', onTm)
      window.removeEventListener('touchend', onTe)
      window.removeEventListener('touchcancel', onTe)
    }
  }, [embedded])

  /* 视图历史栈：壳层返回键逐级回退；显式 onBack 与栈自动对齐（目标===栈顶时弹栈） */
  const viewStack = useRef<View[]>([])
  const skipStack = useRef(false)
  const lastView = useRef<View>(init.view)

  const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b)

  useEffect(() => {
    const prev = lastView.current
    lastView.current = view
    if (skipStack.current) {
      skipStack.current = false
      return
    }
    if (sameView(prev, view)) return
    const top = viewStack.current[viewStack.current.length - 1]
    if (top && sameView(top, view)) viewStack.current.pop()
    else if (prev.name !== 'paySuccess') viewStack.current.push(prev)
  }, [view])

  const navBack = (): boolean => {
    if (view.name === 'tabs') return false
    const prev = viewStack.current.pop()
    skipStack.current = true
    refreshData()
    setView(prev ?? { name: 'tabs' })
    return true
  }

  /* 桥接给壳层返回键（同源 iframe 调用）：处理了内部导航返回 true，根页面返回 false → 关闭应用 */
  useEffect(() => {
    (window as unknown as { __navBack?: () => boolean }).__navBack = navBack
  })

  /* 深色顶部的页面：通知壳层状态栏用白色图标（其余页面顶部为浅色） */
  const sbDark = ['scan', 'payCode', 'receiveCode', 'moments'].includes(view.name)
  useEffect(() => {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'ios-sb-style', dark: sbDark }, window.location.origin)
      }
    } catch {
      /* 跨域忽略 */
    }
  }, [sbDark])

  useEffect(() => {
    saveUiState({ tab, view })
  }, [tab, view])

  const refreshData = () => {
    setFriends(loadFriends())
    setMessages(loadMessages())
  }

  const openChat = (friendId: string) => {
    if (!friendId) return
    setView({ name: 'chat', friendId })
  }

  const backToTabs = () => {
    refreshData()
    setView({ name: 'tabs' })
  }

  const onFriendCreated = (friendId: string) => {
    refreshData()
    if (view.name === 'addFriend' && view.friendId) {
      setView({ name: 'chat', friendId: view.friendId })
    } else {
      setView({ name: 'chat', friendId })
    }
  }

  const scheduleAIReceive = (friendId: string, msgId: string, kind: 'redpacket' | 'transfer' | 'rc') => {
    window.setTimeout(() => {
      const friend = loadFriends().find((f) => f.id === friendId)
      const msg = loadMessages().find((m) => m.id === msgId)
      if (!friend || !msg) return
      const claim = Math.random() < 0.6
      if (kind === 'redpacket' && msg.redpacket) {
        if (claim) {
          patchFriendMsg(friendId, msgId, { redpacket: { ...msg.redpacket, status: '已领取', openedBy: friend.name, openedAt: Date.now() } })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `领取了你的红包，收到 ¥${msg.redpacket.amount} 元`, time: Date.now(), receipt: { kind: 'redpacket', amount: msg.redpacket.amount, srcMsgId: msgId } })
        } else {
          patchFriendMsg(friendId, msgId, { redpacket: { ...msg.redpacket, status: '已退还' } })
          const amt = msg.redpacket.amount
          updateWallet((x) => ({ ...x, balance: Math.round((x.balance + amt) * 100) / 100 }))
          addBill({ kind: '红包', title: `${friend.name}退还的红包`, amount: amt, status: '已退还，退回零钱', friendName: friend.name, note: msg.redpacket.blessing })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `退还了你的红包，¥${amt} 已退回你的零钱`, time: Date.now() })
        }
        friend.lastTime = Date.now()
        saveFriends(loadFriends().map((f) => (f.id === friendId ? friend : f)))
        refreshData()
      } else if (kind === 'transfer' && msg.transfer) {
        if (claim) {
          patchFriendMsg(friendId, msgId, { transfer: { ...msg.transfer, status: '已收款', confirmedAt: Date.now() } })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `已收款，到账 ¥${msg.transfer.amount} 元`, time: Date.now(), receipt: { kind: 'transfer', amount: msg.transfer.amount, srcMsgId: msgId } })
        } else {
          patchFriendMsg(friendId, msgId, { transfer: { ...msg.transfer, status: '已退还' } })
          const amt = msg.transfer.amount
          updateWallet((x) => ({ ...x, balance: Math.round((x.balance + amt) * 100) / 100 }))
          addBill({ kind: '转账', title: `${friend.name}退还的转账`, amount: amt, status: '已退还，退回零钱', friendName: friend.name, note: msg.transfer.note })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `退还了你的转账，¥${amt} 已退回你的零钱`, time: Date.now() })
        }
        friend.lastTime = Date.now()
        saveFriends(loadFriends().map((f) => (f.id === friendId ? friend : f)))
        refreshData()
      } else if (kind === 'rc' && msg.relativeCard) {
        const card = loadWallet().relativeCards.find((c) => c.id === msg.relativeCard!.cardId)
        if (!card) return
        if (claim) {
          updateWallet((x) => ({ ...x, relativeCards: x.relativeCards.map((c2) => (c2.id === card.id ? { ...c2, status: 'claimed', claimedAt: Date.now() } : c2)) }))
          patchFriendMsg(friendId, msgId, { relativeCard: { cardId: card.id, status: '已领取' } })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `已领取你的亲属卡，每月额度 ¥${card.monthlyLimit} 元`, time: Date.now(), receipt: { kind: 'rc', amount: card.monthlyLimit, srcMsgId: msgId, cardId: card.id } })
        } else {
          updateWallet((x) => ({ ...x, relativeCards: x.relativeCards.map((c2) => (c2.id === card.id ? { ...c2, status: 'rejected', rejectedAt: Date.now() } : c2)) }))
          patchFriendMsg(friendId, msgId, { relativeCard: { cardId: card.id, status: '已退还' } })
          appendMessage({ id: uid(), friendId, from: 'friend', text: `婉拒了你的亲属卡，卡已退回给你`, time: Date.now() })
        }
        friend.lastTime = Date.now()
        saveFriends(loadFriends().map((f) => (f.id === friendId ? friend : f)))
        refreshData()
      }
    }, 4000 + Math.random() * 5000)
  }

  const verifyPwd = (pwd: string | null): string | null => {
    const w = loadWallet()
    if (!w.payPassword) return null
    if (pwd === null) return '请输入支付密码'
    return pwd === w.payPassword ? null : '支付密码错误，请重试'
  }

  const submitRedPacket = (friendId: string, amount: number, blessing: string, payId: string, pwd: string | null): string | null => {
    const friend = loadFriends().find((f) => f.id === friendId)
    if (!friend) return '好友不存在'
    const n = Math.round(amount * 100) / 100
    if (!n || n <= 0 || n > 200) return '单个红包金额不可超过 200 元'
    const w = loadWallet()
    const a = checkAmount(w, payId, n)
    if (a) return a
    const v = verifyPwd(pwd)
    if (v) return v
    const label = payLabel(w, payId)
    updateWallet((x) => deduct(x, payId, n))
    addBill({ kind: '红包', title: `发给${friend.name}的红包`, amount: -n, status: '已发出，等待领取', friendName: friend.name, note: blessing })
    const msg: Message = { id: uid(), friendId, from: 'me', text: `[红包:${blessing}|${n}]`, time: Date.now(), redpacket: { amount: n, blessing, status: '待领取' } }
    appendMessage(msg)
    refreshData()
    scheduleAIReceive(friendId, msg.id, 'redpacket')
    setView({
      name: 'paySuccess',
      data: {
        title: '红包已发出',
        amount: n,
        rows: [
          { label: '收款人', value: friend.name },
          { label: '祝福语', value: blessing || '恭喜发财，大吉大利' },
          { label: '支付方式', value: label },
        ],
        back: { name: 'chat', friendId },
      },
    })
    return null
  }

  const submitTransfer = (friendId: string, amount: number, note: string, payId: string, pwd: string | null): string | null => {
    const friend = loadFriends().find((f) => f.id === friendId)
    if (!friend) return '好友不存在'
    const n = Math.round(amount * 100) / 100
    if (!n || n <= 0) return '请输入转账金额'
    const w = loadWallet()
    const a = checkAmount(w, payId, n)
    if (a) return a
    const v = verifyPwd(pwd)
    if (v) return v
    const label = payLabel(w, payId)
    updateWallet((x) => deduct(x, payId, n))
    addBill({ kind: '转账', title: `转账给${friend.name}`, amount: -n, status: '已转账，待对方收款', friendName: friend.name, note: note || '转账' })
    const msg: Message = { id: uid(), friendId, from: 'me', text: `[转账:${n}|${note}]`, time: Date.now(), transfer: { amount: n, note, status: '待收款' } }
    appendMessage(msg)
    refreshData()
    scheduleAIReceive(friendId, msg.id, 'transfer')
    setView({
      name: 'paySuccess',
      data: {
        title: '转账成功',
        amount: n,
        rows: [
          { label: '收款人', value: friend.name },
          { label: '转账说明', value: note.trim() || '转账' },
          { label: '支付方式', value: label },
        ],
        back: { name: 'chat', friendId },
      },
    })
    return null
  }

  const submitGift = (friendId: string, limit: number, payId: string, pwd: string | null): string | null => {
    const friend = loadFriends().find((f) => f.id === friendId)
    if (!friend) return '好友不存在'
    const n = Math.round(limit * 100) / 100
    if (!n || n <= 0 || n > 3000) return '每月消费上限需在 0.01 - 3000 元之间'
    const v = verifyPwd(pwd)
    if (v) return v
    const w = loadWallet()
    const label = payLabel(w, payId)
    const card: RelativeCard = { id: uid(), friendId: friend.id, friendName: friend.name, monthlyLimit: n, used: 0, direction: 'given', status: 'pending', createdAt: Date.now() }
    updateWallet((x) => ({ ...x, relativeCards: [...x.relativeCards, card] }))
    addBill({ kind: '亲属卡', title: `赠送亲属卡 · ${friend.name}`, amount: 0, status: '已赠送', note: `每月消费上限 ¥${formatMoney(n)}` })
    const msg: Message = { id: uid(), friendId: friend.id, from: 'me', text: `赠送给${friend.name}的亲属卡`, time: Date.now(), relativeCard: { cardId: card.id, status: '待领取' } }
    appendMessage(msg)
    refreshData()
    scheduleAIReceive(friend.id, msg.id, 'rc')
    setView({
      name: 'paySuccess',
      data: {
        title: '亲属卡已赠送',
        amount: n,
        amountNote: '每月消费上限',
        rows: [
          { label: '赠送对象', value: friend.name },
          { label: '代付账户', value: label },
          { label: '状态', value: '待对方领取' },
        ],
        back: { name: 'chat', friendId: friend.id },
      },
    })
    return null
  }

  const submitSpend = (cardId: string, amount: number, note: string, payId: string, pwd: string | null): string | null => {
    const w = loadWallet()
    const card = w.relativeCards.find((c) => c.id === cardId)
    if (!card) return '亲属卡不存在'
    if (card.status === 'rejected') return '该亲属卡已退还，无法使用'
    if (card.direction === 'received' && card.status !== 'claimed') return '请先领用该亲属卡'
    const n = Math.round(amount * 100) / 100
    if (!n || n <= 0) return '请输入正确的金额'
    const rest = Math.round((card.monthlyLimit - card.used) * 100) / 100
    if (n > rest) return '超过本卡当月剩余额度'
    const v = verifyPwd(pwd)
    if (v) return v
    if (card.direction === 'received') {
      updateWallet((x) => ({
        ...x,
        relativeCards: x.relativeCards.map((c) => (c.id === cardId ? { ...c, used: Math.round((c.used + n) * 100) / 100 } : c)),
      }))
      addBill({ kind: '亲属卡', title: `${card.friendName} 的亲属卡消费`, amount: 0, status: `由${card.friendName}代付`, friendName: card.friendName, note: note.trim() || '亲属卡消费' })
      setView({
        name: 'paySuccess',
        data: {
          title: '支付成功',
          amount: n,
          rows: [
            { label: '消费项目', value: `${card.friendName} 的亲属卡` },
            { label: '代付人', value: card.friendName },
          ],
          back: { name: 'relativeCard' },
        },
      })
      return null
    }
    const a = checkAmount(w, payId, n)
    if (a) return a
    const label = payLabel(w, payId)
    updateWallet((x) => ({
      ...deduct(x, payId, n),
      relativeCards: x.relativeCards.map((c) => (c.id === cardId ? { ...c, used: Math.round((c.used + n) * 100) / 100 } : c)),
    }))
    addBill({ kind: '亲属卡', title: `${card.friendName} 的亲属卡消费`, amount: -n, status: `已用${label}支付`, friendName: card.friendName, note: note.trim() || '亲属卡消费' })
    setView({
      name: 'paySuccess',
      data: {
        title: '支付成功',
        amount: n,
        rows: [
          { label: '消费项目', value: `${card.friendName} 的亲属卡` },
          { label: '支付方式', value: label },
        ],
        back: { name: 'relativeCard' },
      },
    })
    return null
  }

  const openWalletPage = (page: 'change' | 'fund' | 'paycode' | 'receivecode' | 'scan' | 'bills' | 'redpacket' | 'redpacketRecords' | 'transfer' | 'relatives' | 'bankcards', mode?: '充值' | '提现') => {
    const next: Record<string, View> = {
      change: { name: 'walletChange', mode },
      fund: { name: 'walletFund' },
      paycode: { name: 'payCode' },
      receivecode: { name: 'receiveCode' },
      scan: { name: 'scan' },
      bills: { name: 'bills', filter: 'all' },
      redpacket: { name: 'redPacket' },
      redpacketRecords: { name: 'redPacketRecords' },
      transfer: { name: 'transfer' },
      relatives: { name: 'relativeCard' },
      bankcards: { name: 'bankcards' },
    }
    setView(next[page])
  }

  let content: JSX.Element
  if (view.name === 'addFriend') {
    content = <AddFriend onBack={backToTabs} onCreated={onFriendCreated} friendId={view.friendId} />
  } else if (view.name === 'chat') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
      <Chat
        key={friend.id}
        friend={friend}
        onBack={backToTabs}
        onEditFriend={() => setView({ name: 'addFriend', friendId: view.friendId })}
        onOpenSettings={() => setView({ name: 'apiSetting' })}
        onOpenChatSettings={() => setView({ name: 'chatSettings', friendId: view.friendId })}
        onOpenStickers={() => setView({ name: 'stickers' })}
        onOpenLocation={() => setView({ name: 'location', friendId: view.friendId })}
        onOpenRedPacket={() => setView({ name: 'redPacket', friendId: view.friendId, fromChat: true })}
        onOpenTransfer={() => setView({ name: 'transfer', friendId: view.friendId, fromChat: true })}
        onOpenRelativeGift={() => setView({ name: 'relativeGift', friendId: view.friendId, fromChat: true })}
        onOpenRedPacketDetail={(friendId, msgId) => setView({ name: 'rpDetail', friendId, msgId })}
        onOpenTransferDetail={(friendId, msgId) => setView({ name: 'tfDetail', friendId, msgId })}
        onOpenRelativeCardDetail={(cardId) => setView({ name: 'relativeCardDetail', cardId, friendId: view.friendId, fromChat: true })}
        pendingLocation={pendingLocation}
        onConsumeLocation={() => setPendingLocation(null)}
        jumpTo={view.jumpTo}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'location') {
    content = (
      <LocationPage
        onBack={() => setView({ name: 'chat', friendId: view.friendId })}
        onSend={(loc) => {
          setPendingLocation(loc)
          setView({ name: 'chat', friendId: view.friendId })
        }}
      />
    )
  } else if (view.name === 'wallet') {
    content = <WalletHome onBack={backToTabs} onOpen={openWalletPage} onOpenPassword={() => setView({ name: 'payPwd' })} />
  } else if (view.name === 'walletChange') {
    content = (
      <Change
        initialMode={view.mode}
        onBack={() => setView({ name: 'wallet' })}
        onOpenFund={() => setView({ name: 'walletFund' })}
        onOpenBills={() => setView({ name: 'bills', filter: 'change' })}
        onOpenBankCards={() => setView({ name: 'bankcards' })}
      />
    )
  } else if (view.name === 'walletFund') {
    content = <ChangeFund onBack={() => setView({ name: 'wallet' })} onOpenBills={() => setView({ name: 'bills', filter: 'fund' })} />
  } else if (view.name === 'payCode') {
    content = <PayCode onBack={() => setView({ name: 'wallet' })} onOpenReceive={() => setView({ name: 'receiveCode' })} />
  } else if (view.name === 'receiveCode') {
    content = <ReceiveCode onBack={() => setView({ name: 'wallet' })} />
  } else if (view.name === 'scan') {
    content = <Scan onBack={() => setView({ name: 'wallet' })} />
  } else if (view.name === 'bills') {
    content = <Bills title="账单" initialFilter={view.filter ?? 'all'} onBack={() => setView({ name: 'wallet' })} onOpenDetail={(billId) => setView({ name: 'billDetail', billId })} />
  } else if (view.name === 'billDetail') {
    content = <BillDetail billId={view.billId} onBack={() => setView({ name: 'bills', filter: 'all' })} />
  } else if (view.name === 'redPacket') {
    content = (
      <RedPacket
        friendId={view.friendId}
        friendName={friends.find((f) => f.id === view.friendId)?.name}
        friendAvatar={friends.find((f) => f.id === view.friendId)?.avatar}
        onBack={() => (view.fromChat ? setView({ name: 'chat', friendId: view.friendId ?? '' }) : setView({ name: 'wallet' }))}
        onSubmit={submitRedPacket}
      />
    )
  } else if (view.name === 'redPacketRecords') {
    content = <RedPacketRecords onBack={() => setView({ name: 'wallet' })} />
  } else if (view.name === 'transfer') {
    content = (
      <Transfer
        friendId={view.friendId ?? null}
        friendName={friends.find((f) => f.id === view.friendId)?.name ?? ''}
        friendAvatar={friends.find((f) => f.id === view.friendId)?.avatar}
        onBack={() => (view.fromChat ? setView({ name: 'chat', friendId: view.friendId ?? '' }) : setView({ name: 'wallet' }))}
        onSubmit={submitTransfer}
      />
    )
  } else if (view.name === 'relativeCard') {
    content = (
      <RelativeCardPage
        onBack={() => setView({ name: 'wallet' })}
        onGiftSubmit={submitGift}
        onSpendSubmit={submitSpend}
      />
    )
  } else if (view.name === 'relativeGift') {
    content = (
      <RelativeGift
        friendId={view.friendId}
        friendName={friends.find((f) => f.id === view.friendId)?.name}
        friendAvatar={friends.find((f) => f.id === view.friendId)?.avatar}
        onBack={() => (view.fromChat ? setView({ name: 'chat', friendId: view.friendId ?? '' }) : setView({ name: 'wallet' }))}
        onSubmit={submitGift}
      />
    )
  } else if (view.name === 'paySuccess') {
    content = <PaySuccess data={view.data} onDone={() => setView(view.data.back)} />
  } else if (view.name === 'rpDetail') {
    const rpMsg = loadMessages().find((m) => m.id === view.msgId && m.friendId === view.friendId)
    content = rpMsg ? (
      <RedPacketDetail friendId={view.friendId} msgId={view.msgId} onBack={() => setView({ name: 'chat', friendId: view.friendId })} />
    ) : (
      <div className="page">
        <div className="empty-hint">红包不存在</div>
      </div>
    )
  } else if (view.name === 'tfDetail') {
    const tfMsg = loadMessages().find((m) => m.id === view.msgId && m.friendId === view.friendId)
    content = tfMsg ? (
      <TransferDetail
        friendId={view.friendId}
        msgId={view.msgId}
        onBack={() => setView({ name: 'chat', friendId: view.friendId })}
        onOpenBills={() => setView({ name: 'bills', filter: 'transfer' })}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">转账不存在</div>
      </div>
    )
  } else if (view.name === 'relativeCardDetail') {
    const card = loadWallet().relativeCards.find((c) => c.id === view.cardId)
    content = card ? (
      <RelativeCardDetail card={card} onBack={() => (view.fromChat ? setView({ name: 'chat', friendId: view.friendId ?? '' }) : setView({ name: 'wallet' }))} />
    ) : (
      <div className="page">
        <div className="empty-hint">亲属卡不存在</div>
      </div>
    )
  } else if (view.name === 'payPwd') {
    content = <PayPasswordSet onBack={() => setView({ name: 'wallet' })} />
  } else if (view.name === 'bankcards') {
    content = <BankCards onBack={() => setView({ name: 'wallet' })} />
  } else if (view.name === 'chatSettings') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
      <ChatSettings
        friend={friend}
        onBack={() => {
          refreshData()
          setView({ name: 'chat', friendId: view.friendId })
        }}
        onOpenProfile={() => setView({ name: 'friendDetail', friendId: view.friendId })}
        onOpenSearch={() => setView({ name: 'chatSearch', friendId: view.friendId })}
        onOpenBg={() => setView({ name: 'chatBg', friendId: view.friendId })}
        onOpenTranslateLang={() => setView({ name: 'translateLang', friendId: view.friendId })}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'translateLang') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
        <TranslateLang
          friend={friend}
          onBack={() => {
            refreshData()
            setView({ name: 'chatSettings', friendId: view.friendId })
          }}
        />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'chatSearch') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
      <ChatSearch
        friendId={view.friendId}
        friendName={friend.name}
        onBack={() => setView({ name: 'chatSettings', friendId: view.friendId })}
        onJump={(messageId) => setView({ name: 'chat', friendId: view.friendId, jumpTo: messageId })}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'chatBg') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
      <ChatBackground
        friendId={view.friendId}
        friendName={friend.name}
        onBack={() => setView({ name: 'chatSettings', friendId: view.friendId })}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'friendDetail') {
    const friend = friends.find((f) => f.id === view.friendId)
    content = friend ? (
      <FriendDetail
        friend={friend}
        onBack={backToTabs}
        onOpenChat={() => openChat(view.friendId)}
        onEdit={() => setView({ name: 'addFriend', friendId: view.friendId })}
        onDelete={() => {
          saveFriends(loadFriends().filter((f) => f.id !== view.friendId))
          saveMessages(loadMessages().filter((m) => m.friendId !== view.friendId))
          refreshData()
          setView({ name: 'tabs' })
        }}
      />
    ) : (
      <div className="page">
        <div className="empty-hint">好友不存在</div>
      </div>
    )
  } else if (view.name === 'moments') {
    content = <Moments onBack={backToTabs} />
  } else if (view.name === 'myProfile') {
    content = <MyProfile onBack={backToTabs} onEditPersona={(personaId) => setView({ name: 'addPersona', personaId })} onOpenMoments={() => setView({ name: 'moments' })} onOpenMemory={() => setView({ name: 'memory' })} />
  } else if (view.name === 'stickers') {
    content = <StickerPage onBack={() => setView({ name: 'tabs' })} />
  } else if (view.name === 'addPersona') {
    content = <AddPersona onBack={() => setView({ name: 'myProfile' })} personaId={view.personaId} />
  } else if (view.name === 'settings') {
    content = <Settings onBack={backToTabs} />
  } else if (view.name === 'apiSetting') {
    content = <ApiSettingPage onBack={() => setView({ name: 'settings' })} />
  } else if (view.name === 'visionApi') {
    content = <VisionApiPage onBack={() => setView({ name: 'settings' })} />
  } else if (view.name === 'voiceApi') {
    content = <VoiceApiPage onBack={() => setView({ name: 'settings' })} />
  } else if (view.name === 'memory') {
    content = (
      <MemoryPage
        friendId={view.friendId}
        onBack={backToTabs}
        onPickFriend={(id) => setView({ name: 'memory', friendId: id })}
        onClearFriend={() => setView({ name: 'memory' })}
        onOpenApi={() => setView({ name: 'apiSetting' })}
      />
    )
  } else {
    content = (
      <div className="tab-shell">
        <div className="tab-content" key={tab}>
          {tab === 'messages' && (
            <Messages friends={friends} messages={messages} onOpenChat={openChat} onAddFriend={() => setView({ name: 'addFriend' })} onOpenMoments={() => setView({ name: 'moments' })} onRefresh={refreshData} />
          )}
          {tab === 'contacts' && (
            <Contacts
              friends={friends}
              onOpenChat={openChat}
              onOpenFriend={(friendId) => setView({ name: 'friendDetail', friendId })}
              onAddFriend={() => setView({ name: 'addFriend' })}
              onOpenMoments={() => setView({ name: 'moments' })}
            />
          )}
          {tab === 'discover' && <Discover onOpenMoments={() => setView({ name: 'moments' })} />}
          {tab === 'me' && <Me onOpenProfile={() => setView({ name: 'myProfile' })} onOpenSettings={() => setView({ name: 'settings' })} onOpenMoments={() => setView({ name: 'moments' })} onOpenMemory={() => setView({ name: 'memory' })} onOpenStickers={() => setView({ name: 'stickers' })} onOpenWallet={() => setView({ name: 'wallet' })} />}
        </div>
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon(tab === t.key)}
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className={`phone${embedded ? ' embedded' : ''}`}>
      {content}
    </div>
  )
}

/* 主入口分流：/?as=app 渲染项目主体；默认渲染 iPhone 桌面（iframe 承载 /ios） */
declare global {
  interface Window {
    __closeApp?: () => void
  }
}

function isAsApp() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('as')
}

/* 独立设置页模式：/?as=page&p=api|vision|voice（设置APP子页内嵌打开）
   渲染单个设置页组件，存储与信息APP完全同一份（im.api）；
   页面自身返回键隐藏（.phone.embedded），由壳层全局返回键统一收起子页 —— 与信息APP内嵌行为一致
   秒开机制：壳层把承载 iframe 常驻复用（不重载），切页时通过 postMessage 通知本页切换组件 */
function standalonePage(): 'api' | 'vision' | 'voice' | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('as') !== 'page') return null
  const p = params.get('p')
  return p === 'api' || p === 'vision' || p === 'voice' ? p : null
}

type StandalonePageId = 'api' | 'vision' | 'voice'

export default function App() {
  const [asApp] = useState(isAsApp)
  const [page, setPage] = useState<StandalonePageId | null>(standalonePage)
  useEffect(() => {
    if (!asApp && !page) document.title = '主屏幕'
  }, [asApp, page])
  /* 壳层常驻 iframe 复用时的切页指令：{ type: 'cove-page', p: 'api'|'vision'|'voice' } */
  useEffect(() => {
    if (!page) return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; p?: string } | null
      if (d && d.type === 'cove-page' && (d.p === 'api' || d.p === 'vision' || d.p === 'voice')) {
        setPage(d.p as StandalonePageId)
      }
    }
    window.addEventListener('message', onMsg)
    /* 就绪回执：壳层据此补发当前目标页（防本监听器晚于切页消息就绪而丢指令） */
    try {
      window.parent.postMessage({ type: 'cove-page-ready' }, window.location.origin)
    } catch {
      /* 跨域忽略 */
    }
    return () => window.removeEventListener('message', onMsg)
  }, [page])
  if (page) {
    /* 子页返回桥接：同源调用壳层设置应用弹出子页（返回键被隐藏时为安全兑底） */
    const back = () => {
      try {
        ;(window.parent as unknown as { __covePageBack?: () => void }).__covePageBack?.()
      } catch {
        /* 跨域忽略 */
      }
    }
    return (
      <div className="phone embedded">
        {page === 'api' && <ApiSettingPage onBack={back} />}
        {page === 'vision' && <VisionApiPage onBack={back} />}
        {page === 'voice' && <VoiceApiPage onBack={back} />}
      </div>
    )
  }
  if (asApp) return <AppView />
  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', background: '#000' }}>
      <iframe
        title="主屏幕"
        src="/ios/index.html"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    </div>
  )
}
