/* ============ 内置图像识别（原 localhost:3001 后端 /api/image 的并入实现） ============
   供 iOS 桌面（原生JS）内置视觉使用（ios/js/api/chat.js describeImage 内置回退）：
   POST { image: dataUrl|url, question?: string }
   → JSON { content }（错误时 { error } + 非 200，与原约定一致）
   由 z-ai-web-dev-sdk 视觉模型（服务端）驱动。 */

import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { image?: string; question?: string } | null = null
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const image = typeof body?.image === 'string' ? body.image.trim() : ''
  if (!image) {
    return Response.json({ error: 'image 不能为空' }, { status: 400 })
  }
  const question =
    (typeof body?.question === 'string' && body.question.trim()) ||
    '用一两句话客观描述这张图片的内容，包括场景、主体和显著细节。'

  try {
    const zai = await ZAI.create()
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const content: string = response?.choices?.[0]?.message?.content ?? ''
    if (!String(content).trim()) {
      return Response.json({ error: '识别结果为空' }, { status: 502 })
    }
    return Response.json({ content })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/image]', msg)
    return Response.json({ error: `内置识别请求失败：${msg.slice(0, 200)}` }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: '/api/image' })
}
