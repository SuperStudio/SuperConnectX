export interface AiExecutionContext {
  principalId: string
  clientName: string
  signal: AbortSignal
  requestId?: string | number
}
