import { hasStateAsset } from './manifest'
import type { PetManifest, RenderablePetState } from './manifest'
import { petConfig } from './petConfig'

export type IdleBehaviorName =
  | 'none'
  | 'glance'
  | 'long_blink'
  | 'hand_mouth_pause'
  | 'hand_mouth_alt_pause'
  | 'cold_pause'
  | 'cold_alt_pause'
  | 'sleepy_pause'
  | 'calm_pause'
  | 'side_glance_pause'
  | 'profile_wait_pause'
  | 'bow_pause'
  | 'tiny_star'
  | 'idle_murmur'

export interface IdleBehaviorPlan {
  name: Exclude<IdleBehaviorName, 'none'>
  durationMs: number
  visualState: RenderablePetState | null
  showStar: boolean
  murmurText: string | null
}

interface WeightedBehavior {
  name: IdleBehaviorPlan['name']
  weight: number
}

const WEIGHTED_BEHAVIORS: WeightedBehavior[] = [
  { name: 'glance', weight: 6 },
  { name: 'long_blink', weight: 6 },
  { name: 'tiny_star', weight: 4 },
  { name: 'hand_mouth_pause', weight: 13 },
  { name: 'hand_mouth_alt_pause', weight: 13 },
  { name: 'cold_pause', weight: 10 },
  { name: 'cold_alt_pause', weight: 12 },
  { name: 'sleepy_pause', weight: 10 },
  { name: 'calm_pause', weight: 8 },
  { name: 'side_glance_pause', weight: 8 },
  { name: 'profile_wait_pause', weight: 6 },
  { name: 'bow_pause', weight: 4 },
  { name: 'idle_murmur', weight: 8 },
]

const STATE_BEHAVIOR_MAP: Partial<
  Record<IdleBehaviorPlan['name'], RenderablePetState>
> = {
  hand_mouth_pause: 'hand_mouth',
  hand_mouth_alt_pause: 'hand_mouth_alt',
  cold_pause: 'cold',
  cold_alt_pause: 'cold_alt',
  sleepy_pause: 'sleepy',
  calm_pause: 'calm_alt',
  side_glance_pause: 'side_glance',
  profile_wait_pause: 'profile_wait',
  bow_pause: 'bow',
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function durationForBehavior(name: IdleBehaviorPlan['name']) {
  switch (name) {
    case 'glance':
      return randomBetween(1300, 1700)
    case 'long_blink':
      return randomBetween(900, 1300)
    case 'hand_mouth_pause':
    case 'hand_mouth_alt_pause':
    case 'cold_pause':
    case 'cold_alt_pause':
    case 'calm_pause':
    case 'side_glance_pause':
    case 'profile_wait_pause':
      return randomBetween(1200, 2000)
    case 'sleepy_pause':
      return randomBetween(1500, 2500)
    case 'bow_pause':
      return randomBetween(1000, 1500)
    case 'idle_murmur':
      return randomBetween(1200, 1800)
    case 'tiny_star':
      return 1100
  }
}

function weightedPick(candidates: WeightedBehavior[]) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let cursor = Math.random() * totalWeight

  for (const candidate of candidates) {
    cursor -= candidate.weight
    if (cursor <= 0) {
      return candidate.name
    }
  }

  return candidates[candidates.length - 1]?.name ?? 'tiny_star'
}

function canUseBehavior(
  manifest: PetManifest,
  name: IdleBehaviorPlan['name'],
  canMurmur: boolean,
) {
  if (name === 'idle_murmur') {
    return canMurmur
  }

  const requiredState = STATE_BEHAVIOR_MAP[name]
  if (!requiredState) {
    return true
  }

  return hasStateAsset(manifest, requiredState)
}

export function createIdleBehaviorPlan(
  manifest: PetManifest,
  canMurmur: boolean,
): IdleBehaviorPlan {
  const candidates = WEIGHTED_BEHAVIORS.filter((candidate) =>
    canUseBehavior(manifest, candidate.name, canMurmur),
  )
  const name = weightedPick(
    candidates.length > 0 ? candidates : [{ name: 'tiny_star', weight: 1 }],
  )
  const visualState = STATE_BEHAVIOR_MAP[name] ?? null
  const murmurText =
    name === 'idle_murmur'
      ? petConfig.idle.murmurLines[
          Math.floor(Math.random() * petConfig.idle.murmurLines.length)
        ]
      : null

  return {
    name,
    durationMs: durationForBehavior(name),
    visualState,
    showStar: name !== 'long_blink' && name !== 'idle_murmur',
    murmurText,
  }
}

export function randomIdleDelayMs() {
  return randomBetween(
    petConfig.interaction.idleActionMinMs,
    petConfig.interaction.idleActionMaxMs,
  )
}
