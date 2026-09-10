/* ============ 语音识别（ASR） ============
   POST { audio: base64(16kHz 单声道 WAV) } → { text }
   前端用 MediaRecorder 录音并转为 WAV 上传（src/cove/utils/asr.ts）。

   双后端设计（服务端环境变量切换，前端无感知）：
   1. 自托管 Whisper（推荐用于自部署）：设 ASR_BACKEND_URL 指向
      whisper-asr-webservice（github.com/ahmetoner/whisper-asr-webservice）
      的地址，例如 ASR_BACKEND_URL=http://127.0.0.1:9000。
      启动方式（Docker，CPU 即可，支持中文，免费无密钥）：
        docker run -d -p 9000:9000 \
          -e ASR_ENGINE=faster_whisper \
          -e ASR_MODEL=small \
          -v $PWD/cache:/root/.cache/ \
          onerahmet/openai-whisper-asr-webservice:latest
      语音以 multipart 上传其 /asr 端点（FFmpeg 兼容任意格式）。
   2. 默认（开发环境）：z-ai-web-dev-sdk 的 zai.audio.asr.create，
      依赖 .z-ai-config 配置（不随仓库分发，见 GET 健康检查提示）。 */

import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 自托管 Whisper 服务地址（含协议端口，不带尾斜杠）；空 = 用 z-ai SDK */
function whisperUrl(): string {
  return (process.env.ASR_BACKEND_URL || '').replace(/\/+$/, '')
}

/** 走自托管 Whisper：multipart 传文件到 /asr，取 JSON 的 text */
async function transcribeViaWhisper(b64: string): Promise<string> {
  const base = whisperUrl()
  const form = new FormData()
  form.append(
    'audio_file',
    new Blob([new Uint8Array(Buffer.from(b64, 'base64'))], { type: 'audio/wav' }),
    'audio.wav'
  )
  let res: Response
  try {
    res = await fetch(`${base}/asr?output=json&task=transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120000),
    })
  } catch {
    throw new Error(`Whisper 服务不可达：${base}（检查容器是否在运行、端口是否正确）`)
  }
  if (!res.ok) {
    throw new Error(`Whisper 服务返回 HTTP ${res.status}（看容器日志排错）`)
  }
  const data = (await res.json().catch(() => null)) as { text?: string } | null
  const text = String(data?.text ?? '').trim()
  if (!text) throw new Error('Whisper 未识别到语音内容（换 ASR_MODEL=small 或更大的模型试试）')
  return text
}

export async function POST(req: Request) {
  let body: { audio?: string } | null = null
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  const audio = body?.audio
  if (!audio || typeof audio !== 'string' || audio.length < 100) {
    return Response.json({ error: '音频数据为空或无效' }, { status: 400 })
  }
  try {
    /* 按环境变量选后端：设了 ASR_BACKEND_URL 走自托管 Whisper */
    const text = whisperUrl() ? await transcribeViaWhisper(audio) : await transcribeViaZai(audio)
    return Response.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/asr]', msg)
    /* SDK 配置缺失是部署后最常见故障，单独给出可照做的提示 */
    if (/Configuration file not found|invalid/i.test(msg)) {
      return Response.json(
        {
          error:
            '服务器缺少 .z-ai-config 配置（ASR 密钥未随仓库分发）：部署自托管环境请设 ASR_BACKEND_URL 指向 whisper-asr-webservice，或在服务器上自行配置 z-ai 密钥',
        },
        { status: 503 }
      )
    }
    return Response.json({ error: `语音识别失败：${msg.slice(0, 200)}` }, { status: 500 })
  }
}

/** z-ai SDK 识别（开发环境默认路径） */
async function transcribeViaZai(b64: string): Promise<string> {
  const zai = await ZAI.create()
  const result = await zai.audio.asr.create({ file_base64: b64 })
  const text = String(result?.text ?? '').trim()
  if (!text) throw new Error('没有识别到语音内容')
  return text
}

export async function GET() {
  const base = whisperUrl()
  if (base) {
    /* 自托管 Whisper 模式：探 /openapi.json（任何 HTTP 响应都算服务在线） */
    try {
      const res = await fetch(`${base}/openapi.json`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return Response.json({ ok: true, backend: 'whisper', endpoint: '/api/asr' })
      return Response.json(
        { ok: false, error: `Whisper 服务响应异常（HTTP ${res.status}）：${base}` },
        { status: 503 }
      )
    } catch {
      return Response.json(
        { ok: false, error: `Whisper 服务不可达：${base}（容器没起或地址/端口写错）` },
        { status: 503 }
      )
    }
  }
  /* 默认模式：验证 z-ai SDK 配置可用（.z-ai-config 不在仓库里，
     部署到新环境若未配置，语音识别会 500） */
  try {
    await ZAI.create()
    return Response.json({ ok: true, backend: 'zai', endpoint: '/api/asr' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/asr] 初始化失败：', msg)
    return Response.json(
      {
        ok: false,
        error:
          'ASR 服务未配置：设 ASR_BACKEND_URL 指向自托管 whisper-asr-webservice，或在服务器放置 .z-ai-config（含 baseUrl/apiKey，被 .gitignore 排除）',
      },
      { status: 503 }
    )
  }
}
