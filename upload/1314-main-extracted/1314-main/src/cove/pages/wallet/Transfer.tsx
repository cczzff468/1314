import { useState } from 'react'
import { NavBar, Avatar } from '../../components/common'
import { BackIcon } from '../../components/icons'
import { PayMethodRow, PayPicker, PayPwdPanel } from '../../components/PaySheet'
import { loadFriends, loadWallet } from '../../store'
import type { Friend } from '../../types'
import { checkAmount } from '../../utils/pay'
import { formatMoney } from '../../utils/qr'

export default function Transfer({
  friendId,
  friendName,
  friendAvatar,
  onBack,
  onSubmit,
}: {
  friendId: string | null
  friendName: string
  friendAvatar?: string
  onBack: () => void
  onSubmit: (friendId: string, amount: number, note: string, payId: string, pwd: string | null) => string | null
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [payId, setPayId] = useState('balance')
  const [payOpen, setPayOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [target, setTarget] = useState<{ id: string; name: string; avatar?: string } | null>(friendId ? { id: friendId, name: friendName || '好友', avatar: friendAvatar } : null)
  const w = loadWallet()

  const finish = (pwd: string | null): string | null => {
    const n = Math.round(Number(amount) * 100) / 100
    const e = onSubmit(target!.id, n, note.trim(), payId, pwd)
    if (e && pwd === null) setErr(e)
    return e
  }

  const submit = () => {
    if (!target) {
      setErr('请选择收款方')
      return
    }
    const n = Math.round(Number(amount) * 100) / 100
    if (!n || n <= 0) {
      setErr('请输入转账金额')
      return
    }
    const a = checkAmount(w, payId, n)
    if (a) {
      setErr(a)
      return
    }
    if (loadWallet().payPassword) setPwdOpen(true)
    else finish(null)
  }

  return (
    <div className="page transfer-page">
      <NavBar
        title="转账"
        left={
          <button className="nav-btn" onClick={onBack} aria-label="返回">
            <BackIcon />
          </button>
        }
      />
      <div className="page-body">
        {target ? (
          <>
            <div className="tf-hero">
              <Avatar name={target.name} src={target.avatar} size={58} />
              <span className="tf-hero-name">向 {target.name} 转账</span>
            </div>
            <div className="transfer-amount">
              <span className="transfer-cny">¥</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setErr('') }} />
            </div>
            <div className="list-group tf-form">
              <div className="row">
                <div className="row-main">
                  <input className="rp-input" placeholder="添加转账说明" value={note} maxLength={20} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <PayMethodRow w={w} value={payId} onOpen={() => setPayOpen(true)} />
            </div>
            <button className="tf-submit-btn" onClick={submit}>
              转账
            </button>
            {err && <div className="wallet-money-err center">{err}</div>}
            <div className="tf-tip">零钱余额 ¥{formatMoney(w.balance)} · 对方确认收款后资金将直接转入对方零钱</div>
          </>
        ) : (
          <>
            <div className="tf-pick-title">选择要转账的好友</div>
            <div className="list-group">
              {loadFriends().map((f: Friend) => (
                <button key={f.id} className="row" onClick={() => setTarget({ id: f.id, name: f.name, avatar: f.avatar })}>
                  <Avatar name={f.name} src={f.avatar} size={38} />
                  <div className="row-main">
                    <span className="row-title">{f.name}</span>
                  </div>
                  <span className="arrow-right" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <PayPicker open={payOpen} onClose={() => setPayOpen(false)} w={w} value={payId} onSelect={(k) => { setPayId(k); setErr('') }} />
      <PayPwdPanel
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        amountDesc={`转账金额 ¥${formatMoney(Math.round(Number(amount) * 100) / 100 || 0)}`}
        onVerify={(p) => finish(p)}
      />
    </div>
  )
}
