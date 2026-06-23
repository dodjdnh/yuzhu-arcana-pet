# Phase 4C Runtime Verification Report

日期：2026-06-23

## 1. 本轮新增/修复

本轮除了继续完成 Phase 4C 的运行验收，还补了两个真实问题：

1. `window.close not allowed`
   - 原因：Tauri capability 缺少 `core:window:allow-close`
   - 修复文件：`apps/desktop-pet/src-tauri/capabilities/default.json`
   - 结果：右键菜单里的“退出”现在可以真实关闭 Tauri 进程

2. 离屏位置污染
   - 问题：异常窗口坐标可能被写入本地设置，导致后续恢复位置失真
   - 修复文件：`apps/desktop-pet/src/App.tsx`
   - 修复点：
     - 保存窗口位置时忽略异常坐标
     - 启动恢复位置时校验是否仍有足够可见区域
     - 坏位置自动 fallback 到右下角默认位

额外增加了一个便于重复启动验收的脚本：

- `tools/run_tauri_dev_phase4c.ps1`

## 2. 相关代码文件

- `apps/desktop-pet/src/App.tsx`
- `apps/desktop-pet/src/pet/localSettings.ts`
- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src/pet/ParticleLayer.tsx`
- `apps/desktop-pet/src/pet/SpeechBubble.tsx`
- `apps/desktop-pet/src/pet/petConfig.ts`
- `apps/desktop-pet/src-tauri/capabilities/default.json`
- `tools/run_tauri_dev_phase4c.ps1`

## 3. 构建与运行命令

已执行：

- `cd apps/desktop-pet`
- `npm run build`
- `npm run tauri:dev`

结果：

- `npm run build`：通过
- `npm run tauri:dev`：通过
- Rust/Cargo：本机已存在，但需要确保 `C:\Users\Kevin\.cargo\bin` 在运行环境 PATH 中

运行日志：

- `phase4c_tauri_dev_stdout_4.log`
- `phase4c_tauri_dev_stderr_4.log`
- `phase4c_tauri_dev_stdout_6.log`
- `phase4c_tauri_dev_stderr_6.log`
- `phase4c_tauri_dev_stdout_7.log`
- `phase4c_tauri_dev_stderr_7.log`

## 4. 已拿到的硬证据

### 4.1 普通启动默认隐藏 debug

通过 CDP 直接读取前端状态，确认：

- `debugPanelOpen: false`
- `debugVisible: false`

在最后一次重启后的当前快照里：

- `phase4c_current_startup_probe.json`

内容显示：

- `debugPanelOpen = false`
- `debugVisible = false`
- `scale = 1`
- `windowPosition = { x: 1388, y: 664 }`

### 4.2 右键菜单可用

通过前端 DOM 直接触发 `contextmenu`，确认菜单项目存在：

- 显示/隐藏 debug
- 重置位置
- 缩放 80%
- 缩放 100%
- 缩放 120%
- 粒子开/关
- 退出

### 4.3 debug 显示/隐藏可持久化

已验证两种方向：

- `false -> true`
- `true -> false`

并且在关闭后再次启动，仍恢复为：

- `debugPanelOpen = false`
- `debugVisible = false`

### 4.4 缩放 80 / 100 / 120 可切换且持久化

通过程序化菜单点击和前端状态读取确认：

- `scale = 0.8`
- `scale = 1`
- `scale = 1.2`

都能正确写入本地设置并反映到调试面板。

### 4.5 粒子开/关可切换

已验证：

- `particleEnabled: false -> true`
- `particleEnabled: true -> false`

同时验证：

- 粒子开启时，`click`/`drag` 后存在粒子节点
- 粒子关闭时，`hover` 后粒子节点数为 `0`
- 粒子开启时，重复 `hover` 触发后，粒子节点可实际出现

### 4.6 退出已真实关闭 Tauri 进程

这项最初失败，错误日志明确显示：

- `window.close not allowed`

补齐 capability 后再次验证：

- 右键菜单点击“退出”
- `Get-Process desktop_pet` 返回空

说明该动作已真实关闭 Tauri 应用。

### 4.7 WebSocket 链路存活

已确认：

- `127.0.0.1:17321` 正在监听
- 桌宠到 `17321` 的连接已建立
- 桥接服务对客户端 `ping` 能返回 `pong`

说明当前桥接服务不是假活着，而是能正常收发基本消息。

### 4.8 状态按钮与交互行为

通过 CDP/DOM 直接触发，已确认以下行为可运行：

- `idle`
- `thinking`
- `speaking`
- `soft_idle`
- `shy`
- `attention`
- `magic`
- `annoyed`
- `click`
- `drag`
- `hover`

其中拿到的直接表现包括：

- `thinking` 时调试状态显示“思考中”
- `speaking` 时出现回复气泡
- `soft_idle / shy / attention / magic / annoyed` 都能出现各自文本
- `click` 会出现互动文本，例如“有什么事？”
- `drag` 会出现拖拽文本，例如“不要随便移动我。”
- `hover` 在粒子开启时可实际生成星星粒子

### 4.9 窗口位置恢复

当前本地设置已恢复为正常值：

- `windowPosition = { x: 1388, y: 664 }`

当前运行实例的窗口矩形也已经回到正常屏幕坐标：

- `Left = 2082`
- `Top = 996`
- `Width = 437`
- `Height = 560`

这说明离屏污染被修复后，窗口恢复逻辑重新回到了正常状态。

### 4.10 重置位置真实生效

通过 Win32 直接移动窗口，再调用右键菜单“重置位置”，拿到窗口矩形前后值：

- 重置前原位：`left=1388 top=664`
- 手动挪到左上：`left=120 top=120`
- 重置后回归：`left=1388 top=664`

同时 `localStorage` 中的 `windowPosition` 仍保持：

- `{ x: 1388, y: 664 }`

说明“重置位置”不是假按钮，而是真正把桌宠窗口带回默认右下角位置。

### 4.11 缩放重启恢复已再次实证

在当前运行实例上执行：

- 右键菜单切到 `缩放 120%`
- `localStorage.scale = 1.2`
- 右键菜单执行“退出”
- 重新拉起 `tauri:dev`

重启后再次读取当前实例状态，确认：

- `debugPanelOpen = false`
- `particleEnabled = true`
- `scale = 1.2`
- `windowPosition = { x: 1388, y: 664 }`

当前窗口矩形：

- `Left = 2082`
- `Top = 996`
- `Width = 524`
- `Height = 672`

说明缩放和位置都已经在真实重启后恢复。

### 4.12 真实 AstrBot 回复事件已在当前实例上闭环验证

这一项现在已经完成，不再只是历史日志或链路活性。

触发方式：

- 使用本机现成脚本思路，通过 dashboard live chat 向当前本机 AstrBot 发送真实请求
- 请求文本：`Phase4C 验收，请只用一句简短中文回复：收到。`

拿到的闭环证据：

1. dashboard live chat 返回真实回复：
   - `收到。`
2. 当前日志新增真实 bridge 广播：
   - `assistant_reply emotion=neutral source=webchat session_id=webchat!CL0!... text=收到。`
3. 当前桌宠实例现场出现同样气泡：
   - `收到。`

随后我又补了一轮更强验证：

- 请求文本：`再测一次，请只回复：好的。`

桌宠当前实例的运行态观测显示：

1. 回复生成前：
   - 调试状态进入 `思考中`
2. 回复到达后：
   - 调试状态切到 `回复中`
   - 气泡内容为 `好的。`
3. 收起 debug 后：
   - `debugPanelOpen` 恢复为 `false`
   - 普通模式仍保持隐藏

这说明以下链路在“当前最新运行实例”上都是真实生效的：

- dashboard live chat
- AstrBot 主回复链路
- desktop pet bridge
- localhost WebSocket
- 桌宠 speaking/bubble 状态切换
## 5. 结论

Phase 4C 的主体目标已经基本达成，尤其是这几项现在已经实打实落地：

- 普通启动可隐藏 debug
- 右键菜单可用
- debug 可开关
- 缩放 80/100/120 可切换
- 粒子可开关
- 位置可持久化
- 异常离屏坐标已做容错
- 退出可正常关闭应用
- 位置与缩放可在真实重启后恢复
- 当前实例已现场验证真实 AstrBot 回复会触发 thinking / speaking / bubble
- 构建通过
- `tauri:dev` 通过
