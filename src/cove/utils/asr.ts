/* ============ 双引擎语音识别 ============
   引擎一（优先）：Web Speech API（浏览器原生 SpeechRecognition）——
     实时转写、免流量、无需服务；但依赖浏览器实现与 Google 服务，
     部分网络/预览 iframe 内不可用。
   引擎二（回退）：MediaRecorder 录音 → 解码降采样 16kHz WAV → POST /api/asr，
     由 z-ai-web-dev-sdk（服务端）识别，不依赖任何外部语音服务。
   策略：auto 模式下先试 Web Speech，失败（network 等）自动回退服务端识别。
   Web Speech 关键设计：
     - continuous = true 连续模式，说完一句、短暂停顿不结束会话；
     - 单个识别实例因 no-speech 超时（约 8 秒无声）结束后，自动销毁旧实例、
       换全新实例继续聆听——用户开口前的犹豫不会被误报「没有听到内容」；
     - 调用方启动引擎前先 warmupMic() 显式申请麦克风权限并释放，
       避免 SpeechRecognition 在权限未授/设备被占时静默失败。 */

/* ---- Web Speech API 最小类型声明（lib.dom 未收录，模块内声明不与全局冲突） ---- */
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SRInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRCtor = new () => SRInstance

const getSRCtor = (): SRCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** Web Speech API 识别错误码 */
export type SttErrorCode =
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'audio-capture'
  | 'no-speech'
  | 'aborted'
  | 'start-failed'
  | 'unsupported'
  | 'audio-unavailable'
  | 'unknown'

/** 错误码 → 用户可读提示 */
export function sttErrorMsg(code: string): string {
  switch (code) {
    case 'network':
      return '浏览器语音服务连接失败（可能被网络屏蔽）'
    case 'not-allowed':
    case 'service-not-allowed':
      return '麦克风权限被拒绝：请在浏览器地址栏允许麦克风后重试'
    case 'audio-capture':
      return '未检测到麦克风设备：请插入麦克风或检查系统设置'
    case 'no-speech':
      return '没有听到声音，请靠近麦克风再试'
    case 'audio-unavailable':
      return '未捕获到麦克风声音：页面可能嵌在框架里被限制了麦克风，建议新标签页打开后重试'
    default:
      return '语音识别失败，请重试'
  }
}

/* 麦克风权限热身：先显式 getUserMedia 触发浏览器权限弹窗并确认设备可用，
   成功后立即释放全部音轨（避免与 SpeechRecognition 抢占麦克风——
   Android 上同时占用会导致引擎拿不到音频流直接报错）。
   返回：'ok' | 'denied'（权限被拒）| 'no-device'（无麦克风）|
   'insecure'（非安全上下文，如 http://）| 'unknown' */
export async function warmupMic(): Promise<
  'ok' | 'denied' | 'no-device' | 'insecure' | 'unknown'
> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'insecure'
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    /* 等设备真正释放后再启动识别引擎 */
    await new Promise((r) => setTimeout(r, 250))
    return 'ok'
  } catch (e) {
    const name = String((e as Error)?.name || '')
    if (/NotAllowed|Permission|Security/i.test(name)) return 'denied'
    if (/NotFound|Devices/i.test(name)) return 'no-device'
    return 'unknown'
  }
}

export class WebSpeechRecognizer {
  private rec: SRInstance | null = null
  private finalText = ''
  private errCode: string | null = null
  private settled = false
  private sessionStart = 0
  private lastStart = 0
  private userStopped = false
  private quickEmptyEnds = 0
  private restarts = 0
  private interimCb: ((fullText: string) => void) | null = null
  private resolveDone: ((text: string) => void) | null = null
  private rejectDone: ((err: { code: string }) => void) | null = null

  static supported(): boolean {
    return !!getSRCtor()
  }

  constructor(
    private lang: string,
  ) {}

