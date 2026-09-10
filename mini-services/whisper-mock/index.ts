/* 模拟 whisper-asr-webservice 的最小服务，仅用于本地验证
   /api/asr 的 Whisper 转发逻辑（模拟其 /asr 与 /openapi.json 端点）。
   真正部署时用 Docker 起官方镜像：
     docker run -d -p 9000:9000 -e ASR_ENGINE=faster_whisper -e ASR_MODEL=small \
       onerahmet/openai-whisper-asr-webservice:latest */

const PORT = 9010

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/openapi.json') {
      return Response.json({ openapi: '3.0.0', info: { title: 'Whisper ASR Webservice (mock)' } })
    }
    if (url.pathname === '/asr') {
      if (req.method !== 'POST') {
        return Response.json({ detail: 'Method Not Allowed' }, { status: 405 })
      }
      const form = await req.formData().catch(() => null)
      const file = form?.get('audio_file')
      const size = file instanceof File ? file.size : 0
      console.log(`[whisper-mock] /asr 收到音频 ${size} 字节, task=${url.searchParams.get('task')}`)
      return Response.json({
        text: `Whisper 自托管识别成功（收到 ${size} 字节音频，模拟输出）`,
        segments: [],
        language: 'zh',
      })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[whisper-mock] 模拟 Whisper 服务已启动: http://127.0.0.1:${PORT}`)
