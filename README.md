# AstrBot Yuzhu Desktop Pet

这是 `AstrbotYuzhuDesktopPet` 本地工程的关键代码整理版仓库，重点保留桌宠端、AstrBot 桥接端，以及当前本地运行时准备脚本，方便代码备份、展示和后续继续开发。

## 仓库内容

- `apps/desktop-pet`
  - React + Vite 桌宠前端
  - Tauri 桌面壳
  - 气泡、状态机、粒子效果、待机行为
  - 角色 manifest 与当前使用的精选立绘素材
- `plugins/astrbot_plugin_desktop_pet_bridge`
  - AstrBot 到桌宠的本地 WebSocket 桥接
  - 回复情绪路由
  - 思考态、回复态、错误态事件广播
- `tools/prepare_local_runtime.ps1`
  - 本地 AstrBot 运行时准备脚本
  - 外部 `cmd_config`
  - 外部 `runtime_config`
  - 外部 `knowledge_base` 覆盖逻辑
- `docs/reports`
  - 阶段性工作报告
  - 当前包含 Phase 3 桥接报告和 Phase 4B 表现增强报告

## 当前实现重点

- 桌宠支持多种视觉状态和情绪映射
- AstrBot 回复可以通过桥接插件驱动桌宠表现
- 本地运行时配置与知识库可从外部目录覆盖
- 已整理为适合上传 GitHub 的关键代码子集

## 刻意未上传的内容

- 本地运行时数据库
- 知识库数据文件
- 日志文件
- 机器相关缓存
- 构建产物
- 本地敏感配置或凭据

## 说明

这个仓库不是完整工作目录镜像，而是面向协作和审查的“关键代码发布版”。  
如果后续需要，我可以继续把 README 补成更完整的项目说明，包括运行方式、目录说明和阶段进展。
