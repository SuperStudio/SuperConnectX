<template>
  <div class="syntax-page">
    <div class="syntax-page-body">
      <!-- 左侧规则组列表 -->
      <div class="syntax-left-panel">
        <div class="left-panel-header">
          <span class="left-panel-title">{{ t('syntaxSettings.ruleGroups') }}</span>
          <el-button class="btn-primary" size="small" style="width: auto !important" @click="addGroup">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
        <div class="left-panel-list">
          <div v-if="!groups || groups.length === 0" class="empty-hint">
            {{ t('syntaxSettings.noRuleGroups') }}
          </div>
          <div
            v-for="group in groups"
            :key="group.id"
            class="group-list-item"
            :class="{ active: activeGroupId === group.id }"
            @click="selectGroup(group)"
            @contextmenu.prevent="showGroupContextMenu($event, group)"
          >
            <span class="group-list-name">{{ group.name }}</span>
            <span class="group-list-count">{{ group.subRules?.length || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧规则表格 -->
      <div class="syntax-right-panel">
        <template v-if="activeGroup">
          <div class="right-panel-header">
            <span class="right-panel-title">{{ activeGroup.name }}</span>
            <div class="right-panel-actions">
              <el-button class="btn-primary" size="small" style="width: auto !important" @click="addRule">{{ t('syntaxSettings.addRule') }}</el-button>
            </div>
          </div>

          <div class="rules-table-wrapper">
            <table v-if="activeGroup.subRules && activeGroup.subRules.length > 0" class="rules-table">
              <thead>
                <tr>
                  <th class="col-del"></th>
                  <th class="col-type">{{ t('syntaxSettings.matchType') }}</th>
                  <th class="col-style">{{ t('syntaxSettings.fontStyle') }}</th>
                  <th class="col-pattern">{{ t('syntaxSettings.expression') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(rule, idx) in activeGroup.subRules" :key="rule.id">
                  <td class="col-del">
                    <el-button size="small" type="danger" text @click="deleteRule(idx)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </td>
                  <td class="col-type">
                    <el-select v-model="rule.matchType" size="small" style="width: 100px" @change="onPatternChanged">
                      <el-option :label="t('syntaxSettings.regex')" value="regex" />
                      <el-option :label="t('syntaxSettings.keyword')" value="keyword" />
                    </el-select>
                  </td>
                  <td class="col-style">
                    <div class="style-edit-cell">
                      <el-tooltip :content="t('syntaxSettings.foreground')" placement="top">
                        <span class="color-picker-wrap"><el-color-picker v-model="rule.foreground" size="small" :predefine="predefineColors" @change="onStyleChanged" /></span>
                      </el-tooltip>
                      <el-tooltip :content="t('syntaxSettings.background')" placement="top">
                        <span class="color-picker-wrap"><el-color-picker v-model="rule.background" size="small" class="bg-color-picker" :predefine="predefineColors" @change="onStyleChanged" /></span>
                      </el-tooltip>
                      <el-tooltip :content="t('syntaxSettings.bold')" placement="top">
                        <span class="style-toggle" :class="{ active: rule.bold }" @click="rule.bold = !rule.bold; onStyleChanged()">B</span>
                      </el-tooltip>
                      <el-tooltip :content="t('syntaxSettings.italic')" placement="top">
                        <span class="style-toggle" :class="{ active: rule.italic }" @click="rule.italic = !rule.italic; onStyleChanged()">I</span>
                      </el-tooltip>
                      <el-tooltip :content="t('syntaxSettings.underline')" placement="top">
                        <span class="style-toggle" :class="{ active: rule.underline }" @click="rule.underline = !rule.underline; onStyleChanged()">U</span>
                      </el-tooltip>
                    </div>
                  </td>
                  <td class="col-pattern">
                    <el-input
                      v-model="rule.pattern"
                      size="small"
                      :placeholder="t('syntaxSettings.patternPlaceholder')"
                      @input="onPatternChanged"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty-hint">
              {{ t('syntaxSettings.noRules') }}
            </div>
          </div>

          <!-- 预览区域 -->
          <div class="preview-section" :class="{ 'preview-focused': previewFocused }">
            <div class="preview-header">
              <span class="preview-title">{{ t('syntaxSettings.preview') }}</span>
              <el-button
                class="btn-primary apply-preview-btn"
                :disabled="!previewPending"
                size="small"
                @click="applyPreviewNow"
              >
                {{ t('syntaxSettings.applyPreview') }}
              </el-button>
            </div>
            <div ref="previewEditorContainer" class="preview-editor"></div>
          </div>
        </template>
        <div v-else class="empty-hint" style="flex:1; display:flex; align-items:center; justify-content:center;">
          {{ t('syntaxSettings.selectGroupHint') }}
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuLeft + 'px', top: contextMenuTop + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <div class="menu-item" @click="handleContextMenuEdit">
        {{ t('common.edit') }}
      </div>
      <div class="menu-item danger" @click="handleContextMenuDelete">
        {{ t('common.delete') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import * as monaco from 'monaco-editor'
import { Plus, Delete } from '@element-plus/icons-vue'

const { t } = useI18n()

interface SyntaxSubRuleLocal {
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

interface SyntaxRuleGroupLocal {
  id: number
  name: string
  enabled: boolean
  subRules: SyntaxSubRuleLocal[]
  previewText?: string
}

const groups = ref<SyntaxRuleGroupLocal[]>([])
const activeGroupId = ref<number | null>(null)
const activeGroup = ref<SyntaxRuleGroupLocal | null>(null)
let nextRuleId = 100
let nextGroupId = 100
let saveTimer: ReturnType<typeof setTimeout> | null = null

// 预览 Monaco Editor
const previewEditorContainer = ref<HTMLElement | null>(null)
const previewFocused = ref(false)
let previewEditor: monaco.editor.IStandaloneCodeEditor | null = null
let previewModel: monaco.editor.ITextModel | null = null
let previewStyleEl: HTMLStyleElement | null = null
let previewDecorationIds: string[] = []
let previewApplyTimer: ReturnType<typeof setTimeout> | null = null
const regexCache = new Map<string, RegExp | null>()
const syntaxClassMap = new Map<string, string>()

// 颜色选择器预定义常用颜色
const predefineColors = [
  // 黑白灰
  '#ffffff', '#f0f0f0', '#dcdcdc', '#c0c0c0', '#a9a9a9', '#808080', '#696969', '#404040', '#2d2d2d', '#1a1a1a', '#000000',
  // 红色系
  '#ff0000', '#ff4500', '#dc143c', '#cd5c5c', '#b22222', '#8b0000', '#800000',
  // 橙色系
  '#ffa500', '#ff8c00', '#ff7f50', '#f4a460',
  // 黄色系
  '#ffff00', '#ffd700', '#f0e68c', '#daa520',
  // 绿色系
  '#00ff00', '#32cd32', '#00fa9a', '#90ee90', '#3cb371', '#2e8b57', '#228b22', '#006400',
  // 青色系
  '#00ffff', '#00ced1', '#20b2aa', '#008b8b',
  // 蓝色系
  '#0000ff', '#1e90ff', '#4169e1', '#6495ed', '#4682b4', '#00008b',
  // 紫色系
  '#800080', '#8b008b', '#9400d3', '#c71585', '#ff1493', '#db7093', '#ba55d3',
  // 棕色系
  '#8b4513', '#a0522d', '#d2691e', '#cd853f',
  // 补充
  '#ff6347', '#7fffd4', '#ff69b4', '#adff2f', '#00bfff',
]

const loadGroups = async () => {
  try {
    const data = await window.storageApi.getSyntaxRuleGroups()
    console.log('[SyntaxHighlightPage] loadGroups:', { count: data?.length || 0 })
    window.logApi.info('[SyntaxHighlightPage] loadGroups', { count: data?.length || 0 }).catch(() => {})
    if (data && Array.isArray(data)) {
      groups.value = data
      const maxGroupId = data.reduce((max, g) => Math.max(max, g.id || 0), 0)
      nextGroupId = Math.max(100, maxGroupId + 1)
      let maxRuleId = 0
      data.forEach(g => {
        g.subRules?.forEach(r => { maxRuleId = Math.max(maxRuleId, r.id || 0) })
      })
      nextRuleId = Math.max(100, maxRuleId + 1)

      // 自动选中第一个组
      if (data.length > 0 && !activeGroupId.value) {
        selectGroup(data[0])
      }
    }
  } catch (e) {
    console.error('[SyntaxHighlightPage] loadGroups ERROR:', e)
    window.logApi.error('[SyntaxHighlightPage] loadGroups ERROR', { error: String(e) }).catch(() => {})
  }
}

const saveGroups = () => {
  // 防抖保存：深拷贝避免 Vue 响应式 Proxy 导致 electron-store 比较/序列化异常
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      const plainData = JSON.parse(JSON.stringify(groups.value))
      console.log('[SyntaxHighlightPage] saveGroups:', { count: plainData.length, groupIds: plainData.map((g: SyntaxRuleGroupLocal) => g.id) })
      window.logApi.info('[SyntaxHighlightPage] saveGroups', { count: plainData.length, groupIds: plainData.map((g: SyntaxRuleGroupLocal) => g.id) }).catch(() => {})
      await window.storageApi.saveSyntaxRuleGroups(plainData)
      window.dispatchEvent(new CustomEvent('syntax-rules-updated', { detail: plainData }))
    } catch (e) {
      console.error('[SyntaxHighlightPage] saveGroups ERROR:', e)
      window.logApi.error('[SyntaxHighlightPage] saveGroups ERROR', { error: String(e) }).catch(() => {})
    }
  }, 150)
}

const selectGroup = (group: SyntaxRuleGroupLocal) => {
  activeGroupId.value = group.id
  activeGroup.value = group
}

const addGroup = () => {
  const newGroup: SyntaxRuleGroupLocal = {
    id: nextGroupId++,
    name: `${t('syntaxSettings.newGroup')} ${groups.value.length + 1}`,
    enabled: true,
    subRules: [],
    previewText: ''
  }
  groups.value.push(newGroup)
  selectGroup(newGroup)
  saveGroups()
}

const renameGroup = async () => {
  if (!activeGroup.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      t('syntaxSettings.groupNamePlaceholder'),
      t('syntaxSettings.editGroup'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputValue: activeGroup.value.name
      }
    )
    if (value && value.trim()) {
      activeGroup.value.name = value.trim()
      saveGroups()
    }
  } catch {
    // cancelled
  }
}

const deleteGroup = async () => {
  if (!activeGroup.value) return
  try {
    await ElMessageBox.confirm(
      t('syntaxSettings.deleteGroupConfirm', { name: activeGroup.value.name }),
      t('syntaxSettings.deleteGroup'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        center: true
      }
    )
    const idx = groups.value.findIndex(g => g.id === activeGroup.value!.id)
    if (idx !== -1) {
      groups.value.splice(idx, 1)
      activeGroup.value = null
      activeGroupId.value = null
      if (groups.value.length > 0) {
        selectGroup(groups.value[0])
      }
      saveGroups()
    }
  } catch {
    // cancelled
  }
}

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

const showGroupContextMenu = (event: MouseEvent, group: SyntaxRuleGroupLocal) => {
  event.preventDefault()
  event.stopPropagation()
  selectGroup(group)

  const menuHeight = 72
  const screenHeight = window.innerHeight

  let left = event.clientX
  let top = event.clientY

  if (top + menuHeight > screenHeight) {
    top = screenHeight - menuHeight - 10
  }

  if (left + 120 > window.innerWidth) {
    left = window.innerWidth - 120 - 10
  }

  contextMenuLeft.value = left
  contextMenuTop.value = top
  contextMenuVisible.value = true
}

const closeContextMenuOnClickOutside = (event: MouseEvent) => {
  const contextMenu = document.querySelector('.context-menu')
  if (contextMenu && !contextMenu.contains(event.target as Node)) {
    contextMenuVisible.value = false
  }
}

const handleContextMenuEdit = () => {
  contextMenuVisible.value = false
  renameGroup()
}

const handleContextMenuDelete = () => {
  contextMenuVisible.value = false
  deleteGroup()
}

const addRule = () => {
  if (!activeGroup.value) return
  const newRule: SyntaxSubRuleLocal = {
    id: nextRuleId++,
    matchType: 'regex',
    pattern: '',
    caseSensitive: false,
    foreground: '#FF4444',
    background: '',
    bold: false,
    italic: false,
    underline: false
  }
  activeGroup.value.subRules.push(newRule)
  saveGroups()
  previewPending.value = true
}

const deleteRule = (idx: number) => {
  if (!activeGroup.value) return
  activeGroup.value.subRules.splice(idx, 1)
  saveGroups()
  schedulePreviewApply()
}

// 预览是否有待应用的更改
const previewPending = ref(false)

// 表达式/文本变化：标记待更新，需手动点击"立即预览"
const onPatternChanged = () => {
  saveGroups()
  previewPending.value = true
}

// 颜色/字体样式变化：立即应用预览
const onStyleChanged = () => {
  saveGroups()
  schedulePreviewApply()
}

// 手动点击"立即预览"按钮
const applyPreviewNow = () => {
  previewPending.value = false
  applyPreviewSyntax()
}

// ---- 预览 Monaco Editor ----

const initPreviewEditor = () => {
  if (!previewEditorContainer.value) return

  previewModel = monaco.editor.createModel('', 'plaintext')
  previewEditor = monaco.editor.create(previewEditorContainer.value, {
    model: previewModel,
    readOnly: false,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: 'vs-dark',
    automaticLayout: true,
    hover: { enabled: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    codeLens: false,
    links: false,
    wordWrap: 'on',
    fontSize: 13,
    fontFamily: "'Fira Code', 'Consolas', monospace"
  })

  // 监听文本变化，同步到 activeGroup.previewText
  previewModel.onDidChangeContent(() => {
    if (!activeGroup.value || !previewModel) return
    activeGroup.value.previewText = previewModel.getValue()
    saveGroups()
    // 预览文本变化时也标记待更新
    previewPending.value = true
  })

  // 监听焦点变化
  previewEditor.onDidFocusEditorText(() => {
    previewFocused.value = true
  })
  previewEditor.onDidBlurEditorText(() => {
    previewFocused.value = false
  })
}

const schedulePreviewApply = () => {
  if (previewApplyTimer) clearTimeout(previewApplyTimer)
  previewApplyTimer = setTimeout(() => {
    previewApplyTimer = null
    applyPreviewSyntax()
  }, 150)
}

const applyPreviewSyntax = () => {
  if (!previewEditor || !previewModel || !activeGroup.value) return

  // 清除旧的装饰
  if (previewDecorationIds.length > 0) {
    previewDecorationIds = previewEditor.deltaDecorations(previewDecorationIds, [])
  }

  // 清除旧的样式元素
  if (previewStyleEl) {
    previewStyleEl.remove()
    previewStyleEl = null
  }
  regexCache.clear()
  syntaxClassMap.clear()

  const rules = activeGroup.value.subRules
  if (!rules || rules.length === 0) return

  const fullText = previewModel.getValue()
  if (!fullText) return

  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  let classIndex = 0

  for (const rule of rules) {
    if (!rule.pattern.trim()) continue

    const regex = buildRegexFromRule(rule)
    if (!regex) continue

    // 为每个唯一的样式组合生成 CSS class
    const styleKey = `${rule.foreground}|${rule.background}|${rule.bold}|${rule.italic}|${rule.underline}`
    let className = syntaxClassMap.get(styleKey)
    if (!className) {
      className = `syntax-preview-hl-${classIndex++}`
      syntaxClassMap.set(styleKey, className)
    }

    // 检测退化正则：模式以 '|' 结尾（右侧为空，会产生海量空匹配）
    if (rule.matchType === 'regex' && /\|$/.test(rule.pattern.trim())) {
      continue
    }

    // 全局匹配，仅用空匹配保护（正常正则是 O(n)，无需数量限制）
    let match: RegExpExecArray | null
    while ((match = regex.exec(fullText)) !== null) {
      // 空匹配保护：退化正则的每个位置都可能产生空匹配，跳过并前进
      if (match[0].length === 0) {
        regex.lastIndex++
        if (regex.lastIndex > fullText.length) break
        continue
      }

      const startPos = previewModel.getPositionAt(match.index)
      const endPos = previewModel.getPositionAt(match.index + match[0].length)
      decorations.push({
        range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        options: { inlineClassName: className }
      })
    }
  }

  // 注入 CSS 样式
  if (classIndex > 0) {
    let cssText = ''
    for (const [styleKey, className] of syntaxClassMap) {
      const [foreground, background, bold, italic, underline] = styleKey.split('|')
      const rules: string[] = []
      if (foreground) rules.push(`color: ${foreground} !important`)
      if (background) rules.push(`background-color: ${background} !important`)
      if (bold === 'true') rules.push('font-weight: bold !important')
      if (italic === 'true') rules.push('font-style: italic !important')
      if (underline === 'true') rules.push('text-decoration: underline !important')
      if (rules.length > 0) {
        cssText += `.${className} { ${rules.join('; ')} }\n`
      }
    }
    if (cssText) {
      previewStyleEl = document.createElement('style')
      previewStyleEl.textContent = cssText
      document.head.appendChild(previewStyleEl)
    }
  }

  // 应用装饰
  if (decorations.length > 0) {
    previewDecorationIds = previewEditor.deltaDecorations([], decorations)
  }
}

const buildRegexFromRule = (rule: SyntaxSubRuleLocal): RegExp | null => {
  const cacheKey = `${rule.matchType}|${rule.pattern}|${rule.caseSensitive}`
  const cached = regexCache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    let regex: RegExp | null = null
    if (rule.matchType === 'keyword') {
      const keywords = rule.pattern.split(',').map(k => k.trim()).filter(k => k)
      if (keywords.length === 0) { regexCache.set(cacheKey, null); return null }
      const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      regex = new RegExp(escaped.join('|'), `g${rule.caseSensitive ? '' : 'i'}`)
    } else {
      regex = new RegExp(rule.pattern, `g${rule.caseSensitive ? '' : 'i'}`)
    }
    regexCache.set(cacheKey, regex)
    return regex
  } catch {
    regexCache.set(cacheKey, null)
    return null
  }
}

const setPreviewText = (text: string) => {
  if (!previewModel) return
  // 避免循环触发 onDidChangeContent
  if (previewModel.getValue() === text) return
  previewModel.setValue(text)
}

// 当切换组时，更新预览文本并自动应用高亮
watch(activeGroup, (newGroup) => {
  if (!previewModel) return
  if (newGroup) {
    setPreviewText(newGroup.previewText || '')
    // 切换组时自动应用高亮（规则未变，只是换了组）
    previewPending.value = false
    schedulePreviewApply()
  } else {
    setPreviewText('')
    previewPending.value = false
  }
})

onMounted(async () => {
  await loadGroups()
  // 初始化预览编辑器
  await nextTick()
  initPreviewEditor()
  // 初始化后应用一次语法高亮
  if (activeGroup.value && previewModel) {
    setPreviewText(activeGroup.value.previewText || '')
    schedulePreviewApply()
  }
  document.addEventListener('click', closeContextMenuOnClickOutside)
  document.addEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
})

onUnmounted(() => {
  // 组件卸载时：应用预览 + 立即保存 pending 的数据
  if (previewPending.value) {
    applyPreviewSyntax()
    previewPending.value = false
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    const plainData = JSON.parse(JSON.stringify(groups.value))
    window.storageApi.saveSyntaxRuleGroups(plainData).catch(() => {})
    window.dispatchEvent(new CustomEvent('syntax-rules-updated', { detail: plainData }))
  }
  // 清理预览编辑器
  if (previewApplyTimer) clearTimeout(previewApplyTimer)
  if (previewStyleEl) { previewStyleEl.remove(); previewStyleEl = null }
  if (previewEditor) { previewEditor.dispose(); previewEditor = null }
  if (previewModel) { previewModel.dispose(); previewModel = null }
  regexCache.clear()
  syntaxClassMap.clear()
  document.removeEventListener('click', closeContextMenuOnClickOutside)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
})
</script>

<style scoped>
.syntax-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.syntax-page-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧面板 */
.syntax-left-panel {
  width: 200px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.left-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #3c3c3c;
}

.left-panel-title {
  color: #e0e0e0;
  font-size: 13px;
  font-weight: 600;
}

.left-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.group-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.group-list-item:hover {
  background: #2a2d2e;
}

.group-list-item.active {
  background: #094771;
}

.group-list-name {
  color: #e0e0e0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-list-count {
  color: #888;
  font-size: 11px;
  background: #3c3c3c;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.group-list-item.active .group-list-count {
  background: rgba(255,255,255,0.2);
  color: #fff;
}

/* 右侧面板 */
.syntax-right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #3c3c3c;
  background: #252526;
  flex-shrink: 0;
}

.right-panel-title {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 600;
}

.right-panel-actions {
  display: flex;
  gap: 8px;
}

.rules-table-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  min-height: 0;
}

.rules-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.rules-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.rules-table th {
  background: #2a2a2a;
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #3c3c3c;
}

.rules-table td {
  padding: 10px 10px;
  border-bottom: 1px solid #333;
  vertical-align: middle;
}

.rules-table tbody tr:hover {
  background: #2a2a2a;
}

.col-del {
  width: 40px;
  text-align: center;
}

.col-del :deep(.el-button--danger.is-text:hover),
.col-del :deep(.el-button--danger.is-text:focus) {
  background-color: #f56c6c;
  color: #fff;
}

.col-type {
  width: 110px;
}

.col-style {
  width: 180px;
}

.col-pattern {
  /* auto */
}

.style-edit-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-picker-wrap {
  display: inline-flex;
  line-height: 1;
}

.style-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 11px;
  font-weight: 700;
  color: #666;
  background: #333;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}

.style-toggle:hover {
  background: #444;
  color: #aaa;
}

.style-toggle.active {
  background: #2E5CC7;
  color: #fff;
}

.empty-hint {
  color: #808080;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

/* 预览区域 */
.preview-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 200px;
  margin: 16px 16px 16px 16px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: #1e1e1e;
}

.preview-section.preview-focused {
  border-color: #2E5CC7;
  box-shadow: 0 0 0 1px #2E5CC7;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.preview-title {
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.apply-preview-btn {
  width: auto !important;
  font-size: 11px;
  height: 24px;
  padding: 0 12px;
}

.apply-preview-btn.has-changes {
  border-color: #f0a020 !important;
  color: #f0a020 !important;
  background-color: transparent !important;
}

.apply-preview-btn.has-changes:hover {
  background: rgba(240, 160, 32, 0.15) !important;
  border-color: #f0a020 !important;
  color: #f0a020 !important;
}

.preview-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 滚动条 */
.syntax-left-panel .left-panel-list::-webkit-scrollbar,
.rules-table-wrapper::-webkit-scrollbar {
  width: 6px;
}

.syntax-left-panel .left-panel-list::-webkit-scrollbar-track,
.rules-table-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.syntax-left-panel .left-panel-list::-webkit-scrollbar-thumb,
.rules-table-wrapper::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 3px;
}

.syntax-left-panel .left-panel-list::-webkit-scrollbar-thumb:hover,
.rules-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 匹配类型下拉框：默认边框透明，悬浮/焦点时有边框 */
.col-type :deep(.el-select .el-select__wrapper) {
  min-height: 24px !important;
  height: 24px !important;
}

.col-type :deep(.el-select .el-select__wrapper:not(:hover):not(:focus-within)) {
  border-color: transparent !important;
  box-shadow: none !important;
}

.col-type :deep(.el-select .el-select__wrapper:hover),
.col-type :deep(.el-select.is-focused .el-select__wrapper) {
  border-color: var(--focus-border-color) !important;
  box-shadow: 0 0 0 1px var(--focus-border-color) inset !important;
}

/* Color picker size & border removal */
:deep(.el-color-picker) {
  --el-color-picker-size: 22px;
}

:deep(.el-color-picker__trigger) {
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  outline: none !important;
  border-radius: 3px !important;
  overflow: hidden !important;
}

:deep(.el-color-picker__trigger:hover),
:deep(.el-color-picker.is-focus .el-color-picker__trigger) {
  border: 2px solid var(--focus-border-color) !important;
  box-shadow: none !important;
}

:deep(.el-color-picker__color) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

:deep(.el-color-picker__color-inner) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

:deep(.el-color-picker__icon) {
  display: none !important;
}

/* 背景颜色选择器默认显示边框（避免与背景色融为一体） */
:deep(.bg-color-picker .el-color-picker__trigger) {
  border: 1px solid #555 !important;
}

:deep(.bg-color-picker .el-color-picker__trigger:hover),
:deep(.bg-color-picker.el-color-picker.is-focus .el-color-picker__trigger) {
  border: 2px solid var(--focus-border-color) !important;
}

/* 右键菜单定位（main.css 提供其余样式） */
.syntax-page > .context-menu {
  position: fixed;
  z-index: 9999;
}
</style>
