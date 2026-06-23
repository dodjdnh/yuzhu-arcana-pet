# Yuzhu Arcana Pet

`Yuzhu Arcana Pet` 是一个围绕 AstrBot 本地交互体验构建的桌宠项目。

当前仓库保留了三类关键实现：

- 桌宠前端与 Tauri 桌面壳
- AstrBot 到桌宠的本地 WebSocket 桥接
- 本地运行时准备脚本与阶段性工作报告

这个仓库是从本地工作区整理出的“关键代码发布版”，目标是便于协作、备份、审查和后续继续开发，而不是完整运行时镜像。

## Features

- 基于 `React + Vite + Tauri` 的桌宠客户端
- 基于精选立绘素材的状态表现与气泡渲染
- 支持 `idle`、`thinking`、`speaking`、`error` 以及扩展情绪状态
- AstrBot 侧通过本地 WebSocket 广播思考态、回复态和错误态
- 轻量文本规则驱动的回复情绪识别
- 本地 AstrBot 运行时支持外部配置与知识库覆盖

## Repository Layout

- `apps/desktop-pet`
  桌宠应用主体。包含前端渲染、状态机、待机行为、粒子效果、气泡与 Tauri 壳。

- `plugins/astrbot_plugin_desktop_pet_bridge`
  AstrBot 桥接插件。负责在本机启动 WebSocket server，并把 AstrBot 的处理状态广播给桌宠。

- `tools/prepare_local_runtime.ps1`
  本地 AstrBot 运行时准备脚本。用于把外部 `cmd_config`、`runtime_config`、`knowledge_base` 覆盖到运行时目录。

- `docs/reports`
  阶段性工作报告。目前保留了桥接阶段和 Phase 4B 表现增强阶段的报告。

## Tech Stack

- Frontend: `React 19`, `Vite`, `TypeScript`
- Desktop shell: `Tauri 2`
- Rendering: `PixiJS`
- Bridge plugin: `Python`

## Quick Start

### 1. Run the desktop pet frontend

```powershell
cd apps/desktop-pet
npm install
npm run tauri:dev
```

如只需调试前端渲染层，也可以执行：

```powershell
cd apps/desktop-pet
npm install
npm run dev
```

### 2. Build the desktop pet

```powershell
cd apps/desktop-pet
npm install
npm run build
```

### 3. Enable the AstrBot bridge plugin

把 `plugins/astrbot_plugin_desktop_pet_bridge` 放入 AstrBot 插件目录，并确保 Python 环境满足依赖：

```powershell
pip install websockets
```

默认监听：

- Host: `127.0.0.1`
- Port: `17321`

### 4. Prepare local AstrBot runtime

如果需要使用当前项目整理过的本地运行时准备逻辑，可执行：

```powershell
.\tools\prepare_local_runtime.ps1
```

这个脚本会把外部配置目录中的以下内容覆盖到运行时：

- `cmd_config.json`
- `runtime_config/*.json`
- `knowledge_base/`

## Bridge Event Protocol

桌宠主要消费以下桥接事件：

- `bot_thinking`
  AstrBot 已进入请求或推理阶段。

- `assistant_reply`
  AstrBot 生成最终回复，包含回复文本和情绪标签。

- `error`
  AstrBot 处理过程中出现错误。

插件当前支持的情绪标签包括：

- `neutral`
- `cold`
- `cold_soft`
- `gentle`
- `sleepy`
- `thinking`
- `embarrassed`
- `surprised`
- `error`

## Current Scope

当前仓库重点覆盖的是“桌宠表现层”和“AstrBot 到桌宠的桥接链路”，尤其包括：

- 桌宠状态机与气泡逻辑
- 多状态立绘接入与 manifest 管理
- 回复情绪到视觉状态的映射
- AstrBot 本地桥接与事件广播
- 本地运行时配置覆盖方案

## Reports

可直接参考以下阶段报告：

- `docs/reports/PHASE3_ASTRBOT_BRIDGE_FINAL_REPORT_2026-06-22.md`
- `docs/reports/PHASE4B_LATEST_WORK_REPORT_2026-06-22.md`

## Not Included

以下内容刻意未上传：

- 本地运行时数据库
- 知识库原始数据
- 构建产物
- 日志文件
- 机器缓存
- 本地敏感配置或凭据

## Notes

- 当前仓库是关键代码整理版，不保证开箱即用地还原完整本地环境。
- 若要完整复现实验环境，还需要你自己的 AstrBot 运行时、配置、知识库和素材管理约束。
- 若后续继续公开化整理，建议再补：
  - 完整安装说明
  - AstrBot 集成示例
  - 桌宠状态流转图
  - 配置文件样例
