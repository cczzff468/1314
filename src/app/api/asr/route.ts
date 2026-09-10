/* ============ 语音识别（ASR） ============
   POST { audio: base64(16kHz 单声道 WAV) } → { text }
   前端用 MediaRecorder 录音并转为 WAV 上传（src/cove/utils/asr.ts），
   由 z-ai-web-dev-sdk（服务端）识别，不依赖浏览器 SpeechRecognition / 外部语音服务。 */

import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const zai = await ZAI.create()
    const result = await zai.audio.asr.create({ file_base64: audio })
    const text = String(result?.text ?? '').trim()
    if (!text) {
      return Response.json({ error: '没有识别到语音内容' }, { status: 422 })
    }
    return Response.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/asr]', msg)
    /* SDK 配置缺失是部署后最常见故障，单独给出可照做的提示 */
    if (/Configuration file not found|invalid/i.test(msg)) {
      return Response.json(
        { error: '服务器缺少 .z-ai-config 配置（ASR 密钥未随仓库分发），请部署时自行配置或改接其他识别服务商' },
        { status: 503 }
      )
    }
    return Response.json({ error: `语音识别失败：${msg.slice(0, 200)}` }, { status: 500 })
  }
}

export async function GET() {
  /* 健康检查：不仅路由存在，还要验证 SDK 配置可用（.z-ai-config
     不在仓库里，部署到新环境若未配置，语音识别会 500） */
  try {
    await ZAI.create()
    return Response.json({ ok: true, endpoint: '/api/asr' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/asr] 初始化失败：', msg)
    return Response.json(
      {
        ok: false,
        error: 'ASR 服务未配置：服务器缺少 .z-ai-config（含 baseUrl/apiKey，被 .gitignore 排除），需在部署服务器上自行配置或改接其他识别服务商',
      },
      { status: 503 }
    )
  }
}
