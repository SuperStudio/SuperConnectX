/**
 * useConnectionSidebar - 连接侧边栏逻辑
 * 管理：连接列表、串口列表、搜索、分组、侧边栏宽度/展开状态
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

export function useConnectionSidebar() {
  const { t } = useI18n()

  const connections = ref<any[]>([])
  const searchKeyword = ref('')
  const filterConnection = ref<any[]>([])
  const serialPorts = ref<SerialPortInfo[]>([])
  const showConnectionList = ref(true)
  const sidebarWidth = ref(320)
  const serialPortExpanded = ref(true)
  const showPortType = ref(true)

  const connectionGroupExpanded = ref<Record<string, boolean>>({
    telnet: true,
    ftp: true,
    ssh: true
  })

  // 串口类型解析
  const parseSerialPortType = (port: SerialPortInfo): 'virtual' | 'usb' | 'bluetooth' | 'none' => {
    const text = [port.path, port.friendlyName, port.manufacturer, port.pnpId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (text.includes('virtual')) return 'virtual'
    if (text.includes('usb')) return 'usb'
    if (text.includes('蓝牙') || text.includes('ble') ||
        text.includes('bluetooth low energy') || text.includes('bluetooth smart') ||
        text.includes('bluetooth le')) return 'bluetooth'
    return 'none'
  }

  // 搜索过滤
  const filtereList = () => {
    if (!searchKeyword.value) {
      filterConnection.value = connections.value
      return
    }
    const keyword = searchKeyword.value.toLowerCase()
    filterConnection.value = connections.value.filter(
      (item) =>
        item.name?.toLowerCase().includes(keyword) ||
        item.connectionType?.toLowerCase().includes(keyword) ||
        item.host?.toLowerCase().includes(keyword) ||
        String(item.port).includes(keyword)
    )
  }

  const filteredSerialPorts = computed(() => {
    if (!searchKeyword.value) return serialPorts.value
    const keyword = searchKeyword.value.toLowerCase()
    return serialPorts.value.filter((port) => port.path.toLowerCase().includes(keyword))
  })

  const connectionGroups = computed(() => {
    const groups: Record<string, any[]> = {}
    filterConnection.value.forEach((conn) => {
      const type = conn.connectionType || 'other'
      if (!groups[type]) groups[type] = []
      groups[type].push(conn)
    })
    return groups
  })

  const handleSearch = (keyword: string) => {
    searchKeyword.value = keyword
  }

  const loadConnections = async () => {
    try {
      const savedConn = await window.storageApi.getConnections()
      connections.value = Array.isArray(savedConn) ? savedConn : []
    } catch (e) {
      ElMessage.error(t('dialog.loadFailed'))
      console.error(t('dialog.loadFailed'), e)
      connections.value = []
    }
  }

  const loadSerialPorts = async () => {
    try {
      const ports = await window.connectApi.listSerialPorts()
      ports.forEach(port => {
        port.type = parseSerialPortType(port)
      })
      serialPorts.value = ports
    } catch (error) {
      console.error(t('notification.scanPortsFailed'), error)
      serialPorts.value = []
    }
  }

  // 串口热插拔：主进程轮询检测到列表变化时整体替换（变化频率低，直接全量替换即可）
  const handleSerialPortsChanged = (ports: SerialPortInfo[]): void => {
    ports.forEach((port) => {
      port.type = parseSerialPortType(port)
    })
    serialPorts.value = ports
  }

  // 侧边栏状态持久化
  const loadSidebarState = async () => {
    try {
      const savedState = await window.storageApi.getAppSettings()
      if (savedState?.sidebar) {
        showConnectionList.value = savedState.sidebar.showConnectionList ?? true
        serialPortExpanded.value = savedState.sidebar.serialPortExpanded ?? true
        if (savedState.sidebar.sidebarWidth) {
          sidebarWidth.value = savedState.sidebar.sidebarWidth
        }
        connectionGroupExpanded.value = {
          ...connectionGroupExpanded.value,
          ...savedState.sidebar.connectionGroupExpanded
        }
      }
      const settings = await window.storageApi.getSettings()
      showPortType.value = settings.showPortType ?? true
    } catch (error) {
      console.error(t('common.loadFailed'), error)
    }
  }

  const saveSidebarState = async () => {
    try {
      const currentSettings = await window.storageApi.getAppSettings()
      const newSettings = {
        ...currentSettings,
        sidebar: {
          showConnectionList: Boolean(showConnectionList.value),
          serialPortExpanded: Boolean(serialPortExpanded.value),
          sidebarWidth: Number(sidebarWidth.value),
          connectionGroupExpanded: JSON.parse(JSON.stringify(connectionGroupExpanded.value))
        }
      }
      await window.storageApi.saveAppSettings(newSettings)
    } catch (error) {
      console.error(t('common.saveFailed'), error)
    }
  }

  const toggleConnectionList = () => {
    showConnectionList.value = !showConnectionList.value
  }

  // 自动保存
  watch(
    [showConnectionList, serialPortExpanded, connectionGroupExpanded, sidebarWidth],
    () => { saveSidebarState() },
    { deep: true }
  )

  watch([() => connections.value, () => searchKeyword.value], () => filtereList(), {
    immediate: true,
    deep: true
  })

  return {
    connections,
    searchKeyword,
    filterConnection,
    serialPorts,
    showConnectionList,
    sidebarWidth,
    serialPortExpanded,
    showPortType,
    connectionGroupExpanded,
    filteredSerialPorts,
    connectionGroups,
    handleSearch,
    loadConnections,
    loadSerialPorts,
    handleSerialPortsChanged,
    loadSidebarState,
    saveSidebarState,
    toggleConnectionList,
    parseSerialPortType
  }
}
