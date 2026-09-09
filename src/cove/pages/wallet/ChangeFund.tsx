import { useState } from 'react'
import { NavBar, Modal } from '../../components/common'
import { BackIcon } from '../../components/icons'
import { addBill, loadWallet, settleDailyYield, updateWallet } from '../../store'
import { formatMoney } from '../../utils/qr'

const RATE = '1.9860%'

/* 近 7 日每万份收益示意（开通页趋势图） */
const YIELD_BARS = [0.52, 0.55, 0.53, 0.56, 0.58, 0.55, 0.6]

/* 收益试算：转入 ¥10,000 的预计每日收益 */
const CALC_DAILY = Math.round((10000 * 0.01986) / 365 * 100) / 100

/* 折线面积图（仿微信）：近7日数据 → 平滑曲线 + 渐变填充 + 末点标记 + 日期轴 */
const CHART_W = 300
const CHART_H = 96
const CHART_BASE = 90
const chartPts = YIELD_BARS.map((v, i) => ({
  x: 8 + (i / (YIELD_BARS.length - 1)) * (CHART_W - 16),
  y: 76 - (v - 0.5) * 250,
}))
const chartLine = (() => {
  let d = `M${chartPts[0].x} ${chartPts[0].y}`
  for (let i = 0; i < chartPts.length - 1; i++) {
    const c = (chartPts[i + 1].x - chartPts[i].x) / 3
    d += ` C${chartPts[i].x + c} ${chartPts[i].y} ${chartPts[i + 1].x - c} ${chartPts[i + 1].y} ${chartPts[i + 1].x} ${chartPts[i + 1].y}`
  }
  return d
})()
const chartArea = `${chartLine} L${chartPts[chartPts.length - 1].x} ${CHART_BASE} L${chartPts[0].x} ${CHART_BASE} Z`
const chartDates = YIELD_BARS.map((_, i) => {
  const dt = new Date(Date.now() - (YIELD_BARS.length - 1 - i) * 86400000)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
})

