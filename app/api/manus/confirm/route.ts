import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// POST /api/manus/confirm
// Body: { taskId, eventId, input? }  — confirms a pending "waiting" action.
export async function POST(request: NextRequest) {
  try {
    const { taskId, eventId, input } = await request.json()
    if (!taskId || !eventId)
      return NextResponse.json({ error: "taskId and eventId are required" }, { status: 400 })

    const res = await manus.task.confirmAction({ task_id: taskId, event_id: eventId, input })
    return NextResponse.json(res)
  } catch (error) {
    if (error instanceof ManusError)
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    console.error("[v0] confirm route error:", error)
    return NextResponse.json({ error: "Request failed" }, { status: 500 })
  }
}
