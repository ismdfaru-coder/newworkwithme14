import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  try {
    return NextResponse.json(await manus.skill.list(searchParams.get("project_id") || undefined))
  } catch (error) {
    if (error instanceof ManusError)
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    console.error("[v0] skills route error:", error)
    return NextResponse.json({ error: "Request failed" }, { status: 500 })
  }
}
