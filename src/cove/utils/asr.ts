/* ============ 语音识别（服务端录音识别，唯一引擎） ============
   MediaRecorder 录音 → 解码降采样 16kHz WAV → POST /api/asr，
   由 z-ai-web-dev-sdk（服务端）识别，语言自动检测。
   只依赖「麦克风 + 应用自身后端」，不依赖浏览器 SpeechRecognition，
   在受限网络下最稳。
   （曾内置双引擎：浏览器 Web Speech API 优先 + 服务端回退；因多数
   大陆网络无法访问浏览器语音服务、引擎起不来，按需求仅保留此引擎。）

   错误报告原则：麦克风拿不到 ≠ 录音编码不支持 ≠ 识别服务不可用。
   每个阶段单独分类，兜底文案带上原始错误名（如 AbortError），
   用户看到「无法启动录音（xxxError）」即可定位真实环节，
   不再笼统报「请检查麦克风」掩盖真实原因。 */

/** 麦克风类错误分类：把 getUserMedia/录音启动异常转成「用户能照着做」的提示。
    注意区分两件事：app 里的「语音输入开关」只管功能开没开；
    这里的错误是浏览器/系统层面拿不到录音设备，与开关无关 */
export function micErrMsg(e: unknown): string {
  const name = String((e as Error)?.name || '')
  const embedded = typeof window !== 'undefined' && window !== window.top
  if (/NotAllowed|Permission|Security/i.test(name)) {
    return embedded
      ? '麦克风权限被拒：本页嵌在框架里，请用「新标签页打开」后再允许麦克风'
      : '麦克风权限被拒：地址栏左侧锁图标 → 麦克风 → 允许后重试'
  }
  if (/NotFound/i.test(name)) {
    return '浏览器找不到可用麦克风：请到 系统-声音-输入 换默认设备（蓝牙耳机断开常残留），并检查 Windows 麦克风隐私设置'
  }
  if (/NotReadable/i.test(name)) {
    return '麦克风被占用：请关闭正在使用它的程序（会议/录音软件）后重试'
  }
  if (/Abort/i.test(name)) {
    return '麦克风启动被系统中断（AbortError 多为瞬时）：请再点一次重试'
  }
  if (/NotSupported|Overconstrained/i.test(name)) {
    return '浏览器不支持录音编码：请更新浏览器，或改用 Chrome / Edge'
  }
  if (/InvalidState/i.test(name)) {
    return '录音会话状态异常：请再点一次重试'
  }
  /* 兜底：带上原始错误名，方便反馈定位（正常情况不该走到这里） */
  const detail = name || String((e as Error)?.message || '').slice(0, 24)
  return detail
    ? `无法启动录音（${detail}）：请重试；持续失败请反馈括号里的内容`
    : '无法启动录音，请检查麦克风后重试'
}

