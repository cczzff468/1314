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
    return Response.json({ error: `语音识别失败：${msg.slice(0, 200)}` }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: '/api/asr' })
}
