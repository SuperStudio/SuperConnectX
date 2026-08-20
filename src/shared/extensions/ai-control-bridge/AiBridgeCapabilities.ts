export type AiBridgePermission = 'read-only' | 'full-control'
export type AiBridgeAccessLevel = 'read' | 'write'

export const AI_CORE_CONFIG_DOMAINS = [
  'settings',
  'com-settings'
] as const

export const AI_CORE_SETTINGS_FIELDS = [
  'aiBridgeEnabled',
  'aiBridgePermission',
  'logSplit',
  'logSplitSize',
  'autoScroll',
  'autoScrollToast',
  'autoScrollOnFocus',
  'autoScrollAfterSend',
  'autoScrollOnWheel',
  'maxDisplayText',
  'sendDisplayText',
  'recvDisplayText',
  'supportedBaudRates',
  'showPortType',
  'enableLogStorage',
  'logPath',
  'logFileName',
  'commandHistoryMaxCount',
  'showCommandHistory',
  'clearInputAfterSend'
] as const

export const AI_CORE_COM_SETTINGS_FIELDS = [
  'baudRate',
  'dataBits',
  'stopBits',
  'parity',
  'encoding',
  'readTimeout',
  'writeTimeout',
  'flowControl',
  'rts',
  'dtr',
  'hexDisplayMode',
  'showTimestamp',
  'autoNewline',
  'hexMode',
  'crcEnabled',
  'crcMethod'
] as const

/**
 * GUI 当前保存连接对话框公开的协议类型。
 * 系统串口属于实时枚举资源，必须通过 `start_port_session` 启动，不能写入保存档案。
 */
export const AI_GUI_SAVED_CONNECTION_TYPES = ['telnet', 'ftp'] as const

export interface AiBridgeCapability {
  id: string
  group: string
  label: string
  description: string
  labelKey: string
  descriptionKey: string
  read: boolean
  write: boolean
  methods: string[]
  implemented: boolean
}

/**
 * AI 交互桥梁能力注册表。
 *
 * 主进程用它执行协议权限校验，设置页用它展示能力范围，避免权限规则和用户说明
 * 分别维护后产生偏差。`read`、`write` 表示能力中是否包含对应类型的方法。
 */
