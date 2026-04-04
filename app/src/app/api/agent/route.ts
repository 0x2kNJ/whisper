import { NextRequest } from 'next/server'
import path from 'path'

// ---------------------------------------------------------------------------
// Dynamic import of the agent (lives in the monorepo's agent/ package)
// We use a path alias so this works from app/ when AGENT_PATH is set.
// ---------------------------------------------------------------------------

async function loadAgent() {
  // Allow override via env (useful in CI / Docker)
  const agentPath =
    process.env.AGENT_MODULE_PATH ??
    path.resolve(process.cwd(), '../agent/src/agent.ts')

  // Next.js bundles TS files at build time but at runtime (dev) we rely on ts-node / tsx.
  // For production, the agent must be compiled. We try both .js and .ts extensions.
  const candidates = [
    // Compiled output
    agentPath.replace(/\.ts$/, '.js'),
    // Raw TS (works with tsx / ts-node)
    agentPath,
    // From dist/
    agentPath.replace('/src/', '/dist/').replace(/\.ts$/, '.js'),
  ]

  let lastError: Error | null = null
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import(/* webpackIgnore: true */ candidate)
      return mod
    } catch (err) {
      lastError = err as Error
    }
  }

  throw lastError ?? new Error('Could not load agent module')
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { message?: string; history?: unknown[] }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, history = [] } = body

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // Load agent dynamically (avoids bundling issues with Anthropic SDK in edge)
        const agent = await loadAgent()
        const { runAgent } = agent

        const startTime = Date.now()
        let accumulatedText = ''

        const result = await runAgent(
          message,
          history,
          // onToolCall — fired after each tool execution
          (toolCall: {
            name: string
            input: Record<string, unknown>
            result: string
            timestamp: number
          }) => {
            const duration = Date.now() - toolCall.timestamp
            send('tool_call', { ...toolCall, duration })
          },
          // onText — fired with each text segment
          (text: string) => {
            accumulatedText += text
            send('text', { text })
          },
          // onToolStart — fired before tool execution begins
          (info: { name: string; input: Record<string, unknown> }) => {
            send('tool_start', info)
          },
        )

        // If no text was streamed incrementally, stream the final response now
        if (!accumulatedText && result.response) {
          send('text', { text: result.response })
        }

        send('done', {
          response: result.response,
          toolCalls: result.toolCalls,
          duration: Date.now() - startTime,
        })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred'

        send('error', { error: errorMessage })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
