import { NextRequest, NextResponse } from "next/server"

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY_4
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"

export async function POST(request: NextRequest) {
  try {
    if (!CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "CEREBRAS_API_KEY_4 is not set" }, { status: 500 })
    }

    const { prompt, model = "gpt-oss-120b", stream = false } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const response = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        stream,
        messages: [
          {
            role: "system",
            content: "You are a helpful, fast AI assistant. Provide concise, accurate, and helpful responses. Use markdown formatting for code blocks, lists, and emphasis where appropriate."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_completion_tokens: 1024,
        top_p: 1,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Cerebras API Error]", response.status, errorData)
      return NextResponse.json(
        { error: errorData.error?.message || `Cerebras API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Extract the response content
    const content = data.choices?.[0]?.message?.content || ""
    const reasoning = data.choices?.[0]?.message?.reasoning || null
    
    return NextResponse.json({
      output: content,
      reasoning,
      model: data.model,
      usage: data.usage,
      time_info: data.time_info,
    })
  } catch (error) {
    console.error("[Cerebras API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
