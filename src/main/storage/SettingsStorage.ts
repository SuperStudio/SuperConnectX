import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import logger from '../ipc/IpcAppLogger'
import { getAppDataDir } from '../utils/AppDir'

const SAVE_DIR_NAME = 'userdata'

interface SyntaxSubRule {
  id: number
  matchType: 'regex' | 'keyword'
  pattern: string
  caseSensitive: boolean
  foreground: string
  background: string
  bold: boolean
  italic: boolean
  underline: boolean
}

interface SyntaxRuleGroup {
  id: number
  name: string
  subRules: SyntaxSubRule[]
  previewText?: string
}

interface Settings {
  // 基本设置
  minimizeToTray?: boolean
  logSplit?: boolean
  logSplitSize?: number
  autoScroll?: boolean
  autoScrollToast?: boolean
  autoScrollOnFocus?: boolean
  autoScrollAfterSend?: boolean
  autoScrollOnWheel?: boolean
  language?: string
  autoBackup?: boolean
  backupInterval?: number
  autoStart?: boolean
  preventSleep?: boolean
  maxDisplayText?: number
  // 串口设置
  supportedBaudRates?: number[]
  showPortType?: boolean
  // 日志
  enableLogStorage?: boolean
  logPath?: string
  logFileName?: string
  maxLogSize?: number
  logTimestamp?: boolean
  logHex?: boolean
  // 语法高亮
  enableSyntaxHighlight?: boolean
  syntaxRuleGroups?: SyntaxRuleGroup[]
  // 搜索
  searchCaseSensitive?: boolean
  searchRegex?: boolean
  searchWholeWord?: boolean
  themeMode?: 'dark' | 'light'
  themePluginId?: string
  // 命令历史
  commandHistoryMaxCount?: number
  showCommandHistory?: boolean
}

