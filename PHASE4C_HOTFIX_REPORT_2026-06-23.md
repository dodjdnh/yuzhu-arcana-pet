# Phase 4C Hotfix Report

## 1. 本轮目标

本轮不是重做功能，而是修复 Phase 4C 在真实桌面运行中的两个核心问题：

- 窗口透明区域占用过大，导致“看不见但会挡桌面”的体积明显偏大。
- 拖拽仍依赖整块 canvas 和 `startDragging()`，导致透明区、点击、右键、拖拽互相打架，稳定性差。

本轮继续遵守原边界：

- 未改 AstrBot bridge 主链路。
- 未改 emotion router。
- 未重做状态机。
- 未加入 Live2D / TTS / 音频 / 物理 / 远程桥接。
- 未导入全量素材。

## 2. 修改文件

- `apps/desktop-pet/src/App.tsx`
- `apps/desktop-pet/src/App.css`
- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src/pet/petConfig.ts`
- `apps/desktop-pet/src-tauri/capabilities/default.json`

## 3. 关键修复

### 3.1 窗口宽度收紧

原实现按较宽比例给桌宠窗口分配宽度，导致右下角桌宠实际视觉宽度远小于窗口占用宽度。

本轮改为：

- 在 `petConfig.layout` 中新增 `minWindowWidth` / `maxWindowWidth` / `windowWidthRatio`
- `App.tsx` 中按新的更窄公式计算窗口宽度
- 保留原有高度、自适应缩放、右下角默认定位和位置恢复逻辑

实际重启后测得窗口外接尺寸为：

- 宽 `353 px`
- 高 `672 px`

这已经显著小于上一版的宽占用。

### 3.2 交互从“整块 canvas”收紧为“角色命中框”

原实现的问题：

- Pixi canvas 整块可交互
- 整块 canvas 同时被用于 hover、click、drag
- 透明区域也会吃鼠标

本轮改为：

- Pixi canvas 完全 `pointer-events: none`
- 新增独立 DOM 命中层 `pet-hitbox`
- 命中框参数放入 `petConfig.interaction.hitbox`
- 只有命中框接收：
  - hover
  - click
  - drag
  - right-click
- 粒子层、气泡层继续不拦截鼠标

当前命中框配置：

- `leftRatio: 0.4`
- `topRatio: 0.08`
- `widthRatio: 0.44`
- `heightRatio: 0.84`

并且当 debug 面板打开时，会显示命中框可视化边界，便于后续继续微调。

### 3.3 拖拽改为前端自管，不再依赖整块 drag region

原实现仍在用：

- `data-tauri-drag-region`
- `getCurrentWindow().startDragging()`

这会把“点击”和“拖拽启动”混在一起，也会让透明区域更容易误吞事件。

本轮改为：

- 删除整块 drag region 依赖
- 改成命中框上的自定义 pointer 拖拽
- 新增 `dragStartThresholdPx: 6`
- 只有位移超过阈值才认定为拖拽
- 短距离微动仍按点击处理

实现细节：

- `pointerdown` 时记录窗口物理坐标与鼠标起点
- `pointermove` 超过阈值后才触发 `onPetDragStart`
- 使用 `requestAnimationFrame` 节流窗口移动
- 使用 `PhysicalPosition` 修复物理坐标与逻辑坐标混用导致的异常

这里有一个中途发现并修掉的真实 bug：

- 第一版自定义拖拽误把 `outerPosition()` 的物理坐标配合 `LogicalPosition` 使用
- 真实测试时窗口会被拖到 `(-32000, -32000)` 的隐藏坐标区
- 已改为 `PhysicalPosition`
- 修复后拖拽恢复稳定

### 3.4 右键菜单只绑定到角色本体

原本主容器级别的右键菜单意味着整个窗口都能唤出菜单。

本轮改为：

- 移除 `main.app-shell` 上的全局右键菜单绑定
- 只允许命中框区域右键打开菜单
- 右键菜单自身仍为可交互层

运行截屏已确认右键菜单仍能正常弹出。

## 4. 运行级验证

验证环境：

- 路径：`E:\AstrbotYuzhuDesktopPet\apps\desktop-pet`
- 启动方式：`E:\AstrbotYuzhuDesktopPet\tools\run_tauri_dev_phase4c.ps1`
- 日期：`2026-06-23`

### 4.1 构建

已执行：

```powershell
cd E:\AstrbotYuzhuDesktopPet\apps\desktop-pet
npm run build
```

结果：

- `tsc -b` 通过
- `vite build` 通过

### 4.2 tauri:dev

已通过脚本拉起真实桌宠窗口并完成运行验证。

### 4.3 10 次命中框拖拽测试

使用 Win32 鼠标事件在角色命中框内部做 10 次交替拖拽，窗口坐标每次都发生了稳定变化。

结果：

| Test | DeltaX | DeltaY | Moved |
| --- | ---: | ---: | --- |
| 1 | 21 | -11 | True |
| 2 | -22 | 12 | True |
| 3 | 22 | -13 | True |
| 4 | -22 | 12 | True |
| 5 | 22 | -13 | True |
| 6 | -21 | 11 | True |
| 7 | 21 | -11 | True |
| 8 | -21 | 11 | True |
| 9 | 22 | -13 | True |
| 10 | -21 | 11 | True |

结论：

- 10/10 成功
- 没有出现再次飞到隐藏坐标区的问题

### 4.4 透明区拖拽测试

在窗口左侧透明区域模拟拖拽：

- `DeltaX: 0`
- `DeltaY: 0`
- `Moved: False`

结论：

- 透明区域不再触发拖拽

### 4.5 微小位移误拖测试

在命中框内部只模拟 `2px / 1px` 微小移动：

- `DeltaX: 0`
- `DeltaY: 0`
- `Moved: False`

结论：

- 点击不会轻易误判为拖拽

### 4.6 重启位置恢复

重启前窗口位置：

- `X: 2149`
- `Y: 847`

重启后窗口位置：

- `X: 2150`
- `Y: 848`

结论：

- 位置恢复正常
- 1px 偏差属于窗口边框 / DPI 取整范围内的正常浮动

### 4.7 右键菜单

已通过桌面截图确认：

- 命中框内右键可正常弹出菜单
- 菜单项仍包含：
  - 显示/隐藏 debug
  - 重置位置
  - 缩放 80%
  - 缩放 100%
  - 缩放 120%
  - 粒子开/关
  - 退出

验证截图：

- `artifacts/desktop_pet_context_menu_capture.png`

## 5. 当前结果总结

本轮 hotfix 已完成以下目标：

- 明显收紧桌宠窗口横向占用
- 将交互限制到角色实际区域附近
- 透明区域不再响应拖拽
- 点击与拖拽分离，拖拽更稳定
- 重启后位置恢复正常
- 右键菜单仍可用

## 6. 仍然保留的限制

- 命中框当前仍是“手工比例配置”，不是按像素级轮廓自动命中。
- 右键菜单仍会覆盖角色身体一部分，这是当前菜单布局的既有表现，不属于本轮 hotfix 的主要修复范围。
- 本轮没有改角色状态表现、素材路由、气泡文案、AstrBot 消息链路。
