import { getCurrentWindow } from '@tauri-apps/api/window'
import { Application, Assets, Sprite, type Texture } from 'pixi.js'
import { useEffect, useRef } from 'react'
import type { ParticleKind } from './ParticleLayer'
import { resolveManifestState, resolveSkin } from './manifest'
import type { PetManifest, RenderablePetState, SpriteFrameSet } from './manifest'
import { petConfig } from './petConfig'
import type { IdleBehaviorName } from './idleBehavior'

interface PetStageProps {
  manifest: PetManifest
  state: RenderablePetState
  onAssetStatusChange: (status: string) => void
  onPetHoverChange?: (hovered: boolean) => void
  onPetClick?: () => void
  onPetDragStart?: () => void
  onPetDragEnd?: () => void
  onStateParticle?: (kind: ParticleKind) => void
  idleBehavior?: IdleBehaviorName
}

type TextureMap = Record<string, Texture>

const MAX_RENDER_RESOLUTION = 2
const STATE_FADE_MS = 170

function texturePath(frame: string) {
  return `/assets/alice/${frame}`
}

function resolveTextureForState(textures: TextureMap, state: RenderablePetState) {
  return (
    textures[`${state}:main`] ??
    textures[`${state}:open`] ??
    textures['idle:open'] ??
    null
  )
}

function getRenderResolution() {
  return Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION)
}

function tuneTextureForDownscaling(texture: Texture) {
  texture.source.scaleMode = 'linear'
  texture.source.mipmapFilter = 'linear'
  texture.source.updateMipmaps()
}

function mixTint(from: number, to: number, amount: number) {
  const clamped = Math.max(0, Math.min(1, amount))
  const fromR = (from >> 16) & 0xff
  const fromG = (from >> 8) & 0xff
  const fromB = from & 0xff
  const toR = (to >> 16) & 0xff
  const toG = (to >> 8) & 0xff
  const toB = to & 0xff
  const r = Math.round(fromR + (toR - fromR) * clamped)
  const g = Math.round(fromG + (toG - fromG) * clamped)
  const b = Math.round(fromB + (toB - fromB) * clamped)

  return (r << 16) | (g << 8) | b
}

async function loadTextureSet(states: Record<string, SpriteFrameSet>) {
  const textures: TextureMap = {}
  let loadedCount = 0

  for (const [stateKey, frameSet] of Object.entries(states)) {
    if (frameSet.open) {
      textures[`${stateKey}:open`] = await Assets.load(texturePath(frameSet.open))
      tuneTextureForDownscaling(textures[`${stateKey}:open`])
      loadedCount += 1
    }
    if (frameSet.closed) {
      textures[`${stateKey}:closed`] = await Assets.load(texturePath(frameSet.closed))
      tuneTextureForDownscaling(textures[`${stateKey}:closed`])
      loadedCount += 1
    }
    if (frameSet.main) {
      textures[`${stateKey}:main`] = await Assets.load(texturePath(frameSet.main))
      tuneTextureForDownscaling(textures[`${stateKey}:main`])
      loadedCount += 1
    }
  }

  return { loadedCount, textures }
}

