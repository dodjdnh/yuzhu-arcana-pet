# Desktop Pet Client

这是桌宠客户端子项目，使用 `Tauri + React + TypeScript + PixiJS` 构建。

## Capabilities

- 桌宠角色渲染
- 思考态、回复态、错误态气泡
- 基于状态机的视觉状态切换
- 与本地 AstrBot bridge 的 WebSocket 联动

## Requirements

- Node.js
- npm
- Rust / Tauri 构建环境

## Development

安装依赖：

```powershell
npm install
```

启动 Tauri 开发模式：

```powershell
npm run tauri:dev
```

如果只调试前端：

```powershell
npm run dev
```

## Build

构建前端：

```powershell
npm run build
```

构建桌面应用：

```powershell
npm run tauri:build
```

## Bridge Endpoint

默认连接的本地桥接地址：

- `ws://127.0.0.1:17321`

## Asset Notice

本仓库不提供角色素材。  
你需要自行准备本地素材，并运行根目录下的 `tools/import_alice_assets.ps1` 导入到：

- `public/assets/alice/skins/default_black/`

模板文件：

- `public/assets/alice/manifest.example.json`

本地运行文件：

- `public/assets/alice/manifest.json`

其中 `manifest.json` 为本地文件，不提交到公开仓库。
