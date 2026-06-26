import {
  LogicalPosition,
  LogicalSize,
  currentMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import './App.css'
import {
  ParticleLayer,
  type ParticleBurst,
  type ParticleKind,
} from './pet/ParticleLayer'
import { PetStage } from './pet/PetStage'
import { SpeechBubble } from './pet/SpeechBubble'
import {
  loadPetLocalSettings,
  savePetLocalSettings,
  type PetLocalSettings,
  type PetScaleOption,
  type PetWindowPosition,
} from './pet/localSettings'
import { loadManifest, type RenderablePetState } from './pet/manifest'
import type { PetManifest } from './pet/manifest'
import { petClickLines, petConfig, petDragLines } from './pet/petConfig'
import {
  resolveReplyDisplayMetrics,
  type ReplyDisplayMode,
} from './pet/replyDisplay'
import {
  createIdleBehaviorPlan,
  randomIdleDelayMs,
  type IdleBehaviorName,
} from './pet/idleBehavior'
import {
  createPetSocketClient,
  PET_SOCKET_URL,
  type PetSocketEvent,
  type SocketConnectionStatus,
} from './pet/socket'
import {
  createIdleControllerState,
  forceIdleTransition,
  reducePetEvent,
  type PetControllerState,
} from './pet/stateMachine'
import runPageLogo from './assets/run-page-logo.jpg'

interface ContextMenuState {
  x: number
  y: number
}

interface StatusNotice {
  title: string
  detail?: string
  tone: 'info' | 'warning' | 'error'
}

interface InteractiveRegionRatio {
  leftRatio: number
  topRatio: number
  widthRatio: number
  heightRatio: number
}

interface WindowLayoutSnapshot {
  x: number
  y: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
}

interface BubblePlacementInfo {
  anchor: 'left' | 'right'
  leftPx: number
  topPx: number
  widthPx: number
  leftSpace: number
  rightSpace: number
}

interface BubbleMeasuredSize {
  mode: ReplyDisplayMode
  width: number
  height: number
}

const CONTEXT_MENU_WIDTH = 184
const CONTEXT_MENU_HEIGHT = 260
const CONTEXT_MENU_MARGIN = 12
const POSITION_SAVE_DEBOUNCE_MS = 220
const INVALID_WINDOW_COORDINATE_THRESHOLD = 10_000

function isPersistableWindowPosition(
  position: PetWindowPosition | null,
): position is PetWindowPosition {
  if (!position) {
    return false
  }

  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Math.abs(position.x) < INVALID_WINDOW_COORDINATE_THRESHOLD &&
    Math.abs(position.y) < INVALID_WINDOW_COORDINATE_THRESHOLD
  )
}

function isReasonableRestorePosition(
  position: PetWindowPosition | null,
  bounds: {
    screenX: number
    screenY: number
    screenWidth: number
    screenHeight: number
    windowWidth: number
    windowHeight: number
  },
) {
  if (!isPersistableWindowPosition(position)) {
    return false
  }

  const minVisibleWidth = Math.min(96, bounds.windowWidth * 0.4)
  const minVisibleHeight = Math.min(96, bounds.windowHeight * 0.4)

  return (
    position.x <= bounds.screenX + bounds.screenWidth - minVisibleWidth &&
    position.x + bounds.windowWidth >= bounds.screenX + minVisibleWidth &&
    position.y <= bounds.screenY + bounds.screenHeight - minVisibleHeight &&
    position.y + bounds.windowHeight >= bounds.screenY + minVisibleHeight
  )
}

function buildAssetNotice(
  assetStatus: string,
  runtimeMessage: string | null,
): StatusNotice | null {
  if (assetStatus === 'Loading manifest...') {
    return {
      title: '正在读取本地资源清单…',
      detail: '桌宠启动时会先检查 manifest.json 和本地素材。',
      tone: 'info',
    }
  }

  if (assetStatus === 'Manifest load failed') {
    if (runtimeMessage?.includes('Manifest request failed: 404')) {
      return {
        title: '未找到本地 manifest.json',
        detail:
          '请先运行 .\\tools\\import_alice_assets.ps1 -SourceDir "你的素材目录"。',
        tone: 'error',
      }
    }

    return {
      title: '资源清单加载失败',
      detail: runtimeMessage ?? '请检查 public/assets/alice/manifest.json 是否存在且格式正确。',
      tone: 'error',
    }
  }

  if (
    assetStatus === 'Idle open texture missing' ||
    assetStatus.startsWith('Asset load failed:')
  ) {
    return {
      title: '本地素材缺失或路径不正确',
      detail:
        '请检查 public/assets/alice/skins/default_black 下必要素材是否存在，必要时重新运行导入脚本。',
      tone: 'error',
    }
  }

  return null
}

function buildSocketNotice(
  manifest: PetManifest | null,
  socketStatus: SocketConnectionStatus,
): StatusNotice | null {
  if (!manifest) {
    return null
  }

  switch (socketStatus) {
    case 'connecting':
      return {
        title: '正在连接 AstrBot bridge…',
        detail: '如果长时间未连接，请确认本机 127.0.0.1:17321 已启动。',
        tone: 'info',
      }
    case 'disconnected':
      return {
        title: 'Bridge 已断开，正在自动重连…',
        detail: '请确认 AstrBot bridge 正在监听 127.0.0.1:17321。',
        tone: 'warning',
      }
    case 'error':
      return {
        title: 'Bridge 连接失败，正在继续重试…',
        detail: '桌宠不会崩溃。请检查 AstrBot bridge 或端口 17321 是否被占用。',
        tone: 'warning',
      }
    case 'connected':
    default:
      return null
  }
}

