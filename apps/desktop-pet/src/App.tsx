import {
  LogicalPosition,
  LogicalSize,
  currentMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import {
  ParticleLayer,
  type ParticleBurst,
  type ParticleKind,
} from './pet/ParticleLayer'
import { PetStage } from './pet/PetStage'
import { SpeechBubble } from './pet/SpeechBubble'
import { loadManifest, type RenderablePetState } from './pet/manifest'
import type { PetManifest } from './pet/manifest'
import {
  petClickLines,
  petConfig,
  petDragLines,
} from './pet/petConfig'
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

function App() {
  const [manifest, setManifest] = useState<PetManifest | null>(null)
  const [assetStatus, setAssetStatus] = useState('Loading manifest...')
  const [socketStatus, setSocketStatus] =
    useState<SocketConnectionStatus>('connecting')
  const [controllerState, setControllerState] = useState<PetControllerState | null>(
    null,
  )
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [debugPanelOpen, setDebugPanelOpen] = useState<boolean>(
    petConfig.debug.showPanelByDefault,
  )
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

  const manifestRef = useRef<PetManifest | null>(null)
  const controllerStateRef = useRef<PetControllerState | null>(null)
  const processPetEventRef = useRef<(event: PetSocketEvent) => void>(() => {})
  const settleTimerRef = useRef<number | null>(null)
  const transientBubbleTimerRef = useRef<number | null>(null)
  const interactionStateTimerRef = useRef<number | null>(null)
  const idleActionTimerRef = useRef<number | null>(null)
  const idleBehaviorTimerRef = useRef<number | null>(null)
  const lastClickAtRef = useRef(0)
  const lastDragEndAtRef = useRef(0)
  const lastSocketTransitionAtRef = useRef(0)
  const lastIdleMurmurAtRef = useRef(0)
  const draggingRef = useRef(false)
  const particleIdRef = useRef(0)

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

  const cancelIdleBehavior = useCallback(() => {
    clearIdleBehaviorTimer()
    setIdleBehaviorName('none')
    setInteractionVisualState(null)
  }, [])

  const showTransientBubble = useCallback((
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
  }, [])

  const spawnParticles = (
    kind: ParticleKind,
    count: number,
    x = window.innerWidth * 0.55,
    y = window.innerHeight * 0.36,
  ) => {
    if (!petConfig.appearance.enableParticles || !petConfig.appearance.enableStars) {
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

  const dockWindowToBottomRight = async () => {
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
      const nextHeight = Math.round(screenHeight * petConfig.layout.screenHeightRatio)
      const nextWidth = Math.round(
        Math.max(
          petConfig.layout.fallbackWindowWidth,
          Math.min(320, nextHeight * 0.78),
        ),
      )
      const nextX = Math.round(screenX + screenWidth - nextWidth - petConfig.layout.rightMargin)
      const nextY = Math.round(screenY + screenHeight - nextHeight - petConfig.layout.bottomMargin)
      const currentWindow = getCurrentWindow()

      await currentWindow.setSize(new LogicalSize(nextWidth, nextHeight))
      await currentWindow.setPosition(new LogicalPosition(nextX, nextY))
    } catch (error) {
      console.warn('Failed to dock pet window.', error)
    }
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
    manifestRef.current = manifest
  }, [manifest])

  useEffect(() => {
    controllerStateRef.current = controllerState
  }, [controllerState])

  useEffect(() => {
    processPetEventRef.current = processPetEvent
  })

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
    }
  }, [])

  useEffect(() => {
    dockWindowToBottomRight()
  }, [])

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

  const handleSimulateNeutralReply = () => {
    spawnParticles('star', 2)
    processPetEvent({
      type: 'assistant_reply',
      text: '欢迎回来。今天看起来还算顺利。',
      emotion: 'neutral',
      source: 'debug',
      session_id: 'default',
      timestamp: Date.now(),
    })
  }

  const handleSimulateColdReply = () => {
    spawnParticles('sparkle', 2)
    processPetEvent({
      type: 'assistant_reply',
      text: '……你今天回来得很晚。',
      emotion: 'cold',
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

  return (
    <main
      className="app-shell"
      style={
        {
          '--bubble-max-width': `${petConfig.bubble.maxWidth}px`,
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
          <p className="hint">按住角色区域可拖动窗口。</p>

          <div className="debug-actions">
            <button type="button" onClick={handleSimulateThinking}>
              模拟思考
            </button>
            <button type="button" onClick={handleSimulateNeutralReply}>
              模拟普通回复
            </button>
            <button type="button" onClick={handleSimulateColdReply}>
              模拟冷淡回复
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
      ) : (
        <button
          type="button"
          className="debug-collapsed"
          onClick={() => setDebugPanelOpen(true)}
          title={`连接状态：${socketStatusLabelMap[socketStatus]}`}
        >
          <span className={`connection-dot connection-dot--${socketStatus}`} />
          <span className="debug-collapsed__text">调试</span>
        </button>
      )}

      <section className="pet-shell">
        {manifest && controllerState ? (
          <>
            <ParticleLayer bursts={particleBursts} />
            <SpeechBubble bubble={transientBubble ?? controllerState.bubble} />
            <PetStage
              manifest={manifest}
              state={interactionVisualState ?? controllerState.visualState}
              idleBehavior={idleBehaviorName}
              onAssetStatusChange={setAssetStatus}
              onPetHoverChange={handlePetHover}
              onPetClick={handlePetClick}
              onPetDragStart={handlePetDragStart}
              onPetDragEnd={handlePetDragEnd}
              onStateParticle={(kind) => spawnParticles(kind, kind === 'magic' ? 2 : 1)}
            />
          </>
        ) : (
          <div className="loading-copy">正在等待资源清单...</div>
        )}
      </section>
    </main>
  )
}

export default App
