from __future__ import annotations

import asyncio
import json
import time
from contextlib import suppress
from typing import Any

from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.provider import LLMResponse, ProviderRequest
from astrbot.api.star import Context, Star, register

from .emotion_router import detect_emotion, normalize_default_emotion

try:
    from astrbot.core.message.components import Plain
except Exception:  # pragma: no cover - keep plugin importable across AstrBot builds
    Plain = None  # type: ignore[assignment]


PLUGIN_NAME = "astrbot_plugin_desktop_pet_bridge"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 17321
DEFAULT_SOURCE = "telegram_girlfriend"


@register(
    PLUGIN_NAME,
    "Kevin/OpenAI",
    "把 AstrBot 回复状态通过 localhost WebSocket 广播给本机桌宠客户端。",
    "0.1.0",
)
class DesktopPetBridgePlugin(Star):
    def __init__(self, context: Context, config: dict | None = None):
        super().__init__(context)
        self.context = context
        self.config = config or {}
        self.enabled = bool(self.config.get("enabled", True))
        self.host = str(self.config.get("host", DEFAULT_HOST) or DEFAULT_HOST)
        self.port = int(self.config.get("port", DEFAULT_PORT) or DEFAULT_PORT)
        self.token = str(self.config.get("token", "") or "")
        self.emotion_routing_enabled = bool(self.config.get("emotion_routing_enabled", True))
        self.default_emotion = normalize_default_emotion(
            str(self.config.get("default_emotion", "neutral") or "neutral")
        )
        self._server: Any | None = None
        self._server_task: asyncio.Task | None = None
        self._clients: set[Any] = set()
        self._last_response_text: dict[str, str] = {}
        self._last_thinking_at: dict[str, float] = {}
        self._websockets: Any | None = None
        logger.info(
            "[desktop_pet_bridge] initialized enabled=%s host=%s port=%s token=%s",
            self.enabled,
            self.host,
            self.port,
            "set" if self.token else "empty",
        )
        logger.info(
            "[desktop_pet_bridge] emotion routing enabled=%s default_emotion=%s",
            self.emotion_routing_enabled,
            self.default_emotion,
        )

    @filter.on_astrbot_loaded()
    async def on_astrbot_loaded(self):
        self._ensure_server_task()

    async def initialize(self) -> None:
        self._ensure_server_task()

    async def terminate(self) -> None:
        await self._stop_server()

    def _ensure_server_task(self) -> None:
        if not self.enabled:
            return
        if self._server_task and not self._server_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("[desktop_pet_bridge] cannot start websocket server: no running event loop")
            return
        self._server_task = loop.create_task(self._start_server())

    async def _start_server(self) -> None:
        if self._server is not None:
            return
        try:
            import websockets
        except ImportError:
            logger.error(
                "[desktop_pet_bridge] missing dependency: websockets. "
                "Install with: pip install -r plugins/astrbot_plugin_desktop_pet_bridge/requirements.txt"
            )
            return

        self._websockets = websockets
        try:
            self._server = await websockets.serve(self._handle_client, self.host, self.port)
            logger.info("[desktop_pet_bridge] server started ws://%s:%s", self.host, self.port)
            await asyncio.Future()
        except asyncio.CancelledError:
            raise
        except OSError as exc:
            logger.error(
                "[desktop_pet_bridge] failed to start websocket server on ws://%s:%s: %s",
                self.host,
                self.port,
                exc,
            )
        except Exception as exc:
            logger.error("[desktop_pet_bridge] websocket server error: %s", exc)

    async def _stop_server(self) -> None:
        if self._server_task and not self._server_task.done():
            self._server_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._server_task
        self._server_task = None

        for client in list(self._clients):
            with suppress(Exception):
                await client.close()
        self._clients.clear()

        if self._server is not None:
            self._server.close()
            with suppress(Exception):
                await self._server.wait_closed()
        self._server = None

    async def _handle_client(self, websocket: Any, path: str | None = None) -> None:
        if path is None:
            path = str(getattr(websocket, "path", "") or "")
        if self.token and not self._token_allowed(path):
            logger.warning("[desktop_pet_bridge] client rejected: invalid token")
            with suppress(Exception):
                await websocket.close(code=1008, reason="invalid token")
            return

        self._clients.add(websocket)
        logger.info("[desktop_pet_bridge] client connected total=%d", len(self._clients))
        try:
            async for message in websocket:
                await self._handle_client_message(message, websocket)
        except Exception as exc:
            logger.debug("[desktop_pet_bridge] client loop ended: %s", exc)
        finally:
            self._clients.discard(websocket)
            logger.info("[desktop_pet_bridge] client disconnected total=%d", len(self._clients))

    def _token_allowed(self, path: str | None) -> bool:
        if not self.token:
            return True
        value = str(path or "")
        return f"token={self.token}" in value or value.rstrip("/").endswith(f"/{self.token}")

    async def _handle_client_message(self, message: Any, websocket: Any) -> None:
        text = str(message or "").strip()
        if not text:
            return
        if text.lower() == "ping":
            with suppress(Exception):
                await websocket.send(json.dumps({"type": "pong", "timestamp": time.time()}))
            return
        with suppress(json.JSONDecodeError):
            payload = json.loads(text)
            if isinstance(payload, dict) and payload.get("type") == "ping":
                await websocket.send(json.dumps({"type": "pong", "timestamp": time.time()}))

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        if not self.enabled:
            return
        self._ensure_server_task()
        if not self._clients:
            return

        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        stale: list[Any] = []
        for client in list(self._clients):
            try:
                await client.send(data)
            except Exception as exc:
                logger.warning("[desktop_pet_bridge] broadcast error: %s", exc)
                stale.append(client)
        for client in stale:
            self._clients.discard(client)

    @filter.on_llm_request()
    async def on_llm_request(self, event: AstrMessageEvent, req: ProviderRequest):
        try:
            await self._emit_thinking(event)
        except Exception as exc:
            logger.error("[desktop_pet_bridge] on_llm_request error: %s", exc)
            await self._emit_error(event, str(exc))

    @filter.on_waiting_llm_request()
    async def on_waiting_llm_request(self, event: AstrMessageEvent):
        try:
            await self._emit_thinking(event)
        except Exception as exc:
            logger.error("[desktop_pet_bridge] on_waiting_llm_request error: %s", exc)
            await self._emit_error(event, str(exc))

    async def _emit_thinking(self, event: AstrMessageEvent) -> None:
        session_id = self._session_id(event)
        now = time.time()
        last_at = self._last_thinking_at.get(session_id, 0)
        if now - last_at < 1.0:
            return
        self._last_thinking_at[session_id] = now
        await self._broadcast(
            {
                "type": "bot_thinking",
                "source": self._source(event),
                "session_id": session_id,
                "timestamp": now,
            }
        )

    @filter.on_llm_response()
    async def on_llm_response(self, event: AstrMessageEvent, response: LLMResponse):
        try:
            text = self._extract_response_text(response)
            if text:
                self._last_response_text[self._session_id(event)] = text
        except Exception as exc:
            logger.error("[desktop_pet_bridge] on_llm_response error: %s", exc)
            await self._emit_error(event, str(exc))

    @filter.on_decorating_result(priority=-2000)
    async def on_decorating_result(self, event: AstrMessageEvent):
        try:
            result = event.get_result()
            if not result:
                return

            content_type = str(getattr(getattr(result, "result_content_type", ""), "name", ""))
            if content_type == "AGENT_RUNNER_ERROR":
                return

            try:
                if hasattr(result, "is_llm_result") and not result.is_llm_result():
                    return
            except Exception:
                pass

            session_id = self._session_id(event)
            text = self._extract_result_text(result) or self._last_response_text.pop(session_id, "")
            if not text:
                return
            source = self._source(event)
            emotion = self._resolve_emotion(text, source=source)
            logger.info(
                "[desktop_pet_bridge] assistant_reply emotion=%s source=%s session_id=%s text=%s",
                emotion,
                source,
                session_id,
                self._preview_text(text),
            )

            await self._broadcast(
                {
                    "type": "assistant_reply",
                    "text": text,
                    "emotion": emotion,
                    "source": source,
                    "session_id": session_id,
                    "timestamp": time.time(),
                }
            )
        except Exception as exc:
            logger.error("[desktop_pet_bridge] on_decorating_result error: %s", exc)
            await self._emit_error(event, str(exc))

    @filter.on_decorating_result(priority=-1999)
    async def on_error_result(self, event: AstrMessageEvent):
        try:
            result = event.get_result()
            if not result:
                return
            content_type = str(getattr(getattr(result, "result_content_type", ""), "name", ""))
            if content_type != "AGENT_RUNNER_ERROR":
                return
            message = self._extract_result_text(result) or "AstrBot reply failed"
            await self._emit_error(event, message)
        except Exception as exc:
            logger.error("[desktop_pet_bridge] on_error_result error: %s", exc)
            await self._emit_error(event, str(exc))

    async def _emit_error(self, event: AstrMessageEvent, message: str) -> None:
        with suppress(Exception):
            await self._broadcast(
                {
                    "type": "error",
                    "message": str(message or "AstrBot bridge error"),
                    "source": self._source(event),
                    "session_id": self._session_id(event),
                    "timestamp": time.time(),
                }
            )

    def _source(self, event: AstrMessageEvent) -> str:
        origin = str(getattr(event, "unified_msg_origin", "") or "")
        platform = str(getattr(event, "get_platform_name", lambda: "")() or "")
        combined = f"{origin} {platform}".lower()
        if "telegram_girlfriend" in combined:
            return DEFAULT_SOURCE
        if platform:
            return platform
        if origin:
            return origin.split(":", 1)[0] or "unknown"
        return "unknown"

    def _session_id(self, event: AstrMessageEvent) -> str:
        session_id = str(getattr(event, "session_id", "") or "")
        if session_id:
            return session_id
        origin = str(getattr(event, "unified_msg_origin", "") or "")
        return origin or "default"

    def _extract_response_text(self, response: Any) -> str:
        for attr in ("completion_text", "_completion_text"):
            value = getattr(response, attr, None)
            if isinstance(value, str) and value.strip():
                return self._clean_text(value)
        result_chain = getattr(response, "result_chain", None)
        return self._extract_result_text(result_chain)

    def _extract_result_text(self, result: Any) -> str:
        chain = getattr(result, "chain", None)
        if not chain:
            return ""
        parts: list[str] = []
        for comp in chain:
            if Plain is not None and isinstance(comp, Plain):
                parts.append(str(getattr(comp, "text", "") or ""))
                continue
            text = getattr(comp, "text", None)
            if isinstance(text, str):
                parts.append(text)
        return self._clean_text("\n".join(part for part in parts if part.strip()))

    def _clean_text(self, value: Any) -> str:
        return "\n".join(line.rstrip() for line in str(value or "").strip().splitlines()).strip()

    def _resolve_emotion(self, text: str, source: str | None = None) -> str:
        if not self.emotion_routing_enabled:
            return self.default_emotion
        emotion = detect_emotion(text, source=source)
        return normalize_default_emotion(emotion)

    def _preview_text(self, text: str, limit: int = 48) -> str:
        normalized = self._clean_text(text).replace("\n", " / ")
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit]}..."
