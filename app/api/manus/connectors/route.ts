import { NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json(await manus.connector.list())
  } catch (error) {
    if (error instanceof ManusError)
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    console.error("[v0] connectors route error:", error)
    return NextResponse.json({ error: "Request failed" }, { status: 500 })
  }
}