export const AI_BRIDGE_CAPABILITIES: readonly AiBridgeCapability[] = [
  {
    id: 'bridge.access',
    group: 'bridge',
    label: 'Bridge status and permissions',
    description: 'Read the current bridge switch, permission level, and capability list.',
    labelKey: 'aiBridgeSettings.capabilities.bridgeAccess.label',
    descriptionKey: 'aiBridgeSettings.capabilities.bridgeAccess.description',
    read: true,
    write: false,
    methods: ['get_info', 'get_capabilities', 'client_hello'],
    implemented: true
  },
  {
    id: 'sessions.observe',
    group: 'sessions',
    label: 'Runtime sessions and terminal output',
    description:
      'Query current runtime sessions, including connection state and target, then read or subscribe to recent RX and TX events.',
    labelKey: 'aiBridgeSettings.capabilities.sessionsObserve.label',
    descriptionKey: 'aiBridgeSettings.capabilities.sessionsObserve.description',
    read: true,
    write: false,
    methods: ['list_sessions', 'read_events', 'read_buffer', 'subscribe', 'unsubscribe'],
    implemented: true
  },
  {
    id: 'sessions.attach',
    group: 'sessions',
    label: 'Attach and detach a session',
    description:
      'Attach to a session in this window and reuse its connection without opening another port.',
    labelKey: 'aiBridgeSettings.capabilities.sessionsAttach.label',
    descriptionKey: 'aiBridgeSettings.capabilities.sessionsAttach.description',
    read: true,
    write: true,
    methods: ['attach_session', 'detach_session'],
    implemented: true
  },
  {
    id: 'sessions.lifecycle',
    group: 'sessions',
    label: 'Connect and disconnect sessions',
    description:
      'Start a visible runtime session from a saved profile or a currently enumerated serial port, or stop an existing session.',
    labelKey: 'aiBridgeSettings.capabilities.sessionsLifecycle.label',
    descriptionKey: 'aiBridgeSettings.capabilities.sessionsLifecycle.description',
    read: false,
    write: true,
    methods: ['start_session', 'start_port_session', 'stop_session'],
    implemented: true
  },
  {
    id: 'serial.command',
    group: 'serial',
    label: 'Send terminal commands',
    description:
      'Apply current newline, HEX, and CRC settings, then record the transmission as AI SEND.',
    labelKey: 'aiBridgeSettings.capabilities.serialCommand.label',
    descriptionKey: 'aiBridgeSettings.capabilities.serialCommand.description',
    read: false,
    write: true,
    methods: ['send'],
    implemented: true
  },
  {
    id: 'serial.ports',
    group: 'serial',
    label: 'Available serial ports',
    description: 'List available serial ports without opening them.',
    labelKey: 'aiBridgeSettings.capabilities.serialPorts.label',
    descriptionKey: 'aiBridgeSettings.capabilities.serialPorts.description',
    read: true,
    write: false,
    methods: ['list_serial_ports'],
    implemented: true
  },
  {
    id: 'logs.read',
    group: 'serial',
    label: 'Bounded terminal log access',
    description: 'Read a limited tail or search a bounded byte range without loading the full log.',
    labelKey: 'aiBridgeSettings.capabilities.logsRead.label',
    descriptionKey: 'aiBridgeSettings.capabilities.logsRead.description',
    read: true,
    write: false,
    methods: ['read_log_tail', 'search_log'],
    implemented: true
  },
  {
    id: 'connections.manage',
    group: 'connections',
    label: 'Saved connection profiles',
    description:
      'Query saved profiles and maintain only GUI-exposed Telnet or FTP profiles; passwords are returned masked. Use start_port_session for live serial ports.',
    labelKey: 'aiBridgeSettings.capabilities.connectionsManage.label',
    descriptionKey: 'aiBridgeSettings.capabilities.connectionsManage.description',
    read: true,
    write: true,
    methods: ['list_connections', 'create_connection', 'update_connection', 'delete_connection'],
    implemented: true
  },
  {
    id: 'commands.manage',
    group: 'commands',
    label: 'Preset commands and groups',
    description: "Query or maintain groups and presets without changing the user's selected group.",
    labelKey: 'aiBridgeSettings.capabilities.commandsManage.label',
    descriptionKey: 'aiBridgeSettings.capabilities.commandsManage.description',
    read: true,
    write: true,
    methods: [
      'list_command_groups',
      'create_command_group',
      'update_command_group',
      'delete_command_group',
      'list_preset_commands',
      'create_preset_command',
      'update_preset_command',
      'delete_preset_command'
    ],
    implemented: true
  },
  {
    id: 'config.read',
    group: 'configuration',
    label: 'Read software configuration',
    description: 'Query exposed software and COM settings, current values, and revisions.',
    labelKey: 'aiBridgeSettings.capabilities.configRead.label',
    descriptionKey: 'aiBridgeSettings.capabilities.configRead.description',
    read: true,
    write: false,
    methods: ['describe_config', 'get_config'],
    implemented: true
  },
  {
    id: 'config.write',
    group: 'configuration',
    label: 'Change software configuration',
    description: 'Validate and update exposed software and COM settings, then refresh the UI.',
    labelKey: 'aiBridgeSettings.capabilities.configWrite.label',
    descriptionKey: 'aiBridgeSettings.capabilities.configWrite.description',
    read: false,
    write: true,
    methods: ['patch_config'],
    implemented: true
  }
]

const METHOD_ACCESS: Readonly<Record<string, AiBridgeAccessLevel>> = {
  get_info: 'read',
  get_capabilities: 'read',
  client_hello: 'read',
  list_sessions: 'read',
  attach_session: 'read',
  detach_session: 'read',
  start_session: 'write',
  start_port_session: 'write',
  stop_session: 'write',
  send: 'write',
  list_serial_ports: 'read',
  list_connections: 'read',
  create_connection: 'write',
  update_connection: 'write',
  delete_connection: 'write',
  list_command_groups: 'read',
  create_command_group: 'write',
  update_command_group: 'write',
  delete_command_group: 'write',
  list_preset_commands: 'read',
  create_preset_command: 'write',
  update_preset_command: 'write',
  delete_preset_command: 'write',
  read_events: 'read',
  read_buffer: 'read',
  read_log_tail: 'read',
  search_log: 'read',
  subscribe: 'read',
  unsubscribe: 'read',
  describe_config: 'read',
  get_config: 'read',
  patch_config: 'write'
}

export function getAiBridgeMethodAccess(
  method: string,
  params: Record<string, unknown> = {}
): AiBridgeAccessLevel | null {
  if (method === 'attach_session' && params.mode === 'write') return 'write'
  return METHOD_ACCESS[method] || null
}

export function getAiBridgeCapabilityState(
  enabled: boolean,
  permission: AiBridgePermission
): Array<
  AiBridgeCapability & { available: boolean; readAvailable: boolean; writeAvailable: boolean }
> {
  return AI_BRIDGE_CAPABILITIES.map((capability) => ({
    ...capability,
    methods: [...capability.methods],
    available: enabled && (capability.read || (permission === 'full-control' && capability.write)),
    readAvailable: enabled && capability.read,
    writeAvailable: enabled && permission === 'full-control' && capability.write
  }))
}
