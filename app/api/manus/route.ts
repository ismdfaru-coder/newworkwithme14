import { type NextRequest, NextResponse } from "next/server"
import {
  manus,
  ManusError,
  collectAssistantText,
  collectAttachments,
  deriveUiStatus,
  getPendingConfirmation,
  latestPlan,
  type AgentProfile,
  type ShareVisibility,
} from "@/lib/manus"

export const runtime = "nodejs"

/**
 * POST /api/manus
 * Creates a Manus v2 task. Backwards compatible: returns `{ task_id, id }`.
 * Accepts the legacy `{ prompt, taskMode }` shape plus new v2 options.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prompt,
      taskId,
      projectId,
      agentProfile = "manus-1.6",
      interactiveMode = false,
      shareVisibility = "private",
      connectors,
      enableSkills,
      hideInTaskList,
    } = body as {
      prompt?: string
      taskId?: string
      projectId?: string
      agentProfile?: AgentProfile
      interactiveMode?: boolean
      shareVisibility?: ShareVisibility
      connectors?: string[]
      enableSkills?: string[]
      hideInTaskList?: boolean
    }

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const message = {
      content: prompt,
      ...(connectors?.length ? { connectors } : {}),
      ...(enableSkills?.length ? { enable_skills: enableSkills } : {}),
    }

    // If a taskId is provided, this is a follow-up message in an existing task.
    if (taskId) {
      const sent = await manus.task.sendMessage({
        task_id: taskId,
        message,
        agent_profile: agentProfile,
      })
      return NextResponse.json({ task_id: taskId, id: taskId, request_id: sent.request_id })
    }

    const created = await manus.task.create({
      message,
      agent_profile: agentProfile,
      interactive_mode: interactiveMode,
      share_visibility: shareVisibility,
      ...(projectId ? { project_id: projectId } : {}),
      ...(hideInTaskList ? { hide_in_task_list: true } : {}),
    })

    return NextResponse.json({
      task_id: created.task_id,
      id: created.task_id,
      task_title: created.task_title,
      task_url: created.task_url,
      share_url: created.share_url,
      request_id: created.request_id,
    })
  } catch (error) {
    if (error instanceof ManusError) {
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    }
    console.error("[v0] Error creating Manus task:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}

/**
 * GET /api/manus?taskId=...&verbose=true
 * Polls a task and returns an aggregated view. Backwards compatible: exposes
 * a `status` of completed/running/etc. and a `result` string for legacy callers,
 * plus the full v2 `events`, `plan`, `attachments`, and `pendingConfirmation`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  const verbose = searchParams.get("verbose") !== "false"

  if (!taskId) {
    return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
  }

  try {
    // Fetch detail + all messages. Page through messages to get the full timeline.
    const events = [] as Awaited<ReturnType<typeof manus.task.listMessages>>["messages"]
    let cursor: string | undefined
    let detailStatus: Awaited<ReturnType<typeof manus.task.detail>>["task"] | undefined

    try {
      const detail = await manus.task.detail(taskId)
      detailStatus = detail.task
    } catch {
      // detail can lag right after creation; ignore and rely on messages
    }

    // Collect up to a few pages of events.
    for (let page = 0; page < 8; page++) {
      const res = await manus.task.listMessages({
        task_id: taskId,
        verbose,
        order: "asc",
        limit: 100,
        cursor,
      })
      events.push(...res.messages)
      if (!res.has_more || !res.next_cursor) break
      cursor = res.next_cursor
    }

    const uiStatus = deriveUiStatus(events, detailStatus?.status)
    const pending = getPendingConfirmation(events)
    const text = collectAssistantText(events)
    const attachments = collectAttachments(events)
    const plan = latestPlan(events)

    // Legacy status: map "stopped" with no pending confirmation to "completed".
    const legacyStatus =
      uiStatus === "stopped" ? "completed" : uiStatus === "waiting" ? "waiting" : uiStatus

    return NextResponse.json({
      task_id: taskId,
      status: legacyStatus,
      uiStatus,
      result: text,
      output: text,
      attachments,
      plan,
      events,
      pendingConfirmation: pending,
      task: detailStatus,
      creditUsage: detailStatus?.credit_usage,
      taskUrl: detailStatus?.task_url,
    })
  } catch (error) {
    if (error instanceof ManusError) {
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    }
    console.error("[v0] Error fetching Manus task:", error)
    return NextResponse.json({ error: "Failed to fetch task status" }, { status: 500 })
  }
}
