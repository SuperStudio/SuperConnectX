const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(repoRoot, 'package.json')
const versionMdPath = path.join(repoRoot, 'version.md')
const latestMdPath = path.join(repoRoot, 'latest.md')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text.replace(/\r?\n/g, '\n'), 'utf8')
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    if (options.allowFailure) {
      return null
    }
    throw new Error((result.stderr || result.stdout || 'git command failed').trim())
  }

  return (result.stdout || '').trim()
}

function hasGitHistory() {
  const insideRepo = runGit(['rev-parse', '--is-inside-work-tree'], { allowFailure: true })
  if (insideRepo !== 'true') return false

  const count = runGit(['rev-list', '--count', 'HEAD'], { allowFailure: true })
  return !!count && Number(count) > 0
}

function formatDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseVersionSections(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const headingRegex = /^##\s+v(\d+\.\d+\.\d+)\s+\(([^)]+)\)\s*$/gm
  const headings = Array.from(normalized.matchAll(headingRegex))

  return headings.map((match, index) => {
    const start = match.index
    const end = index + 1 < headings.length ? headings[index + 1].index : normalized.length
    const rawBlock = normalized.slice(start, end).replace(/\n+\s*---\s*$/g, '').trim()
    const body = rawBlock.slice(match[0].length).trim()

    return {
      version: match[1],
      date: match[2],
      body,
      rawSection: rawBlock
    }
  })
}

function parseSemver(input) {
  const match = input.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    raw: input,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function getPreviousTag(currentVersion) {
  const rawTags = runGit(['tag', '--list', 'v*'], { allowFailure: true })
  if (!rawTags) return null

  const current = parseSemver(currentVersion)
  const tags = rawTags
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => ({ raw: tag, version: parseSemver(tag) }))
    .filter((item) => item.version)
    .sort((left, right) => compareSemver(right.version, left.version))

  if (!current) return tags[0]?.raw || null

  const previous = tags.find((item) => compareSemver(item.version, current) < 0)
  return previous?.raw || null
}

function cleanCommitMessage(message) {
  return message
    .replace(/^(feat|fix|refactor|perf|docs|style|test|build|ci|chore)(\([^)]+\))?:\s*/i, '')
    .replace(/^merge\s.+$/i, '')
    .replace(/^release\s+v?\d+\.\d+\.\d+$/i, '')
    .replace(/^bump\s+version.*$/i, '')
    .trim()
}

function normalizeReleaseItem(message) {
  const text = cleanCommitMessage(message)
  if (!text) return null
  return `**${text}**`
}

function categorizeCommit(message) {
  const lower = message.toLowerCase()

  const skipKeywords = ['merge branch', 'merge pull request', 'release ', 'bump version', 'chore:', 'docs:', 'test:', 'ci:', 'build:']
  if (skipKeywords.some((keyword) => lower.startsWith(keyword))) {
    return null
  }

  const fixKeywords = [
    'fix', 'bug', 'hotfix', 'repair', 'optimize', 'optimization', 'refactor',
    '修复', '优化', '调整', '兼容', '解决', '改进'
  ]

  const featureKeywords = [
    'feat', 'feature', 'add', 'support', 'introduce', 'implement',
    '新增', '添加', '支持', '增加', '实现'
  ]

  if (fixKeywords.some((keyword) => lower.includes(keyword))) {
    return 'fixes'
  }

  if (featureKeywords.some((keyword) => lower.includes(keyword))) {
    return 'features'
  }

  return 'features'
}

function collectCommits(previousTag) {
  const args = previousTag
    ? ['log', `${previousTag}..HEAD`, '--pretty=format:%s']
    : ['log', '--pretty=format:%s']

  const raw = runGit(args, { allowFailure: true }) || ''
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildReleaseNotesFromCommits(commits) {
  const features = []
  const fixes = []
  const seen = new Set()

  for (const commit of commits) {
    const category = categorizeCommit(commit)
    if (!category) continue

    const item = normalizeReleaseItem(commit)
    if (!item || seen.has(item)) continue
    seen.add(item)

    if (category === 'fixes') {
      fixes.push(item)
    } else {
      features.push(item)
    }
  }

  return { features, fixes }
}

function renderList(items, emptyText) {
  if (items.length === 0) {
    return [`1. ${emptyText}`]
  }

  return items.map((item, index) => `${index + 1}. ${item}`)
}

function renderVersionSection(version, date, notes) {
  return [
    `## v${version} (${date})`,
    '',
    '### 新增功能',
    ...renderList(notes.features, '本版本暂无新增功能记录'),
    '',
    '### 优化修复',
    ...renderList(notes.fixes, '本版本暂无优化修复记录')
  ].join('\n')
}

function renderLatestContent(notes) {
  return [
    '### 新增功能',
    ...renderList(notes.features, '本版本暂无新增功能记录'),
    '',
    '### 优化修复',
    ...renderList(notes.fixes, '本版本暂无优化修复记录')
  ].join('\n')
}

function updateVersionHistory(version, date, sectionText) {
  const existing = fs.existsSync(versionMdPath) ? fs.readFileSync(versionMdPath, 'utf8').replace(/\r\n/g, '\n') : '# SuperConnectX 版本历史\n'
  const header = existing.startsWith('#') ? existing.split(/\n+/).slice(0, 1)[0] : '# SuperConnectX 版本历史'
  const sections = parseVersionSections(existing).filter((item) => item.version !== version)

  const renderedSections = [sectionText]
  for (const section of sections) {
    renderedSections.push(section.rawSection)
  }

  const output = `${header}\n\n${renderedSections.join('\n\n---\n\n')}\n`
  writeText(versionMdPath, output)
}

function syncLatestFromVersion(version) {
  const existing = fs.existsSync(versionMdPath) ? fs.readFileSync(versionMdPath, 'utf8') : ''
  const section = parseVersionSections(existing).find((item) => item.version === version)
  if (!section) {
    throw new Error(`未找到 v${version} 的版本记录，且当前仓库没有可用 git 历史`)
  }

  writeText(latestMdPath, section.body.trim() + '\n')
  return section.body.trim()
}

function main() {
  const pkg = readJson(packageJsonPath)
  const currentVersion = pkg.version
  const today = formatDate()

  if (!hasGitHistory()) {
    const latestContent = syncLatestFromVersion(currentVersion)
    console.log(`[release-notes] 当前仓库没有 git 提交历史，已根据 version.md 中的 v${currentVersion} 段落同步 latest.md`)
    console.log(latestContent)
    return
  }

  const previousTag = getPreviousTag(currentVersion)
  const commits = collectCommits(previousTag)

  if (commits.length === 0) {
    const latestContent = syncLatestFromVersion(currentVersion)
    console.log(`[release-notes] 未找到可用于生成的提交记录，已根据 version.md 中的 v${currentVersion} 段落同步 latest.md`)
    console.log(latestContent)
    return
  }

  const notes = buildReleaseNotesFromCommits(commits)
  const versionSection = renderVersionSection(currentVersion, today, notes)
  const latestContent = renderLatestContent(notes)

  updateVersionHistory(currentVersion, today, versionSection)
  writeText(latestMdPath, latestContent + '\n')

  console.log(`[release-notes] 已生成 v${currentVersion} 的 release notes`)
  console.log(previousTag ? `[release-notes] 对比范围: ${previousTag}..HEAD` : '[release-notes] 对比范围: 初始提交..HEAD')
}

main()
