import { NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// Lists browsers currently online and available for "use my browser" actions.
export async function GET() {
  try {
    return NextResponse.json(await manus.browser.onlineList())
  } catch (error) {
    if (error instanceof ManusError)
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    console.error("[v0] browser route error:", error)
    return NextResponse.json({ error: "Request failed" }, { status: 500 })
  }
}
