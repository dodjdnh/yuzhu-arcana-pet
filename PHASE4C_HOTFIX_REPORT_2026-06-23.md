# Phase 4C Hotfix Reference Report

## 1. 本轮边界确认

- 未改 AstrBot bridge 主链路。
- 未改 emotion router。
- 未重做状态机。
- 未加入 Live2D / TTS / 音频 / 物理 / 远程桥接。
- 未导入全量素材。

## 2. 参考项目

本轮先看参考实现，再决定最终方案，没有盲改。

参考目录：

- `tmp_reference_repos/clawd-on-desk`
- `tmp_reference_repos/WindowPet`
- `tmp_reference_repos/bongo-cat-next`

重点参考点：

- `clawd-on-desk`
  - `docs/project/theme-state-ui.md`
  - `src/main.js`
  - `src/pet-window-runtime.js`
  - 重点吸收思路：`transparent areas pass clicks`、`only body interactive`
- `WindowPet`
  - `src/scenes/manager.ts`
  - 重点吸收思路：运行时切换 `setIgnoreCursorEvents(true/false)`
- `bongo-cat-next`
  - `src/app/page.tsx`
  - `src/hooks/use-window-effects.ts`
  - 重点吸收思路：命中区里稳定调用 `startDragging()`

最终没有照搬 `clawd-on-desk` 的双窗口架构，而是先在当前项目里落地更小代价、可验证的混合方案：

- tight window
- body hitbox
- `setIgnoreCursorEvents`
- 命中区阈值触发 `startDragging()`

## 3. 最终采用方案

### 3.1 Tight Window

当前窗口不再放很宽的透明横向冗余，尺寸策略放在 `petConfig.layout`：

- `screenHeightRatio: 0.35`
- `minWindowWidth: 196`
- `maxWindowWidth: 262`
- `windowWidthRatio: 0.5`
- `rightMargin: 28`
- `bottomMargin: 30`

`App.tsx` 会按显示器高度和当前缩放 `80% / 100% / 120%` 重新计算窗口逻辑尺寸，并保持默认右下角停靠。

当前运行窗口实测矩形：

- `PetRect=(1391,697,1626,1145)`
- 即：`235 x 448 px`

这比早期版本的大块透明矩形明显收紧。

### 3.2 命中区

交互已从整窗 / 整块 canvas 收紧为显式 hitbox。

当前参数：

- `leftRatio: 0.4`
- `topRatio: 0.08`
- `widthRatio: 0.44`
- `heightRatio: 0.84`

只有 hitbox 接收：

- hover
- click
- drag
- right-click

以下层默认不拦截鼠标：

- Pixi canvas
- speech bubble
- particle layer
- 普通装饰层

以下层打开时会恢复交互：

- debug panel
- context menu

### 3.3 Click-Through

当前 click-through 不是只靠 CSS `pointer-events`，而是组合实现：

1. 先收紧真实窗口矩形。
2. 再用 hitbox 限定交互范围。
3. 对透明区域启用 `getCurrentWindow().setIgnoreCursorEvents(true)`。

实现位置：

- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src-tauri/capabilities/default.json`

已补齐权限：

- `core:window:allow-cursor-position`
- `core:window:allow-set-ignore-cursor-events`
- `core:window:allow-start-dragging`

实际策略：

- 默认根据全局鼠标位置轮询判断是否位于 hitbox 内。
- 鼠标不在 hitbox 内：整窗忽略鼠标事件。
- 鼠标进入 hitbox：恢复窗口鼠标事件。
- debug / context menu 打开时：强制恢复交互。
- 拖拽会话进行中：强制恢复交互。

为了降低“快速掠过透明区后立刻点下去”的短暂阻塞概率，命中轮询已从早先的较慢频率收紧为：

- `HITBOX_POLL_INTERVAL_MS = 32`

### 3.4 拖拽

当前拖拽不是整窗 drag region，也不是前端逐帧 `setPosition()`，而是：

- `pointerdown` 只在 hitbox 内触发
- 左键按下记录起点
- 位移超过 `dragStartThresholdPx: 6` 才进入拖拽
- 进入拖拽后调用原生 `getCurrentWindow().startDragging()`

这样保留了原生窗口拖拽稳定性，同时避免短点击误触发拖拽。

拖拽相关补强：

- 右键不会触发拖拽
- 原生拖拽结束后仍保留原有 drag 反馈
- `handlePetDragEnd` 直接补一次当前位置持久化
  - 不再只依赖 `window.onMoved` 的异步节流保存

## 4. 修改文件

- `apps/desktop-pet/src/App.tsx`
- `apps/desktop-pet/src/App.css`
- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src/pet/petConfig.ts`
- `apps/desktop-pet/src-tauri/capabilities/default.json`

## 5. 运行级验证

验证环境：

- 项目路径：`E:\AstrbotYuzhuDesktopPet\apps\desktop-pet`
- 启动方式：`tools/run_tauri_dev_phase4c.ps1`
- 日期：`2026-06-23`

### 5.1 build

执行：

```powershell
cd E:\AstrbotYuzhuDesktopPet\apps\desktop-pet
npm run build
```

结果：

- `tsc -b` 通过
- `vite build` 通过

### 5.2 tauri:dev

已多次通过真实 `tauri:dev` 窗口验证。

最近一次确认：

- `desktop_pet pid=2972`
- 当前运行页已能通过 CDP 读取状态
- 当前 `localStorage`：
  - `{"debugPanelOpen":false,"particleEnabled":true,"scale":1.2,"windowPosition":{"x":1339,"y":534}}`

### 5.3 当前连接与待机

