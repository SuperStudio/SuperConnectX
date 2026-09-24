export type UpdateStatus =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'
  | 'check-error'

export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes?: string
  files?: Array<{ url: string; size: number }>
}

export interface ProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/** Maps transport and updater errors to display-safe messages. */
export function mapUpdateErrorToFriendlyMessage(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message || ''
  const lower = message.toLowerCase()

  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('econnreset')) {
    return 'Network connection failed, please check your network'
  }
  if (lower.includes('etimedout') || lower.includes('timeout')) {
    return 'Connection timed out, please try again later'
  }
  if (lower.includes('404') || lower.includes('not found')) return 'Update server not found (404)'
  if (lower.includes('403')) return 'Access denied, please check your permissions'
  if (lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return 'Update server error, please try again later'
  }
  if (lower.includes('sha512') || lower.includes('sha256') || lower.includes('checksum')) {
    return 'File verification failed, will re-download'
  }
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return 'SSL certificate error, please check system time or network proxy'
  }
  if (lower.includes('yaml') || lower.includes('parse')) return 'Failed to parse update information'
  if (lower.includes('enospc') || lower.includes('disk')) return 'Insufficient disk space'
  return 'Update failed, please try again later'
}