const defaultSettings: Settings = {
  // 基本设置
  minimizeToTray: false,
  logSplit: true,
  logSplitSize: 20,
  autoScroll: true,
  autoScrollToast: true,
  autoScrollOnFocus: true,
  autoScrollAfterSend: false,
  autoScrollOnWheel: true,
  language: 'zh-CN',
  autoBackup: true,
  backupInterval: 30,
  autoStart: false,
  preventSleep: false,
  maxDisplayText: 30,
  // 串口设置
  supportedBaudRates: [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000],
  showPortType: true,
  // 日志
  enableLogStorage: true,
  logPath: '',
  logFileName: '%C-%Y-%M-%D-%hh-%mm-%ss',
  maxLogSize: 50,
  logTimestamp: true,
  logHex: false,
  // 语法高亮
  enableSyntaxHighlight: true,
  syntaxRuleGroups: [
    {
      id: 1,
      name: '串口通信',
      previewText: '[2024-01-15 10:30:45.123] AT+CIMI\r\n460012345678901\r\n\r\nOK\r\n[2024-01-15 10:30:46.456] AT+CSQ\r\n+CSQ: 24,99\r\n\r\nOK\r\n[2024-01-15 10:30:47.789] AT+CREG?\r\n+CREG: 0,1\r\n\r\nOK\r\n[2024-01-15 10:30:48.012] AT+CIPSTART="TCP","192.168.1.1",8080\r\nCONNECT OK\r\n[2024-01-15 10:30:49.345] ERROR: AT command timeout',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: 'AT\\+[A-Z]+[?=]?', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(OK|CONNECT|READY)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(ERROR|BUSY|NO CARRIER|NO DIALTONE|NO ANSWER)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\+[A-Z]+:\\s*[0-9,]+', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 2,
      name: 'Linux 系统日志',
      previewText: '[2024-01-15 10:30:45.123] Jan 15 10:30:45 ubuntu kernel: [  12.345678] usb 1-1: new high-speed USB device\n[2024-01-15 10:30:46.456] Jan 15 10:30:46 ubuntu sshd[1234]: Accepted publickey for admin from 192.168.1.100 port 22\n[2024-01-15 10:30:47.789] Jan 15 10:30:47 ubuntu systemd[1]: Started Session 5 of user admin.\n[2024-01-15 10:30:48.012] Jan 15 10:30:48 ubuntu CRON[5678]: (root) CMD (cd / && run-parts --report /etc/cron.hourly)\n[2024-01-15 10:30:49.345] Jan 15 10:30:49 ubuntu kernel: [  15.901234] EXT4-fs (sda1): mounted filesystem',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(kernel|systemd|CRON|sshd|NetworkManager|docker|ufw)\\b', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(failed|error|Error|FAILED|ERROR|panic|PANIC|segfault|OOM)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(started|Started|stopped|Stopped|reloaded|enabled|active|running|ok|OK|success|Success|mounted)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\[\\s*\\d+\\.\\d+\\]', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 3,
      name: 'Telnet 调试',
      previewText: '[2024-01-15 10:30:45.123] Trying 192.168.1.1...\nConnected to 192.168.1.1.\nEscape character is \'^]\'.\n[2024-01-15 10:30:46.456] login: admin\nPassword:\n[2024-01-15 10:30:47.789] Last login: Thu Jan 15 10:25:00 2024 from 192.168.1.100\nadmin@router:~$ ping 8.8.8.8\n[2024-01-15 10:30:48.012] PING 8.8.8.8: 56 data bytes\n64 bytes from 8.8.8.8: seq=0 ttl=115 time=12.345 ms\n[2024-01-15 10:30:49.345] Connection closed by foreign host.',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Trying|Connected to|Escape character)\\b', caseSensitive: false, foreground: '#409EFF', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(login|Password|Last login)\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(closed by foreign host|Connection refused|timed out)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\w+@[^:]+:[~/].*\\$', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b\\d+\\.\\d+\\s*ms\\b', caseSensitive: false, foreground: '#B0C4DE', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 4,
      name: 'SSH 会话',
      previewText: '[2024-01-15 10:30:45.123] OpenSSH_8.9p1 Ubuntu-3, OpenSSL 3.0.2 15 Mar 2022\ndebug1: Reading configuration data /etc/ssh/ssh_config\n[2024-01-15 10:30:46.456] debug1: Connecting to 192.168.1.1 [192.168.1.1] port 22.\ndebug1: Connection established.\n[2024-01-15 10:30:47.789] debug1: Authenticating to 192.168.1.1:22 as \'admin\'\ndebug1: Authentication succeeded (publickey).\n[2024-01-15 10:30:48.012] Authenticated to 192.168.1.1 ([192.168.1.1]:22).\nLast login: Thu Jan 15 10:25:00 2024 from 192.168.1.100\n[2024-01-15 10:30:49.345] admin@ubuntu:~$ ls -la\ndrwxr-xr-x 2 admin admin 4096 Jan 15 10:30 .\ndrwxr-xr-x 5 root  root  4096 Jan 14 08:00 ..',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\bdebug\\d:', caseSensitive: false, foreground: '#909399', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Authenticated|Authentication succeeded|Connection established)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Permission denied|Authentication failed|Connection refused|host key mismatch|WARNING: REMOTE HOST IDENTIFICATION)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(OpenSSH|OpenSSL|ssh_config|sshd_config)\\b', caseSensitive: false, foreground: '#409EFF', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '^\\S+@\\S+:\\S*\\$\\s', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 5,
      name: '蓝牙 / BLE',
      previewText: '[2024-01-15 10:30:45.123] [BLE] Scanning started...\n[2024-01-15 10:30:46.456] [BLE] Device found: AA:BB:CC:DD:EE:FF RSSI:-45 Name:Sensor_01\n[2024-01-15 10:30:47.789] [BLE] Connecting to AA:BB:CC:DD:EE:FF...\n[2024-01-15 10:30:48.012] [BLE] Connected, discovering services...\nService UUID: 0000180a-0000-1000-8000-00805f9b34fb\nCharacteristic UUID: 00002a29-0000-1000-8000-00805f9b34fb\n[2024-01-15 10:30:49.345] [BLE] Disconnected: 0x08 (Connection Timeout)',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\[BLE\\]', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\bRSSI:-?\\d+\\b', caseSensitive: false, foreground: '#B0C4DE', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Connected|discovering|Subscribed|notified)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Disconnected|Timeout|Error|Failed)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 6,
      name: 'MQTT',
      previewText: '[2024-01-15 10:30:45.123] [MQTT] Client connecting to broker mqtt://192.168.1.1:1883\n[2024-01-15 10:30:46.456] [MQTT] CONNECT: clientId=esp32_001 cleanSession=true keepAlive=60\n[2024-01-15 10:30:47.789] [MQTT] CONNACK: sessionPresent=false returnCode=0\n[2024-01-15 10:30:48.012] [MQTT] SUBSCRIBE: topic=/devices/sensor/temperature QoS=1\n[2024-01-15 10:30:49.345] [MQTT] PUBLISH: topic=/devices/sensor/temperature payload={"temp":25.6,"unit":"C"} QoS=0 retain=false',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\[MQTT\\]', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(CONNECT|CONNACK|SUBSCRIBE|SUBACK|PUBLISH|PUBACK|PUBREC|PUBREL|PUBCOMP|UNSUBSCRIBE|UNSUBACK|PINGREQ|PINGRESP|DISCONNECT)\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\btopic[=:]\\s*/?[^\\s,]+', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\bQoS[=:]?\\s*\\d\\b', caseSensitive: false, foreground: '#B0C4DE', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\breturnCode[=:]?\\s*\\d+\\b', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(0x00|0x01|0x02|Accepted|Refused)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 7,
      name: 'HTTP 请求响应',
      previewText: '[2024-01-15 10:30:45.123] GET /api/v1/devices HTTP/1.1\nHost: 192.168.1.1:8080\nAuthorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\n[2024-01-15 10:30:46.456] HTTP/1.1 200 OK\nContent-Type: application/json\nContent-Length: 256\n[2024-01-15 10:30:47.789] POST /api/v1/command HTTP/1.1\nContent-Type: application/json\n[2024-01-15 10:30:48.012] HTTP/1.1 201 Created\nLocation: /api/v1/command/42\n[2024-01-15 10:30:49.345] HTTP/1.1 500 Internal Server Error',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\\b', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\bHTTP/\\d\\.\\d\\b', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(200|201|204|301|302|304|400|401|403|404|500|502|503)\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(OK|Created|Accepted|No Content|Moved|Found|Not Modified|Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error|Bad Gateway|Service Unavailable)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Content-Type|Content-Length|Authorization|Host|User-Agent|Accept|Cookie|Location)\\b', caseSensitive: false, foreground: '#909399', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 8,
      name: 'Modbus 协议',
      previewText: '[2024-01-15 10:30:45.123] [Modbus] RTU Request: 01 03 00 00 00 0A C5 CD\n  Slave: 1  Function: 03 (Read Holding Registers)\n  Start: 0x0000  Quantity: 10\n[2024-01-15 10:30:46.456] [Modbus] RTU Response: 01 03 14 00 64 00 C8 01 2C 01 90 01 F4 02 58 02 BC 03 20 03 84 03 E8 A1 B2\n  Slave: 1  ByteCount: 20\n  Reg[0]=100 Reg[1]=200 Reg[2]=300 Reg[3]=400 Reg[4]=500\n[2024-01-15 10:30:47.789] [Modbus] Exception: 01 83 02 C0 F1\n  Slave: 1  Function: 83  Exception: 02 (Illegal Data Address)\n[2024-01-15 10:30:48.012] [Modbus] TCP Request: 00 01 00 00 00 06 01 03 00 00 00 0A\n  Transaction: 1  Protocol: 0  Length: 6\n[2024-01-15 10:30:49.345] [Modbus] TCP Response: 00 01 00 00 00 17 01 03 14 ...',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\[Modbus\\]', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Request|Response|Exception)\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(01|02|03|04|05|06|0F|10|83|86|90)\\b', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Read Coils|Read Discrete Inputs|Read Holding Registers|Read Input Registers|Write Single Coil|Write Single Register|Write Multiple Coils|Write Multiple Registers)\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(Illegal Function|Illegal Data Address|Illegal Data Value|Slave Device Failure|Acknowledge|Slave Device Busy|Gateway Path Unavailable)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 9,
      name: 'CAN 总线',
      previewText: '[2024-01-15 10:30:45.123] can0  123   [8]  11 22 33 44 55 66 77 88\n[2024-01-15 10:30:46.456] can0  18FEF100   [4]  00 01 FF FE\n[2024-01-15 10:30:47.789] can0  7DF   [8]  02 01 0D 00 00 00 00 00\n[2024-01-15 10:30:48.012] can0  7E8   [8]  03 41 0D 00 00 00 00 00\n[2024-01-15 10:30:49.345] can0  18FECA00   [3]  ErrorFlags=0x04 TxErrorCount=0x00 RxErrorCount=0x60',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\bcan\\d+\\b', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b[0-9A-Fa-f]{1,8}\\s+\\[\\d+\\]', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b[0-9A-Fa-f]{2}(\\s[0-9A-Fa-f]{2})+\\b', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(ErrorFlags|TxErrorCount|RxErrorCount|BusOff|Warning|Passive)\\b', caseSensitive: false, foreground: '#FF4444', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(7DF|7E8|7E9|18DAF1|18FECA|18FEF1|18FF)\\w*\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false }
      ]
    },
    {
      id: 10,
      name: 'GPS / NMEA',
      previewText: '[2024-01-15 10:30:45.123] $GPGGA,103045.000,3110.1234,N,12122.5678,E,1,08,1.2,50.5,M,10.0,M,,*6A\n[2024-01-15 10:30:46.456] $GPRMC,103046.000,A,3110.1234,N,12122.5678,E,0.5,180.2,150124,,,A*5F\n[2024-01-15 10:30:47.789] $GPGSA,A,3,01,08,11,14,17,20,22,28,,,,,1.5,1.2,0.8*3A\n[2024-01-15 10:30:48.012] $GPGSV,3,1,10,01,45,120,42,08,30,080,38,11,60,200,45,14,20,300,35*7E\n[2024-01-15 10:30:49.345] $GPVTG,180.2,T,183.5,M,0.5,N,0.9,K,A*2C',
      subRules: [
        { matchType: 'regex', pattern: '\\[\\d\\d\\d\\d-\\d\\d-\\d\\d\\ \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d\\]', caseSensitive: false, foreground: '#808080', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\$GP\\w{3}', caseSensitive: false, foreground: '#409EFF', background: '', bold: true, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b\\d{4,6}\\.\\d{3,4}\\b', caseSensitive: false, foreground: '#E6A23C', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b[NSEW]\\b', caseSensitive: false, foreground: '#67C23A', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\*[0-9A-Fa-f]{2}$', caseSensitive: false, foreground: '#909399', background: '', bold: false, italic: false, underline: false },
        { matchType: 'regex', pattern: '\\b(A|V|D|E|M|N)\\b', caseSensitive: false, foreground: '#C0A0E0', background: '', bold: false, italic: false, underline: false }
      ]
    }
  ] as SyntaxRuleGroup[],
  // 搜索
  searchCaseSensitive: false,
  searchRegex: false,
  searchWholeWord: false,
  themeMode: 'dark',
  themePluginId: '',
  // 命令历史
  commandHistoryMaxCount: 10,
  showCommandHistory: true
}

export default class SettingsStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'settings'

  constructor() {
    const cwd = this.getAppUserDataPath()
    this.storageData = new Store<any>({
      name: this.STORAGE_NAME,
      cwd,
      defaults: defaultSettings
    })
    logger.debug(`SettingsStorage initialized at: ${cwd}`)
  }

  private getAppUserDataPath(): string {
    const userDataPath = path.join(getAppDataDir(), SAVE_DIR_NAME)
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    return userDataPath
  }

  getSettings(): Settings {
    return { ...defaultSettings, ...this.storageData.store }
  }

  saveSettings(settings: Settings): void {
    Object.keys(settings).forEach((key) => {
      this.storageData.set(key, (settings as any)[key])
    })
  }

  getDefaults(): Settings {
    return { ...defaultSettings }
  }
}
