# AstrBot 桌宠 MVP Phase 3 最终工作报告

## 1. 报告结论

本阶段已完成 AstrBot 侧 WebSocket 插件桥，实现 AstrBot 回复状态向本机桌宠客户端推送。

| 项目 | 结果 |
|---|---|
| 阶段范围 | 只实现 AstrBot 插件服务端 |
| 桌宠客户端 | 未改动表现层 |
| WebSocket 地址 | `ws://127.0.0.1:17321` |
| 当前运行实例 | 已热重载并启动成功 |
| 实际广播验证 | 已通过 WebChat 触发真实 AstrBot pipeline |
| 禁止项 | 未加入 Live2D、TTS、音频、物理、远程桥接、全量素材导入 |

## 2. 交付物

本节列出本阶段实际生成和同步的文件。

| 类型 | 路径 |
|---|---|
| 项目内插件源码 | `E:\AstrbotYuzhuDesktopPet\plugins\astrbot_plugin_desktop_pet_bridge\` |
| 当前运行 AstrBot 插件目录 | `C:\Users\Kevin\Desktop\Astrbot助手\local_astrbot_airi_lab\runtime_root\data\plugins\astrbot_plugin_desktop_pet_bridge\` |
| 备用同步目录 | `C:\AstrBot\data\plugins\astrbot_plugin_desktop_pet_bridge\` |
| 备用 server_sync 插件目录 | `C:\Users\Kevin\Desktop\Astrbot助手\local_astrbot_airi_lab\server_sync\data\plugins\astrbot_plugin_desktop_pet_bridge\` |

插件目录文件如下。

| 文件 | 作用 |
|---|---|
| `__init__.py` | AstrBot 插件包标记 |
| `main.py` | WebSocket server、事件 hook、广播逻辑 |
| `_conf_schema.json` | AstrBot 插件配置 schema |
| `metadata.yaml` | 插件元数据 |
| `requirements.txt` | `websockets` 依赖声明 |
| `README.md` | 插件说明 |

## 3. 实现范围

本阶段严格保持 Phase 3 边界，只做 AstrBot 侧桥接。

| 模块 | 实现内容 |
|---|---|
| WebSocket server | 在 `127.0.0.1:17321` 启动本地服务 |
| 客户端管理 | 保存已连接桌宠客户端，断开时自动移除 |
| 事件广播 | 将 AstrBot hook 事件转为 JSON 并广播 |
| 空连接处理 | 无客户端时静默丢弃事件 |
| 依赖保护 | 缺少 `websockets` 时记录清晰错误，不让 AstrBot 崩溃 |
| 异常保护 | hook 内异常记录日志，并尽量广播 `error` |
| 配置保留 | 保留 `enabled`、`host`、`port`、`token` |

未做内容如下。

| 项目 | 状态 |
|---|---|
| Live2D | 未加入 |
| TTS / 音频 | 未加入 |
| 物理系统 | 未加入 |
| 远程服务器桥接 | 未加入 |
| 全量素材导入 | 未加入 |
| 桌宠客户端表现层 | 未修改 |

## 4. AstrBot Hook 设计

插件使用 AstrBot v4.23.2 真实存在的 hook，不依赖猜测名称。

| Hook | 用途 |
|---|---|
| `initialize()` | 插件初始化时尝试启动 server |
| `terminate()` | 插件重载或禁用时关闭 server 和客户端连接 |
| `@filter.on_astrbot_loaded()` | AstrBot 加载完成后确保 server 已启动 |
| `@filter.on_waiting_llm_request()` | 进入 LLM 等待阶段时发送 `bot_thinking` |
| `@filter.on_llm_request()` | 进入 LLM 请求阶段时补发 `bot_thinking` |
| `@filter.on_llm_response()` | 缓存原始 LLM 回复文本 |
| `@filter.on_decorating_result(priority=-2000)` | 发送消息前提取最终文本并广播 `assistant_reply` |
| `@filter.on_decorating_result(priority=-1999)` | 捕获 `AGENT_RUNNER_ERROR` 并广播 `error` |

`bot_thinking` 增加了同会话 1 秒去重，避免等待阶段和请求阶段连续触发造成桌宠状态重复闪动。

## 5. WebSocket 协议

插件对桌宠客户端广播 JSON，协议保持 MVP 最小集。

| 事件 | 触发点 | 核心字段 |
|---|---|---|
| `bot_thinking` | AstrBot 等待或发起 LLM 请求 | `source`、`session_id`、`timestamp` |
| `assistant_reply` | AstrBot 生成最终回复 | `text`、`emotion`、`source`、`session_id`、`timestamp` |
| `error` | AstrBot 返回错误或 hook 异常 | `message`、`source`、`session_id`、`timestamp` |
| `pong` | 客户端发送 `ping` | `timestamp` |

`assistant_reply.emotion` 当前固定为 `neutral`，符合 MVP 阶段要求。

## 6. Source 与 Session 规则

本节说明桌宠事件中来源和会话字段的解析策略。

| 字段 | 规则 |
|---|---|
| `source` | 如果上下文包含 `telegram_girlfriend`，发送 `telegram_girlfriend` |
| `source` fallback | 否则优先平台名，再使用 `unified_msg_origin` 前缀，最后为 `unknown` |
| `session_id` | 优先 `event.session_id` |
| `session_id` fallback | 否则使用 `event.unified_msg_origin`，最后为 `default` |

当前 WebChat 验证中的 `source` 为 `webchat` 是预期结果。Telegram 场景下，只要 AstrBot 事件来源包含 `telegram_girlfriend`，插件会输出 `source: "telegram_girlfriend"`。

## 7. 部署与热重载

本阶段确认当前真正运行的 AstrBot 实例位于 `local_astrbot_airi_lab`。

1. 定位运行实例。
   通过进程命令行确认 AstrBot 主进程来自 `server_sync_core\AstrBot\main.py`。

2. 确认插件加载根目录。
   日志显示当前运行实例使用 `runtime_root\data\plugins`。

3. 同步插件文件。
   将项目内插件同步到当前运行实例目录和备用目录。

4. 调用 Dashboard API 热重载。
   对 `astrbot_plugin_desktop_pet_bridge` 执行热重载，返回 `重载成功。`

5. 验证端口监听。
   `127.0.0.1:17321` 监听成功。

## 8. 验证结果

本阶段不仅做了静态检查，也做了真实运行链路验证。

| 验证项 | 结果 |
|---|---|
| 项目内插件 `py_compile` | 通过 |
| 当前运行 AstrBot `.venv` 下 `py_compile` | 通过 |
| 当前运行 AstrBot `.venv` 中 `websockets` | 可导入，版本 `16.0` |
| Dashboard API 热重载 | 成功 |
| `127.0.0.1:17321` | 监听成功 |
| WebSocket 客户端连接 | 成功 |
| `ping -> pong` | 成功 |
| WebChat 触发真实 pipeline | 成功 |
| `bot_thinking` 广播 | 成功 |
| `assistant_reply` 广播 | 成功 |
| 客户端断开清理 | 成功 |

实际广播验证中，临时客户端收到的事件类型为：

```json
[
  "bot_thinking",
  "assistant_reply"
]
```

日志证据包含：

```txt
[desktop_pet_bridge] server started ws://127.0.0.1:17321
[desktop_pet_bridge] client connected total=1
[desktop_pet_bridge] client disconnected total=1
```

## 9. 当前限制

本节记录仍需注意但不阻塞 Phase 3 完成的事项。

| 限制 | 说明 |
|---|---|
| Telegram 外部人工消息 | 未直接向 Telegram bot 发送消息验证 |
| 验证替代路径 | 使用本机 WebChat 触发真实 AstrBot pipeline |
| 合理性 | LLM hook 与 result hook 是平台无关链路，WebChat 能证明插件广播链路可用 |
| 控制台编码 | 某次 PowerShell 输出中文显示为乱码，但 JSON 字段和事件类型正常 |

## 10. 验收对照

本节按原始 Phase 3 验收标准逐项对照。

| 验收项 | 状态 | 证据 |
|---|---|---|
| AstrBot 能加载插件 | 通过 | 日志显示插件载入成功 |
| 插件启动 `ws://127.0.0.1:17321` | 通过 | 端口监听和日志均确认 |
| 桌宠客户端能连接 | 通过 | 临时 WebSocket 客户端连接成功，日志出现 `client connected` |
| 桌宠关闭不导致 AstrBot 崩溃 | 通过 | 客户端断开后日志出现 `client disconnected` |
| AstrBot 回复时广播 `assistant_reply` | 通过 | WebChat 真实 pipeline 已收到该事件 |
| AstrBot 处理时广播 `bot_thinking` | 通过 | WebChat 真实 pipeline 已收到该事件 |
| 无客户端时不影响 AstrBot | 通过 | `_broadcast` 在无客户端时直接返回 |
| 配置项完整 | 通过 | `_conf_schema.json` 已包含 4 个字段 |
| 依赖声明 | 通过 | `requirements.txt` 包含 `websockets>=12.0` |
| 未越界实现 | 通过 | 未引入禁止项 |

## 11. 后续建议

本节只列后续可选改进，不属于 Phase 3 当前交付范围。

| 建议 | 价值 |
|---|---|
| Telegram 实机消息复测 | 证明外部平台入口到桌宠的完整闭环 |
| 增加插件状态命令 | 可在 AstrBot 内查询连接数、端口、最近广播 |
| 增加轻量统计 | 记录最近事件类型和最近一次回复时间 |
| 后续情绪路由 | 将 `emotion` 从固定 `neutral` 升级为规则或模型判断 |

## 12. 最终结论

AstrBot 桌宠 MVP Phase 3 已完成。

当前运行实例已经加载插件，WebSocket server 已启动，真实 AstrBot pipeline 已能把 `bot_thinking` 与 `assistant_reply` 推送到本地 WebSocket 客户端。该结果满足“让 AstrBot 回复能够真正推送到桌宠客户端”的阶段目标。
