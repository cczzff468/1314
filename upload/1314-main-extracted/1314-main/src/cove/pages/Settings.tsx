import { NavBar, Chevron } from '../components/common'
import { BackIcon } from '../components/icons'

export default function Settings({ onBack }: { onBack: () => void }) {
  return (
    <div className="page">
      <NavBar
        title="设置"
        left={
          <button className="nav-btn" onClick={onBack} aria-label="返回">
            <BackIcon />
          </button>
        }
      />
      <div className="page-body">
        <div className="list-group">
          {['账号与安全', '消息通知', '隐私', '通用'].map((label) => (
            <button key={label} className="row" onClick={() => {}}>
              <div className="row-main">
                <span className="row-title">{label}</span>
              </div>
              <Chevron />
            </button>
          ))}
        </div>

        <div className="list-group">
          {['帮助与反馈', '关于'].map((label) => (
            <button key={label} className="row" onClick={() => {}}>
              <div className="row-main">
                <span className="row-title">{label}</span>
              </div>
              <Chevron />
            </button>
          ))}
        </div>

        <div className="list-group">
          <button className="row" onClick={() => {}}>
            <div className="row-main">
              <span className="row-title settings-danger">切换账号</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
