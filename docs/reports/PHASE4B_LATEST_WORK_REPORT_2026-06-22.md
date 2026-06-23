# Phase 4B 最新工作报告

日期：2026-06-22

## 本轮目标

仅推进 Phase 4B：情绪表现增强与状态素材扩展。

本轮明确遵守以下边界：

- 未重建整个项目，只检查并构建 `apps/desktop-pet`
- 未修改 AstrBot bridge 主链路
- 未加入 Live2D、TTS、音频、物理、远程桥接
- 未扫描或导入全量立绘素材

## 本轮完成内容

### 1. 扩展桌宠可识别状态类型

已在 `apps/desktop-pet/src/pet/manifest.ts` 中扩展前端状态类型，新增以下可渲染状态：

- `soft_idle`
- `shy`
- `attention`
- `magic`
- `annoyed`

这使前端表现层可以正式接收这些状态，而不是只能退回到旧状态集合。

### 2. 重做 emotion 到 visualState 的映射逻辑

已在 `apps/desktop-pet/src/pet/stateMachine.ts` 中替换旧的固定映射，改为带 manifest 感知的稳定 fallback。

当前逻辑如下：

- `neutral -> idle`
- `cold -> cold`
- `cold_soft -> soft_idle -> cold -> idle`
- `gentle -> soft_idle -> idle`
- `sleepy -> sleepy -> idle`
- `thinking -> magic/thinking -> idle`
- `embarrassed -> shy -> hand_mouth -> idle`
- `surprised -> attention -> thinking -> idle`
- `error -> error -> cold -> idle`

说明：

- 状态机现在保留 `soft_idle`、`shy`、`attention`、`magic`、`annoyed` 这些概念状态
- 实际贴图 fallback 交由渲染层根据 manifest 解析
- 缺图时不会崩溃
- `cold_soft` 已不再等同普通 `cold`
- `gentle` 已优先走更柔和路线
- `embarrassed`、`surprised`、`thinking` 已具备更细分的表现入口

### 3. 调整思考态与回复态的生成策略

在 `stateMachine.ts` 中同步更新了状态生成：

- `bot_thinking` 不再只会进入 `thinking`
- 如存在 `magic` 资产，可优先或交替使用 `magic`
- `assistant_reply` 不再被通用 `speaking` 立绘完全吞掉
- 回复阶段现在优先展示 emotion 对应的目标视觉状态
- 这样 `cold_soft`、`gentle`、`embarrassed`、`surprised`、`thinking` 的差异能真正显示出来

### 4. 增强 PetStage 的动作气质差异

已在 `apps/desktop-pet/src/pet/PetStage.tsx` 中新增多组状态表现逻辑：

- `soft_idle`
  - 呼吸更慢
  - 左右摆动更轻
  - 色调更柔和
  - 会低频触发少量 `star` 粒子
- `shy`
  - 动作更小
  - 有短暂停顿感
  - 整体更收敛
- `attention`
  - 有更明显的轻微上浮与小幅摇动
  - 更像被提醒后集中注意
- `magic`
  - 基于思考态增强
  - 触发更频繁的 `magic` 粒子
  - 色调更偏淡紫
- `annoyed`
  - 动作更克制
  - 轻微冷淡摆动
  - 视觉氛围比普通 `cold` 更收束

同时把原本仅用于思考态的粒子回调，改为通用的状态粒子回调：

- `magic` 可触发魔法粒子
- `soft_idle` 可触发轻微星星粒子

### 5. 新增调试按钮

已在 `apps/desktop-pet/src/App.tsx` 中加入以下独立模拟入口：

- `Simulate soft_idle`
- `Simulate shy`
- `Simulate attention`
- `Simulate magic`
- `Simulate annoyed`

用途：

- 不依赖 AstrBot
- 可直接检查前端表现层
- 可验证新状态动画、气泡与粒子是否工作

### 6. 新增调试文案配置

已在 `apps/desktop-pet/src/pet/petConfig.ts` 中新增 `debugSamples`，用于承载新状态的调试气泡文本：

- `softIdle`
- `shy`
- `attention`
- `magic`
- `annoyed`

这样调试逻辑不需要把临时文案硬编码散落在 `App.tsx` 里。

### 7. 扩展 manifest 可选状态占位

已在 `apps/desktop-pet/public/assets/alice/manifest.json` 中加入以下可选状态键：

- `soft_idle`
- `shy`
- `attention`
- `magic`
- `annoyed`

当前写法使用空对象占位，例如：

```json
"soft_idle": {}
```

这样做的效果：

- manifest 已显式支持这些状态
- 当前没有实际图片文件时，不会触发贴图加载失败
- 前端可通过渲染层 fallback 把这些状态稳定映射到旧素材

## 本轮未做内容

### 1. 未修改 AstrBot 插件主链路

符合本阶段约束。

### 2. 未导入新增精选素材

当前 `public/assets/alice/skins/default_black/` 中仍只有原有图片，没有新增：

- `soft_idle.webp`
- `shy.webp`
- `attention.webp`
- `magic.webp`
- `annoyed.webp`

因此本轮采取的是：

- 先完成类型支持
- 先完成状态映射
- 先完成稳定 fallback
- 先完成动作差异

而不是伪造 manifest 条目去引用不存在的文件。

## 影响文件

本轮实际修改文件：

- `apps/desktop-pet/src/pet/manifest.ts`
- `apps/desktop-pet/src/pet/stateMachine.ts`
- `apps/desktop-pet/src/pet/PetStage.tsx`
- `apps/desktop-pet/src/pet/petConfig.ts`
- `apps/desktop-pet/src/App.tsx`
- `apps/desktop-pet/public/assets/alice/manifest.json`

## 验证结果

已执行：

```powershell
npm run build
```

执行目录：

```text
apps/desktop-pet
```

结果：

- `tsc -b` 通过
- `vite build` 通过
- 前端成功产出 `dist`

附注：

- 构建过程中出现一个 Vite chunk 体积警告
- 这不是本轮功能错误，不影响 Phase 4B 的行为验证

## 当前结论

本轮已经完成 Phase 4B 的第一阶段落地：

- 新状态类型已接入
- emotion 映射已细化
- fallback 已稳定
- 表现差异已增强
- 调试按钮已补齐
- 前端构建已通过

当前还未完成的仅是“少量精选新素材接入”这一步。

如果后续继续 Phase 4B，下一步应当是：

1. 从用户现有立绘中只挑少量同服装素材
2. 落到：
   - `soft_idle.webp`
   - `shy.webp`
   - `attention.webp`
   - `magic.webp`
   - `annoyed.webp`
3. 再更新 `public/assets/alice/manifest.json`
4. 用调试按钮逐个验收真实素材表现
