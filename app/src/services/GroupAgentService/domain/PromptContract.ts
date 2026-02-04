export type CompactBoolean = 0 | 1

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

export interface PromptBuildInput {
  system: string
  context: PromptContext
  messages: CompactMessage[]
  history?: CompactHistoryEntry[]
}

export interface CompactResultItem {
  mid: number
  c: number
  a: number
  t?: string
  tu?: number
  tm?: number
  d?: number
}

export interface CompactResult {
  r: CompactResultItem[]
}
