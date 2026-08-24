export type AiPermission = 'read-only' | 'full-control'
export type AiCommandContentMode = 'none' | 'preview' | 'full'
export type AiOverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface AiCapabilityGroups {
  sessionRead: boolean
  serialWrite: boolean
  sessionManage: boolean
  connectionManage: boolean
  commandManage: boolean
  configManage: boolean
  auditRead: boolean
}

export interface AiSharedConfig {
  basePort: number
  capabilityGroups: AiCapabilityGroups
  allowAiCloseUserConnection: boolean
  activity: {
    overlayClickable: boolean
    overlayOpacity: number
    overlayPosition: AiOverlayPosition
    /** 1~15 秒；0 表示永久显示，直到用户关闭。 */
    overlayDuration: number
    logRoot: string
    logMaxSizeMb: number
    logMaxFiles: number
    commandContentMode: AiCommandContentMode
  }
}

export interface AiInstanceConfig {
  enabled: boolean
  alias: string
  portOverride: number | null
  token: string
}

export interface AiConfigDocument {
  version: 1
  revision: number
  shared: AiSharedConfig
  instances: Record<string, AiInstanceConfig>
}

export type AiConfigPatch = {
  expectedRevision: number
  shared?: Partial<Omit<AiSharedConfig, 'capabilityGroups' | 'activity'>> & {
    capabilityGroups?: Partial<AiCapabilityGroups>
    activity?: Partial<AiSharedConfig['activity']>
  }
  instance?: Partial<Omit<AiInstanceConfig, 'token'>>
}
