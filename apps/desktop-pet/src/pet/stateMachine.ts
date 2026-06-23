import type { PetManifest, RenderablePetState } from './manifest'
import type { PetSocketEvent } from './socket'

export interface SpeechBubbleState {
  text: string
  tone: 'reply' | 'error'
}

export interface PetControllerState {
  debugState: RenderablePetState
  visualState: RenderablePetState
  bubble: SpeechBubbleState | null
  activePriority: number
}

export interface PetControllerTransition {
  nextState: PetControllerState
  settleAfterMs: number | null
}

const PRIORITY_IDLE = 1
const PRIORITY_THINKING = 2
const PRIORITY_SPEAKING = 3
const PRIORITY_ERROR = 4

function normalizeText(text: string | undefined, fallback: string) {
  const normalized = text?.trim()
  return normalized && normalized.length > 0 ? normalized : fallback
}

function resolveEmotionState(emotion: string | undefined): RenderablePetState {
  switch (emotion ?? 'neutral') {
    case 'cold':
      return 'cold'
    case 'cold_soft':
      return 'soft_idle'
    case 'gentle':
      return 'soft_idle'
    case 'sleepy':
      return 'sleepy'
    case 'thinking':
      return Math.random() > 0.52 ? 'magic' : 'thinking'
    case 'embarrassed':
      return 'shy'
    case 'surprised':
      return 'attention'
    case 'error':
      return 'error'
    case 'neutral':
    default:
      return 'idle'
  }
}

export function getReplyBubbleDuration(text: string) {
  const duration = 1800 + Array.from(text).length * 120
  return Math.min(12000, Math.max(2500, duration))
}

export function createIdleControllerState(_manifest: PetManifest): PetControllerState {
  return {
    debugState: 'idle',
    visualState: 'idle',
    bubble: null,
    activePriority: PRIORITY_IDLE,
  }
}

function createThinkingState(_manifest: PetManifest): PetControllerState {
  return {
    debugState: 'thinking',
    visualState: resolveEmotionState('thinking'),
    bubble: null,
    activePriority: PRIORITY_THINKING,
  }
}

function createReplyState(
  _manifest: PetManifest,
  text: string,
  emotion: string | undefined,
): PetControllerState {
  const visualState = resolveEmotionState(emotion)

  return {
    debugState: 'speaking',
    visualState,
    bubble: {
      text: normalizeText(text, '...'),
      tone: 'reply',
    },
    activePriority: PRIORITY_SPEAKING,
  }
}

function createErrorState(_manifest: PetManifest, message: string): PetControllerState {
  return {
    debugState: 'error',
    visualState: resolveEmotionState('error'),
    bubble: {
      text: normalizeText(message, 'error'),
      tone: 'error',
    },
    activePriority: PRIORITY_ERROR,
  }
}

export function forceIdleTransition(manifest: PetManifest): PetControllerTransition {
  return {
    nextState: createIdleControllerState(manifest),
    settleAfterMs: null,
  }
}

export function reducePetEvent(
  manifest: PetManifest,
  currentState: PetControllerState,
  event: PetSocketEvent,
): PetControllerTransition | null {
  switch (event.type) {
    case 'assistant_reply':
      if (currentState.activePriority >= PRIORITY_ERROR) {
        return null
      }

      return {
        nextState: createReplyState(manifest, event.text, event.emotion),
        settleAfterMs: getReplyBubbleDuration(event.text),
      }

    case 'bot_thinking':
      if (currentState.activePriority >= PRIORITY_SPEAKING) {
        return null
      }

      return {
        nextState: createThinkingState(manifest),
        settleAfterMs: null,
      }

    case 'error':
      return {
        nextState: createErrorState(manifest, event.message),
        settleAfterMs: 3000,
      }

    case 'idle':
      if (currentState.activePriority >= PRIORITY_SPEAKING) {
        return null
      }

      return forceIdleTransition(manifest)

    default:
      return null
  }
}
