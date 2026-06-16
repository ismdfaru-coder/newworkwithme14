import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// GET /api/manus/websites?taskId=&websiteId=&view=status|checkpoints
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId") || undefined
  const websiteId = searchParams.get("websiteId") || undefined
  const view = searchParams.get("view") || "status"
  if (!taskId && !websiteId)
    return NextResponse.json({ error: "taskId or websiteId required" }, { status: 400 })
  try {
    if (view === "checkpoints")
      return NextResponse.json(await manus.website.listCheckpoints({ task_id: taskId, website_id: websiteId }))
    return NextResponse.json(await manus.website.status({ task_id: taskId, website_id: websiteId }))
  } catch (error) {
    return err(error)
  }
}

// POST /api/manus/websites  — { action: "publish" | "update", taskId, websiteId, title?, visibility? }
export async function POST(request: NextRequest) {
  try {
    const { action, taskId, websiteId, title, visibility } = await request.json()
    if (action === "update")
      return NextResponse.json(
        await manus.website.update({ task_id: taskId, website_id: websiteId, title, visibility }),
      )
    return NextResponse.json(
      await manus.website.publish({ task_id: taskId, website_id: websiteId, visibility }),
    )
  } catch (error) {
    return err(error)
  }
}

function err(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] websites route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
