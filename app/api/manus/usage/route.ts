import { type NextRequest, NextResponse } from "next/server"
import { manus, ManusError } from "@/lib/manus"

export const runtime = "nodejs"

// GET /api/manus/usage?view=list|teamStatistic|teamLog
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const view = searchParams.get("view") || "list"
  try {
    if (view === "teamStatistic") {
      return NextResponse.json(
        await manus.usage.teamStatistic({
          start_date: num(searchParams.get("start_date")),
          end_date: num(searchParams.get("end_date")),
        }),
      )
    }
    if (view === "teamLog") {
      return NextResponse.json(
        await manus.usage.teamLog({
          limit: num(searchParams.get("limit")),
          cursor: searchParams.get("cursor") || undefined,
          start_date: num(searchParams.get("start_date")),
          end_date: num(searchParams.get("end_date")),
        }),
      )
    }
    return NextResponse.json(
      await manus.usage.list({
        limit: num(searchParams.get("limit")) ?? 30,
        cursor: searchParams.get("cursor") || undefined,
      }),
    )
  } catch (error) {
    if (error instanceof ManusError)
      return NextResponse.json({ error: error.message, request_id: error.requestId }, { status: error.status })
    console.error("[v0] usage route error:", error)
    return NextResponse.json({ error: "Request failed" }, { status: 500 })
  }
}

function num(v: string | null): number | undefined {
  if (v === null || v === "") return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}
