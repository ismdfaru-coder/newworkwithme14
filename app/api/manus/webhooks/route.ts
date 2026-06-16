import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json(await manus.webhook.list())
  } catch (error) {
    return err(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
    return NextResponse.json(await manus.webhook.create(url))
  } catch (error) {
    return err(error)
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("webhookId")
  if (!id) return NextResponse.json({ error: "webhookId required" }, { status: 400 })
  try {
    return NextResponse.json(await manus.webhook.delete(id))
  } catch (error) {
    return err(error)
  }
}

function err(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] webhooks route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
