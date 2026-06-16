// app/api/agent/route.ts
// WorkwithMe AI Agent — streams a Manus v2 task as a verbose SSE timeline.

import { manus, ManusError, type TaskEvent, type AgentProfile } from "@/lib/manus"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get("query") ?? ""
  const agentProfile = (searchParams.get("profile") as AgentProfile) || "manus-1.6"
  const projectId = searchParams.get("projectId") || undefined
  const interactive = searchParams.get("interactive") === "true"

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 })
  }
  if (!process.env.MANUS_API_KEY) {
    return new Response(JSON.stringify({ error: "MANUS_API_KEY environment variable is not set" }), { status: 500 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: object) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send("step", { type: "info", desc: "Creating AI task...", icon: "thinking" })

        const created = await manus.task.create({
          message: { content: query },
          agent_profile: agentProfile,
          interactive_mode: interactive,
          ...(projectId ? { project_id: projectId } : {}),
        })

        const taskId = created.task_id
        if (!taskId) throw new Error("Invalid response: missing task id")

        const taskUrl = created.task_url || `https://manus.im/app/${taskId}`
        send("step", { type: "success", desc: "Task created successfully", icon: "check" })
        send("session", { taskId, taskUrl, status: "running" })
        send("step", {
          type: "info",
          desc: `Processing: "${query.slice(0, 50)}${query.length > 50 ? "..." : ""}"`,
          icon: "processing",
        })

        const maxPolls = 280 // ~280 * 2s ≈ 9.3 min
        let pollCount = 0
        const seenEventIds = new Set<string>()
        let lastStatus = "running"
        let cursor: string | undefined
        let finished = false

        const emitEvent = (e: TaskEvent) => {
          if (seenEventIds.has(e.id)) return
          seenEventIds.add(e.id)

          switch (e.type) {
            case "explanation":
              if (e.explanation?.content)
                send("step", { type: "info", desc: e.explanation.content, icon: "thinking" })
              break
            case "new_plan_step":
              if (e.new_plan_step?.title)
                send("step", { type: "info", desc: `Plan: ${e.new_plan_step.title}`, icon: "action" })
              break
            case "plan_update":
              if (e.plan_update?.steps)
                send("plan", { steps: e.plan_update.steps })
              break
            case "tool_used":
              if (e.tool_used)
                send("step", {
                  type: e.tool_used.status === "error" ? "error" : "info",
                  desc: e.tool_used.brief || e.tool_used.description || `Used ${e.tool_used.tool}`,
                  icon: "tool",
                  tool: e.tool_used.tool,
                })
              break
            case "assistant_message":
              if (e.assistant_message?.content)
                send("message", { content: e.assistant_message.content })
              for (const a of e.assistant_message?.attachments ?? [])
                send("file", { fileName: a.filename, fileUrl: a.url, mimeType: a.content_type, kind: a.type })
              break
            case "error_message":
              if (e.error_message?.content)
                send("step", { type: "error", desc: e.error_message.content, icon: "error" })
              break
            case "status_update": {
              const su = e.status_update
              if (su?.agent_status === "waiting" && su.status_detail?.waiting_for_event_id) {
                send("waiting", {
                  taskId,
                  eventId: su.status_detail.waiting_for_event_id,
                  eventType: su.status_detail.waiting_for_event_type,
                  inputSchema: su.status_detail.confirm_input_schema,
                })
              }
              break
            }
          }
        }

        await new Promise((r) => setTimeout(r, 1500))

        while (pollCount < maxPolls && !finished) {
          await new Promise((r) => setTimeout(r, 2000))
          pollCount++

          let page: Awaited<ReturnType<typeof manus.task.listMessages>>
          try {
            page = await manus.task.listMessages({
              task_id: taskId,
              verbose: true,
              order: "asc",
              limit: 100,
              cursor,
            })
          } catch {
            if (pollCount % 10 === 0)
              send("step", { type: "info", desc: `Waiting for AI... (${pollCount * 2}s)`, icon: "waiting" })
            continue
          }

          for (const e of page.messages) emitEvent(e)

          // Advance the cursor only when there are no more pages, so we always
          // re-scan the tail for the latest status; keep paging when has_more.
          if (page.has_more && page.next_cursor) {
            cursor = page.next_cursor
            continue
          }

          // Determine current status from the latest status_update we've seen.
          let current = lastStatus
          for (let i = page.messages.length - 1; i >= 0; i--) {
            const s = page.messages[i].status_update?.agent_status
            if (s) {
              current = s
              break
            }
          }

          if (current !== lastStatus) {
            lastStatus = current
            const map: Record<string, { desc: string; icon: string }> = {
              running: { desc: "AI is working on your task...", icon: "processing" },
              waiting: { desc: "Waiting for your confirmation...", icon: "waiting" },
              error: { desc: "Task encountered an error", icon: "error" },
              stopped: { desc: "Task completed", icon: "check" },
            }
            const info = map[current] || { desc: `Status: ${current}`, icon: "info" }
            send("step", {
              type: current === "stopped" ? "success" : current === "error" ? "error" : "info",
              desc: info.desc,
              icon: info.icon,
            })
          }

          if (current === "stopped") {
            // Agent finished its turn. Emit a final result summary.
            const finalText = page.messages
              .filter((e) => e.type === "assistant_message")
              .map((e) => e.assistant_message?.content)
              .filter(Boolean)
              .join("\n\n")
            const files = page.messages
              .flatMap((e) => e.assistant_message?.attachments ?? [])
              .map((a) => ({ fileName: a.filename, fileUrl: a.url, mimeType: a.content_type }))
            send("files", { files })
            send("result", { output: finalText, success: true, taskUrl })
            send("summary", { text: finalText, taskTitle: created.task_title || "Task Completed" })
            finished = true
            break
          }

          if (current === "error") {
            finished = true
            break
          }

          if (pollCount % 15 === 0)
            send("step", { type: "info", desc: `Still working... (${pollCount * 2}s elapsed)`, icon: "waiting" })
        }

        if (!finished && pollCount >= maxPolls)
          send("step", { type: "error", desc: "Polling timeout reached. Task may still be running.", icon: "error" })

        send("done", { message: "AI task finished.", taskId })
      } catch (err: unknown) {
        const msg = err instanceof ManusError ? err.message : err instanceof Error ? err.message : String(err)
        if (/401|403|unauthorized/i.test(msg)) {
          send("agent_error", { message: "Invalid API key. Please check your MANUS_API_KEY environment variable." })
        } else if (/402|quota|limit/i.test(msg)) {
          send("agent_error", { message: "API quota exceeded. Please check your Manus account." })
        } else {
          send("agent_error", { message: msg })
        }
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// POST endpoint mirrors GET via query params for convenience.
export async function POST(req: Request) {
  const body = await req.json()
  const { query, profile, projectId, interactive } = body
  if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 })

  const url = new URL(req.url)
  url.searchParams.set("query", query)
  if (profile) url.searchParams.set("profile", profile)
  if (projectId) url.searchParams.set("projectId", projectId)
  if (interactive) url.searchParams.set("interactive", "true")
  return GET(new Request(url.toString()))
}