export function PetStage({
  manifest,
  state,
  onAssetStatusChange,
  onPetHoverChange,
  onPetClick,
  onPetDragStart,
  onPetDragEnd,
  onStateParticle,
  idleBehavior = 'none',
}: PetStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const spriteRef = useRef<Sprite | null>(null)
  const shadowSpriteRef = useRef<Sprite | null>(null)
  const glowSpriteRef = useRef<Sprite | null>(null)
  const texturesRef = useRef<TextureMap | null>(null)
  const desiredStateRef = useRef<RenderablePetState>(state)
  const idleBehaviorRef = useRef<IdleBehaviorName>(idleBehavior)
  const hoveredRef = useRef(false)
  const hoverAmountRef = useRef(0)
  const transitionStartRef = useRef(0)
  const thinkingParticleMsRef = useRef(0)
  const onPetHoverChangeRef = useRef(onPetHoverChange)
  const onPetClickRef = useRef(onPetClick)
  const onPetDragStartRef = useRef(onPetDragStart)
  const onPetDragEndRef = useRef(onPetDragEnd)
  const onStateParticleRef = useRef(onStateParticle)
  const blinkOpenTimerRef = useRef<number | null>(null)
  const blinkScheduleTimerRef = useRef<number | null>(null)

  const clearBlinkTimers = () => {
    if (blinkOpenTimerRef.current !== null) {
      window.clearTimeout(blinkOpenTimerRef.current)
      blinkOpenTimerRef.current = null
    }
    if (blinkScheduleTimerRef.current !== null) {
      window.clearTimeout(blinkScheduleTimerRef.current)
      blinkScheduleTimerRef.current = null
    }
  }

  useEffect(() => {
    onPetHoverChangeRef.current = onPetHoverChange
    onPetClickRef.current = onPetClick
    onPetDragStartRef.current = onPetDragStart
    onPetDragEndRef.current = onPetDragEnd
    onStateParticleRef.current = onStateParticle
  })

  useEffect(() => {
    desiredStateRef.current = state
    idleBehaviorRef.current = idleBehavior

    const textures = texturesRef.current
    const sprite = spriteRef.current
    const shadowSprite = shadowSpriteRef.current
    const glowSprite = glowSpriteRef.current
    if (!textures || !sprite) {
      return
    }

    const nextTexture = resolveTextureForState(textures, state)
    if (nextTexture) {
      sprite.texture = nextTexture
      if (shadowSprite) {
        shadowSprite.texture = nextTexture
      }
      if (glowSprite) {
        glowSprite.texture = nextTexture
      }
      transitionStartRef.current = performance.now()
    }

    if (state !== 'idle') {
      clearBlinkTimers()
      return
    }

    const closedTexture = textures['idle:closed']
    const openTexture = textures['idle:open']
    if (!closedTexture || !openTexture) {
      clearBlinkTimers()
      return
    }

    clearBlinkTimers()

    if (idleBehavior === 'long_blink') {
      sprite.texture = closedTexture
      if (shadowSprite) {
        shadowSprite.texture = closedTexture
      }
      if (glowSprite) {
        glowSprite.texture = closedTexture
      }
      return
    }

    const scheduleBlink = () => {
      const latestSprite = spriteRef.current
      const latestTextures = texturesRef.current
      if (
          desiredStateRef.current !== 'idle' ||
          idleBehaviorRef.current === 'long_blink' ||
          !latestSprite ||
        !latestTextures?.['idle:open'] ||
        !latestTextures['idle:closed']
      ) {
        return
      }

      const nextBlinkDelay = 4000 + Math.random() * 4000
      blinkScheduleTimerRef.current = window.setTimeout(() => {
        const blinkSprite = spriteRef.current
        const blinkTextures = texturesRef.current
        if (
          desiredStateRef.current !== 'idle' ||
          idleBehaviorRef.current === 'long_blink' ||
          !blinkSprite ||
          !blinkTextures?.['idle:open'] ||
          !blinkTextures['idle:closed']
        ) {
          return
        }

        blinkSprite.texture = blinkTextures['idle:closed']

        const closeDuration = 100 + Math.random() * 80
        blinkOpenTimerRef.current = window.setTimeout(() => {
          const reopenSprite = spriteRef.current
          const reopenTextures = texturesRef.current
          if (
            desiredStateRef.current !== 'idle' ||
            idleBehaviorRef.current === 'long_blink' ||
            !reopenSprite ||
            !reopenTextures?.['idle:open']
          ) {
            return
          }

          reopenSprite.texture = reopenTextures['idle:open']
          scheduleBlink()
        }, closeDuration)
      }, nextBlinkDelay)
    }

    scheduleBlink()

    return () => {
      clearBlinkTimers()
    }
  }, [idleBehavior, state])

  useEffect(() => {
    const currentHost = hostRef.current
    if (!(currentHost instanceof HTMLDivElement)) {
      return
    }

    const stageHost = currentHost
    const skin = resolveSkin(manifest)
    const idleState = skin.states.idle
    if (!idleState?.open) {
      onAssetStatusChange('Idle open texture missing')
      return
    }

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let cleanupCanvasEvents = () => {}

    const applyLayerTexture = (texture: Texture) => {
      const sprite = spriteRef.current
      if (sprite) {
        sprite.texture = texture
      }
      if (shadowSpriteRef.current) {
        shadowSpriteRef.current.texture = texture
      }
      if (glowSpriteRef.current) {
        glowSpriteRef.current.texture = texture
      }
    }

    const resizeSprite = () => {
      const sprite = spriteRef.current
      const shadowSprite = shadowSpriteRef.current
      const glowSprite = glowSpriteRef.current
      if (!sprite) {
        return
      }

      const maxHeightScale =
        (stageHost.clientHeight * petConfig.layout.spriteHeightRatio) /
        sprite.texture.height
      const configuredScale = petConfig.appearance.defaultScale || manifest.default_scale
      const renderScale = Math.min(configuredScale, maxHeightScale)

      for (const layer of [shadowSprite, glowSprite, sprite]) {
        if (!layer) {
          continue
        }

        layer.anchor.set(manifest.anchor.x, manifest.anchor.y)
        layer.x = stageHost.clientWidth * petConfig.layout.spriteAnchorXRatio
        layer.y = stageHost.clientHeight - petConfig.layout.spriteBaselineOffset
        layer.scale.set(renderScale)
      }
    }

    async function mount() {
      try {
        onAssetStatusChange('Loading textures...')

        const nextApp = new Application()
        await nextApp.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          resolution: getRenderResolution(),
          resizeTo: stageHost,
        })

        const { loadedCount, textures } = await loadTextureSet(skin.states)
        if (disposed) {
          nextApp.destroy(true, { children: true })
          return
        }

        appRef.current = nextApp
        texturesRef.current = textures
        stageHost.replaceChildren(nextApp.canvas)
        nextApp.canvas.setAttribute('data-tauri-drag-region', 'true')
        nextApp.canvas.style.width = '100%'
        nextApp.canvas.style.height = '100%'
        nextApp.canvas.style.touchAction = 'none'
        nextApp.canvas.style.cursor = 'grab'

        let dragStarted = false
        const handlePointerEnter = () => {
          hoveredRef.current = true
          onPetHoverChangeRef.current?.(true)
        }
        const handlePointerLeave = () => {
          hoveredRef.current = false
          onPetHoverChangeRef.current?.(false)
        }
        const handlePointerDown = (event: PointerEvent) => {
          if (event.button !== 0) {
            return
          }

          dragStarted = true
          onPetDragStartRef.current?.()
          getCurrentWindow().startDragging().catch((error: unknown) => {
            console.warn('Failed to start window dragging.', error)
          })
        }
        const handlePointerUp = () => {
          if (!dragStarted) {
            return
          }

          dragStarted = false
          onPetDragEndRef.current?.()
        }
        const handleClick = () => {
          onPetClickRef.current?.()
        }

        nextApp.canvas.addEventListener('pointerenter', handlePointerEnter)
        nextApp.canvas.addEventListener('pointerleave', handlePointerLeave)
        nextApp.canvas.addEventListener('pointerdown', handlePointerDown)
        nextApp.canvas.addEventListener('click', handleClick)
        window.addEventListener('pointerup', handlePointerUp)
        cleanupCanvasEvents = () => {
          nextApp.canvas.removeEventListener('pointerenter', handlePointerEnter)
          nextApp.canvas.removeEventListener('pointerleave', handlePointerLeave)
          nextApp.canvas.removeEventListener('pointerdown', handlePointerDown)
          nextApp.canvas.removeEventListener('click', handleClick)
          window.removeEventListener('pointerup', handlePointerUp)
        }

        const shadowSprite = new Sprite(textures['idle:open'])
        const glowSprite = new Sprite(textures['idle:open'])
        const sprite = new Sprite(textures['idle:open'])

        shadowSprite.tint = 0x101018
        shadowSprite.alpha = petConfig.appearance.enableSoftShadow ? 0.28 : 0
        glowSprite.tint = 0xdcc8ff
        glowSprite.alpha = petConfig.appearance.enableSoftShadow ? 0.16 : 0

        shadowSpriteRef.current = shadowSprite
        glowSpriteRef.current = glowSprite
        spriteRef.current = sprite
        nextApp.stage.addChild(shadowSprite)
        nextApp.stage.addChild(glowSprite)
        nextApp.stage.addChild(sprite)
        resizeSprite()

        resizeObserver = new ResizeObserver(() => {
          resizeSprite()
        })
        resizeObserver.observe(stageHost)

        let elapsed = 0
        nextApp.ticker.add((ticker) => {
          const latestSprite = spriteRef.current
          const latestShadowSprite = shadowSpriteRef.current
          const latestGlowSprite = glowSpriteRef.current
          if (!latestSprite) {
            return
          }

          const maxHeightScale =
            (stageHost.clientHeight * petConfig.layout.spriteHeightRatio) /
            latestSprite.texture.height
          const configuredScale = petConfig.appearance.defaultScale || manifest.default_scale
          const renderScale = Math.min(configuredScale, maxHeightScale)
          const baseX = stageHost.clientWidth * petConfig.layout.spriteAnchorXRatio
          const baseY = stageHost.clientHeight - petConfig.layout.spriteBaselineOffset
          const stateNow = desiredStateRef.current
          const idleBehaviorNow = idleBehaviorRef.current
          const hoverTarget = hoveredRef.current ? 1 : 0
          hoverAmountRef.current += (hoverTarget - hoverAmountRef.current) * 0.16
          const hoverLift = hoverAmountRef.current * petConfig.appearance.hoverLiftPx
          const fadeProgress = Math.min(
            1,
            (performance.now() - transitionStartRef.current) / STATE_FADE_MS,
          )
          const textureState = resolveManifestState(manifest, stateNow)
          const nextTexture = resolveTextureForState(textures, textureState)
          if (nextTexture && latestSprite.texture !== nextTexture) {
            latestSprite.texture = nextTexture
            if (latestShadowSprite) {
              latestShadowSprite.texture = nextTexture
            }
            if (latestGlowSprite) {
              latestGlowSprite.texture = nextTexture
            }
          }

          elapsed += ticker.deltaMS
          let offsetX = 0
          let offsetY = -hoverLift
          let rotation = 0
          const scaleX = renderScale
          let scaleY = renderScale
          let brightnessTint = mixTint(0xf8f5ff, 0xffffff, hoverAmountRef.current)
          latestSprite.alpha = Math.max(0.35, fadeProgress)

          if (stateNow === 'idle') {
            const wave = Math.sin(elapsed / 840)
            scaleY = renderScale * (1 + 0.005 * wave)
            offsetY += -2.5 * ((wave + 1) / 2)

            if (idleBehaviorNow === 'glance') {
              const glanceWave = Math.sin(elapsed / 260)
              rotation += glanceWave * (Math.PI / 180) * 1.5
              offsetX += glanceWave * 2
            }
          } else if (stateNow === 'soft_idle') {
            const wave = Math.sin(elapsed / 1280)
            scaleY = renderScale * (1 + 0.0035 * wave)
            offsetY += -1.7 * ((wave + 1) / 2)
            offsetX += Math.sin(elapsed / 2100) * 0.8
            rotation = Math.sin(elapsed / 1900) * 0.003
            brightnessTint = mixTint(0xf7f0ff, 0xffffff, 0.34 + hoverAmountRef.current * 0.42)

            if (elapsed - thinkingParticleMsRef.current > 2400) {
              thinkingParticleMsRef.current = elapsed
              onStateParticleRef.current?.('star')
            }
          } else if (stateNow === 'speaking') {
            const wave = Math.sin(elapsed / 180)
            offsetY += -3.5 * ((wave + 1) / 2)
            rotation = Math.sin(elapsed / 280) * 0.012
            scaleY = renderScale * (1 + 0.004 * wave)
          } else if (stateNow === 'thinking') {
            offsetX = Math.sin(elapsed / 620) * 5
            rotation = Math.sin(elapsed / 760) * 0.018

            if (elapsed - thinkingParticleMsRef.current > 900) {
              thinkingParticleMsRef.current = elapsed
              onStateParticleRef.current?.('magic')
            }
          } else if (stateNow === 'magic') {
            offsetX = Math.sin(elapsed / 700) * 4
            offsetY += -2.5 * ((Math.sin(elapsed / 540) + 1) / 2)
            rotation = Math.sin(elapsed / 880) * 0.015
            scaleY = renderScale * (1 + 0.003 * Math.sin(elapsed / 760))
            brightnessTint = mixTint(0xf2e6ff, 0xffffff, 0.5 + hoverAmountRef.current * 0.3)

            if (elapsed - thinkingParticleMsRef.current > 700) {
              thinkingParticleMsRef.current = elapsed
              onStateParticleRef.current?.('magic')
            }
          } else if (stateNow === 'attention') {
            offsetY += -3 - ((Math.sin(elapsed / 320) + 1) / 2) * 2.8
            offsetX += Math.sin(elapsed / 420) * 1.6
            rotation = Math.sin(elapsed / 460) * 0.008
            brightnessTint = mixTint(0xfaf6ff, 0xffffff, 0.55 + hoverAmountRef.current * 0.25)
          } else if (stateNow === 'sleepy') {
            const wave = Math.sin(elapsed / 1450)
            offsetY += -1.5 * ((wave + 1) / 2)
            scaleY = renderScale * (1 + 0.004 * wave)
            latestSprite.alpha = 0.86
          } else if (stateNow === 'shy') {
            const wave = Math.sin(elapsed / 1500)
            const pauseWindow = Math.sin(elapsed / 2300) > 0.86 ? 0.25 : 1
            offsetY += -0.5 * ((wave + 1) / 2) * pauseWindow
            offsetX += Math.sin(elapsed / 1900) * 0.45
            scaleY = renderScale * (1 + 0.0018 * wave * pauseWindow)
            rotation = Math.sin(elapsed / 1700) * 0.0018
            brightnessTint = mixTint(0xf8f0fb, 0xffffff, 0.42 + hoverAmountRef.current * 0.25)
          } else if (stateNow === 'annoyed') {
            offsetY += Math.sin(elapsed / 1700) * 0.35
            rotation = Math.sin(elapsed / 1500) * 0.0018
            offsetX += Math.sin(elapsed / 2100) * 0.55
            brightnessTint = mixTint(0xeeebf5, 0xffffff, hoverAmountRef.current * 0.35)
          } else if (stateNow === 'cold' || stateNow === 'cold_alt') {
            offsetY += Math.sin(elapsed / 1500) * 0.45
            rotation = Math.sin(elapsed / 1300) * 0.0025
            brightnessTint = mixTint(0xf1eff8, 0xffffff, hoverAmountRef.current * 0.45)
          } else if (stateNow === 'hand_mouth' || stateNow === 'hand_mouth_alt') {
            const wave = Math.sin(elapsed / 1180)
            offsetY += -0.65 * ((wave + 1) / 2)
            scaleY = renderScale * (1 + 0.0025 * wave)
            brightnessTint = mixTint(0xf5f2fb, 0xffffff, hoverAmountRef.current * 0.5)
          } else if (stateNow === 'calm_alt') {
            const wave = Math.sin(elapsed / 1100)
            offsetY += -1.1 * ((wave + 1) / 2)
            rotation = Math.sin(elapsed / 1500) * 0.003
            scaleY = renderScale * (1 + 0.003 * wave)
          } else if (stateNow === 'side_glance' || stateNow === 'profile_wait') {
            const wave = Math.sin(elapsed / 1300)
            offsetY += -0.8 * ((wave + 1) / 2)
            offsetX += Math.sin(elapsed / 1600) * 0.9
            rotation = Math.sin(elapsed / 1400) * 0.002
            brightnessTint = mixTint(0xf4f2fa, 0xffffff, hoverAmountRef.current * 0.55)
          } else if (stateNow === 'bow') {
            const wave = Math.sin(elapsed / 900)
            offsetY += -1.4 * ((wave + 1) / 2)
            rotation = Math.sin(elapsed / 1200) * 0.004
            scaleY = renderScale * (1 + 0.0035 * wave)
          }

          latestSprite.tint = brightnessTint
          latestSprite.alpha =
            stateNow === 'sleepy'
              ? Math.min(0.86, latestSprite.alpha)
              : latestSprite.alpha

          for (const layer of [latestShadowSprite, latestGlowSprite, latestSprite]) {
            if (!layer) {
              continue
            }

            const layerScaleOffset = layer === latestGlowSprite ? 1.016 : 1
            const layerXOffset = layer === latestShadowSprite ? 4 : 0
            const layerYOffset = layer === latestShadowSprite ? 6 : 0

            layer.x = baseX + offsetX + layerXOffset
            layer.y = baseY + offsetY + layerYOffset
            layer.rotation = rotation
            layer.scale.x = scaleX * layerScaleOffset
            layer.scale.y = scaleY * layerScaleOffset
          }
        })

        const initialTexture = resolveTextureForState(textures, desiredStateRef.current)
        if (initialTexture) {
          applyLayerTexture(initialTexture)
        }

        onAssetStatusChange(`Loaded ${loadedCount} textures`)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to initialize Pixi stage.'
        onAssetStatusChange(`Asset load failed: ${message}`)
      }
    }

    mount()

    return () => {
      disposed = true
      clearBlinkTimers()
      cleanupCanvasEvents()
      resizeObserver?.disconnect()
      spriteRef.current = null
      shadowSpriteRef.current = null
      glowSpriteRef.current = null
      texturesRef.current = null
      appRef.current?.destroy(true, { children: true })
      appRef.current = null
      stageHost.replaceChildren()
    }
  }, [manifest, onAssetStatusChange])

  return <div ref={hostRef} className="pet-stage" data-tauri-drag-region="true" />
}
