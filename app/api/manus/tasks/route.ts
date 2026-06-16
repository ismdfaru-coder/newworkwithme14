import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// GET /api/manus/tasks?limit=&cursor=&scope=&project_id=&agent_id=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  try {
    const res = await manus.task.list({
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 30,
      cursor: searchParams.get("cursor") || undefined,
      order: searchParams.get("order") || undefined,
      scope: searchParams.get("scope") || undefined,
      project_id: searchParams.get("project_id") || undefined,
      agent_id: searchParams.get("agent_id") || undefined,
    })
    return NextResponse.json(res)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/manus/tasks?taskId=  — delete a task
// PATCH  /api/manus/tasks          — update / stop a task
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 })
  try {
    const res = await manus.task.delete(taskId)
    return NextResponse.json(res)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, action, title, shareVisibility, hideInTaskList } = body
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 })

    if (action === "stop") {
      const res = await manus.task.stop(taskId)
      return NextResponse.json(res)
    }
    const res = await manus.task.update({
      task_id: taskId,
      title,
      share_visibility: shareVisibility,
      enable_visible_in_task_list: hideInTaskList === undefined ? undefined : !hideInTaskList,
    })
    return NextResponse.json(res)
  } catch (error) {
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] tasks route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
