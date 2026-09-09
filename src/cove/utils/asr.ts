/* ============ 语音录制 + 后端 ASR 识别 ============
   背景：浏览器原生 SpeechRecognition（webkitSpeechRecognition）依赖 Google 语音服务，
   国内网络普遍不可达，且在预览框架（iframe）内受权限策略限制，导致「识别不管用」。
   方案：MediaRecorder 录音 → 解码降采样为 16kHz 单声道 WAV → POST /api/asr，
   由 z-ai-web-dev-sdk（服务端）识别，不依赖任何外部语音服务。 */

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