export default function ChangeFund({ onBack, onOpenBills }: { onBack: () => void; onOpenBills: () => void }) {
  const [mode, setMode] = useState<null | '转入' | '转出'>(null)
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [tick, setTick] = useState(0)
  const [agreed, setAgreed] = useState(true)
  const w = (() => {
    void tick
    settleDailyYield()
    return loadWallet()
  })()

  const flash = (t: string) => {
    setHint(t)
    window.setTimeout(() => setHint(''), 1600)
  }

  /* ---------- 开通界面：未开通时先展示（像微信） ---------- */
  if (!w.fundOpened) {
    const openFund = () => {
      if (!agreed) {
        flash('请先阅读并同意相关协议')
        return
      }
      updateWallet((x) => ({ ...x, fundOpened: true }))
      setTick((t) => t + 1)
      flash('零钱通已开通')
    }
    return (
      <div className="page fund-page fund-open-page">
        <NavBar
          title=""
          left={
            <button className="nav-btn light" onClick={onBack} aria-label="返回">
              <BackIcon />
            </button>
          }
        />
        <div className="page-body">
          <div className="fund-brand">
            <span className="fund-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 3 4.5 7v7c0 4 3 7 7.5 9 4.5-2 7.5-5 7.5-9V7L12 3Z" fill="#ffc300" />
                <path d="m12 7.5 1.6 3.4 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L12 7.5Z" fill="#fff" />
              </svg>
            </span>
            <span className="fund-title">零钱通</span>
            <span className="fund-safe">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5 5.5 6v5c0 4.2 2.7 7.4 6.5 9.5 3.8-2.1 6.5-5.3 6.5-9.5V6L12 3.5Z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              资金安全保障中
            </span>
          </div>

          <div className="fund-card fund-open-card">
            <div className="fund-open-rate">
              <span className="fund-open-rate-label">七日年化收益率</span>
              <span className="fund-open-rate-num">{RATE}</span>
              <span className="fund-open-pills">
                <span className="fund-pill">易方达易理财货币A</span>
                <span className="fund-pill">低风险</span>
              </span>
            </div>
            <div className="fund-open-chart" aria-hidden="true">
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="fund-open-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb400" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#ffb400" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chartArea} fill="url(#fund-open-area)" />
                <path d={chartLine} fill="none" stroke="#ff9d00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={chartPts[chartPts.length - 1].x} cy={chartPts[chartPts.length - 1].y} r="3.6" fill="#ff9d00" stroke="#fff" strokeWidth="1.6" />
              </svg>
            </div>
            <div className="fund-open-dates" aria-hidden="true">
              {chartDates.map((d, i) => (
                <span key={d} className={i === chartDates.length - 1 ? 'cur' : ''}>
                  {d}
                </span>
              ))}
            </div>
            <div className="fund-open-slogan">零钱转入零钱通，能赚又能花</div>
            <div className="fund-open-calc">
              <span>收益试算</span>
              <span className="fund-open-calc-main">转入 ¥10,000，预计每日收益 <em>¥{CALC_DAILY.toFixed(2)}</em></span>
            </div>
          </div>

          <div className="fund-open-points">
            <div className="fund-open-point">
              <span className="wi-line-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.6" />
                  <path d="M12 7.4v9.2M12 7.4 8.6 10.8M12 7.4l3.4 3.4" />
                </svg>
              </span>
              <span className="fund-open-point-main">
                <span className="fund-open-point-title">随时转出</span>
                <span className="fund-open-point-desc">转出至零钱，最快秒到账</span>
              </span>
            </div>
            <div className="fund-open-point">
              <span className="wi-line-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="17" height="15.5" rx="2.2" />
                  <path d="M3.5 9h17M8 13h2M8 16h2M13 13h2M13 16h2" />
                </svg>
              </span>
              <span className="fund-open-point-main">
                <span className="fund-open-point-title">天天有收益</span>
                <span className="fund-open-point-desc">每日结算，收益自动滚存</span>
              </span>
            </div>
            <div className="fund-open-point">
              <span className="wi-line-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5 5.5 6v5c0 4.2 2.7 7.4 6.5 9.5 3.8-2.1 6.5-5.3 6.5-9.5V6L12 3.5Z" />
                  <path d="m12 8.5 1.2 2.5 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L12 8.5Z" />
                </svg>
              </span>
              <span className="fund-open-point-main">
                <span className="fund-open-point-title">消费付款</span>
                <span className="fund-open-point-desc">红包、转账、日常消费直接用</span>
              </span>
            </div>
          </div>

          <div className={`fund-open-agree ${agreed ? 'on' : ''}`}>
            <button type="button" className="fund-open-check" onClick={() => setAgreed((a) => !a)} aria-label="同意协议">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span>已阅读并同意</span>
            <span className="fund-open-link">《零钱通服务协议》</span>
            <span className="fund-open-link">《货币基金销售协议》</span>
          </div>
          <button className="btn-orange-big fund-open-btn" onClick={openFund}>
            开通零钱通
          </button>
          <div className="fund-open-links">
            <span>了解零钱通</span>
            <i />
            <span>常见问题</span>
          </div>
          <div className="fund-open-note">1分钱起转入 · 转出无手续费 · 开通不收任何费用</div>
        </div>
        {hint && <div className="chat-toast">{hint}</div>}
      </div>
    )
  }

  const submit = () => {
    const n = Math.round(Number(val) * 100) / 100
    if (!n || n <= 0) {
      setErr('请输入正确的金额')
      return
    }
    if (mode === '转入') {
      if (n > w.balance) {
        setErr('零钱余额不足')
        return
      }
      updateWallet((x) => ({
        ...x,
        balance: Math.round((x.balance - n) * 100) / 100,
        changeFund: Math.round((x.changeFund + n) * 100) / 100,
      }))
      addBill({ kind: '零钱通', title: '转入零钱通', amount: -n, status: '已转入', note: '零钱自动转入，随时可转出' })
      flash(`已转入零钱通 ¥${formatMoney(n)}`)
    } else {
      if (n > w.changeFund) {
        setErr('零钱通余额不足')
        return
      }
      updateWallet((x) => ({
        ...x,
        balance: Math.round((x.balance + n) * 100) / 100,
        changeFund: Math.round((x.changeFund - n) * 100) / 100,
      }))
      addBill({ kind: '零钱通', title: '零钱通转出', amount: n, status: '已到账零钱', note: '转出到零钱，最快秒到账' })
      flash(`已转出到零钱 ¥${formatMoney(n)}`)
    }
    setVal('')
    setErr('')
    setMode(null)
    setTick((t) => t + 1)
  }

  const close = () => {
    setMode(null)
    setVal('')
    setErr('')
  }

  const yesterday = Math.round(((w.changeFund * 0.01986) / 365) * 100) / 100

  return (
    <div className="page fund-page">
      <NavBar
        title=""
        left={
          <button className="nav-btn light" onClick={onBack} aria-label="返回">
            <BackIcon />
          </button>
        }
      />
      <div className="page-body">
        <div className="fund-brand">
          <span className="fund-logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 4.5 7v7c0 4 3 7 7.5 9 4.5-2 7.5-5 7.5-9V7L12 3Z" fill="#ffc300" />
              <path d="m12 7.5 1.6 3.4 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L12 7.5Z" fill="#fff" />
            </svg>
          </span>
          <span className="fund-title">零钱通</span>
          <span className="fund-safe">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5 5.5 6v5c0 4.2 2.7 7.4 6.5 9.5 3.8-2.1 6.5-5.3 6.5-9.5V6L12 3.5Z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            资金安全保障中
          </span>
        </div>

        <div className="fund-card">
          <div className="fund-balance">
            <span className="fund-balance-label">账户余额</span>
            <span className="fund-balance-amount">¥ {formatMoney(w.changeFund)}</span>
            <button className="fund-detail-link" onClick={onOpenBills}>
              资金明细
            </button>
          </div>
          <div className="fund-metrics">
            <div className="fund-metric">
              <span className="fund-metric-label">七日年化收益率</span>
              <span className="fund-metric-value">{RATE}</span>
              <span className="fund-pill">易方达易理财货币A</span>
            </div>
            <span className="fund-divider" />
            <div className="fund-metric">
              <span className="fund-metric-label">累计收益</span>
              <span className="fund-metric-value">¥{formatMoney(w.fundYield)}</span>
              <span className="fund-pill">昨日 ¥{formatMoney(Math.max(yesterday, 0))}</span>
            </div>
          </div>
          <div className="fund-actions">
            <button className="btn-gray-big" onClick={() => setMode('转出')}>
              转出
            </button>
            <button className="btn-orange-big" onClick={() => setMode('转入')}>
              转入
            </button>
          </div>
        </div>

        <div className="fund-products-title">更多产品</div>
        <div className="list-group fund-products">
          <div className="row">
            <span className="fund-product-icon" style={{ background: '#3a7afe' }}>
              理
            </span>
            <div className="row-main">
              <span className="row-title">活期理财</span>
              <span className="row-preview">转出最快秒到账</span>
            </div>
            <div className="fund-product-rate">
              <span className="rate-num">1.11%</span>
              <span className="rate-label">七日年化</span>
            </div>
          </div>
          <div className="row">
            <span className="fund-product-icon" style={{ background: '#ff7a1a' }}>
              定
            </span>
            <div className="row-main">
              <span className="row-title">定期理财</span>
              <span className="row-preview">追求更高收益</span>
            </div>
            <div className="fund-product-rate">
              <span className="rate-num">2.34%</span>
              <span className="rate-label">最高收益率</span>
            </div>
          </div>
        </div>

        <div className="fund-footer">
          <span>了解零钱通</span>
          <span>常见问题</span>
        </div>
      </div>

      <Modal
        open={mode !== null}
        title={mode === '转入' ? '转入零钱通' : '转出到零钱'}
        buttons={[
          { label: '取消', onClick: close },
          { label: mode ?? '确定', primary: true, onClick: submit },
        ]}
      >
        <div className="wallet-money-input">
          <span>¥</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={val}
            autoFocus
            onChange={(e) => {
              setVal(e.target.value)
              setErr('')
            }}
          />
        </div>
        {err && <div className="wallet-money-err">{err}</div>}
        <div className="wallet-money-tip">{mode === '转入' ? `零钱可用余额 ¥${formatMoney(w.balance)}` : `零钱通可转出 ¥${formatMoney(w.changeFund)}`}</div>
      </Modal>
      {hint && <div className="chat-toast">{hint}</div>}
    </div>
  )
}