打开 debug 面板后读取当前运行态：

- `连接已连接`
- `状态待机`
- `idle behavior: cold_pause`

结论：

- 当前 WebSocket 连接正常
- idle 链路当前正常运行

### 5.4 emotion 运行验证

在当前真实运行实例里，通过 debug 按钮触发一条冷淡回复事件，随后读取运行态：

- `bubbleText = "……你今天回来得很晚。"`
- `状态回复中`
- `连接已连接`

结论：

- 回复事件能正常驱动 speaking 状态
- emotion 对应的回复链路仍正常
- 本轮 hotfix 没有破坏现有回复 / emotion 表现

## 6. 拖拽验证

### 6.1 10 次连续拖拽

使用 Win32 鼠标模拟，在 hitbox 内连续执行 10 次往返拖拽。

结果：

| Test | DeltaX | DeltaY | Moved |
| --- | ---: | ---: | --- |
| 1 | 83 | -48 | True |
| 2 | -83 | 48 | True |
| 3 | 83 | -48 | True |
| 4 | -83 | 48 | True |
| 5 | 83 | -48 | True |
| 6 | -83 | 48 | True |
| 7 | 83 | -48 | True |
| 8 | -83 | 48 | True |
| 9 | 83 | -48 | True |
| 10 | -83 | 48 | True |

结论：

- `10 / 10` 成功
- 没有再次出现“只能拖一小段”
- 没有再次出现拖动时明显抖动

### 6.2 微小位移误拖

在 hitbox 内只做很小位移：

- `DeltaX=0`
- `DeltaY=0`
- `Moved=False`

结论：

- 短点击不会误判为拖拽

### 6.3 点击互动

在关闭 debug 面板后，直接对 `.pet-hitbox` 执行运行时点击，随后读取气泡：

- `bubbleText = "……嗯？"`

结论：

- 短点击互动仍然正常
- 本轮热修没有把 click 链路打断

### 6.4 hover 对照验证

为了避免只靠肉眼观察，本轮在运行中的 `.pet-hitbox` 上临时挂了 `pointerenter / pointerleave` 计数器，然后用真实系统鼠标做两组对照：

1. 透明区往返 12 次
2. hitbox 往返 12 次

结果：

- 透明区阶段：
  - `enter = 0`
  - `leave = 0`
- hitbox 阶段：
  - `enter = 12`
  - `leave = 11`

结论：

- 鼠标在透明区附近不会误触发角色 hover
- 鼠标进入 hitbox 时会稳定触发 hover

## 7. 透明区域穿透验证

这部分不再只看视觉效果，而是用了原生探针验证：

- 在桌宠窗口下方放置 WinForms 按钮窗体
- 对桌宠透明区发送真实鼠标点击
- 通过底层按钮点击计数判断是否真正穿透

### 7.1 透明区点击

实测：

- `PetRect=(1391,697,1626,1145)`
- `Click=(1426,831)`
- `Counter=1`

含义：

- 点击位于桌宠窗口矩形内
- 但位于 hitbox 外透明区
- 下层按钮成功收到点击

结论：

- 透明区域点击穿透成立

### 7.2 命中区点击

实测：

- `PetRect=(1391,697,1626,1145)`
- `Click=(1537,912)`
- `Counter=0`

含义：

- 点击位于 hitbox 内
- 下层按钮没有收到点击

结论：

- 当前确实是“only body interactive”
- 不是整窗都在拦截鼠标

### 7.3 右键菜单

在 hitbox 内执行真实右键后，运行时 DOM 读取结果：

- `visible = true`
- 文本：
  - `显示 debug`
  - `重置位置`
  - `缩放 80%`
  - `缩放 100%`
  - `缩放 120%`
  - `粒子关`
  - `退出`

结论：

- 右键菜单仍正常

### 7.4 气泡 / 粒子层鼠标拦截配置

在运行时直接读取计算样式：

- `bubblePointerEvents = "none"`
- `particlePointerEvents = "none"`

结论：

- 气泡层和粒子层当前都被明确配置为不接管鼠标事件

## 8. 位置恢复验证

修补前暴露出一个真实问题：

- 自动拖动后，`localStorage` 中的 `windowPosition` 没有稳定更新
- 重启后会恢复到旧位置

已修复方式：

- `onPetDragEnd` 直接调用当前位置持久化

修复后验证链路：

1. 先拖到新位置：
   - `Physical=2008,801`
2. 再读运行中 `localStorage`：
   - `windowPosition = { x: 1339, y: 534 }`
3. 重启 `tauri:dev` 后再读窗口坐标：
   - `Before=2008,801`
   - `After=2009,801`

结论：

- 位置恢复正常
- `1px` 差异属于 DPI / 取整误差

## 9. 当前结论

本轮 Phase 4C Hotfix Reference 的核心目标已在当前单窗口架构下得到证明：

- 窗口矩形已收紧，不再保留早期那种过宽透明占用
- 交互已收紧到角色本体附近 hitbox
- 透明区域真实点击可穿透到底层窗口
- 命中区可稳定拦截 hover / click / drag / right-click
- 连续拖动 `10 / 10` 成功
- 短点击不会误拖
- 右键菜单仍正常
- 位置恢复已修正
- `npm run build` 通过
- `tauri:dev` 通过

## 10. 仍保留的限制

- 当前仍是单窗口方案，没有引入 `clawd-on-desk` 式双窗口输入层。
- hitbox 仍是手工比例，不是按 alpha 轮廓自动命中。
- 当前报告没有额外加入新的功能，只聚焦透明区挡鼠标和拖动稳定性热修。
