export const PET_SOCKET_URL = 'ws://127.0.0.1:17321'

export type SocketConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

interface BaseSocketEvent {
  source?: string
  session_id?: string
  timestamp?: number
}

export interface BotThinkingEvent extends BaseSocketEvent {
  type: 'bot_thinking'
}

export interface AssistantReplyEvent extends BaseSocketEvent {
  type: 'assistant_reply'
  text: string
  emotion?: string
}

export interface ErrorEvent extends BaseSocketEvent {
  type: 'error'
  message: string
}

export interface IdleEvent extends BaseSocketEvent {
  type: 'idle'
}

export type PetSocketEvent =
  | BotThinkingEvent
  | AssistantReplyEvent
  | ErrorEvent
  | IdleEvent

interface PetSocketClientOptions {
  url: string
  onEvent: (event: PetSocketEvent) => void
  onStatusChange: (status: SocketConnectionStatus) => void
  onMessageError?: (message: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseIncomingEvent(raw: string): PetSocketEvent | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null
  }

  switch (parsed.type) {
    case 'bot_thinking':
      return {
        type: 'bot_thinking',
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
        session_id:
          typeof parsed.session_id === 'string' ? parsed.session_id : undefined,
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
      }

    case 'assistant_reply':
      if (typeof parsed.text !== 'string') {
        return null
      }

      return {
        type: 'assistant_reply',
        text: parsed.text,
        emotion: typeof parsed.emotion === 'string' ? parsed.emotion : undefined,
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
        session_id:
          typeof parsed.session_id === 'string' ? parsed.session_id : undefined,
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
      }

    case 'error':
      if (typeof parsed.message !== 'string') {
        return null
      }

      return {
        type: 'error',
        message: parsed.message,
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
        session_id:
          typeof parsed.session_id === 'string' ? parsed.session_id : undefined,
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
      }

    case 'idle':
      return {
        type: 'idle',
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
      }

    default:
      return null
  }
}

export function createPetSocketClient({
  url,
  onEvent,
  onStatusChange,
  onMessageError,
}: PetSocketClientOptions) {
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let disposed = false

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    clearReconnectTimer()
    reconnectTimer = window.setTimeout(() => {
      connect()
    }, 3000)
  }

  const connect = () => {
    if (disposed) {
      return
    }

    clearReconnectTimer()
    onStatusChange('connecting')

    try {
      socket = new WebSocket(url)
    } catch (error) {
      onStatusChange('error')
      onMessageError?.(
        error instanceof Error ? error.message : 'Failed to create WebSocket.',
      )
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      onStatusChange('connected')
    }

    socket.onmessage = (messageEvent) => {
      const payload =
        typeof messageEvent.data === 'string'
          ? messageEvent.data
          : String(messageEvent.data)

      const parsed = parseIncomingEvent(payload)
      if (!parsed) {
        onMessageError?.('Ignored unsupported WebSocket payload.')
        return
      }

      onEvent(parsed)
    }

    socket.onerror = () => {
      onStatusChange('error')
    }

    socket.onclose = () => {
      socket = null
      if (disposed) {
        return
      }

      onStatusChange('disconnected')
      scheduleReconnect()
    }
  }

  return {
    connect,
    disconnect() {
      disposed = true
      clearReconnectTimer()

      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close()
        socket = null
      }
    },
  }
}
