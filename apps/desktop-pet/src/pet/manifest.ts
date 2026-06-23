export type PetState =
  | 'idle'
  | 'soft_idle'
  | 'idle_closed'
  | 'speaking'
  | 'thinking'
  | 'attention'
  | 'magic'
  | 'cold'
  | 'annoyed'
  | 'cold_alt'
  | 'sleepy'
  | 'shy'
  | 'hand_mouth'
  | 'hand_mouth_alt'
  | 'calm_alt'
  | 'side_glance'
  | 'profile_wait'
  | 'bow'
  | 'error'

export type RenderablePetState = Exclude<PetState, 'idle_closed'>

export interface SpriteFrameSet {
  main?: string
  open?: string
  closed?: string
}

export interface SkinDefinition {
  states: Record<string, SpriteFrameSet>
}

export interface PetManifest {
  character_id: string
  display_name: string
  default_skin: string
  default_scale: number
  anchor: {
    x: number
    y: number
  }
  skins: Record<string, SkinDefinition>
}

const STATE_FALLBACK_MAP: Partial<Record<RenderablePetState, RenderablePetState>> = {
  soft_idle: 'idle',
  shy: 'hand_mouth',
  attention: 'thinking',
  magic: 'thinking',
  annoyed: 'cold',
  error: 'cold',
  cold_alt: 'cold',
  hand_mouth_alt: 'hand_mouth',
}

export async function loadManifest(path: string): Promise<PetManifest> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`)
  }

  return (await response.json()) as PetManifest
}

export function resolveSkin(manifest: PetManifest): SkinDefinition {
  const skin = manifest.skins[manifest.default_skin]
  if (!skin) {
    throw new Error(`Missing default skin "${manifest.default_skin}" in manifest.`)
  }

  return skin
}

export function getStateFrames(
  manifest: PetManifest,
  state: RenderablePetState,
): SpriteFrameSet | undefined {
  return resolveSkin(manifest).states[state]
}

export function hasStateAsset(manifest: PetManifest, state: RenderablePetState): boolean {
  const frameSet = getStateFrames(manifest, state)
  if (!frameSet) {
    return false
  }

  return Boolean(frameSet.main || frameSet.open)
}

export function resolveManifestState(
  manifest: PetManifest,
  desiredState: RenderablePetState,
): RenderablePetState {
  let currentState: RenderablePetState = desiredState
  const visited = new Set<RenderablePetState>()

  while (!visited.has(currentState)) {
    visited.add(currentState)
    if (currentState === 'idle' || hasStateAsset(manifest, currentState)) {
      return currentState
    }

    const fallbackState = STATE_FALLBACK_MAP[currentState]
    if (!fallbackState) {
      return 'idle'
    }
    currentState = fallbackState
  }

  return 'idle'
}
