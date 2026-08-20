<template>
  <div class="settings-page">
    <!-- 设置内容区 -->
    <div class="settings-content">
      <!-- 左侧分类导航 -->
      <div class="settings-nav">
        <div
          v-for="category in categories"
          :key="category.key"
          class="nav-item"
          :class="{ active: activeCategory === category.key }"
          @click="activeCategory = category.key"
        >
          {{ category.label }}
        </div>
        <div class="nav-footer">
          <el-button class="btn-primary" size="small" @click="resetSettings">{{ t('settings.reset') }}</el-button>
        </div>
      </div>

      <!-- 右侧设置项 -->
      <div class="settings-panel">
        <div>
        <!-- 基本设置 -->
        <div v-if="activeCategory === 'basic'" class="settings-group">
          <!-- 基本配置 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.language') }}</span>
              </div>
              <el-select v-model="settings.language" size="small" style="width: 120px">
                <el-option :label="t('languages.zh-CN')" value="zh-CN" />
                <el-option :label="t('languages.en-US')" value="en-US" />
              </el-select>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.minimizeToTray') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.minimizeToTray" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.preventSleep') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.preventSleep" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.maxDisplayText') }}</span>
                <span class="label-desc">{{ t('basicSettings.maxDisplayTextDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.maxDisplayText"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.maxDisplayText }} MB</span>
              </div>
            </div>
          </div>

          <!-- 显示 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.display') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollToast') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollToast" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollOnFocus') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollOnFocus" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollAfterSend') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollAfterSend" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollOnWheel') }}</span>
                <span class="label-desc">{{ t('basicSettings.autoScrollOnWheelDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollOnWheel" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.clearInputAfterSend') }}</span>
                <span class="label-desc">{{ t('basicSettings.clearInputAfterSendDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.clearInputAfterSend" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.sendDisplayText') }}</span>
                <span class="label-desc">{{ t('basicSettings.sendDisplayTextDesc') }}</span>
              </div>
              <el-input
                v-model="settings.sendDisplayText"
                size="small"
                style="width: 200px"
                :placeholder="defaultSettings.sendDisplayText || 'SEND>>>>>>>>>>>>>'"
              />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.recvDisplayText') }}</span>
                <span class="label-desc">{{ t('basicSettings.recvDisplayTextDesc') }}</span>
              </div>
              <el-input
                v-model="settings.recvDisplayText"
                size="small"
                style="width: 200px"
                :placeholder="defaultSettings.recvDisplayText || ''"
              />
            </div>
          </div>
          </div>

          <!-- AI 交互桥梁 -->
          <div v-else-if="activeCategory === 'ai-bridge'" class="settings-group ai-bridge-group">
            <div class="group-section">
              <div class="group-title">{{ t('aiBridgeSettings.title') }}</div>
              <div
                class="ai-bridge-status-badge"
                :class="
                  !settings.aiBridgeEnabled
                    ? 'disabled'
                    : settings.aiBridgePermission === 'full-control'
                      ? 'full-control'
                      : 'read-only'
                "
              >
                <span class="ai-bridge-status-dot"></span>
                <strong>
                  {{
                    !settings.aiBridgeEnabled
                      ? t('aiBridgeSettings.disabledStatus')
                      : settings.aiBridgePermission === 'full-control'
                        ? t('aiBridgeSettings.enabledFullControlStatus')
                        : t('aiBridgeSettings.enabledReadOnlyStatus')
                  }}
                </strong>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.enabled') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.enabledDesc') }}</span>
                </div>
                <el-switch class="terminal-switch" v-model="settings.aiBridgeEnabled" />
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.permission') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.permissionDesc') }}</span>
                </div>
                <el-select v-model="settings.aiBridgePermission" size="small" style="width: 150px">
                  <el-option :label="t('aiBridgeSettings.readOnly')" value="read-only" />
                  <el-option :label="t('aiBridgeSettings.fullControl')" value="full-control" />
                </el-select>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.takeoverTitle') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.takeoverDesc') }}</span>
                </div>
                <div class="ai-takeover-actions">
                  <div class="ai-client-indicator" :class="aiClientIndicatorClass">
                    <span class="ai-client-indicator-dot"></span>
                    <span>{{ aiClientIndicatorText }}</span>
                  </div>
                  <el-button
                    type="primary"
                    size="small"
                    class="ai-takeover-button"
                    @click="takeoverDialogVisible = true"
                  >
                    {{ t('aiBridgeSettings.takeoverButton') }}
                  </el-button>
                </div>
              </div>
            </div>

            <div class="group-section">
              <div class="group-title">{{ t('aiBridgeSettings.capabilityTitle') }}</div>
              <p class="ai-bridge-doc-text">{{ t('aiBridgeSettings.capabilityDesc') }}</p>
              <div class="ai-bridge-capability-list">
                <div
                  v-for="capability in AI_BRIDGE_CAPABILITIES"
                  :key="capability.id"
                  class="ai-bridge-capability"
                >
                  <div class="ai-bridge-capability-header">
                    <span class="ai-bridge-capability-label">{{ t(capability.labelKey) }}</span>
                    <el-tag
                      size="small"
                      :type="capabilityStatus(capability) === 'available' ? 'success' : 'info'"
                      :class="{
                        'ai-bridge-capability-tag-clickable':
                          capabilityStatus(capability) === 'unavailable'
                      }"
                      @click="handleCapabilityClick(capability)"
                    >
                      {{
                        capabilityStatus(capability) === 'available'
                          ? t('aiBridgeSettings.available')
                          : capabilityStatus(capability) === 'read-only'
                            ? t('aiBridgeSettings.readOnlyAvailable')
                            : t('aiBridgeSettings.unavailable')
                      }}
                    </el-tag>
                  </div>
                  <div class="ai-bridge-capability-description">
                    {{ t(capability.descriptionKey) }}
                  </div>
                  <div class="ai-bridge-capability-methods">
                    {{ capability.methods.join(', ') }}
                  </div>
                </div>
              </div>
            </div>

            <div class="group-section">
              <div class="group-title">{{ t('aiBridgeSettings.feedbackTitle') }}</div>
              <p class="ai-bridge-doc-text">{{ t('aiBridgeSettings.feedbackDesc') }}</p>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.overlayClickable') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.overlayClickableDesc') }}</span>
                </div>
                <el-switch class="terminal-switch" v-model="settings.aiActivityOverlayClickable" />
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.overlayPosition') }}</span>
                </div>
                <el-select
                  v-model="settings.aiActivityOverlayPosition"
                  size="small"
                  style="width: 140px"
                >
                  <el-option :label="t('aiBridgeSettings.positionTopLeft')" value="top-left" />
                  <el-option :label="t('aiBridgeSettings.positionTopCenter')" value="top-center" />
                  <el-option :label="t('aiBridgeSettings.positionTopRight')" value="top-right" />
                  <el-option
                    :label="t('aiBridgeSettings.positionMiddleLeft')"
                    value="middle-left"
                  />
                  <el-option :label="t('aiBridgeSettings.positionCenter')" value="center" />
                  <el-option
                    :label="t('aiBridgeSettings.positionMiddleRight')"
                    value="middle-right"
                  />
                  <el-option
                    :label="t('aiBridgeSettings.positionBottomLeft')"
                    value="bottom-left"
                  />
                  <el-option
                    :label="t('aiBridgeSettings.positionBottomCenter')"
                    value="bottom-center"
                  />
                  <el-option
                    :label="t('aiBridgeSettings.positionBottomRight')"
                    value="bottom-right"
                  />
                </el-select>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.overlayOpacity') }}</span>
                </div>
                <div class="slider-control">
                  <el-slider
                    v-model="settings.aiActivityOverlayOpacity"
                    :min="30"
                    :max="100"
                    :step="5"
                    :show-tooltip="false"
                    class="ai-feedback-slider"
                  />
                  <span class="slider-value">{{ settings.aiActivityOverlayOpacity }}%</span>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.overlayDuration') }}</span>
                </div>
                <div
                  class="slider-control overlay-duration-control"
                  :class="{ 'is-permanent': isOverlayDurationPermanent }"
                >
                  <el-slider
                    v-model="overlayDurationSlider"
                    :min="1"
                    :max="16"
                    :step="1"
                    :marks="overlayDurationMarks"
                    :show-tooltip="false"
                    class="ai-feedback-slider overlay-duration-slider"
                  />
                  <span
                    class="slider-value overlay-duration-value"
                    :class="{ 'is-permanent': isOverlayDurationPermanent }"
                  >
                    {{
                      isOverlayDurationPermanent
                        ? t('aiBridgeSettings.permanent')
                        : `${settings.aiActivityOverlayDuration} ${t('aiBridgeSettings.seconds')}`
                    }}
                  </span>
                </div>
              </div>
            </div>

            <div class="group-section">
              <div class="group-title">{{ t('aiBridgeSettings.activityLogTitle') }}</div>
              <p class="ai-bridge-doc-text">{{ t('aiBridgeSettings.activityLogDesc') }}</p>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.activityLogPath') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.activityLogPathDesc') }}</span>
                </div>
                <div class="path-input-wrapper">
                  <el-input
                    v-model="settings.aiActivityLogPath"
                    size="small"
                    :placeholder="t('aiBridgeSettings.activityLogPathPlaceholder')"
                    class="path-input"
                  />
                  <el-button
                    size="small"
                    class="btn-primary path-btn"
                    @click="selectAiActivityLogRoot"
                  >
                    {{ t('aiBridgeSettings.activityLogSelectDir') }}
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.activityLogMaxSize') }}</span>
                  <span class="label-desc">{{ t('aiBridgeSettings.activityLogMaxSizeDesc') }}</span>
                </div>
                <div class="slider-control">
                  <el-slider
                    v-model="settings.aiActivityLogMaxSizeMb"
                    :min="1"
                    :max="100"
                    :step="1"
                    :show-tooltip="false"
                    class="ai-feedback-slider"
                  />
                  <span class="slider-value">{{ settings.aiActivityLogMaxSizeMb }} MiB</span>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-label">
                  <span class="label-text">{{ t('aiBridgeSettings.activityLogMaxFiles') }}</span>
                  <span class="label-desc">{{
                    t('aiBridgeSettings.activityLogMaxFilesDesc')
                  }}</span>
                </div>
                <div class="slider-control">
                  <el-slider
                    v-model="settings.aiActivityLogMaxFiles"
                    :min="1"
                    :max="10"
                    :step="1"
                    :show-tooltip="false"
                    class="ai-feedback-slider"
                  />
                  <span class="slider-value">{{
                    t('aiBridgeSettings.activityLogFilesValue', {
                      count: settings.aiActivityLogMaxFiles
                    })
                  }}</span>
                </div>
              </div>
            </div>

            <div class="group-section">
              <AiActivityHistory ref="aiActivityHistoryRef" />
            </div>

            <div class="group-section ai-bridge-doc-section">
              <div class="group-title">{{ t('aiBridgeSettings.docsTitle') }}</div>
              <h3 id="ai-bridge-overview">{{ t('aiBridgeSettings.docsOverviewTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsOverviewText') }}</p>
              <h3 id="ai-bridge-technology">{{ t('aiBridgeSettings.docsTechnologyTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsTechnologyText') }}</p>
              <h3 id="ai-bridge-platform">{{ t('aiBridgeSettings.docsPlatformTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsPlatformText') }}</p>
              <h3 id="ai-bridge-permission">{{ t('aiBridgeSettings.docsPermissionTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsPermissionText') }}</p>
              <h3 id="ai-bridge-operation">{{ t('aiBridgeSettings.docsOperationTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsOperationText') }}</p>
              <h3 id="ai-bridge-safety">{{ t('aiBridgeSettings.docsSafetyTitle') }}</h3>
              <p>{{ t('aiBridgeSettings.docsSafetyText') }}</p>
            </div>
        </div>

        <!-- 串口设置 -->
        <div v-else-if="activeCategory === 'serial'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('serialSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('serialSettings.supportedBaudRates') }}</span>
              </div>
              <div class="baudrate-tags">
                <el-tag
                  v-for="rate in settings.supportedBaudRates"
                  :key="rate"
                  closable
                  size="small"
                  effect="dark"
                  @close="removeBaudRate(rate)"
                  class="baudrate-tag"
                >
                  {{ rate }}
                </el-tag>
                <el-input
                  v-if="addingBaudRate"
                  ref="baudRateInputRef"
                  v-model="newBaudRate"
                  size="small"
                  style="width: 80px"
                  @keyup.enter="confirmAddBaudRate"
                  @blur="confirmAddBaudRate"
                />
                <el-button v-else size="small" text type="primary" @click="startAddBaudRate">+ {{ t('serialSettings.addNew') }}</el-button>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('serialSettings.showPortType') }}</span>
                <span class="label-desc">{{ t('serialSettings.showPortTypeDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.showPortType" />
            </div>
          </div>
        </div>

        <!-- 日志 -->
        <div v-else-if="activeCategory === 'log'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('logSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.enableLogStorage') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.enableLogStorage" />
            </div>
            <template v-if="settings.enableLogStorage">
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logSplitSize') }}</span>
                <span class="label-desc">{{ t('logSettings.logSplitSizeDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.logSplitSize"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.logSplitSize }} MB</span>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logPath') }}</span>
              </div>
              <div class="path-input-wrapper">
                <el-input v-model="settings.logPath" size="small" :placeholder="t('logSettings.logPathPlaceholder')" class="path-input" />
                <el-button size="small" @click="selectLogDir" class="btn-primary path-btn">{{ t('logSettings.selectDir') }}</el-button>
              </div>
            </div>
            <div class="setting-item filename-hint-item">
              <div class="filename-hint">
                <span class="hint-title">{{ t('logSettings.dirNameHint') }}</span>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logFileName') }}</span>
              </div>
              <el-input v-model="settings.logFileName" size="small" :placeholder="t('logSettings.logFileNamePlaceholder')" style="width: 280px" />
            </div>
            <div class="setting-item filename-hint-item">
              <div class="filename-hint">
                <span class="hint-title">{{ t('logSettings.fileNameHint') }}:</span>
                <div class="hint-grid">
                  <span class="hint-tag"><code>%C</code> {{ t('logSettings.hintC') }}</span>
                  <span class="hint-tag"><code>%R</code> {{ t('logSettings.hintR') }}</span>
                  <span class="hint-tag"><code>%Y</code> {{ t('logSettings.hintY') }}</span>
                  <span class="hint-tag"><code>%M</code> {{ t('logSettings.hintM') }}</span>
                  <span class="hint-tag"><code>%D</code> {{ t('logSettings.hintD') }}</span>
                  <span class="hint-tag"><code>%h</code> {{ t('logSettings.hintH') }}</span>
                  <span class="hint-tag"><code>%m</code> {{ t('logSettings.hintm') }}</span>
                  <span class="hint-tag"><code>%s</code> {{ t('logSettings.hints') }}</span>
                  <span class="hint-tag"><code>%f</code> {{ t('logSettings.hintf') }}</span>
                </div>
                <span class="hint-subtitle">{{ t('logSettings.fileNameHintPad') }}: <code>%MM</code> <code>%DD</code> <code>%hh</code> <code>%mm</code> <code>%ss</code> <code>%fff</code></span>
              </div>
            </div>
            </template>
          </div>
        </div>

        <!-- 语法高亮 -->
        <div v-else-if="activeCategory === 'syntax'" class="settings-group syntax-embed-group">
          <SyntaxHighlightPage />
        </div>

        <!-- 命令历史 -->
        <div v-else-if="activeCategory === 'history'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('historySettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('historySettings.showCommandHistory') }}</span>
                <span class="label-desc">{{ t('historySettings.showCommandHistoryDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.showCommandHistory" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('historySettings.commandHistoryMaxCount') }}</span>
                <span class="label-desc">{{ t('historySettings.commandHistoryMaxCountDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.commandHistoryMaxCount"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.commandHistoryMaxCount }} {{ t('historySettings.commandHistoryMaxCountUnit') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 备份与恢复 -->
        <div v-else-if="activeCategory === 'backup'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.backup') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.manualBackup') }}</span>
                <span class="label-desc">{{ t('basicSettings.manualBackupDesc') }}</span>
              </div>
              <el-button size="small" class="btn-primary" style="width: auto !important" @click="handleManualBackup">
                {{ t('basicSettings.manualBackup') }}
              </el-button>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoBackup') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoBackup" />
            </div>
            <div class="setting-item" v-if="settings.autoBackup">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.backupInterval') }}</span>
                <span class="label-desc">
                  <template v-if="nextBackupDate">
                    {{ t('basicSettings.nextBackupDate') }}：
                    <span class="next-backup-value" :class="{ today: nextBackupDate === todayStr }">
                      {{ nextBackupDate === todayStr ? t('basicSettings.nextBackupDateToday') : nextBackupDate }}
                    </span>
                  </template>
                </span>
              </div>
              <el-select v-model="settings.backupInterval" size="small" style="width: 100px" @change="refreshNextBackupDate">
                <el-option :label="`1 ${t('basicSettings.day')}`" :value="1" />
                <el-option :label="`3 ${t('basicSettings.day')}`" :value="3" />
                <el-option :label="`7 ${t('basicSettings.day')}`" :value="7" />
                <el-option :label="`15 ${t('basicSettings.day')}`" :value="15" />
                <el-option :label="`30 ${t('basicSettings.day')}`" :value="30" />
                <el-option :label="`60 ${t('basicSettings.day')}`" :value="60" />
                <el-option :label="`180 ${t('basicSettings.day')}`" :value="180" />
              </el-select>
            </div>
          </div>

          <!-- 恢复 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.restore') }}</div>
            <div class="setting-item restore-header-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.restoreList') }}</span>
                <span class="label-desc">{{ t('basicSettings.restoreListDesc') }}</span>
              </div>
              <el-button type="text" icon="Refresh" @click="refreshBackupList" size="small" class="icon-text-button">
                {{ t('common.refresh') }}
              </el-button>
            </div>
            <div v-if="backupList.length === 0" class="no-backups">
              {{ t('basicSettings.noBackups') }}
            </div>
            <div v-else class="backup-list">
              <div
                v-for="item in backupList"
                :key="item.date"
                class="backup-item"
                :class="{ selected: selectedBackup === item.date }"
                @click="selectedBackup = item.date"
              >
                <div class="backup-date">{{ item.date }}</div>
                <div class="backup-size">{{ formatSize(item.size) }}</div>
              </div>
            </div>
            <div v-if="backupList.length > 0" class="restore-action">
              <el-button
                size="small"
                :disabled="!selectedBackup"
                @click="handleRestoreBackup"
                class="btn-primary"
              >
                {{ t('basicSettings.restoreBtn') }}
              </el-button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="takeoverDialogVisible"
      :title="t('aiBridgeSettings.takeoverDialogTitle')"
      width="720px"
      class="ai-takeover-dialog"
      append-to-body
    >
      <el-alert
        :title="takeoverPermissionText"
        type="info"
        :closable="false"
        show-icon
        class="ai-takeover-alert"
      />
      <p class="ai-takeover-intro">{{ t('aiBridgeSettings.takeoverDialogIntro') }}</p>
      <div class="ai-takeover-prompt-panel">
        <div class="ai-takeover-prompt-header">
          <span>{{ t('aiBridgeSettings.takeoverPromptTitle') }}</span>
          <span>{{ t('aiBridgeSettings.takeoverPromptProtocol') }}</span>
        </div>
        <pre class="ai-takeover-prompt" tabindex="0">{{ takeoverPrompt }}</pre>
      </div>
      <template #footer>
        <div class="ai-takeover-footer">
          <el-button @click="takeoverDialogVisible = false">
            {{ t('settings.cancel') }}
          </el-button>
          <el-button type="primary" class="ai-takeover-copy-button" @click="copyTakeoverPrompt">
            {{
              settings.aiBridgeEnabled
                ? t('aiBridgeSettings.copyPrompt')
                : t('aiBridgeSettings.enableAndCopyPrompt')
            }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { setLocale } from '../locales'
import SyntaxHighlightPage from './SyntaxHighlightPage.vue'
import AiActivityHistory from '../extensions/ai-control-bridge/components/AiActivityHistory.vue'
import { AI_BRIDGE_CAPABILITIES } from '../../../shared/extensions/ai-control-bridge/AiBridgeCapabilities'
import type {
  AiBridgeClientStatus,
  AiBridgeEvent
} from '../../../shared/extensions/ai-control-bridge/AiBridgeEvents'

const { t } = useI18n()

const activeCategory = ref('basic')

// 标记：是否已通过事件切换到指定分类（避免 loadActiveCategory 覆盖）
let pendingCategorySwitch: string | null = null

// 加载上次选中的设置分类
const loadActiveCategory = async () => {
  try {
    const appSettings = await window.storageApi.getAppSettings()
    // 如果有 pending 切换，优先使用 pending 值
    if (pendingCategorySwitch) {
      activeCategory.value = pendingCategorySwitch
      pendingCategorySwitch = null
    } else if (appSettings?.settingsActiveCategory) {
      activeCategory.value = appSettings.settingsActiveCategory
    }
  } catch {
    // ignore
  }
}

// 保存选中的设置分类
const saveActiveCategory = async () => {
  try {
    const currentSettings = await window.storageApi.getAppSettings()
    await window.storageApi.saveAppSettings({
      ...currentSettings,
      settingsActiveCategory: activeCategory.value
    })
  } catch {
    // ignore
  }
}

const categories = computed(() => [
  { key: 'basic', label: t('settingsNav.basic') },
  { key: 'ai-bridge', label: t('settingsNav.aiBridge') },
  { key: 'serial', label: t('settingsNav.serial') },
  { key: 'log', label: t('settingsNav.log') },
  { key: 'syntax', label: t('settingsNav.syntax') },
  { key: 'history', label: t('settingsNav.history') },
  { key: 'backup', label: t('settingsNav.backup') }
])

// 默认配置从后端获取
const defaultSettings = ref<Record<string, any>>({})

const settings = ref<Record<string, any>>({})
let isLoading = true
let isApplyingBridgeUpdate = false
let removeBridgeEventListener: (() => void) | null = null
const aiActivityHistoryRef = ref<InstanceType<typeof AiActivityHistory> | null>(null)
const takeoverDialogVisible = ref(false)
const aiClientStatus = ref<AiBridgeClientStatus>({
  connected: false,
  clientCount: 0,
  clientNames: []
})

const aiClientIndicatorClass = computed(() => {
  if (!aiClientStatus.value.connected) return 'disconnected'
  return settings.value.aiBridgeEnabled ? 'connected' : 'suspended'
})

const aiClientIndicatorText = computed(() => {
  if (!aiClientStatus.value.connected) return t('aiBridgeSettings.clientDisconnected')
  if (!settings.value.aiBridgeEnabled) return t('aiBridgeSettings.clientSuspended')
  if (aiClientStatus.value.clientCount > 1) {
    return t('aiBridgeSettings.clientConnectedCount', { count: aiClientStatus.value.clientCount })
  }
  return t('aiBridgeSettings.clientConnected')
})

const takeoverPermissionText = computed(() =>
  settings.value.aiBridgePermission === 'full-control'
    ? t('aiBridgeSettings.takeoverPermissionFullControl')
    : t('aiBridgeSettings.takeoverPermissionReadOnly')
)

const takeoverPrompt = computed(() =>
  [
    t('aiBridgeSettings.takeoverPrompt'),
    t('aiBridgeSettings.takeoverPortSessionRule')
  ].join('\n\n')
)

const isOverlayDurationPermanent = computed(() => settings.value.aiActivityOverlayDuration === 0)

const overlayDurationSlider = computed<number>({
  get: () => {
    const duration = settings.value.aiActivityOverlayDuration
    if (typeof duration !== 'number' || !Number.isFinite(duration)) return 4
    if (duration <= 0) return 16
    return Math.min(15, Math.max(1, Math.round(duration)))
  },
  set: (value: number) => {
    settings.value.aiActivityOverlayDuration = value >= 16 ? 0 : value
  }
})

const overlayDurationMarks = { 15: '', 16: '' }

const copyTakeoverPrompt = async (): Promise<void> => {
  try {
    if (!settings.value.aiBridgeEnabled) {
      settings.value.aiBridgeEnabled = true
      await saveSettings()
    }
    const prompt = takeoverPrompt.value
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('AI bridge takeover prompt is empty')
    }
    await navigator.clipboard.writeText(prompt)
    ElMessage.success(t('aiBridgeSettings.promptCopied'))
  } catch (error) {
    console.error('Failed to copy AI bridge takeover prompt', error)
    ElMessage.error(t('aiBridgeSettings.promptCopyFailed'))
  }
}

type CapabilityStatus = 'available' | 'read-only' | 'unavailable'

const capabilityStatus = (
  capability: (typeof AI_BRIDGE_CAPABILITIES)[number]
): CapabilityStatus => {
  if (!settings.value.aiBridgeEnabled) return 'unavailable'
  if (settings.value.aiBridgePermission === 'full-control' || !capability.write) return 'available'
  return capability.read ? 'read-only' : 'unavailable'
}

const handleCapabilityClick = (capability: (typeof AI_BRIDGE_CAPABILITIES)[number]): void => {
  if (capabilityStatus(capability) !== 'unavailable') return

  if (settings.value.aiBridgeEnabled === true) {
    ElMessage.info(t('aiBridgeSettings.fullControlRequired'))
  } else {
    ElMessage.info(t('aiBridgeSettings.enableRequired'))
  }
}

const loadDefaultSettings = async () => {
  try {
    const data = await window.storageApi.getDefaultSettings()
    if (data && typeof data === 'object') {
      defaultSettings.value = data
    }
  } catch (error) {
    console.error(t('common.loadFailed'), error)
  }
}

const loadSettings = async () => {
  try {
    const data = await window.storageApi.getSettings()
    if (data && typeof data === 'object') {
      settings.value = { ...defaultSettings.value, ...data }
      isLoading = false
    }
  } catch (error) {
    console.error(t('common.loadFailed'), error)
  }
}

const saveSettings = async () => {
  try {
    const plainSettings = JSON.parse(JSON.stringify(settings.value))
    await window.storageApi.saveSettings(plainSettings)
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: plainSettings }))
    // 通知主进程设置更新（用于防止屏幕息屏功能）
    window.toolApi?.notifySettingsUpdate(plainSettings)
  } catch (error) {
    console.error(t('common.saveFailed'), error)
  }
}

// 监听设置变化，自动保存
watch(settings, () => {
  if (!isLoading && !isApplyingBridgeUpdate) {
    saveSettings()
  }
}, { deep: true })

// 监听语言设置变化，实时切换界面语言
watch(() => settings.value.language, (newLocale) => {
  if (newLocale && (newLocale === 'zh-CN' || newLocale === 'en-US')) {
    setLocale(newLocale)
  }
})

const resetSettings = async () => {
  try {
    await ElMessageBox.confirm(t('settings.resetConfirm'), t('settings.reset'), {
      confirmButtonText: t('settings.confirm'),
      cancelButtonText: t('settings.cancel'),
      type: 'warning',
      center: true,
      cancelButtonClass: 'el-button--danger'
    })
    settings.value = JSON.parse(JSON.stringify(defaultSettings.value))
    ElMessage.success(t('settings.resetSuccess'))
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(t('common.operationFailed'), error)
    }
  }
}

// 波特率管理
const addingBaudRate = ref(false)
const newBaudRate = ref('')
const baudRateInputRef = ref()

const removeBaudRate = (rate: number) => {
  const rates = settings.value.supportedBaudRates
  if (rates.length > 1) {
    settings.value.supportedBaudRates = rates.filter(r => r !== rate)
  } else {
    ElMessage.warning(t('serialSettings.atLeastOneRate'))
  }
}

const startAddBaudRate = () => {
  addingBaudRate.value = true
  nextTick(() => {
    baudRateInputRef.value?.focus()
  })
}

const confirmAddBaudRate = () => {
  const rate = parseInt(newBaudRate.value)
  if (isNaN(rate) || rate <= 0) {
    ElMessage.warning(t('serialSettings.invalidBaudRate'))
  } else if (settings.value.supportedBaudRates.includes(rate)) {
    ElMessage.warning(t('serialSettings.rateExists'))
  } else {
    settings.value.supportedBaudRates.push(rate)
    settings.value.supportedBaudRates.sort((a, b) => a - b)
  }
  addingBaudRate.value = false
  newBaudRate.value = ''
}

// 选择日志保存目录
const selectLogDir = async () => {
  try {
    const result = await window.dialogApi.openFileDialog({
      properties: ['openDirectory']
    })
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      settings.value.logPath = result.filePaths[0]
    }
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
}

// 选择 AI 审计日志根目录；主进程会在其下创建独立的 ai-activity 子目录。
const selectAiActivityLogRoot = async (): Promise<void> => {
  try {
    const result = await window.dialogApi.openFileDialog({
      properties: ['openDirectory']
    })
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      settings.value.aiActivityLogPath = result.filePaths[0]
    }
  } catch (error) {
    console.error('Failed to select AI activity log directory:', error)
  }
}

// 备份恢复相关
const backupList = ref<{ date: string; size: number }[]>([])
const selectedBackup = ref<string | null>(null)
const nextBackupDate = ref<string | null>(null)

// 今天日期字符串
const todayStr = (() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
})()

const refreshNextBackupDate = async () => {
  if (!settings.value.autoBackup) {
    nextBackupDate.value = null
    return
  }
  try {
    nextBackupDate.value = await window.storageApi.getNextBackupDate(settings.value.backupInterval)
  } catch (error) {
    console.error('Failed to get next backup date:', error)
  }
}

const refreshBackupList = async () => {
  try {
    backupList.value = await window.storageApi.getBackupList()
    selectedBackup.value = null
  } catch (error) {
    console.error('Failed to get backup list:', error)
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const handleRestoreBackup = async () => {
  if (!selectedBackup.value) return
  try {
    await ElMessageBox.confirm(
      t('basicSettings.restoreConfirm', { date: selectedBackup.value }),
      t('basicSettings.restoreBtn'),
      {
        confirmButtonText: t('settings.confirm'),
        cancelButtonText: t('settings.cancel'),
        type: 'warning',
        center: true,
        cancelButtonClass: 'el-button--danger'
      }
    )
    const result = await window.storageApi.restoreBackup(selectedBackup.value)
    if (result.success) {
      ElMessage.success(t('basicSettings.restoreSuccess', { date: selectedBackup.value }))
      selectedBackup.value = null
    } else {
      ElMessage.error(result.message || t('basicSettings.restoreFailed'))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('basicSettings.restoreFailed'))
    }
  }
}

// 立即备份：弹出备份数据类型提示，确认后执行备份
const handleManualBackup = async () => {
  try {
    await ElMessageBox.confirm(
      t('basicSettings.manualBackupTip'),
      t('basicSettings.manualBackupTitle'),
      {
        confirmButtonText: t('basicSettings.manualBackup'),
        cancelButtonText: t('settings.cancel'),
        type: 'info',
        center: true,
        customClass: 'backup-manual-dialog'
      }
    )
    const result = await window.storageApi.performBackup()
    if (result.success) {
      ElMessage.success(t('basicSettings.manualBackupSuccess'))
      await refreshBackupList()
    } else {
      ElMessage.error(result.message || t('basicSettings.manualBackupFailed'))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('basicSettings.manualBackupFailed'))
    }
  }
}

// 监听分类切换，进入备份页时自动刷新列表
watch(activeCategory, (newCat) => {
  if (newCat === 'backup') {
    refreshBackupList()
    refreshNextBackupDate()
  }
  saveActiveCategory()
})

// 监听 autoBackup 开关变化
watch(() => settings.value?.autoBackup, () => {
  refreshNextBackupDate()
})

onMounted(async () => {
  // 先注册事件监听，确保在 loadActiveCategory 完成前收到事件也能处理
  window.addEventListener('settings-updated', handleSettingsUpdated)
  window.addEventListener('open-syntax-highlight-page', switchToSyntaxCategory)
  window.addEventListener('open-ai-activity-history', handleOpenAiActivityHistory)
  removeBridgeEventListener = window.connectApi.onBridgeEvent(handleBridgeEvent)

  await loadDefaultSettings()
  await loadSettings()
  await loadActiveCategory()
  try {
    aiClientStatus.value = await window.aiBridgeApi.getClientStatus()
  } catch (error) {
    console.error('Failed to read AI bridge client status', error)
  }
})

onUnmounted(() => {
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  window.removeEventListener('open-syntax-highlight-page', switchToSyntaxCategory)
  window.removeEventListener('open-ai-activity-history', handleOpenAiActivityHistory)
  removeBridgeEventListener?.()
  removeBridgeEventListener = null
})

// 切换到语法高亮分类
const switchToSyntaxCategory = () => {
  activeCategory.value = 'syntax'
  pendingCategorySwitch = 'syntax'
  saveActiveCategory()
}

const handleOpenAiActivityHistory = () => {
  activeCategory.value = 'ai-bridge'
  pendingCategorySwitch = 'ai-bridge'
  void saveActiveCategory()
  nextTick(() => aiActivityHistoryRef.value?.focusHistory())
}

// 设置更新处理
const handleSettingsUpdated = (event: Event) => {
  const updatedSettings = (event as CustomEvent).detail
  if (updatedSettings && 'supportedBaudRates' in updatedSettings) {
    // 刷新波特率列表显示（使用 splice 保持响应性）
    settings.value.supportedBaudRates.splice(0, settings.value.supportedBaudRates.length, ...updatedSettings.supportedBaudRates)
  }
}

// AI 或其他 renderer 通过主进程修改设置后，当前页面立即应用权威变更。
const handleBridgeEvent = (event: AiBridgeEvent): void => {
  if (event?.eventType === 'ai.client.changed') {
    const { connected, clientCount, clientNames } = event.payload || {}
    if (typeof connected === 'boolean' && typeof clientCount === 'number') {
      aiClientStatus.value = {
        connected,
        clientCount,
        clientNames: Array.isArray(clientNames)
          ? clientNames.filter((name): name is string => typeof name === 'string')
          : []
      }
    }
    return
  }
  if (event?.eventType !== 'config.changed' || event.payload?.domain !== 'settings') return
  const changed = event.payload.changed
  if (!changed || typeof changed !== 'object' || Array.isArray(changed)) return

  isApplyingBridgeUpdate = true
  settings.value = { ...settings.value, ...(changed as Record<string, unknown>) }
  window.dispatchEvent(new CustomEvent('settings-updated', { detail: settings.value }))
  nextTick(() => {
    isApplyingBridgeUpdate = false
  })
}
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.settings-search {
  flex-shrink: 0;
  padding: 8px;
  background: transparent;
}

.search-inner {
  position: relative;
  width: 100%;
  height: 32px;
}

.search-input {
  width: 100%;
  height: 100%;
  padding: 0 28px 0 12px;
  border: 1px solid transparent;
  background-color: var(--bg-input);
  color: var(--search-input-color);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--focus-border-color);
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

.clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--search-clear);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.clear-btn:hover {
  color: var(--search-clear-hover);
}

.settings-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-nav {
  width: 140px;
  background: var(--settings-nav-bg);
  border-right: 1px solid var(--settings-nav-border);
  padding: 8px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.nav-item {
  padding: 8px 16px;
  color: var(--settings-nav-item-color);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.nav-item:hover {
  background: var(--settings-nav-item-hover);
}

.nav-item.active {
  background: var(--settings-nav-item-active-bg);
  color: var(--settings-nav-item-active-color);
}

.nav-footer {
  margin-top: auto;
  padding: 16px 8px;
  border-top: 1px solid var(--settings-nav-footer-border);
}



.settings-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-panel:has(.syntax-embed-group) {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-panel:has(.syntax-embed-group) > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-group {
  max-width: 700px;
}

.syntax-embed-group {
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.syntax-embed-group :deep(.syntax-page) {
  height: 100%;
  background: transparent;
}

.group-section {
  background: var(--settings-group-bg);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.group-section:last-child {
  margin-bottom: 0;
}

/* ---- 搜索结果 ---- */
.search-results {
  max-width: 700px;
}

.search-empty {
  color: var(--settings-search-empty);
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}

.search-result-section {
  background: var(--settings-search-section-bg);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.search-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--settings-search-section-header-border);
  font-size: 12px;
  color: var(--settings-search-section-header-color);
  cursor: pointer;
  transition: color 0.15s;
}

.search-section-header:hover {
  color: var(--settings-search-section-header-hover);
}

.search-category {
  color: var(--focus-border-color);
  font-weight: 600;
}

.search-section {
  color: var(--settings-search-section-header-hover);
  font-weight: 600;
}

.search-result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--settings-search-result-item-border);
  cursor: pointer;
  transition: background 0.15s;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--settings-search-result-item-hover);
  margin: 0 -12px;
  padding-left: 12px;
  padding-right: 12px;
  border-radius: 4px;
}

.search-label {
  color: var(--settings-search-label-color);
  font-size: 13px;
}

.search-label :deep(.search-highlight),
.search-desc :deep(.search-highlight) {
  background: var(--settings-highlight-bg);
  color: var(--settings-highlight-color);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

.search-desc {
  color: var(--settings-search-desc-color);
  font-size: 11px;
}

/* 左侧导航匹配计数 */
.nav-item .match-count {
  margin-left: auto;
  background: var(--focus-border-color);
  color: var(--settings-nav-match-color);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.nav-item.has-match {
  color: var(--focus-border-color);
}

.nav-item.has-match:hover {
  color: var(--settings-nav-match-hover);
}

.group-title {
  color: var(--settings-group-title-color);
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--settings-group-title-border);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--settings-item-border);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label-text {
  color: var(--settings-label-text);
  font-size: 13px;
}

.label-desc {
  color: var(--settings-label-desc);
  font-size: 11px;
}

.slider-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  width: 250px;
}

.ai-feedback-slider {
  flex: 0 0 180px;
  width: 180px;
}

.slider-value {
  color: var(--settings-slider-value);
  font-size: 12px;
  min-width: 50px;
  text-align: right;
}

.overlay-duration-control :deep(.el-slider__marks-text) {
  display: none;
}

.overlay-duration-control.is-permanent :deep(.el-slider__runway) {
  background: linear-gradient(90deg, rgba(227, 160, 79, 0.2), rgba(227, 160, 79, 0.48));
}

.overlay-duration-control.is-permanent :deep(.el-slider__bar) {
  background: linear-gradient(90deg, #c98232, #e3a04f);
}

.overlay-duration-control.is-permanent :deep(.el-slider__button) {
  border-color: #e3a04f;
  background: #fff4df;
}

.overlay-duration-value.is-permanent {
  color: #e3a04f;
  font-weight: 700;
}

.path-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-input {
  width: 240px;
}

.path-btn {
  flex-shrink: 0;
  width: auto !important;
}

.filename-hint-item {
  flex-direction: column;
  align-items: flex-start !important;
}

.filename-hint {
  width: 100%;
  padding: 8px 0 0 0;
}

.hint-title {
  color: var(--settings-label-desc);
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  display: block;
}

.hint-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 4px 0;
}

.hint-tag {
  color: var(--notify-meta);
  font-size: 11px;
  white-space: nowrap;
}

.hint-tag code {
  background: var(--settings-filename-code-bg);
  color: var(--settings-filename-code-color);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.hint-subtitle {
  color: var(--settings-label-desc);
  font-size: 11px;
  display: block;
  margin-top: 4px;
}

.hint-subtitle code {
  background: var(--settings-filename-code-bg);
  color: var(--settings-filename-code-color);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

/* Switch 样式与 TerminalControl 一致 */
:deep(.el-switch) {
  --el-switch-on-color: var(--settings-slider-bar);
  --el-switch-off-color: var(--terminal-control-switch-off);
}

/* Slider 样式与 Switch 一致 */
:deep(.el-slider__runway) {
  background-color: var(--terminal-control-switch-off);
}

:deep(.el-slider__bar) {
  background-color: var(--settings-slider-bar);
}

.baudrate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 300px;
  align-items: center;
}

.baudrate-tag {
  background: var(--settings-baudrate-tag-bg);
  border-color: var(--settings-baudrate-tag-border);
  color: var(--settings-baudrate-tag-color);
}

.baudrate-tag :deep(.el-tag__close) {
  color: var(--settings-baudrate-tag-color);
}

.baudrate-tag :deep(.el-tag__close:hover) {
  background-color: var(--settings-baudrate-tag-hover);
  color: var(--settings-baudrate-tag-color);
}

.baudrate-tag:hover {
  background: var(--settings-baudrate-tag-hover);
}

/* 滚动条美化 */
.settings-panel::-webkit-scrollbar {
  width: 10px;
}

.settings-panel::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

.settings-panel::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-light);
  border-radius: 5px;
}

.settings-panel::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-light-hover);
}

