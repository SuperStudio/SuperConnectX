import { ref } from 'vue'

export default class FormUtils {
  static buildTelnet() {
    return ref({})
  }

  static buildPresetCmd() {
    return ref({})
  }

  static buildGroups() {
    return {}
  }

  static buildGroupData() {
    return ref({
      name: '',
      connectionType: 'telnet',
      copyFromGroupId: null
    })
  }
}
