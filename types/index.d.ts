export type Phase = 'idle' | 'ready' | 'thinking' | 'preview' | 'committing' | 'done' | 'error'

export type Proposal = { message: string; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'blade-of-commits': {
      phase: Phase
      files: string[]
      task: string
      proposal: Proposal | null
      note: string
    }
  }
}