.settings-panel::-webkit-scrollbar-corner {
  background: var(--bg-primary);
}

/* 备份恢复样式 */
.restore-header-item {
  padding-bottom: 4px;
}

.no-backups {
  color: var(--settings-no-backups);
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}

.backup-list {
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--settings-backup-item-border);
  cursor: pointer;
  transition: background 0.15s;
}

.backup-item:last-child {
  border-bottom: none;
}

.backup-item:hover {
  background: var(--settings-backup-item-hover);
}

.backup-item.selected {
  background: var(--settings-backup-item-selected);
}

.backup-date {
  color: var(--settings-backup-date);
  font-size: 13px;
}

.backup-size {
  color: var(--settings-backup-size);
  font-size: 12px;
}

.restore-action {
  padding: 12px 0 0 0;
  border-top: 1px solid var(--settings-restore-border);
  margin-top: 8px;
}

.restore-action .el-button {
  width: 100%;
}

.backup-list::-webkit-scrollbar {
  width: 6px;
}

.backup-list::-webkit-scrollbar-track {
  background: var(--settings-group-bg);
}

.backup-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-light);
  border-radius: 3px;
}

.backup-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-light-hover);
}

.next-backup-value {
  color: var(--settings-next-backup-value);
  font-size: 13px;
  font-weight: 500;
}

