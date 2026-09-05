<template>
  <FeatureConnectionSidebar
    v-bind="props"
    @update:serial-port-expanded="emit('update:serialPortExpanded', $event)"
    @open-create-dialog="emit('openCreateDialog')"
    @search="emit('search', $event)"
    @load-serial-ports="emit('loadSerialPorts')"
    @connect-to-serial-port="emit('connectToSerialPort', $event)"
    @disconnect-serial-port="emit('disconnectSerialPort', $event)"
    @connect-to-server="emit('connectToServer', $event)"
    @edit-create-dialog="emit('editCreateDialog', $event)"
    @delete-connection="emit('deleteConnection', $event)"
    @sidebar-menu-command="emit('sidebarMenuCommand', $event)"
  />
</template>

<script setup lang="ts">
import FeatureConnectionSidebar from '../../features/connections/ConnectionSidebar.vue'

const props = defineProps<{
  showConnectionList: boolean
  sidebarWidth: number
  serialPorts: SerialPortInfo[]
  filteredSerialPorts: SerialPortInfo[]
  serialPortExpanded: boolean
  showPortType: boolean
  showSerialPortFriendlyName: boolean
  showSerialPortDetails: boolean
  connectionGroups: Record<string, any[]>
  connectionGroupExpanded: Record<string, boolean>
  serialRemarks: Record<string, string>
  connections: any[]
  isSerialPortConnected: (path: string) => boolean
}>()

const emit = defineEmits<{
  'update:serialPortExpanded': [value: boolean]
  openCreateDialog: []
  search: [keyword: string]
  loadSerialPorts: []
  connectToSerialPort: [port: SerialPortInfo]
  disconnectSerialPort: [path: string]
  connectToServer: [connection: any]
  editCreateDialog: [connection: any]
  deleteConnection: [connection: any]
  sidebarMenuCommand: [command: string]
}>()
</script>