  /** 开始一次「会话级」识别。Promise 在会话结束（用户 stop()/abort()、
      致命错误、会话时长上限）后 resolve 全部定稿文本；出错 reject { code }
      （code 见 SttErrorCode，可用 sttErrorMsg 转提示）。
      会话内部：单个识别实例因 no-speech 超时或自然断句结束后，会销毁旧
      实例、换一个全新实例继续聆听，不会因「还没开口就超时」而提前结束。
      onInterim 回调实时返回「已定稿 + 中间结果」文本，用于 UI 实时转写展示。 */
  start(onInterim?: (fullText: string) => void): Promise<string> {
    if (!getSRCtor()) return Promise.reject({ code: 'unsupported' })
    this.interimCb = onInterim ?? null
    this.finalText = ''
    this.errCode = null
    this.settled = false
    this.userStopped = false
    this.quickEmptyEnds = 0
    this.restarts = 0
    this.sessionStart = Date.now()
    return new Promise<string>((resolve, reject) => {
      this.resolveDone = resolve
      this.rejectDone = reject
      this.spinUp()
    })
  }

  /** 创建并启动一个全新识别实例（重启时也走这里：出错的旧实例可能已
      不可用，必须销毁重建，不能复用） */
  private spinUp(): void {
    if (this.settled) return
    const Ctor = getSRCtor()
    if (!Ctor) {
      this.settle('unsupported')
      return
    }
    const rec = new Ctor()
    this.rec = rec
    this.lastStart = Date.now()
    rec.lang = this.lang || 'zh-CN'
    /* 关键：连续模式——说完一句、短暂停顿后不结束会话，继续听 */
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      if (this.settled) return
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const alt = r[0]
        if (!alt) continue
        if (r.isFinal) this.finalText += alt.transcript
        else interim += alt.transcript
      }
      this.interimCb?.((this.finalText + interim).trim())
    }
    rec.onerror = (e) => {
      if (this.settled) return
      const code = e.error || 'unknown'
      /* 致命错误（network / not-allowed / audio-capture 等）记下、由随后的
         onend 结算；no-speech 与 aborted 不致命——交给 onend 重启续听
         或按用户意图结算 */
      if (code !== 'no-speech' && code !== 'aborted') this.errCode = code
    }
    rec.onend = () => this.onRecEnd()
    try {
      rec.start()
    } catch {
      this.settle('start-failed')
    }
  }

  /** 单个识别实例结束时的调度：
     1) 致命错误 / 用户已主动停止 → 结算整个会话；
     2) 1.5 秒内空结束且连续 3 次 → 音频流根本没建立（页面嵌在无
        allow="microphone" 的 iframe 里 Chrome 会静默 onend），报
        audio-unavailable，auto 模式下回退服务端识别；
     3) 其余（no-speech 超时 / 自然断句结束）→ 换全新实例继续聆听，
        用户开口前的犹豫期不再被误判为「没听到内容」。 */
  private onRecEnd(): void {
    if (this.settled) return
    const rec = this.rec
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
    }
    this.rec = null
    if (this.errCode || this.userStopped) {
      this.settle()
      return
    }
    const elapsed = this.lastStart ? Date.now() - this.lastStart : Infinity
    if (!this.finalText.trim() && elapsed < 1500) {
      this.quickEmptyEnds++
      if (this.quickEmptyEnds >= 3) {
        this.settle('audio-unavailable')
        return
      }
    }
    /* 重启预算 + 会话时长上限（调用方另有更短的 stop 定时器） */
    const total = this.sessionStart ? Date.now() - this.sessionStart : 0
    if (this.restarts < 15 && total < 115000) {
      this.restarts++
      window.setTimeout(() => {
        if (!this.settled && !this.userStopped) this.spinUp()
      }, 300)
      return
    }
    this.settle()
  }

  /** 用户点击「停止」：以已识别文本结束（触发 start() 的 promise resolve）。
      个别环境（如 headless）stop 后不触发 onend，3 秒后强制结算作兜底 */
  stop(): void {
    this.userStopped = true
    const rec = this.rec
    if (!rec) {
      this.settle()
      return
    }
    try {
      rec.stop()
    } catch {
      this.settle()
      return
    }
    this.armSettleFallback()
  }

  /** 放弃本次识别（同样触发 promise resolve，文本可能为空） */
  abort(): void {
    this.userStopped = true
    const rec = this.rec
    if (!rec) {
      this.settle()
      return
    }
    try {
      rec.abort()
    } catch {
      this.settle()
      return
    }
    this.armSettleFallback()
  }

  /** onend 兜底：3 秒内未结算则强制结束（settle 幂等，已结算则无副作用） */
  private armSettleFallback(): void {
    window.setTimeout(() => this.settle(), 3000)
  }

  private settle(errCode?: string): void {
    if (this.settled) return
    this.settled = true
    const code = errCode || this.errCode
    const text = this.finalText.trim()
    /* 先取出 resolve/reject 再清理，否则清理置空后 promise 永不结算 */
    const resolve = this.resolveDone
    const reject = this.rejectDone
    this.resolveDone = null
    this.rejectDone = null
    this.rec = null
    this.interimCb = null
    if (code && code !== 'aborted') {
      reject?.({ code })
    } else {
      resolve?.(text)
    }
  }
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private mime = ''

  static supported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    )
  }

  /** 申请麦克风并开始录音（失败抛 NotAllowedError 等原始异常） */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const prefer = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    this.mime = prefer.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined)
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(250)
  }

  get active(): boolean {
    return !!this.recorder && this.recorder.state !== 'inactive'
  }

  /** 停止录音并送后端识别，返回识别文本 */
  async stopAndRecognize(): Promise<string> {
    const rec = this.recorder
    if (!rec) throw new Error('当前没有在录音')
    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime || 'audio/webm' }))
      if (rec.state !== 'inactive') rec.stop()
      else resolve(new Blob(this.chunks, { type: this.mime || 'audio/webm' }))
    })
    this.cleanup()
    if (blob.size < 2000) throw new Error('录音太短，没有录到内容')
    const b64 = await blobToWavBase64(blob)
    const text = await recognizeBase64(b64)
    if (!text) throw new Error('没有识别到内容，请靠近麦克风再试')
    return text
  }

  /** 放弃录音（不识别） */
  abort(): void {
    this.cleanup()
  }

  private cleanup(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* ignore */
    }
    this.recorder = null
    try {
      this.stream?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    this.stream = null
    this.chunks = []
  }
}

