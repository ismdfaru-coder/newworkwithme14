// lib/manus.ts
// Typed client for the Manus v2 API (https://api.manus.ai/v2)
// Docs: https://open.manus.ai/docs

export const MANUS_BASE_URL = "https://api.manus.ai/v2"

export type AgentProfile = "manus-1.6" | "manus-1.6-lite" | "manus-1.6-max"
export type ShareVisibility = "private" | "team" | "public"
export type TaskStatus = "running" | "stopped" | "waiting" | "error"
export type TaskType = "standard" | "project" | "agent_subtask"

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface ManusEnvelope {
  ok: boolean
  request_id?: string
  error?: { code?: string; message?: string } | string
  message?: string
}

// ---------------------------------------------------------------------------
// Core resource types
// ---------------------------------------------------------------------------

export interface ManusTask {
  id: string
  status: TaskStatus
  created_at: number
  updated_at: number
  task_type: TaskType
  share_visibility: ShareVisibility
  title: string
  credit_usage: number
  task_url: string
  agent_profile: AgentProfile
}

export interface TaskAttachment {
  type: "image" | "file" | "voice" | "slides"
  filename: string
  url: string
  content_type: string
}

export type TaskEventType =
  | "user_message"
  | "assistant_message"
  | "error_message"
  | "status_update"
  | "tool_used"
  | "plan_update"
  | "new_plan_step"
  | "explanation"
  | "user_stop"
  | "structured_output_result"

export interface PlanStep {
  status: "todo" | "doing" | "done" | "failed"
  title: string
  started_at?: number | null
  end_at?: number | null
}

export interface TaskEvent {
  id: string
  type: TaskEventType
  timestamp: number
  user_message?: {
    content: string
    message_type?: "text" | "voice"
    attachments?: TaskAttachment[]
  }
  assistant_message?: {
    content: string
    attachments?: TaskAttachment[]
  }
  error_message?: {
    error_type?: string
    content: string
  }
  status_update?: {
    agent_status: TaskStatus
    status_detail?: {
      waiting_for_event_id?: string
      waiting_for_event_type?: string
      confirm_input_schema?: Record<string, unknown>
      [key: string]: unknown
    }
  }
  tool_used?: {
    tool: string
    action_id?: string
    status?: "success" | "error" | "rollback"
    brief?: string
    description?: string
    message?: Record<string, unknown>
  }
  plan_update?: {
    steps: PlanStep[]
  }
  new_plan_step?: {
    step_id: string
    title: string
  }
  explanation?: {
    content: string
  }
  structured_output_result?: Record<string, unknown>
}

export interface ManusProject {
  id: string
  name: string
  created_at: number
  instruction?: string
}

export interface ManusSkill {
  id: string
  name: string
  description?: string
  owner_type: "personal" | "official" | "team" | "project"
  creator_info?: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface ManusAgent {
  id: string
  task_id?: string
  nickname?: string
  about?: string
}

export interface ManusConnector {
  id: string
  name: string
  type: "builtin" | "byok" | "mcp"
  description?: string
  category?: string
}

export interface ManusWebhook {
  id: string
  url: string
  status: "active" | "inactive"
  created_at: number
}

export interface ManusBrowserClient {
  client_id: string
  client_name: string
  ua: string
}

export interface ManusUsageRecord {
  task_id: string
  title: string
  credits: number
  created_at: number
  type: "cost" | "refund" | "grant"
  collaborate_infos?: unknown[]
}

export interface ManusFileDetail {
  id: string
  filename: string
  status: "pending" | "uploaded" | "deleted" | "error"
  created_at: number
  bytes?: number | null
  content_type?: string
  expires_at?: number
  error_message?: string | null
}

export interface WebsiteCheckpoint {
  version_id: string
  message: string
  status: "pending" | "success" | "failed" | "unspecified"
  created_at: number
}

// ---------------------------------------------------------------------------
// Message payload
// ---------------------------------------------------------------------------

export interface ContentPart {
  type: string
  text?: string
  [key: string]: unknown
}

export interface ManusMessage {
  content: string | ContentPart[]
  connectors?: string[]
  enable_skills?: string[]
  force_skills?: string[]
  attachments?: { file_id: string }[] | unknown[]
}

export interface CreateTaskInput {
  message: ManusMessage
  project_id?: string
  locale?: string
  interactive_mode?: boolean
  hide_in_task_list?: boolean
  share_visibility?: ShareVisibility
  agent_profile?: AgentProfile
  title?: string
}

// ---------------------------------------------------------------------------
// Low-level request helper
// ---------------------------------------------------------------------------

export class ManusError extends Error {
  status: number
  requestId?: string
  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.name = "ManusError"
    this.status = status
    this.requestId = requestId
  }
}

