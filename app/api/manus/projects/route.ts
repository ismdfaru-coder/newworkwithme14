import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json(await manus.project.list())
  } catch (error) {
    return err(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, instruction } = await request.json()
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
    return NextResponse.json(await manus.project.create({ name, instruction }))
  } catch (error) {
    return err(error)
  }
}

function err(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] projects route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
