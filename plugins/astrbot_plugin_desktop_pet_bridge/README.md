# AstrBot Desktop Pet Bridge

本插件在 AstrBot 侧启动本机 WebSocket server，用于把 AstrBot 的处理状态和最终回复广播给桌宠客户端。

## 默认配置

- `enabled`: `true`
- `host`: `127.0.0.1`
- `port`: `17321`
- `token`: `""`
- `emotion_routing_enabled`: `true`
- `default_emotion`: `"neutral"`

## 事件

插件会发送以下 JSON 事件：

- `bot_thinking`: AstrBot 已进入 LLM 请求阶段。
- `assistant_reply`: AstrBot 生成并即将发送回复，包含 `text` 和轻量规则识别得到的 `emotion`。
- `error`: AstrBot 产生 agent runner 错误结果时发送。

桌宠未连接时，事件会被静默丢弃。

## 情绪路由

当 `emotion_routing_enabled=true` 时，插件会根据最终回复文本做轻量规则判断，输出以下 emotion 之一：

- `neutral`
- `cold`
- `cold_soft`
- `gentle`
- `sleepy`
- `thinking`
- `embarrassed`
- `surprised`
- `error`

当前规则集中在 `emotion_router.py`，便于后续调整词表和优先级。

如需关闭规则路由，可设置：

- `emotion_routing_enabled=false`
- `default_emotion="neutral"`

## 本地自检

可在项目根目录执行：

```powershell
@'
from plugins.astrbot_plugin_desktop_pet_bridge.emotion_router import run_self_test
failures = run_self_test()
print("ok" if not failures else failures)
'@ | python -
```

## 依赖

插件使用 `websockets`。如果依赖缺失，插件会输出清晰错误日志并停止桥接 server，不会中断 AstrBot 主流程。