function getApiKey(): string {
  const key = process.env.MANUS_API_KEY
  if (!key) {
    throw new ManusError("MANUS_API_KEY is not configured", 500)
  }
  return key
}

type Query = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${MANUS_BASE_URL}/${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v))
      }
    }
  }
  return url.toString()
}

async function parseEnvelope<T>(res: Response): Promise<T & ManusEnvelope> {
  const text = await res.text()
  let data: (T & ManusEnvelope) | undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = undefined
  }

  if (!res.ok || (data && data.ok === false)) {
    const requestId = data?.request_id
    let msg = `Manus API error: ${res.status}`
    if (data?.error) {
      msg = typeof data.error === "string" ? data.error : data.error.message || msg
    } else if (data?.message) {
      msg = data.message
    } else if (text) {
      msg = text.slice(0, 500)
    }
    throw new ManusError(msg, res.status, requestId)
  }

  return (data ?? ({ ok: true } as T & ManusEnvelope))
}

async function manusGet<T>(path: string, query?: Query): Promise<T & ManusEnvelope> {
  const res = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: { "x-manus-api-key": getApiKey() },
    cache: "no-store",
  })
  return parseEnvelope<T>(res)
}

async function manusPost<T>(path: string, body: unknown): Promise<T & ManusEnvelope> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "x-manus-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  })
  return parseEnvelope<T>(res)
}

// ---------------------------------------------------------------------------
// Typed endpoint wrappers
// ---------------------------------------------------------------------------

export const manus = {
  // Tasks ------------------------------------------------------------------
  task: {
    create: (input: CreateTaskInput) =>
      manusPost<{ task_id: string; task_title?: string; task_url?: string; share_url?: string }>(
        "task.create",
        input,
      ),
    detail: (task_id: string) => manusGet<{ task: ManusTask }>("task.detail", { task_id }),
    list: (query?: {
      limit?: number
      cursor?: string
      order?: string
      scope?: string
      agent_id?: string
      project_id?: string
    }) => manusGet<{ tasks: ManusTask[]; has_more?: boolean; next_cursor?: string }>("task.list", query),
    stop: (task_id: string) => manusPost<Record<string, never>>("task.stop", { task_id }),
    delete: (task_id: string) => manusPost<Record<string, never>>("task.delete", { task_id }),
    update: (input: {
      task_id: string
      title?: string
      share_visibility?: ShareVisibility
      enable_visible_in_task_list?: boolean
    }) => manusPost<Record<string, never>>("task.update", input),
    sendMessage: (input: {
      task_id: string
      message: ManusMessage
      agent_profile?: AgentProfile
      structured_output_schema?: Record<string, unknown>
    }) => manusPost<{ task_id: string }>("task.sendMessage", input),
    listMessages: (query: {
      task_id: string
      limit?: number
      cursor?: string
      order?: string
      verbose?: boolean
      slides_format?: string
    }) =>
      manusGet<{ task_id: string; messages: TaskEvent[]; has_more?: boolean; next_cursor?: string }>(
        "task.listMessages",
        query,
      ),
    confirmAction: (input: { task_id: string; event_id: string; input?: Record<string, unknown> }) =>
      manusPost<Record<string, never>>("task.confirmAction", input),
  },

  // Projects ---------------------------------------------------------------
  project: {
    list: () => manusGet<{ projects: ManusProject[] }>("project.list"),
    create: (input: { name: string; instruction?: string }) =>
      manusPost<{ project: ManusProject }>("project.create", input),
  },

  // Skills -----------------------------------------------------------------
  skill: {
    list: (project_id?: string) => manusGet<{ skills: ManusSkill[] }>("skill.list", { project_id }),
  },

  // Agents -----------------------------------------------------------------
  agent: {
    list: () => manusGet<{ agents: ManusAgent[] }>("agent.list"),
    detail: (agent_id: string) => manusGet<{ agent: ManusAgent }>("agent.detail", { agent_id }),
    update: (input: { agent_id: string; nickname?: string; about?: string }) =>
      manusPost<{ agent: ManusAgent }>("agent.update", input),
  },

  // Connectors -------------------------------------------------------------
  connector: {
    list: () => manusGet<{ connectors: ManusConnector[] }>("connector.list"),
  },

  // Files ------------------------------------------------------------------
  file: {
    upload: (input: { filename: string; content_type?: string; bytes?: number }) =>
      manusPost<{ file_id: string; upload_url?: string }>("file.upload", input),
    detail: (file_id: string) => manusGet<{ file: ManusFileDetail }>("file.detail", { file_id }),
    delete: (file_id: string) => manusPost<Record<string, never>>("file.delete", { file_id }),
  },

  // Webhooks ---------------------------------------------------------------
  webhook: {
    list: () => manusGet<{ webhooks: ManusWebhook[] }>("webhook.list"),
    create: (url: string) => manusPost<{ webhook: ManusWebhook }>("webhook.create", { url }),
    delete: (webhook_id: string) => manusPost<Record<string, never>>("webhook.delete", { webhook_id }),
    publicKey: () => manusGet<{ public_key: string }>("webhook.publicKey"),
  },

  // Browser ----------------------------------------------------------------
  browser: {
    onlineList: () => manusGet<{ clients: ManusBrowserClient[] }>("browser.onlineList"),
  },

  // Usage ------------------------------------------------------------------
  usage: {
    list: (query?: { limit?: number; cursor?: string }) =>
      manusGet<{ records: ManusUsageRecord[]; has_more?: boolean; next_cursor?: string }>("usage.list", query),
    teamStatistic: (query?: { start_date?: number; end_date?: number }) =>
      manusGet<{ statistics: unknown[] }>("usage.teamStatistic", query),
    teamLog: (query?: {
      limit?: number
      cursor?: string
      start_date?: number
      end_date?: number
      sort_by?: string
      is_asc?: boolean
    }) => manusGet<{ logs: unknown[]; has_more?: boolean; next_cursor?: string }>("usage.teamLog", query),
  },

  // Websites ---------------------------------------------------------------
  website: {
    status: (query: { task_id?: string; website_id?: string }) =>
      manusGet<{ website: Record<string, unknown> }>("website.status", query),
    listCheckpoints: (query: { task_id?: string; website_id?: string }) =>
      manusGet<{ checkpoints: WebsiteCheckpoint[] }>("website.listCheckpoints", query),
    publish: (input: { task_id?: string; website_id?: string; visibility?: string }) =>
      manusPost<{ website: Record<string, unknown> }>("website.publish", input),
    update: (input: { task_id?: string; website_id?: string; title?: string; visibility?: string }) =>
      manusPost<{ website: Record<string, unknown> }>("website.update", input),
  },
}

