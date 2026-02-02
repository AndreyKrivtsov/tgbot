export type CompactBoolean = 0 | 1

export interface PromptSpec {
  persona: {
    r: string
    t: string
    v: string
  }
  constraints: Record<string, CompactBoolean>
  moderation: Record<string, CompactBoolean | number>
  triggers: string[]
  output: {
    schema: string
    fields?: {
      mid?: string
      c?: string
      rr?: string
      a?: string
      t?: string
      tu?: string
      tm?: string
      d?: string
    }
    enums: {
      c: string
      a: string
    }
    action_hints?: {
      none?: string
      warn?: string
      delete?: string
      mute?: string
      unmute?: string
      kick?: string
      ban?: string
      unban?: string
    }
  }
  predefined: {
    fake_tech: string
    review_notice?: string
    mention_username?: string
  }
}

export interface PromptContext {
  admins: number[]
  flags: Record<string, CompactBoolean>
  userStats: Record<string, { warns: number, mutedUntil: number | null }>
}

export interface CompactMessageRef {
  mid: number
  uid: number
}

export interface CompactMessage {
  id: number
  u: number
  a: CompactBoolean
  t: string
  un?: string
  r?: CompactMessageRef
}

export interface CompactHistoryEntry {
  id: number
  u: number
  a: CompactBoolean
  t: string
  un?: string
  c?: number
  ac?: number
}

export interface CompactPrompt {
  sys: PromptSpec
  ctx: PromptContext
  msgs: CompactMessage[]
  h?: CompactHistoryEntry[]
  task: "return_json_only"
}

export interface CompactResultItem {
  mid: number
  c: number
  rr: CompactBoolean
  a: number
  t?: string
  tu?: number
  tm?: number
  d?: number
}

export interface CompactResult {
  r: CompactResultItem[]
}