function clampWindowPosition(
  position: PetWindowPosition,
  bounds: {
    screenX: number
    screenY: number
    screenWidth: number
    screenHeight: number
    windowWidth: number
    windowHeight: number
  },
) {
  const minX = Math.round(bounds.screenX)
  const maxX = Math.round(bounds.screenX + bounds.screenWidth - bounds.windowWidth)
  const minY = Math.round(bounds.screenY)
  const maxY = Math.round(bounds.screenY + bounds.screenHeight - bounds.windowHeight)

  return {
    x: Math.max(minX, Math.min(position.x, maxX)),
    y: Math.max(minY, Math.min(position.y, maxY)),
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function App() {
  const initialSettingsRef = useRef<PetLocalSettings>(loadPetLocalSettings())
  const initialSettings = initialSettingsRef.current

  const [manifest, setManifest] = useState<PetManifest | null>(null)
  const [assetStatus, setAssetStatus] = useState('Loading manifest...')
  const [socketStatus, setSocketStatus] =
    useState<SocketConnectionStatus>('connecting')
  const [controllerState, setControllerState] = useState<PetControllerState | null>(
    null,
  )
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [debugPanelOpen, setDebugPanelOpen] = useState<boolean>(
    initialSettings.debugPanelOpen,
  )
  const [particleEnabled, setParticleEnabled] = useState<boolean>(
    initialSettings.particleEnabled,
  )
  const [uiScale, setUiScale] = useState<PetScaleOption>(initialSettings.scale)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [transientBubble, setTransientBubble] = useState<{
    text: string
    tone: 'reply' | 'error'
  } | null>(null)
  const [interactionVisualState, setInteractionVisualState] =
    useState<RenderablePetState | null>(null)
  const [idleBehaviorName, setIdleBehaviorName] =
    useState<IdleBehaviorName>('none')
  const [lastIdleBehaviorName, setLastIdleBehaviorName] =
    useState<IdleBehaviorName>('none')
  const [idleBehaviorNextLabel, setIdleBehaviorNextLabel] = useState('未调度')
  const [idleScheduleRevision, setIdleScheduleRevision] = useState(0)
  const [particleBursts, setParticleBursts] = useState<ParticleBurst[]>([])
  const [speechBubbleInteractiveRegion, setSpeechBubbleInteractiveRegion] =
    useState<InteractiveRegionRatio | null>(null)
  const [windowLayoutSnapshot, setWindowLayoutSnapshot] =
    useState<WindowLayoutSnapshot | null>(null)
  const [bubbleMeasuredSize, setBubbleMeasuredSize] =
    useState<BubbleMeasuredSize | null>(null)

  const manifestRef = useRef<PetManifest | null>(null)
  const controllerStateRef = useRef<PetControllerState | null>(null)
  const processPetEventRef = useRef<(event: PetSocketEvent) => void>(() => {})
  const settleTimerRef = useRef<number | null>(null)
  const transientBubbleTimerRef = useRef<number | null>(null)
  const interactionStateTimerRef = useRef<number | null>(null)
  const idleActionTimerRef = useRef<number | null>(null)
  const idleBehaviorTimerRef = useRef<number | null>(null)
  const positionPersistTimerRef = useRef<number | null>(null)
  const lastClickAtRef = useRef(0)
  const lastDragEndAtRef = useRef(0)
  const lastSocketTransitionAtRef = useRef(0)
  const lastIdleMurmurAtRef = useRef(0)
  const draggingRef = useRef(false)
  const particleIdRef = useRef(0)
  const uiScaleRef = useRef<PetScaleOption>(initialSettings.scale)
  const savedWindowPositionRef = useRef<PetWindowPosition | null>(
    initialSettings.windowPosition,
  )
  const windowLayoutReadyRef = useRef(false)

  const activeBubble = transientBubble ?? controllerState?.bubble ?? null
  const activeBubbleMetrics = useMemo(
    () =>
      activeBubble
        ? resolveReplyDisplayMetrics(activeBubble.text, petConfig.bubble.thresholds)
        : null,
    [activeBubble],
  )
  const replyDisplayMode =
    activeBubbleMetrics?.mode ??
    (speechBubbleInteractiveRegion ? 'long' : 'short')
  const hasActiveBubble = activeBubble !== null
  const characterAnchorXRatio =
    replyDisplayMode === 'short'
      ? petConfig.layout.spriteAnchorXRatio
      : petConfig.layout.replyExpandedSpriteAnchorXRatio
  const interactionHitbox =
    replyDisplayMode === 'short'
      ? petConfig.interaction.hitbox
      : petConfig.interaction.expandedHitbox
  const interactiveRegions = useMemo(
    () => (speechBubbleInteractiveRegion ? [speechBubbleInteractiveRegion] : []),
    [speechBubbleInteractiveRegion],
  )

  const estimateBubbleWidth = useCallback(
    (mode: ReplyDisplayMode) => {
      const layout = petConfig.bubble.layout
      const desired =
        mode === 'long'
          ? layout.longPanelMaxWidth
          : mode === 'medium'
            ? layout.mediumMaxWidth
            : layout.shortMaxWidth

      return Math.round(desired * uiScale)
    },
    [uiScale],
  )

  const bubblePlacement = useMemo<BubblePlacementInfo | null>(() => {
    if (!activeBubbleMetrics || !windowLayoutSnapshot) {
      return null
    }

    const mode = activeBubbleMetrics.mode
    const layout = petConfig.bubble.layout
    const edgePadding = layout.screenEdgePadding
    const safeMargin = layout.bubbleSafeMargin
    const sideGap = Math.round(layout.sideGap * uiScale)
    const windowWidth = windowLayoutSnapshot.width
    const windowHeight = windowLayoutSnapshot.height
    const hitboxLeft = windowWidth * interactionHitbox.leftRatio
    const hitboxRight =
      windowWidth * (interactionHitbox.leftRatio + interactionHitbox.widthRatio)
    const hitboxTop = windowHeight * interactionHitbox.topRatio
    const leftSpace =
      windowLayoutSnapshot.x +
      hitboxLeft -
      windowLayoutSnapshot.screenX
    const rightSpace =
      windowLayoutSnapshot.screenX +
      windowLayoutSnapshot.screenWidth -
      (windowLayoutSnapshot.x + hitboxRight)
    const measuredWidth =
      bubbleMeasuredSize?.mode === mode ? bubbleMeasuredSize.width : null
    const measuredHeight =
      bubbleMeasuredSize?.mode === mode ? bubbleMeasuredSize.height : null
    const desiredWidth = measuredWidth ?? estimateBubbleWidth(mode)
    const maxWidthWithinWindow = Math.max(
      96,
      windowWidth - edgePadding * 2,
    )
    const widthPx = Math.min(desiredWidth, maxWidthWithinWindow)
    const rightFits = rightSpace >= widthPx + safeMargin
    const leftFits = leftSpace >= widthPx + safeMargin
    let anchor: BubblePlacementInfo['anchor']

    if (mode === 'long') {
      if (leftFits) {
        anchor = 'left'
      } else if (rightFits) {
        anchor = 'right'
      } else {
        anchor = leftSpace >= rightSpace ? 'left' : 'right'
      }
    } else if (rightFits) {
      anchor = 'right'
    } else if (leftFits) {
      anchor = 'left'
    } else {
      anchor = rightSpace >= leftSpace ? 'right' : 'left'
    }

    const unclampedLeft =
      anchor === 'right'
        ? hitboxRight + sideGap
        : hitboxLeft - sideGap - widthPx
    const leftPx = clampNumber(
      Math.round(unclampedLeft),
      edgePadding,
      Math.max(edgePadding, windowWidth - widthPx - edgePadding),
    )
    const offsetY =
      mode === 'long'
        ? layout.longPanelOffsetY
        : mode === 'medium'
          ? layout.mediumOffsetY
          : layout.shortOffsetY
    const estimatedHeight =
      measuredHeight ??
      (mode === 'long'
        ? Math.min(layout.longPanelMaxHeightPx * uiScale, windowHeight * 0.52)
        : mode === 'medium'
          ? 142 * uiScale
          : 76 * uiScale)
    const topPx = clampNumber(
      Math.round(mode === 'short' ? hitboxTop + offsetY * uiScale : offsetY * uiScale),
      edgePadding,
      Math.max(edgePadding, windowHeight - estimatedHeight - edgePadding),
    )

    return {
      anchor,
      leftPx,
      topPx,
      widthPx,
      leftSpace: Math.round(leftSpace),
      rightSpace: Math.round(rightSpace),
    }
  }, [
    activeBubbleMetrics,
    estimateBubbleWidth,
    bubbleMeasuredSize,
    interactionHitbox.leftRatio,
    interactionHitbox.topRatio,
    interactionHitbox.widthRatio,
    uiScale,
    windowLayoutSnapshot,
  ])

  const clearSettleTimer = () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }

  const clearTransientBubbleTimer = () => {
    if (transientBubbleTimerRef.current !== null) {
      window.clearTimeout(transientBubbleTimerRef.current)
      transientBubbleTimerRef.current = null
    }
  }

  const clearInteractionStateTimer = () => {
    if (interactionStateTimerRef.current !== null) {
      window.clearTimeout(interactionStateTimerRef.current)
      interactionStateTimerRef.current = null
    }
  }

  const clearIdleActionTimer = () => {
    if (idleActionTimerRef.current !== null) {
      window.clearTimeout(idleActionTimerRef.current)
      idleActionTimerRef.current = null
    }
  }

  const clearIdleBehaviorTimer = () => {
    if (idleBehaviorTimerRef.current !== null) {
      window.clearTimeout(idleBehaviorTimerRef.current)
      idleBehaviorTimerRef.current = null
    }
  }

  const clearPositionPersistTimer = () => {
    if (positionPersistTimerRef.current !== null) {
      window.clearTimeout(positionPersistTimerRef.current)
      positionPersistTimerRef.current = null
    }
  }

  const persistLocalSettings = useCallback(
    (nextWindowPosition = savedWindowPositionRef.current) => {
      savePetLocalSettings({
        debugPanelOpen,
        particleEnabled,
        scale: uiScale,
        windowPosition: nextWindowPosition,
      })
    },
    [debugPanelOpen, particleEnabled, uiScale],
  )

  const persistWindowPosition = useCallback(
    (position: PetWindowPosition | null) => {
      savedWindowPositionRef.current = position
      persistLocalSettings(position)
    },
    [persistLocalSettings],
  )

  const saveWindowPositionFromPhysical = useCallback(
    async (physicalX: number, physicalY: number) => {
      try {
        const currentWindow = getCurrentWindow()
        const scaleFactor = await currentWindow.scaleFactor()
        const logicalPosition = {
          x: Math.round(physicalX / scaleFactor),
          y: Math.round(physicalY / scaleFactor),
        }

        if (!isPersistableWindowPosition(logicalPosition)) {
          return
        }

        persistWindowPosition(logicalPosition)
      } catch (error) {
        console.warn('Failed to persist window position.', error)
      }
    },
    [persistWindowPosition],
  )

  const refreshWindowLayoutSnapshot = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow()
      const [monitor, windowScaleFactor, outerPosition] = await Promise.all([
        currentMonitor(),
        currentWindow.scaleFactor(),
        currentWindow.outerPosition(),
      ])
      if (!monitor) {
        return
      }

      const monitorScaleFactor = monitor.scaleFactor || windowScaleFactor || 1
      setWindowLayoutSnapshot({
        x: Math.round(outerPosition.x / windowScaleFactor),
        y: Math.round(outerPosition.y / windowScaleFactor),
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight),
        screenX: Math.round(monitor.position.x / monitorScaleFactor),
        screenY: Math.round(monitor.position.y / monitorScaleFactor),
        screenWidth: Math.round(monitor.size.width / monitorScaleFactor),
        screenHeight: Math.round(monitor.size.height / monitorScaleFactor),
      })
    } catch (error) {
      console.warn('Failed to refresh desktop pet window snapshot.', error)
    }
  }, [])

  const persistCurrentWindowPosition = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow()
      const outerPosition = await currentWindow.outerPosition()
      await saveWindowPositionFromPhysical(outerPosition.x, outerPosition.y)
    } catch (error) {
      console.warn('Failed to persist current desktop pet window position.', error)
    }
  }, [saveWindowPositionFromPhysical])

  const applyWindowLayout = useCallback(
    async (
      nextScale: PetScaleOption,
      options?: {
        resetToDefault?: boolean
        replyDisplayMode?: ReplyDisplayMode
        hasBubble?: boolean
      },
    ) => {
      try {
        const monitor = await currentMonitor()
        if (!monitor) {
          return
        }

        const scaleFactor = monitor.scaleFactor || 1
        const screenWidth = monitor.size.width / scaleFactor
        const screenHeight = monitor.size.height / scaleFactor
        const screenX = monitor.position.x / scaleFactor
        const screenY = monitor.position.y / scaleFactor
        const nextHeight = Math.round(
          screenHeight * petConfig.layout.screenHeightRatio * nextScale,
        )
        const compactWidth = Math.round(
          Math.min(
            petConfig.layout.maxWindowWidth * nextScale,
            Math.max(
              petConfig.layout.minWindowWidth * nextScale,
              nextHeight * petConfig.layout.windowWidthRatio,
            ),
          ),
        )
        const replyDisplayMode = options?.replyDisplayMode ?? 'short'
        const hasBubble = options?.hasBubble ?? false
        const nextWidth =
          replyDisplayMode === 'long'
            ? Math.round(
                Math.max(compactWidth, petConfig.layout.longWindowWidth * nextScale),
              )
            : replyDisplayMode === 'medium'
              ? Math.round(
                  Math.max(
                    compactWidth,
                    petConfig.layout.mediumWindowWidth * nextScale,
                  ),
                )
              : hasBubble
                ? Math.round(
                    Math.max(
                      compactWidth,
                      petConfig.layout.shortBubbleWindowWidth * nextScale,
                    ),
                  )
                : compactWidth
        const defaultPosition = {
          x: Math.round(
            screenX + screenWidth - nextWidth - petConfig.layout.rightMargin,
          ),
          y: Math.round(
            screenY + screenHeight - nextHeight - petConfig.layout.bottomMargin,
          ),
        }
        const canRestoreSavedPosition = isReasonableRestorePosition(
          savedWindowPositionRef.current,
          {
            screenX,
            screenY,
            screenWidth,
            screenHeight,
            windowWidth: nextWidth,
            windowHeight: nextHeight,
          },
        )
        const currentWindow = getCurrentWindow()
        let targetPosition: PetWindowPosition

        if (windowLayoutReadyRef.current && !options?.resetToDefault) {
          const [windowScaleFactor, outerPosition, outerSize] = await Promise.all([
            currentWindow.scaleFactor(),
            currentWindow.outerPosition(),
            currentWindow.outerSize(),
          ])
          const logicalX = outerPosition.x / windowScaleFactor
          const logicalY = outerPosition.y / windowScaleFactor
          const logicalWidth = outerSize.width / windowScaleFactor
          const logicalHeight = outerSize.height / windowScaleFactor
          targetPosition = clampWindowPosition(
            {
              x: Math.round(logicalX + logicalWidth - nextWidth),
              y: Math.round(logicalY + logicalHeight - nextHeight),
            },
            {
              screenX,
              screenY,
              screenWidth,
              screenHeight,
              windowWidth: nextWidth,
              windowHeight: nextHeight,
            },
          )
        } else {
          targetPosition =
            options?.resetToDefault || !canRestoreSavedPosition
              ? defaultPosition
              : clampWindowPosition(savedWindowPositionRef.current ?? defaultPosition, {
                  screenX,
                  screenY,
                  screenWidth,
                  screenHeight,
                  windowWidth: nextWidth,
                  windowHeight: nextHeight,
                })
        }

        await currentWindow.setSize(new LogicalSize(nextWidth, nextHeight))
        await currentWindow.setPosition(
          new LogicalPosition(targetPosition.x, targetPosition.y),
        )
        await refreshWindowLayoutSnapshot()

        if (options?.resetToDefault || !canRestoreSavedPosition) {
          persistWindowPosition(targetPosition)
        }
      } catch (error) {
        console.warn('Failed to apply desktop pet window layout.', error)
      }
    },
    [persistWindowPosition, refreshWindowLayoutSnapshot],
  )

  const resetWindowPosition = useCallback(async () => {
    await applyWindowLayout(uiScaleRef.current, { resetToDefault: true })
  }, [applyWindowLayout])

  const cancelIdleBehavior = useCallback(() => {
    clearIdleBehaviorTimer()
    setIdleBehaviorName('none')
    setInteractionVisualState(null)
  }, [])

  const showTransientBubble = useCallback(
    (
      text: string,
      duration: number = petConfig.bubble.interactionDurationMs,
    ) => {
      if (transientBubbleTimerRef.current !== null) {
        window.clearTimeout(transientBubbleTimerRef.current)
        transientBubbleTimerRef.current = null
      }

      setTransientBubble({ text, tone: 'reply' })
      transientBubbleTimerRef.current = window.setTimeout(() => {
        setTransientBubble(null)
        transientBubbleTimerRef.current = null
      }, duration)
    },
    [],
  )

  const spawnParticles = (
    kind: ParticleKind,
    count: number,
    x = window.innerWidth * 0.55,
    y = window.innerHeight * 0.36,
  ) => {
    if (
      !particleEnabled ||
      !petConfig.appearance.enableParticles ||
      !petConfig.appearance.enableStars
    ) {
      return
    }

    const id = particleIdRef.current + 1
    particleIdRef.current = id
    setParticleBursts((current) => [
      ...current,
      {
        id,
        kind,
        count: Math.min(count, petConfig.interaction.maxStarsPerBurst),
        x,
        y,
      },
    ])
    window.setTimeout(() => {
      setParticleBursts((current) => current.filter((burst) => burst.id !== id))
    }, 1300)
  }

  const resetToIdle = () => {
    const nextManifest = manifestRef.current
    if (!nextManifest) {
      return
    }

    clearSettleTimer()
    const transition = forceIdleTransition(nextManifest)
    controllerStateRef.current = transition.nextState
    setControllerState(transition.nextState)
  }

  const commitTransition = (
    transition: ReturnType<typeof forceIdleTransition>,
  ) => {
    controllerStateRef.current = transition.nextState
    setControllerState(transition.nextState)

    clearSettleTimer()
    if (transition.settleAfterMs !== null) {
      settleTimerRef.current = window.setTimeout(() => {
        resetToIdle()
      }, transition.settleAfterMs)
    }
  }

  const processPetEvent = (event: PetSocketEvent) => {
    const nextManifest = manifestRef.current
    const currentController = controllerStateRef.current
    if (!nextManifest || !currentController) {
      return
    }

    setRuntimeMessage(null)
    const transition = reducePetEvent(nextManifest, currentController, event)
    if (!transition) {
      return
    }

    lastSocketTransitionAtRef.current = Date.now()
    cancelIdleBehavior()
    commitTransition(transition)
  }

  useEffect(() => {
    persistLocalSettings()
  }, [persistLocalSettings])

  useEffect(() => {
    manifestRef.current = manifest
  }, [manifest])

  useEffect(() => {
    controllerStateRef.current = controllerState
  }, [controllerState])

  useEffect(() => {
    processPetEventRef.current = processPetEvent
  })

  useEffect(() => {
    uiScaleRef.current = uiScale
  }, [uiScale])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const nextManifest = await loadManifest('/assets/alice/manifest.json')
        if (!mounted) {
          return
        }

        const initialController = createIdleControllerState(nextManifest)
        manifestRef.current = nextManifest
        controllerStateRef.current = initialController
        setManifest(nextManifest)
        setControllerState(initialController)
        setAssetStatus('Manifest loaded. Preparing textures...')
      } catch (loadError) {
        if (!mounted) {
          return
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load manifest.'
        setRuntimeMessage(message)
        setAssetStatus('Manifest load failed')
      }
    }

    bootstrap()

    return () => {
      mounted = false
      clearSettleTimer()
      clearTransientBubbleTimer()
      clearInteractionStateTimer()
      clearIdleActionTimer()
      clearIdleBehaviorTimer()
      clearPositionPersistTimer()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlistenMoved: (() => void) | null = null
    let unlistenResized: (() => void) | null = null

    async function initWindowBehavior() {
      await applyWindowLayout(uiScaleRef.current, {
        resetToDefault: savedWindowPositionRef.current === null,
        replyDisplayMode,
        hasBubble: hasActiveBubble,
      })
      if (cancelled) {
        return
      }

      windowLayoutReadyRef.current = true
      const currentWindow = getCurrentWindow()
      unlistenMoved = await currentWindow.onMoved(({ payload }) => {
        void refreshWindowLayoutSnapshot()
        clearPositionPersistTimer()
        positionPersistTimerRef.current = window.setTimeout(() => {
          void saveWindowPositionFromPhysical(payload.x, payload.y)
        }, POSITION_SAVE_DEBOUNCE_MS)
      })
      unlistenResized = await currentWindow.onResized(() => {
        void refreshWindowLayoutSnapshot()
      })
    }

    void initWindowBehavior()

    return () => {
      cancelled = true
      if (unlistenMoved) {
        unlistenMoved()
      }
      if (unlistenResized) {
        unlistenResized()
      }
      clearPositionPersistTimer()
    }
  }, [
    applyWindowLayout,
    hasActiveBubble,
    refreshWindowLayoutSnapshot,
    replyDisplayMode,
    saveWindowPositionFromPhysical,
  ])

  useEffect(() => {
    if (!windowLayoutReadyRef.current) {
      return
    }

    void applyWindowLayout(uiScale, { replyDisplayMode, hasBubble: hasActiveBubble })
  }, [applyWindowLayout, hasActiveBubble, replyDisplayMode, uiScale])

  useEffect(() => {
    if (!manifest) {
      return
    }

    const client = createPetSocketClient({
      url: PET_SOCKET_URL,
      onEvent: (event) => {
        processPetEventRef.current(event)
      },
      onStatusChange: setSocketStatus,
      onMessageError: setRuntimeMessage,
    })

    client.connect()

    return () => {
      client.disconnect()
    }
  }, [manifest])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.context-menu')) {
        return
      }

      setContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const canRunIdleBehavior = useCallback((ignorePostEventQuiet = false) => {
    const now = Date.now()

    return Boolean(
      manifestRef.current &&
        controllerStateRef.current?.debugState === 'idle' &&
        !controllerStateRef.current?.bubble &&
        !transientBubbleTimerRef.current &&
        !draggingRef.current &&
        idleBehaviorTimerRef.current === null &&
        (ignorePostEventQuiet ||
          now - lastSocketTransitionAtRef.current >= petConfig.idle.postEventQuietMs),
    )
  }, [])

  const triggerIdleBehavior = useCallback(
    (force = false) => {
      const currentManifest = manifestRef.current
      if (!currentManifest || !canRunIdleBehavior(force)) {
        return false
      }

      const now = Date.now()
      const canMurmur =
        now - lastIdleMurmurAtRef.current >= petConfig.idle.murmurCooldownMs
      const plan = createIdleBehaviorPlan(currentManifest, canMurmur)

      clearIdleActionTimer()
      clearInteractionStateTimer()
      clearIdleBehaviorTimer()
      setIdleBehaviorName(plan.name)
      setLastIdleBehaviorName(plan.name)
      console.info('[desktop-pet] idle behavior triggered:', plan.name)

      if (plan.visualState) {
        setInteractionVisualState(plan.visualState)
      }
      if (plan.showStar) {
        spawnParticles('star', 1, window.innerWidth * 0.58, window.innerHeight * 0.32)
      }
      if (plan.murmurText) {
        lastIdleMurmurAtRef.current = now
        showTransientBubble(plan.murmurText, plan.durationMs)
      }

      idleBehaviorTimerRef.current = window.setTimeout(() => {
        setIdleBehaviorName('none')
        setInteractionVisualState(null)
        idleBehaviorTimerRef.current = null
        setIdleScheduleRevision((revision) => revision + 1)
      }, plan.durationMs)

      return true
    },
    [canRunIdleBehavior, showTransientBubble],
  )

  useEffect(() => {
    clearIdleActionTimer()

    if (!manifest || !controllerState || !canRunIdleBehavior()) {
      return
    }

    const nextDelay = randomIdleDelayMs()
    window.setTimeout(() => {
      setIdleBehaviorNextLabel(`${Math.ceil(nextDelay / 1000)} 秒内`)
    }, 0)

    idleActionTimerRef.current = window.setTimeout(() => {
      idleActionTimerRef.current = null
      setIdleBehaviorNextLabel('触发中')
      if (!triggerIdleBehavior()) {
        setIdleScheduleRevision((revision) => revision + 1)
      }
    }, nextDelay)

    return () => {
      clearIdleActionTimer()
    }
  }, [
    canRunIdleBehavior,
    controllerState,
    idleScheduleRevision,
    manifest,
    transientBubble,
    triggerIdleBehavior,
  ])

  const handleSimulateThinking = () => {
    spawnParticles('magic', 3)
    processPetEvent({
      type: 'bot_thinking',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateShortReply = () => {
    spawnParticles('star', 2)
    processPetEvent({
      type: 'assistant_reply',
      text: petConfig.debugSamples.shortReply,
      emotion: 'neutral',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateMediumReply = () => {
    spawnParticles('star', 2)
    processPetEvent({
      type: 'assistant_reply',
      text: petConfig.debugSamples.mediumReply,
      emotion: 'cold_soft',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateLongReply = () => {
    spawnParticles('magic', 1)
    processPetEvent({
      type: 'assistant_reply',
      text: petConfig.debugSamples.longReply,
      emotion: 'gentle',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateVeryLongReply = () => {
    spawnParticles('magic', 2)
    processPetEvent({
      type: 'assistant_reply',
      text: petConfig.debugSamples.veryLongReply,
      emotion: 'thinking',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateError = () => {
    processPetEvent({
      type: 'error',
      message: 'Bridge server reported an error.',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateVisualState = (
    visualState: RenderablePetState,
    text: string,
    particleKind?: ParticleKind,
  ) => {
    cancelIdleBehavior()
    clearInteractionStateTimer()
    setInteractionVisualState(visualState)
    showTransientBubble(text)
    if (particleKind) {
      spawnParticles(particleKind, particleKind === 'magic' ? 2 : 1)
    }
    interactionStateTimerRef.current = window.setTimeout(() => {
      setInteractionVisualState(null)
      interactionStateTimerRef.current = null
    }, petConfig.bubble.interactionDurationMs)
  }

  const handleSimulateIdleBehavior = () => {
    triggerIdleBehavior(true)
  }

  const handlePetHover = (hovered: boolean) => {
    if (hovered && Math.random() > 0.45) {
      spawnParticles('star', Math.random() > 0.5 ? 1 : 2)
    }
  }

  const handlePetClick = () => {
    const now = Date.now()
    if (
      draggingRef.current ||
      now - lastDragEndAtRef.current < 260 ||
      now - lastClickAtRef.current < petConfig.interaction.clickCooldownMs
    ) {
      return
    }

    lastClickAtRef.current = now
    cancelIdleBehavior()
    if (controllerStateRef.current?.debugState === 'speaking') {
      spawnParticles('sparkle', 2, window.innerWidth * 0.62, window.innerHeight * 0.3)
      return
    }

    const text = petClickLines[Math.floor(Math.random() * petClickLines.length)]
    const clickStates: RenderablePetState[] = [
      'calm_alt',
      'side_glance',
      'hand_mouth',
      'hand_mouth_alt',
    ]
    clearInteractionStateTimer()
    setInteractionVisualState(
      clickStates[Math.floor(Math.random() * clickStates.length)],
    )
    showTransientBubble(text)
    spawnParticles(
      Math.random() > 0.55 ? 'star' : 'sparkle',
      Math.random() > 0.5 ? 1 : 2,
      window.innerWidth * 0.62,
      window.innerHeight * 0.3,
    )
    interactionStateTimerRef.current = window.setTimeout(() => {
      setInteractionVisualState(null)
      interactionStateTimerRef.current = null
    }, petConfig.bubble.interactionDurationMs)
  }

  const handlePetDragStart = () => {
    draggingRef.current = true
    cancelIdleBehavior()
    clearInteractionStateTimer()
    const dragStates: RenderablePetState[] = [
      'cold',
      'cold_alt',
      'hand_mouth',
      'hand_mouth_alt',
      'bow',
    ]
    setInteractionVisualState(
      dragStates[Math.floor(Math.random() * dragStates.length)],
    )
    const text = petDragLines[Math.floor(Math.random() * petDragLines.length)]
    showTransientBubble(text, 1500)
    spawnParticles('sparkle', 2, window.innerWidth * 0.58, window.innerHeight * 0.34)
  }

  const handlePetDragEnd = () => {
    draggingRef.current = false
    lastDragEndAtRef.current = Date.now()
    void persistCurrentWindowPosition()
    const minDelay = petConfig.interaction.dragSettleMinMs
    const maxDelay = petConfig.interaction.dragSettleMaxMs
    const settleDelay = minDelay + Math.random() * (maxDelay - minDelay)

    clearInteractionStateTimer()
    interactionStateTimerRef.current = window.setTimeout(() => {
      setInteractionVisualState(null)
      if (controllerStateRef.current?.debugState === 'idle') {
        resetToIdle()
      }
      spawnParticles('star', 1, window.innerWidth * 0.6, window.innerHeight * 0.32)
      interactionStateTimerRef.current = null
    }, settleDelay)
  }

  const openContextMenu = (x: number, y: number) => {
    const nextX = Math.max(
      CONTEXT_MENU_MARGIN,
      Math.min(
        x,
        window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN,
      ),
    )
    const nextY = Math.max(
      CONTEXT_MENU_MARGIN,
      Math.min(
        y,
        window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN,
      ),
    )

    setContextMenu({ x: nextX, y: nextY })
  }

  const handleToggleDebug = () => {
    setDebugPanelOpen((current) => !current)
    setContextMenu(null)
  }

  const handleScaleChange = (nextScale: PetScaleOption) => {
    setUiScale(nextScale)
    setContextMenu(null)
  }

  const handleToggleParticles = () => {
    setParticleEnabled((current) => !current)
    setParticleBursts([])
    setContextMenu(null)
  }

  const handleResetPosition = async () => {
    await resetWindowPosition()
    setContextMenu(null)
  }

  const handleExitApp = async () => {
    setContextMenu(null)
    try {
      await getCurrentWindow().close()
    } catch (error) {
      console.warn('Failed to close desktop pet window.', error)
    }
  }

  const debugStateLabelMap: Record<string, string> = {
    idle: '待机',
    thinking: '思考中',
    speaking: '回复中',
    soft_idle: '柔和待机',
    shy: '害羞',
    attention: '注意',
    magic: '魔术',
    annoyed: '不悦',
    cold: '冷淡',
    sleepy: '困倦',
    hand_mouth: '掩口',
    error: '错误',
  }

  const socketStatusLabelMap: Record<SocketConnectionStatus, string> = {
    connecting: '连接中',
    connected: '已连接',
    disconnected: '已断开',
    error: '连接错误',
  }

  const assetStatusLabel = assetStatus
    .replace('Loading manifest...', '正在读取资源清单...')
    .replace('Manifest loaded. Preparing textures...', '资源清单已加载，正在准备贴图...')
    .replace('Manifest load failed', '资源清单加载失败')
    .replace('Loading textures...', '正在加载贴图...')
    .replace('Idle open texture missing', '缺少待机睁眼贴图')
    .replace(/^Loaded (\d+) textures$/, '已加载 $1 张贴图')
    .replace(/^Asset load failed: /, '贴图加载失败：')

  const assetNotice = buildAssetNotice(assetStatus, runtimeMessage)
  const socketNotice = buildSocketNotice(manifest, socketStatus)
  const loadingNotice = !manifest ? assetNotice : null
  const floatingNotice = manifest ? assetNotice ?? socketNotice : null
  const loadingStatusTitle = loadingNotice?.title ?? '正在等待资源清单…'
  const loadingStatusDetail =
    loadingNotice?.detail ?? '桌宠会在本地素材和 AstrBot bridge 就绪后自动进入运行状态。'

  return (
    <main
      className={`app-shell${debugPanelOpen ? ' app-shell--debug-bounds' : ''}`}
      style={
        {
          '--bubble-max-width': `${petConfig.bubble.layout.shortMaxWidth * uiScale}px`,
          '--bubble-medium-max-width': `${petConfig.bubble.layout.mediumMaxWidth * uiScale}px`,
          '--reply-panel-width': `${petConfig.bubble.layout.longPanelMaxWidth * uiScale}px`,
          '--reply-panel-min-width': `${petConfig.bubble.layout.longPanelMinWidth * uiScale}px`,
          '--reply-panel-max-height': `min(${petConfig.bubble.layout.longPanelMaxHeightVh}vh, ${
            petConfig.bubble.layout.longPanelMaxHeightPx * uiScale
          }px)`,
        '--ui-scale': `${uiScale}`,
        } as CSSProperties
      }
    >
      {debugPanelOpen ? (
        <div className="debug-panel">
          <div className="debug-panel__header">
            <strong>桌宠调试</strong>
            <button
              type="button"
              className="debug-panel__toggle"
              onClick={() => setDebugPanelOpen(false)}
            >
              收起
            </button>
          </div>

          <p>
            <span className="label">状态</span>
            <span className="value">
              {debugStateLabelMap[controllerState?.debugState ?? 'idle'] ?? '待机'}
            </span>
          </p>
          <p>
            <span className="label">资源</span>
            <span className="value">{assetStatusLabel}</span>
          </p>
          <p>
            <span className="label">连接</span>
            <span className="value">{socketStatusLabelMap[socketStatus]}</span>
          </p>
          <p>
            <span className="label">待机</span>
            <span className="value">idle behavior: {idleBehaviorName}</span>
          </p>
          <p>
            <span className="label">上次</span>
            <span className="value">{lastIdleBehaviorName}</span>
          </p>
          <p>
            <span className="label">下次</span>
            <span className="value">{idleBehaviorNextLabel}</span>
          </p>
          <p>
            <span className="label">缩放</span>
            <span className="value">{Math.round(uiScale * 100)}%</span>
          </p>
          <p>
            <span className="label">粒子</span>
            <span className="value">{particleEnabled ? '开启' : '关闭'}</span>
          </p>
          <p>
            <span className="label">气泡</span>
            <span className="value">
              {bubblePlacement
                ? `${bubblePlacement.anchor} L:${bubblePlacement.leftSpace} R:${bubblePlacement.rightSpace}`
                : '无'}
            </span>
          </p>
          <p className="hint">左键互动，拖拽移动，右键打开日常菜单。</p>

          <div className="debug-actions">
            <button type="button" onClick={handleSimulateThinking}>
              模拟思考
            </button>
            <button type="button" onClick={handleSimulateShortReply}>
              Simulate short reply
            </button>
            <button type="button" onClick={handleSimulateMediumReply}>
              Simulate medium reply
            </button>
            <button type="button" onClick={handleSimulateLongReply}>
              Simulate long reply
            </button>
            <button type="button" onClick={handleSimulateVeryLongReply}>
              Simulate very long reply
            </button>
            <button
              type="button"
              onClick={() =>
                handleSimulateVisualState(
                  'soft_idle',
                  petConfig.debugSamples.softIdle,
                  'star',
                )
              }
            >
              Simulate soft_idle
            </button>
            <button
              type="button"
              onClick={() =>
                handleSimulateVisualState('shy', petConfig.debugSamples.shy)
              }
            >
              Simulate shy
            </button>
            <button
              type="button"
              onClick={() =>
                handleSimulateVisualState(
                  'attention',
                  petConfig.debugSamples.attention,
                )
              }
            >
              Simulate attention
            </button>
            <button
              type="button"
              onClick={() =>
                handleSimulateVisualState(
                  'magic',
                  petConfig.debugSamples.magic,
                  'magic',
                )
              }
            >
              Simulate magic
            </button>
            <button
              type="button"
              onClick={() =>
                handleSimulateVisualState(
                  'annoyed',
                  petConfig.debugSamples.annoyed,
                )
              }
            >
              Simulate annoyed
            </button>
            <button type="button" onClick={handleSimulateError}>
              模拟错误
            </button>
            <button type="button" onClick={resetToIdle}>
              回到待机
            </button>
            <button type="button" onClick={handleSimulateIdleBehavior}>
              模拟待机动作
            </button>
          </div>

          {runtimeMessage ? <p className="error">{runtimeMessage}</p> : null}
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="context-menu"
          style={
            {
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            } as CSSProperties
          }
        >
          <button type="button" className="context-menu__item" onClick={handleToggleDebug}>
            {debugPanelOpen ? '隐藏 debug' : '显示 debug'}
          </button>
          <button type="button" className="context-menu__item" onClick={handleResetPosition}>
            重置位置
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={() => handleScaleChange(0.8)}
          >
            缩放 80%
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={() => handleScaleChange(1)}
          >
            缩放 100%
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={() => handleScaleChange(1.2)}
          >
            缩放 120%
          </button>
          <button type="button" className="context-menu__item" onClick={handleToggleParticles}>
            粒子{particleEnabled ? '关' : '开'}
          </button>
          <button
            type="button"
            className="context-menu__item context-menu__item--danger"
            onClick={handleExitApp}
          >
            退出
          </button>
        </div>
      ) : null}

      <section className="pet-shell">
        {manifest && controllerState ? (
          <>
            <ParticleLayer
              bursts={particleBursts}
              enabled={particleEnabled}
              scale={uiScale}
            />
            <SpeechBubble
              bubble={activeBubble}
              metrics={activeBubbleMetrics}
              scale={uiScale}
              debugVisible={debugPanelOpen}
              placement={bubblePlacement}
              onMeasuredSizeChange={setBubbleMeasuredSize}
              onInteractiveRegionChange={setSpeechBubbleInteractiveRegion}
            />
            <PetStage
              manifest={manifest}
              state={interactionVisualState ?? controllerState.visualState}
              scale={uiScale}
              characterAnchorXRatio={characterAnchorXRatio}
              interactionHitbox={interactionHitbox}
              interactiveRegions={interactiveRegions}
              idleBehavior={idleBehaviorName}
              overlayInteractive={debugPanelOpen || contextMenu !== null}
              showInteractionBounds={debugPanelOpen}
              onAssetStatusChange={setAssetStatus}
              onPetHoverChange={handlePetHover}
              onPetClick={handlePetClick}
              onPetDragStart={handlePetDragStart}
              onPetDragEnd={handlePetDragEnd}
              onPetContextMenu={openContextMenu}
              onStateParticle={(kind) => {
                if (!particleEnabled) {
                  return
                }

                spawnParticles(kind, kind === 'magic' ? 2 : 1)
              }}
            />
            {floatingNotice ? (
              <div
                className={`status-banner status-banner--${floatingNotice.tone}`}
              >
                <strong>{floatingNotice.title}</strong>
                {floatingNotice.detail ? <span>{floatingNotice.detail}</span> : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="loading-screen">
            <div
              className={`loading-copy${loadingNotice ? ' loading-copy--panel' : ''}`}
            >
              <div className="loading-brand">
                <div className="loading-brand__media">
                  <img src={runPageLogo} alt="Yuzhu desktop pet logo" />
                </div>
                <div className="loading-brand__copy">
                  <span className="loading-brand__eyebrow">Yuzhu Desktop Pet</span>
                  <strong>本地运行中</strong>
                  <p>桌宠、素材清单与 AstrBot bridge 正在对齐启动状态。</p>
                </div>
              </div>

              <div className="loading-status-card">
                <strong>{loadingStatusTitle}</strong>
                <span>{loadingStatusDetail}</span>
                <div className="loading-status-meta">
                  <span>资源：{assetStatusLabel}</span>
                  <span>连接：{socketStatusLabelMap[socketStatus]}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
