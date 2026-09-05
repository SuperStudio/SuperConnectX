<template>
  <div class="tabs-content">
    <template v-for="tab in connectionTabs" :key="tab.id">
      <ComTerminal
        v-if="tab.connectionType === 'com'"
        v-show="activeTabId === tab.id.toString()"
        :connection="tab"
        :ref="(el: any) => { if (el) onComTerminalRef(tab.id, el) }"
        :auto-connect="true"
        @onClose="$emit('terminalClose', tab.id)"
        @commandSent="$emit('commandSent', $event)"
        @onConnect="() => $emit('comConnected', tab.comName)"
        @onDisconnect="() => $emit('comDisconnected', tab.comName)"
        @openCommandEditor="$emit('openCommandEditor', $event)"
        @openSyntaxHighlight="$emit('openSyntaxHighlight')"
        @remarkUpdated="(data: any) => $emit('remarkUpdated', data)"
        @fontLoaded="(font: string) => $emit('fontLoaded', font)"
        class="telnet-terminal"
      />
      <TelnetTerminal
        v-if="tab.connectionType === 'telnet' || tab.connectionType === 'ftp'"
        v-show="activeTabId === tab.id.toString()"
        :connection="tab"
        :ref="(el: any) => { if (el) onTelnetTerminalRef(tab.id, el) }"
        @onClose="$emit('terminalClose', tab.id)"
        @commandSent="$emit('commandSent', $event)"
        @openCommandEditor="$emit('openCommandEditor', $event)"
        @openSyntaxHighlight="$emit('openSyntaxHighlight')"
        @fontLoaded="(font: string) => $emit('fontLoaded', font)"
        class="telnet-terminal"
      />
      <CommandEditor
        v-if="tab.connectionType === 'commandEditor'"
        v-show="activeTabId === tab.id.toString()"
        :connection-type="tab.editorConnectionType"
        class="command-editor-terminal"
      />
      <ShortcutsPage
        v-if="tab.connectionType === 'shortcuts'"
        v-show="activeTabId === tab.id.toString()"
        class="shortcuts-terminal"
      />
      <SettingsPage
        v-if="tab.connectionType === 'settings'"
        v-show="activeTabId === tab.id.toString()"
        class="settings-terminal"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import ComTerminal from '../ComTerminal.vue'
import TelnetTerminal from '../TelnetTerminal.vue'
import CommandEditor from '../../features/commands/CommandEditor.vue'
import ShortcutsPage from '../ShortcutsPage.vue'
import SettingsPage from '../SettingsPage.vue'

defineProps<{
  connectionTabs: any[]
  activeTabId: string
  onComTerminalRef: (id: string, el: any) => void
  onTelnetTerminalRef: (id: string, el: any) => void
}>()

defineEmits<{
  terminalClose: [tabId: string | number]
  commandSent: [command: string]
  comConnected: [comName: string]
  comDisconnected: [comName: string]
  openCommandEditor: [connectionType: string]
  openSyntaxHighlight: []
  remarkUpdated: [data: any]
  fontLoaded: [font: string]
}>()
</script>

<style scoped>
.tabs-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.telnet-terminal {
  width: 100%;
  height: 100%;
}

.command-editor-terminal {
  width: 100%;
  height: 100%;
}
</style>
