/**
 * Connection navigation feature state: saved connections, serial ports, search,
 * grouping and sidebar preferences.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

export type SerialPortType = 'virtual' | 'usb' | 'bluetooth' | 'none'

export function useConnectionSidebar() {
  const { t } = useI18n()
  const connections = ref<any[]>([])
  const searchKeyword = ref('')
  const filterConnection = ref<any[]>([])
  const serialPorts = ref<SerialPortInfo[]>([])
  const showConnectionList = ref(true)
  const showBottomPanel = ref(true)
  const sidebarWidth = ref(320)
  const serialPortExpanded = ref(true)
  const showPortType = ref(true)
  const showSerialPortFriendlyName = ref(true)
  const showSerialPortDetails = ref(false)
  const connectionGroupExpanded = ref<Record<string, boolean>>({ telnet: true, ftp: true, ssh: true })

  const parseSerialPortType = (port: SerialPortInfo): SerialPortType => {
    const text = [port.path, port.friendlyName, port.manufacturer, port.pnpId].filter(Boolean).join(' ').toLowerCase()
    if (text.includes('virtual')) return 'virtual'
    if (text.includes('usb')) return 'usb'
    if (text.includes('蓝牙') || text.includes('ble') || text.includes('bluetooth low energy') || text.includes('bluetooth smart') || text.includes('bluetooth le')) return 'bluetooth'
    return 'none'
  }

  const filterList = (): void => {
    if (!searchKeyword.value) {
      filterConnection.value = connections.value
      return
    }
    const keyword = searchKeyword.value.toLowerCase()
    filterConnection.value = connections.value.filter(item =>
      item.name?.toLowerCase().includes(keyword) || item.connectionType?.toLowerCase().includes(keyword) || item.host?.toLowerCase().includes(keyword) || String(item.port).includes(keyword)
    )
  }
  const filteredSerialPorts = computed(() => {
    if (!searchKeyword.value) return serialPorts.value
    const keyword = searchKeyword.value.toLowerCase()
    return serialPorts.value.filter(port => [port.path, port.friendlyName, port.manufacturer, port.vendorId, port.productId, port.serialNumber, port.pnpId, port.locationId].some(value => value?.toLowerCase().includes(keyword)))
  })
  const connectionGroups = computed(() => {
    const groups: Record<string, any[]> = {}
    filterConnection.value.forEach(connection => {
      const type = connection.connectionType || 'other'
      ;(groups[type] ??= []).push(connection)
    })
    return groups
  })
  const handleSearch = (keyword: string): void => { searchKeyword.value = keyword }

  const loadConnections = async (): Promise<void> => {
    try {
      const savedConnections = await window.storageApi.getConnections()
      connections.value = Array.isArray(savedConnections) ? savedConnections : []
    } catch (error) {
      ElMessage.error(t('dialog.loadFailed'))
      console.error(t('dialog.loadFailed'), error)
      connections.value = []
    }
  }
  const applySerialPortTypes = (ports: SerialPortInfo[]): SerialPortInfo[] => ports.map(port => ({ ...port, type: parseSerialPortType(port) }))
  const loadSerialPorts = async (): Promise<void> => {
    try {
      serialPorts.value = applySerialPortTypes(await window.connectApi.listSerialPorts())
    } catch (error) {
      console.error(t('notification.scanPortsFailed'), error)
      serialPorts.value = []
    }
  }
  const handleSerialPortsChanged = (ports: SerialPortInfo[]): void => { serialPorts.value = applySerialPortTypes(ports) }

  const loadSidebarState = async (): Promise<void> => {
    try {
      const savedState = await window.storageApi.getAppSettings()
      if (savedState?.sidebar) {
        showConnectionList.value = savedState.sidebar.showConnectionList ?? true
        showBottomPanel.value = savedState.sidebar.showBottomPanel ?? true
        serialPortExpanded.value = savedState.sidebar.serialPortExpanded ?? true
        if (savedState.sidebar.sidebarWidth) sidebarWidth.value = savedState.sidebar.sidebarWidth
        connectionGroupExpanded.value = { ...connectionGroupExpanded.value, ...savedState.sidebar.connectionGroupExpanded }
      }
      const settings = await window.storageApi.getSettings()
      showPortType.value = settings.showPortType ?? true
      showSerialPortFriendlyName.value = settings.showSerialPortFriendlyName ?? true
      showSerialPortDetails.value = settings.showSerialPortDetails ?? false
    } catch (error) {
      console.error(t('common.loadFailed'), error)
    }
  }
  const saveSidebarState = async (): Promise<void> => {
    try {
      const currentSettings = await window.storageApi.getAppSettings()
      await window.storageApi.saveAppSettings({
        ...currentSettings,
        sidebar: {
          showConnectionList: Boolean(showConnectionList.value),
          showBottomPanel: Boolean(showBottomPanel.value),
          serialPortExpanded: Boolean(serialPortExpanded.value),
          sidebarWidth: Number(sidebarWidth.value),
          connectionGroupExpanded: JSON.parse(JSON.stringify(connectionGroupExpanded.value))
        }
      })
    } catch (error) {
      console.error(t('common.saveFailed'), error)
    }
  }
  const toggleConnectionList = (): void => { showConnectionList.value = !showConnectionList.value }
  const toggleBottomPanel = (): void => { showBottomPanel.value = !showBottomPanel.value }

  watch([showConnectionList, showBottomPanel, serialPortExpanded, connectionGroupExpanded, sidebarWidth], saveSidebarState, { deep: true })
  watch([connections, searchKeyword], filterList, { immediate: true, deep: true })

  return { connections, searchKeyword, filterConnection, serialPorts, showConnectionList, showBottomPanel, sidebarWidth, serialPortExpanded, showPortType, showSerialPortFriendlyName, showSerialPortDetails, connectionGroupExpanded, filteredSerialPorts, connectionGroups, handleSearch, loadConnections, loadSerialPorts, handleSerialPortsChanged, loadSidebarState, saveSidebarState, toggleConnectionList, toggleBottomPanel, parseSerialPortType }
}
