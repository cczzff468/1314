/* ============ 双引擎语音识别 ============
   引擎一（优先）：Web Speech API（浏览器原生 SpeechRecognition）——
     实时转写、免流量、无需服务；但依赖浏览器实现与 Google 服务，
     部分网络/预览 iframe 内不可用。
   引擎二（回退）：MediaRecorder 录音 → 解码降采样 16kHz WAV → POST /api/asr，
     由 z-ai-web-dev-sdk（服务端）识别，不依赖任何外部语音服务。
   策略：auto 模式下先试 Web Speech，失败（network 等）自动回退服务端识别。 */

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

export class WebSpeechRecognizer {
  private rec: SRInstance | null = null
  private finalText = ''
  private errCode: string | null = null
  private settled = false
  private startedAt = 0
  private earlySilentEnd = false
  private resolveDone: ((text: string) => void) | null = null
  private rejectDone: ((err: { code: string }) => void) | null = null

  static supported(): boolean {
    return !!getSRCtor()
  }

  constructor(
    private lang: string,
  ) {}

  /** 开始识别。Promise 在识别结束（说完自动停 / stop() / abort()）后 resolve
      全部定稿文本；出错 reject { code }（code 见 SttErrorCode，可用 sttErrorMsg 转提示）。
      onInterim 回调实时返回「已定稿 + 中间结果」文本，用于 UI 实时转写展示。 */
  start(onInterim?: (fullText: string) => void): Promise<string> {
    const Ctor = getSRCtor()
    if (!Ctor) return Promise.reject({ code: 'unsupported' })
    const rec = new Ctor()
    this.rec = rec
    this.finalText = ''
    this.errCode = null
    this.settled = false
    this.earlySilentEnd = false
    this.startedAt = Date.now()
    rec.lang = this.lang || 'zh-CN'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const alt = r[0]
        if (!alt) continue
        if (r.isFinal) this.finalText += alt.transcript
        else interim += alt.transcript
      }
      onInterim?.((this.finalText + interim).trim())
    }
    rec.onerror = (e) => {
      if (this.settled) return
      this.errCode = e.error || 'unknown'
      /* 其余错误交由 onend 统一 settle（规范保证 error 后必触发 end） */
    }
    rec.onend = () => this.settle()
    return new Promise<string>((resolve, reject) => {
      this.resolveDone = resolve
      this.rejectDone = reject
      try {
        rec.start()
      } catch {
        this.settled = true
        reject({ code: 'start-failed' })
        this.cleanup()
      }
    })
  }

  /** 用户点击「停止」：以已识别文本结束（触发 start() 的 promise resolve）。
      个别环境（如 headless）stop 后不触发 onend，3 秒后强制结算作兜底 */
  stop(): void {
    try {
      this.rec?.stop()
    } catch {
      this.settle()
      return
    }
    this.armSettleFallback()
  }

  /** 放弃本次识别（同样触发 promise resolve，文本可能为空） */
  abort(): void {
    try {
      this.rec?.abort()
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

  private settle(): void {
    if (this.settled) return
    this.settled = true
    const code = this.errCode
    const text = this.finalText.trim()
    /* 立即空结束（无错误、无结果，1.5 秒内）：麦克风音频流根本没建立。
       典型场景：页面嵌在无 allow="microphone" 的 iframe 里，Chrome 的
       SpeechRecognition 会静默 onend —— 报 audio-unavailable 而非「没听到内容」 */
    const duration = this.startedAt ? Date.now() - this.startedAt : Infinity
    if (!code && !text && duration < 1500) {
      this.earlySilentEnd = true
    }
    /* 先取出 resolve/reject 再清理，否则 cleanup 置空后 promise 永不结算 */
    const resolve = this.resolveDone
    const reject = this.rejectDone
    this.cleanup()
    if (this.earlySilentEnd) {
      reject?.({ code: 'audio-unavailable' })
    } else if (code && code !== 'aborted' && !(code === 'no-speech' && text)) {
      reject?.({ code })
    } else {
      resolve?.(text)
    }
  }

  private cleanup(): void {
    this.rec = null
    this.resolveDone = null
    this.rejectDone = null
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