// ---------------------------------------------------------------------------
// Helpers for status / event aggregation
// ---------------------------------------------------------------------------

// Map the v2 status set onto a UI-friendly status used across the app.
export type UiStatus = "pending" | "running" | "waiting" | "completed" | "error" | "stopped"

export function deriveUiStatus(events: TaskEvent[], taskStatus?: TaskStatus): UiStatus {
  // Find the most recent status_update
  let last: TaskStatus | undefined = taskStatus
  for (let i = events.length - 1; i >= 0; i--) {
    const s = events[i].status_update?.agent_status
    if (s) {
      last = s
      break
    }
  }
  if (!last) return "running"
  if (last === "running") return "running"
  if (last === "waiting") return "waiting"
  if (last === "error") return "error"
  // "stopped" means the agent finished its turn.
  return "stopped"
}

// Returns the pending confirmation request, if the task is waiting on the user.
export function getPendingConfirmation(events: TaskEvent[]): {
  event_id: string
  event_type?: string
  input_schema?: Record<string, unknown>
} | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const su = events[i].status_update
    if (su?.agent_status === "waiting" && su.status_detail?.waiting_for_event_id) {
      return {
        event_id: su.status_detail.waiting_for_event_id,
        event_type: su.status_detail.waiting_for_event_type,
        input_schema: su.status_detail.confirm_input_schema,
      }
    }
    // A later non-waiting status means the wait was resolved.
    if (su && su.agent_status !== "waiting") break
  }
  return null
}

// Concatenate assistant message text from a list of events.
export function collectAssistantText(events: TaskEvent[]): string {
  return events
    .filter((e) => e.type === "assistant_message" && e.assistant_message?.content)
    .map((e) => e.assistant_message!.content)
    .join("\n\n")
    .trim()
}

// Collect all attachments produced by the agent.
export function collectAttachments(events: TaskEvent[]): TaskAttachment[] {
  const out: TaskAttachment[] = []
  for (const e of events) {
    for (const a of e.assistant_message?.attachments ?? []) out.push(a)
  }
  return out
}

// Latest plan snapshot (from plan_update events).
export function latestPlan(events: TaskEvent[]): PlanStep[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "plan_update" && events[i].plan_update?.steps) {
      return events[i].plan_update!.steps
    }
  }
  return []
}
