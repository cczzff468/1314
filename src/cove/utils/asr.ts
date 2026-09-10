/* ============ 语音识别（服务端录音识别，唯一引擎） ============
   MediaRecorder 录音 → 解码降采样 16kHz WAV → POST /api/asr，
   由 z-ai-web-dev-sdk（服务端）识别，语言自动检测。
   只依赖「麦克风 + 应用自身后端」，不依赖浏览器 SpeechRecognition，
   在受限网络下最稳。
   （曾内置双引擎：浏览器 Web Speech API 优先 + 服务端回退；因多数
   大陆网络无法访问浏览器语音服务、引擎起不来，按需求仅保留此引擎。） */

/** 麦克风类错误分类：把 getUserMedia 异常转成「用户能照着做」的提示。
    注意区分两件事：app 里的「语音输入开关」只管功能开没开；
    这里的错误是浏览器/系统层面拿不到录音设备，与开关无关 */
export function micErrMsg(e: unknown): string {
  const name = String((e as Error)?.name || '')
  if (/NotAllowed|Permission|Security/i.test(name)) {
    return typeof window !== 'undefined' && window !== window.top
      ? '麦克风权限被拒：本页嵌在框架里，请用「新标签页打开」后再允许麦克风'
      : '麦克风权限被拒：请在浏览器地址栏左侧的站点设置里允许麦克风后重试'
  }
  if (/NotFound/i.test(name)) {
    return '浏览器找不到可用麦克风：请到 系统-声音-输入 换默认设备（蓝牙耳机断开常残留），并检查 Windows 麦克风隐私设置'
  }
  if (/NotReadable/i.test(name)) {
    return '麦克风被占用：请关闭正在使用它的程序（会议/录音软件）后重试'
  }
  return '无法启动录音，请检查麦克风后重试'
}

/** 麦克风一键诊断：环境（HTTPS）→ 设备枚举 → 实录测试，
    返回带结论的多行文本（用于设置页展示） */
export async function diagnoseMic(): Promise<string> {
  const lines: string[] = []
  if (typeof window === 'undefined') return ''
  const secure = window.isSecureContext
  lines.push(`页面环境：${secure ? 'HTTPS，浏览器允许使用麦克风' : '非 HTTPS，浏览器已禁用麦克风（localhost 除外）'}`)
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) {
    lines.push('结论：当前浏览器不支持录音 API，请换 Chrome / Edge')
    return lines.join('\n')
  }
  let inputs = -1
  try {
    const devs = await md.enumerateDevices()
    inputs = devs.filter((d) => d.kind === 'audioinput').length
    lines.push(`输入设备：浏览器看到 ${inputs} 个（未授权时名称隐藏）`)
  } catch {
    lines.push('输入设备：无法枚举')
  }
  if (!secure) {
    lines.push('结论：用 HTTPS 打开本页后麦克风即可使用')
    return lines.join('\n')
  }
  try {
    const stream = await md.getUserMedia({ audio: true })
    const label = stream.getAudioTracks()[0]?.label || ''
    stream.getTracks().forEach((t) => t.stop())
    lines.push(`实测录音：成功${label ? `（${label.slice(0, 24)}）` : ''}`)
    lines.push('结论：麦克风正常，可直接使用语音输入')
    return lines.join('\n')
  } catch (e) {
    const name = String((e as Error)?.name || '')
    lines.push(`实测录音：失败（${name || '未知异常'}）`)
    if (/NotAllowed|Permission|Security/i.test(name)) {
      lines.push(
        '结论：权限被拒——浏览器地址栏左侧站点设置 → 麦克风 → 允许，再重试' +
          (window !== window.top ? '；本页嵌在框架里的话，请先用「新标签页打开」' : '')
      )
    } else if (/NotFound/i.test(name)) {
      lines.push(
        inputs === 0
          ? '结论：浏览器看不到任何输入设备——系统层面把麦克风关了：Windows 设置 → 隐私和安全性 → 麦克风，开启「允许应用」和「允许桌面应用访问麦克风」（浏览器属于桌面应用）；Mac 在 系统设置 → 隐私与安全性 → 麦克风 勾选浏览器'
          : '结论：有输入设备但默认那个不可用——系统设置 → 声音 → 输入，换一个真实存在的麦克风做默认设备（蓝牙耳机断开后常残留为默认设备）'
      )
    } else if (/NotReadable/i.test(name)) {
      lines.push('结论：设备被其他程序占用——关闭会议/录音/K歌等软件后重试')
    } else {
      lines.push('结论：未知错误，请截图这段检测结果反馈')
    }
    return lines.join('\n')
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