.next-backup-value.today {
  color: var(--settings-next-backup-today);
}

.ai-bridge-status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  margin-bottom: 8px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
}

.ai-bridge-status-badge.read-only {
  background: rgba(119, 185, 139, 0.18);
  color: #72b486;
}

.ai-bridge-status-badge.disabled {
  background: rgba(128, 128, 128, 0.16);
  color: var(--settings-label-desc);
}

.ai-bridge-status-badge.full-control {
  background: rgba(227, 129, 83, 0.2);
  color: #e58a5b;
}

.ai-bridge-status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
}

.ai-takeover-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.ai-client-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, currentColor 9%, transparent);
  color: var(--settings-label-desc);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.ai-client-indicator-dot {
  display: block;
  width: 10px;
  height: 10px;
  min-width: 10px;
  min-height: 10px;
  flex: 0 0 10px;
  box-sizing: border-box;
  aspect-ratio: 1;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    0 0 0 3px color-mix(in srgb, currentColor 14%, transparent),
    0 1px 2px rgba(0, 0, 0, 0.28);
}

.ai-client-indicator.connected {
  color: #67b17b;
}

.ai-client-indicator.suspended {
  color: #d99a45;
}

.ai-takeover-button {
  min-width: 92px;
}

.ai-takeover-alert {
  margin-bottom: 12px;
}

