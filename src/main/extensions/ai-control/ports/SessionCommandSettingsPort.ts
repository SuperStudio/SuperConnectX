export interface SessionCommandSettings {
  autoNewline: boolean
  hexMode: boolean
  crcEnabled: boolean
  crcMethod: string
}

export interface SessionCommandSettingsPort {
  getEffectiveSettings(sessionId: string): SessionCommandSettings
}
