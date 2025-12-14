import { ref } from 'vue'

export default class FormUtils {
  static buildTelnet() {
    return ref({
      name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
      host: [
        { required: true, message: '请输入服务器地址', trigger: 'blur' },
        {
          pattern: /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-zA-Z0-9.-]+$/,
          message: '请输入有效的 IP 地址或域名',
          trigger: 'blur'
        }
      ],
      port: [
        { required: true, message: '请输入端口', trigger: 'blur' },
        { type: 'number', min: 1, max: 65535, message: '端口范围 1-65535', trigger: 'blur' }
      ]
    })
  }

  static buildPresetCmd() {
    return ref({
      name: [{ required: true, message: '请输入命令名称', trigger: 'blur' }],
      command: [{ required: true, message: '请输入命令内容', trigger: 'blur' }],
      delay: [
        { required: true, message: '请输入时延', trigger: 'blur' },
        { type: 'number', min: 0, message: '时延不能为负数', trigger: 'blur' }
      ]
    })
  }
}