.ai-takeover-intro {
  margin: 0 0 10px;
  color: var(--settings-label-desc);
  font-size: 12px;
  line-height: 1.6;
}

.ai-takeover-prompt-panel {
  overflow: hidden;
  border: 1px solid var(--settings-item-border);
  border-radius: 6px;
  background: var(--bg-input);
}

.ai-takeover-prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--settings-item-border);
  color: var(--settings-label-desc);
  font-size: 11px;
}

.ai-takeover-prompt-header span:first-child {
  color: var(--settings-label-text);
  font-size: 12px;
  font-weight: 600;
}

.ai-takeover-prompt {
  max-height: 330px;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  color: var(--settings-label-text);
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
  outline: none;
}

.ai-takeover-prompt:focus {
  box-shadow: inset 0 0 0 1px var(--focus-border-color);
}

.ai-takeover-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}

.ai-takeover-copy-button {
  min-width: 118px;
}

.ai-bridge-doc-text,
.ai-bridge-doc-section p {
  color: var(--settings-label-desc);
  font-size: 12px;
  line-height: 1.6;
}

.ai-bridge-capability-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-bridge-capability {
  padding: 8px 10px;
  border: 1px solid var(--settings-item-border);
  border-radius: 4px;
}

.ai-bridge-capability-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-bridge-capability-label {
  color: var(--settings-label-text);
  font-size: 13px;
  font-weight: 600;
}

.ai-bridge-capability-description,
.ai-bridge-capability-methods {
  color: var(--settings-label-desc);
  font-size: 11px;
  line-height: 1.5;
}

.ai-bridge-capability-tag-clickable {
  cursor: pointer;
}

.ai-bridge-capability-methods {
  margin-top: 3px;
  font-family: Consolas, monospace;
}

.ai-bridge-doc-section h3 {
  color: var(--settings-label-text);
  font-size: 13px;
  margin: 16px 0 6px;
}
</style>
