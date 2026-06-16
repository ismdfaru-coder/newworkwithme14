import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Inbound receiver for Manus webhook events. Register this public URL via
 * the Webhooks page (POST /api/manus/webhooks). Manus signs each delivery; the
 * signature can be verified against the key from `webhook.publicKey`.
 *
 * For now we accept and log the event so it can be surfaced in the dashboard.
 * Production deployments should verify the signature header before trusting it.
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("manus-signature") || request.headers.get("x-manus-signature")
    const payload = await request.json().catch(() => ({}))

    console.log("[v0] Manus webhook received:", {
      hasSignature: Boolean(signature),
      type: payload?.type || payload?.event,
      taskId: payload?.task_id,
    })

    // Acknowledge quickly so Manus does not retry.
    return NextResponse.json({ ok: true, received: true })
  } catch (error) {
    console.error("[v0] webhook-receiver error:", error)
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}

// Allow a quick health check / verification handshake.
export async function GET() {
  return NextResponse.json({ ok: true, receiver: "manus-webhook" })
}
