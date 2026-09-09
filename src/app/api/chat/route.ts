/* ============ 内置 AI 聊天（原 localhost:3001 后端 /api/chat 的并入实现） ============
   供 iOS 桌面（原生JS）内置 AI 使用（ios/js/api/chat.js builtinChat）：
   POST { messages: [{role, content}], stream?: true }
   - stream=true → text/event-stream，data: {"choices":[{"delta":{"content":"…"}}]}} + [DONE]
   - 其他 → JSON { content }
   由 z-ai-web-dev-sdk（服务端）驱动，与原部署的 Next.js 后端行为一致。 */

import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[]; stream?: boolean } | null = null
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const messages = Array.isArray(body?.messages)
    ? body!.messages!.filter(
        (m) => m && typeof m.role === 'string' && typeof m.content === 'string'
      )
    : []
  if (!messages.length) {
    return Response.json({ error: 'messages 不能为空' }, { status: 400 })
  }

  const wantsStream = body?.stream !== false

  try {
    const zai = await ZAI.create()
    const result = await zai.chat.completions.create({
      messages,
      stream: wantsStream,
      thinking: { type: 'disabled' },
    })

    /* 流式：SDK 返回上游 ReadableStream（OpenAI 兼容 SSE，含 [DONE]） */
    if (wantsStream && result instanceof ReadableStream) {
      return new Response(result, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    /* 非流式（或上游返回 JSON） */
    const content: string =
      result?.choices?.[0]?.message?.content ?? result?.content ?? ''
    if (!String(content).trim()) {
      return Response.json({ error: '模型没有返回内容' }, { status: 502 })
    }
    return Response.json({ content })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/chat]', msg)
    return Response.json({ error: `内置AI请求失败：${msg.slice(0, 200)}` }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: '/api/chat' })
}
