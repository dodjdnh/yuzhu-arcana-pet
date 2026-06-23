import { petConfig } from './petConfig'
import type { CSSProperties } from 'react'

export type ParticleKind = 'star' | 'magic' | 'sparkle' | 'heart' | 'ellipsis'

export interface ParticleBurst {
  id: number
  kind: ParticleKind
  count: number
  x: number
  y: number
}

interface ParticleLayerProps {
  bursts: ParticleBurst[]
  enabled?: boolean
  scale?: number
}

function particleGlyph(kind: ParticleKind, index: number) {
  if (kind === 'heart') {
    return '♥'
  }
  if (kind === 'ellipsis') {
    return index % 2 === 0 ? '…' : '•'
  }
  if (kind === 'magic') {
    return index % 2 === 0 ? '✦' : '·'
  }
  return index % 2 === 0 ? '✧' : '✦'
}

export function ParticleLayer({
  bursts,
  enabled = true,
  scale = 1,
}: ParticleLayerProps) {
  if (!petConfig.appearance.enableParticles || !enabled) {
    return null
  }

  return (
    <div
      className="particle-layer"
      aria-hidden="true"
      style={{ '--particle-scale': scale } as CSSProperties}
    >
      {bursts.flatMap((burst) =>
        Array.from({ length: burst.count }, (_, index) => (
          <span
            key={`${burst.id}-${index}`}
            className={`pet-particle pet-particle--${burst.kind}`}
            style={
              {
                '--particle-x': `${burst.x + (index - (burst.count - 1) / 2) * 12}px`,
                '--particle-y': `${burst.y + (index % 2) * 8}px`,
                '--particle-dx': `${(index - (burst.count - 1) / 2) * 12}px`,
                '--particle-dy': `${-28 - index * 5}px`,
                '--particle-delay': `${index * 70}ms`,
              } as CSSProperties
            }
          >
            {particleGlyph(burst.kind, index)}
          </span>
        )),
      )}
    </div>
  )
}
