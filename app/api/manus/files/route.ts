import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// GET /api/manus/files?fileId=  — get file detail (status, download url, etc.)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get("fileId")
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 })
  try {
    return NextResponse.json(await manus.file.detail(fileId))
  } catch (error) {
    return err(error)
  }
}

// POST /api/manus/files  — request an upload URL for a new file
export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, bytes } = await request.json()
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 })
    return NextResponse.json(await manus.file.upload({ filename, content_type: contentType, bytes }))
  } catch (error) {
    return err(error)
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get("fileId")
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 })
  try {
    return NextResponse.json(await manus.file.delete(fileId))
  } catch (error) {
    return err(error)
  }
}

function err(error: unknown) {
  if (error instanceof ManusError)
    return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
  console.error("[v0] files route error:", error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}
