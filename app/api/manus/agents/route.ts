import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get("agentId")
  try {
    if (agentId) return NextResponse.json(await manus.agent.detail(agentId))
    return NextResponse.json(await manus.agent.list())
  } catch (error) {
    return err(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { agentId, nickname, about } = await request.json()
    if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 })
    return NextResponse.json(await manus.agent.update({ agent_id: agentId, nickname, about }))
  } catch (error) {
    return err(error)
  }
}

function err(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] agents route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
