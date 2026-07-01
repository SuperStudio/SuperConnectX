

[中文](README.md) [English](README_EN.md) 


<h1 align="center">SuperConnectX</h1>

[![LICENSE](https://img.shields.io/badge/license-GPL%203.0-blue)](#)
[![Star](https://img.shields.io/github/stars/SuperStudio/SuperConnectX?label=Star%20this%20repo)](https://github.com/SuperStudio/SuperConnectX)
[![Fork](https://img.shields.io/github/forks/SuperStudio/SuperConnectX?label=Fork%20this%20repo)](https://github.com/SuperStudio/SuperConnectX/fork)


SuperConnectX 是**超级终端工具**，支持 com、telnet 等终端连接，完全**使用 vibe coding 开发**

下载地址：[点此下载](https://github.com/SuperStudio/SuperConnectX/releases)


![image-20260531221403478](Image/image-20260531221403478.png)


![star-history](https://api.star-history.com/svg?repos=SuperStudio/SuperConnectX&type=Date)

# 功能创新

1、串口等功能完全继承自 [SuperCom](https://github.com/SuperStudio/SuperCom)

2、支持 telnet 功能

# 如何开发？

## 环境配置

安装依赖

```bash
npm install
```

运行

```bash
npm run dev
```

## 参与开发

vscode 中下载插件 codebuddy，或者使用其他 agent 进行 vibe coding 即可

<img src="Image/image-20260531221642675.png" alt="image-20260531221642675" style="zoom: 80%;" />

# 版本发布

## 自动生成 releaseNotes

运行 `npm run release:notes`

说明：
- 脚本会优先基于 `git tag / git log` 总结当前版本与上个版本的差异
- 自动按“新增功能 / 优化修复”两部分生成内容
- 自动写入 `version.md`
- 同时覆盖写入 `latest.md`

## codecheck检查

运行 `npm run typecheck`

## 本地构建

运行 `build.bat` 即可

## 流水线构建

运行 `release.bat` 即可，github actions会自动启动，构建完成后自动生成最新 releases

<img src="Image/image-20260531222201852.png" alt="image-20260531222201852" style="zoom:80%;" />
