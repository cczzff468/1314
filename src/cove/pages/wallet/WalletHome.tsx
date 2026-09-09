import { useEffect, useState } from 'react'
import { NavBar } from '../../components/common'
import { BackIcon } from '../../components/icons'
import { loadWallet, settleDailyYield } from '../../store'
import { formatMoney } from '../../utils/qr'

export default function WalletHome({
  onBack,
  onOpen,
  onOpenPassword,
}: {
  onBack: () => void
  onOpen: (page: 'change' | 'fund' | 'paycode' | 'receivecode' | 'scan' | 'bills' | 'redpacket' | 'redpacketRecords' | 'transfer' | 'relatives' | 'bankcards', mode?: '充值' | '提现') => void
  onOpenPassword: () => void
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    settleDailyYield()
    setTick((t) => t + 1)
  }, [])
  const w = (() => {
    void tick
    return loadWallet()
  })()

  /* 线条样式图标：透明底 + 细描边 + currentColor 描边线条（黑白灰） */
  const line = (children: JSX.Element) => <span className="wi-line-icon">{children}</span>

  const services: { key: 'change' | 'fund' | 'redpacket' | 'redpacketRecords' | 'transfer' | 'relatives' | 'bankcards' | 'bills'; name: string; desc: string; icon: JSX.Element }[] = [
    {
      key: 'change',
      name: '零钱',
      desc: formatMoney(w.balance),
      icon: line(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 6.4v11.2M12 6.4 8.2 10.6M12 6.4l3.8 4.2M8.4 13.4h7.2M8.4 16.6h7.2" />
        </svg>
      ),
    },
    {
      key: 'fund',
      name: '零钱通',
      desc: formatMoney(w.changeFund),
      icon: line(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4.2 19.8 12 12 19.8 4.2 12z" />
          <path d="M12 8.6 15.4 12 12 15.4 8.6 12z" />
        </svg>
      ),
    },
    {
      key: 'relatives',
      name: '亲属卡',
      desc: '亲情消费我买单',
      icon: line(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="6.5" width="17" height="12" rx="2.2" />
          <path d="M3.5 10.5h17" />
          <path d="M12 13.2s-2.1-1.3-2.1-2.6c0-.7.5-1.2 1.1-1.2.5 0 .8.3 1 .6.2-.3.5-.6 1-.6.6 0 1.1.5 1.1 1.2 0 1.3-2.1 2.6-2.1 2.6z" />
        </svg>
      ),
    },
    {
      key: 'bankcards',
      name: '银行卡',
      desc: '添加银行卡，充值提现更方便',
      icon: line(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
          <path d="M3 10h18" />
          <path d="M6.5 14.5h4" />
          <circle cx="16.5" cy="14.5" r="1" />
        </svg>
      ),
    },
  ]

  return (
    <div className="page wallet-page">
      <NavBar
        title="钱包"
        left={
          <button className="nav-btn" onClick={onBack} aria-label="返回">
            <BackIcon />
          </button>
        }
        right={
          <button className="nav-btn wallet-bills-btn" onClick={() => onOpen('bills')} aria-label="账单">
            账单
          </button>
        }
      />
      <div className="page-body">
        {/* 零钱块：灰底、金额居中、下方充值/提现 */}
        <div className="wallet-balance-block">
          <span className="wallet-balance-label">零钱</span>
          <span className="wallet-balance-amount">¥{formatMoney(w.balance)}</span>
          <div className="wallet-balance-actions">
            <button className="wallet-op-btn" onClick={() => onOpen('change', '充值')}>
              充值
            </button>
            <button className="wallet-op-btn" onClick={() => onOpen('change', '提现')}>
              提现
            </button>
          </div>
        </div>

        <div className="wallet-pay-grid">
          <button className="wallet-pay-item" onClick={() => onOpen('paycode')}>
            <span className="wallet-pay-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
                <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
                <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
                <path d="M13.5 17h3m3 0h.5M13.5 13.5h.5M17 20h3.5" />
              </svg>
            </span>
            <span className="wallet-pay-name">付款码</span>
          </button>
          <button className="wallet-pay-item" onClick={() => onOpen('receivecode')}>
            <span className="wallet-pay-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
                <path d="M13.5 5h5.5v5.5M13.5 13.5h5.5V19" />
                <path d="M4 13.5h6.5V19H4z" />
              </svg>
            </span>
            <span className="wallet-pay-name">收款码</span>
          </button>
          <button className="wallet-pay-item" onClick={() => onOpen('scan')}>
            <span className="wallet-pay-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
                <path d="M4 12h16" />
              </svg>
            </span>
            <span className="wallet-pay-name">扫一扫</span>
          </button>
        </div>

        <div className="list-group wallet-services">
          {services.map((s) => (
            <button key={s.key} className="row" onClick={() => onOpen(s.key)}>
              {s.icon}
              <div className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-preview">{s.desc}</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="m9 5 7 7-7 7" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        <div className="wallet-footer">
          <span className="wallet-shield">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5 5.5 6v5c0 4.2 2.7 7.4 6.5 9.5 3.8-2.1 6.5-5.3 6.5-9.5V6L12 3.5Z" stroke="#9aa4b2" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          微信安全支付
        </div>
        <button className="wallet-pwd-link" onClick={onOpenPassword}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10.5" width="14" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          支付密码
        </button>
      </div>
    </div>
  )
}