/** 任意浏览器录音格式（webm/mp4/ogg）→ 16kHz 单声道 16bit PCM WAV → base64 */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!Ctx) throw new Error('当前浏览器不支持音频解码')
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0))
    const rate = 16000
    const src = audio.getChannelData(0)
    const ratio = audio.sampleRate / rate
    const len = Math.max(1, Math.floor(src.length / ratio))
    const out = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const pos = i * ratio
      const i0 = Math.floor(pos)
      const i1 = Math.min(i0 + 1, src.length - 1)
      const f = pos - i0
      out[i] = src[i0] * (1 - f) + src[i1] * f
    }
    const bytes = new DataView(new ArrayBuffer(44 + len * 2))
    const w = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) bytes.setUint8(off + i, s.charCodeAt(i))
    }
    w(0, 'RIFF')
    bytes.setUint32(4, 36 + len * 2, true)
    w(8, 'WAVE')
    w(12, 'fmt ')
    bytes.setUint32(16, 16, true)
    bytes.setUint16(20, 1, true)
    bytes.setUint16(22, 1, true)
    bytes.setUint32(24, rate, true)
    bytes.setUint32(28, rate * 2, true)
    bytes.setUint16(32, 2, true)
    bytes.setUint16(34, 16, true)
    w(36, 'data')
    bytes.setUint32(40, len * 2, true)
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, out[i]))
      bytes.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    const arr = new Uint8Array(bytes.buffer)
    const CH = 0x8000
    let bin = ''
    for (let i = 0; i < arr.length; i += CH) {
      bin += String.fromCharCode(...Array.from(arr.subarray(i, i + CH)))
    }
    return btoa(bin)
  } finally {
    void ctx.close()
  }
}

/** 调后端 /api/asr 识别 base64 WAV */
export async function recognizeBase64(b64: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/asr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64 }),
    })
  } catch {
    throw new Error('识别服务连接失败，请检查网络后重试')
  }
  const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
  if (!res.ok || !data || typeof data.text !== 'string') {
    throw new Error(data?.error || '识别服务暂不可用，请稍后再试')
  }
  return data.text.trim()
}