/** 麦克风一键诊断：环境（HTTPS）→ 设备枚举 → 取麦实测 → 录音编码实测。
    与语音输入完全同链路（getUserMedia + MediaRecorder），
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
    lines.push(`实测取麦：成功${label ? `（${label.slice(0, 24)}）` : ''}`)
    /* 第二阶段：MediaRecorder 真录 0.4 秒并确认出了数据。
       只测 getUserMedia 不够——部分浏览器（iOS WebView、老 Safari）能拿到
       麦克风但 MediaRecorder 构造/启动失败，语音输入同样无法工作 */
    let recorderOk = true
    try {
      const rec = new MediaRecorder(stream)
      const parts: Blob[] = []
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) parts.push(ev.data)
      }
      rec.start(100)
      await new Promise((r) => setTimeout(r, 400))
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        rec.onstop = done
        try {
          rec.stop()
        } catch {
          done()
        }
        setTimeout(done, 800)
      })
      if (!parts.length) throw new Error('没录到任何数据')
      lines.push('实测录音：支持（MediaRecorder 正常出数据）')
    } catch (e) {
      recorderOk = false
      const why = String((e as Error)?.name || (e as Error)?.message || '未知')
      lines.push(`实测录音：失败（${why}）——浏览器录音编码不可用`)
    }
    stream.getTracks().forEach((t) => t.stop())
    lines.push(
      recorderOk
        ? '结论：麦克风正常，可直接使用语音输入'
        : '结论：麦克风正常，但浏览器录音编码不可用——请更新浏览器或改用 Chrome / Edge'
    )
    return lines.join('\n')
  } catch (e) {
    const name = String((e as Error)?.name || '')
    lines.push(`实测取麦：失败（${name || '未知异常'}）`)
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
    } else if (/Abort/i.test(name)) {
      lines.push('结论：麦克风启动被系统中断（多为瞬时）——请刷新页面再试一次')
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
    this.stream = await this.acquireMic()
    /* gUM 成功但音轨已断开（设备中途被拔出/被系统抢占） */
    const track = this.stream.getAudioTracks()[0]
    if (!track || track.readyState === 'ended') {
      this.cleanup()
      const err = new Error('麦克风设备已断开')
      err.name = 'NotFoundError'
      throw err
    }
    /* MediaRecorder 构造：依次尝试各编码，最后退回默认构造；
       部分浏览器 isTypeSupported 说支持、实际构造却抛 NotSupportedError */
    const prefer = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', '']
    for (const mime of prefer) {
      try {
        this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
        this.mime = this.recorder.mimeType || mime
        break
      } catch {
        /* 尝试下一种编码 */
      }
    }
    if (!this.recorder) {
      this.cleanup()
      const err = new Error('当前浏览器不支持录音编码（MediaRecorder）')
      err.name = 'NotSupportedError'
      throw err
    }
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    try {
      this.recorder.start(250)
    } catch (e) {
      this.cleanup()
      const name = String((e as Error)?.name || '')
      if (!/InvalidState|NotSupported/i.test(name)) throw e
      const err = new Error('录音启动失败：请再点一次重试')
      err.name = name || 'InvalidStateError'
      throw err
    }
  }

  /** 申请麦克风；iOS/Safari 常见瞬时 AbortError，等 300ms 自动重试一次再判失败 */
  private async acquireMic(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      if (!/Abort/i.test(String((e as Error)?.name || ''))) throw e
      await new Promise((r) => setTimeout(r, 300))
      return navigator.mediaDevices.getUserMedia({ audio: true })
    }
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
    let audio: AudioBuffer
    try {
      audio = await ctx.decodeAudioData(buf.slice(0))
    } catch (e) {
      const why = String((e as Error)?.name || '格式不支持')
      throw new Error(`录音解码失败（${why}）：请换 Chrome / Edge 重试`)
    }
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

/** 调后端 /api/asr 识别 base64 WAV。
    部署环境常见三类失败分别报因：后端没部署（404/返回网页）、
    代理层未转发（如 Cloudflare，HTML/5xx）、识别服务本身出错 */
export async function recognizeBase64(b64: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/asr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64 }),
    })
  } catch {
    throw new Error('识别服务连接失败：请检查网络后重试')
  }
  const raw = await res.text().catch(() => '')
  let data: { text?: string; error?: string } | null = null
  if (raw) {
    try {
      data = JSON.parse(raw) as { text?: string; error?: string }
    } catch {
      data = null
    }
  }
  if (res.ok && data && typeof data.text === 'string') return data.text.trim()
  /* 5xx：网关/代理（如 Cloudflare）或后端本身出错（502 页面也是 HTML，先判状态码） */
  if (res.status >= 500) {
    throw new Error(`识别服务网关错误（HTTP ${res.status}）：代理或后端暂时不可用，请稍后再试`)
  }
  /* 404 或 200 却返回 HTML（SPA 兜底页）：该部署根本没有 /api/asr 后端 */
  if (res.status === 404 || (res.ok && !data)) {
    throw new Error('识别接口不可用（404/返回网页）：当前部署没有 /api/asr 后端，纯静态托管无法语音识别')
  }
  throw new Error(data?.error || `识别失败（HTTP ${res.status}）：请稍后再试`)
}
