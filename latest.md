### 新增功能
（本次版本主要为优化修复，无新增功能）

### 优化修复
1. **Ctrl+C 复制修复** - 修复终端中 Ctrl+C 复制不生效的问题，无 `\0` 字符时回退到 Monaco 默认复制逻辑
2. **Linux 终端字体修复** - 终端字体链按平台适配，修复 Linux 下中西文宽度失调导致显示效果差的问题；新增 `getDefaultTerminalFont()` 方法，Windows/macOS/Linux 各自使用最优字体回退链
