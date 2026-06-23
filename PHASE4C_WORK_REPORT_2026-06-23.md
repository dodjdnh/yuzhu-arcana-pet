## Phase 4C 工作报告

### 1. 本轮边界确认
- 是否未改 AstrBot bridge 主链路：是
- 是否未改 emotion router：是
- 是否未重做状态机：是
- 是否未加入 Live2D/TTS/音频/物理/远程桥接：是
- 是否未导入全量素材：是

### 2. 修改文件列表
- `apps/desktop-pet/src/App.tsx`
- `apps/desktop-pet/src/App.css`
- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src/pet/ParticleLayer.tsx`
- `apps/desktop-pet/src/pet/SpeechBubble.tsx`
- `apps/desktop-pet/src/pet/petConfig.ts`
- `apps/desktop-pet/src/pet/localSettings.ts`：新增
- `apps/desktop-pet/src-tauri/capabilities/default.json`
- `tools/run_tauri_dev_phase4c.ps1`：新增
- `PHASE4C_RUNTIME_VERIFICATION_REPORT_2026-06-23.md`

### 3. Debug 默认隐藏
说明：
- debug 默认是否隐藏：是
- 通过什么方式打开/关闭：通过右键菜单“显示 debug / 隐藏 debug”打开或关闭
- 是否保留原有调试按钮：是，原有调试按钮逻辑未删除

### 4. 右键菜单
说明右键菜单是否包含：
- 显示/隐藏 debug：包含
- 重置位置：包含
- 缩放 80%：包含
- 缩放 100%：包含
- 缩放 120%：包含
- 粒子开/关：包含
- 退出：包含

并说明：
- 是否影响左键点击：否
- 是否影响拖拽：否
- 是否影响透明窗口：否
- 退出是否正常：是，已补齐 Tauri `allow-close` 权限并实测可关闭进程

### 5. 本地设置持久化
说明设置保存在哪里，例如 localStorage / Tauri store / 文件。

- 保存位置：`localStorage`
- 键名：`desktop-pet:local-settings:v1`

必须列出是否保存：
- debug 是否显示：是
- 缩放比例：是
- 粒子是否启用：是
- 窗口位置：是

并说明：
- 启动时是否恢复：是
- 设置损坏时是否 fallback 默认值：是，`JSON.parse` 或字段校验失败时回退默认值，不崩溃

### 6. 默认窗口体验
说明：
- 默认位置是否右下角：是
- 是否保留 20~40px 边距：是，当前配置为右侧 `28px`、底部 `30px`
- 默认角色高度是否约屏幕 35%：是，`screenHeightRatio = 0.35`
- 重置位置是否可用：是
- 如果有上次位置，是否优先恢复：是

### 7. 缩放实现
说明：
- 80% / 100% / 120% 是否可用：是
- 缩放影响哪些内容：角色、气泡、粒子、窗口整体观感
- 是否持久化：是
- 是否破坏 manifest scale / anchor：否，仍在现有 manifest scale / anchor 逻辑之上叠加

### 8. 粒子开关
说明：
- 粒子开关是否可用：是
- 关闭后 hover / magic / soft_idle 是否停止生成粒子：是
- 是否不影响状态切换和气泡：是

### 9. 回归测试
逐项说明是否正常：
- idle：正常
- speaking：正常
- thinking：正常
- magic：正常
- soft_idle：正常
- shy：正常
- attention：正常
- annoyed：正常
- click：正常
- hover：正常
- drag：正常
- WebSocket 连接状态：正常
- AstrBot 回复事件触发气泡和情绪状态：正常，已在当前实例上通过真实 live chat 请求现场验证

### 10. 验证命令结果
贴结果：
- `cd apps/desktop-pet`：已执行
- `npm run build`：通过
- `npm run tauri:dev`：通过

补充：
- 本机 Rust/Cargo 实际已存在
- 运行 `tauri:dev` 时需要保证 `C:\Users\Kevin\.cargo\bin` 在 PATH 中
- 为此新增了 `tools/run_tauri_dev_phase4c.ps1` 作为稳定启动脚本

### 11. 已知问题 / 未做事项
- 本轮没有新增功能性未完成项，Phase 4C 目标已完成
- 运行态验证依赖本机已安装 Rust/Cargo 且 PATH 可用；若直接在缺 PATH 的 shell 中运行，属于环境启动方式问题，不是代码逻辑错误
- 当前仍使用前端自绘右键菜单，不是原生系统菜单；但已满足本轮需求
