export type PetScaleOption = 0.8 | 1 | 1.2

export interface PetWindowPosition {
  x: number
  y: number
}

export interface PetLocalSettings {
  debugPanelOpen: boolean
  particleEnabled: boolean
  scale: PetScaleOption
  windowPosition: PetWindowPosition | null
}

const STORAGE_KEY = 'desktop-pet:local-settings:v1'

export const defaultPetLocalSettings: PetLocalSettings = {
  debugPanelOpen: false,
  particleEnabled: true,
  scale: 1,
  windowPosition: null,
}

function isScaleOption(value: unknown): value is PetScaleOption {
  return value === 0.8 || value === 1 || value === 1.2
}

export function loadPetLocalSettings(): PetLocalSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultPetLocalSettings
    }

    const parsed = JSON.parse(raw) as Partial<PetLocalSettings> | null
    if (!parsed || typeof parsed !== 'object') {
      return defaultPetLocalSettings
    }

    const debugPanelOpen =
      typeof parsed.debugPanelOpen === 'boolean'
        ? parsed.debugPanelOpen
        : defaultPetLocalSettings.debugPanelOpen
    const particleEnabled =
      typeof parsed.particleEnabled === 'boolean'
        ? parsed.particleEnabled
        : defaultPetLocalSettings.particleEnabled
    const scale = isScaleOption(parsed.scale)
      ? parsed.scale
      : defaultPetLocalSettings.scale

    let windowPosition: PetWindowPosition | null = null
    if (
      parsed.windowPosition &&
      typeof parsed.windowPosition === 'object' &&
      typeof parsed.windowPosition.x === 'number' &&
      typeof parsed.windowPosition.y === 'number'
    ) {
      windowPosition = {
        x: parsed.windowPosition.x,
        y: parsed.windowPosition.y,
      }
    }

    return {
      debugPanelOpen,
      particleEnabled,
      scale,
      windowPosition,
    }
  } catch {
    return defaultPetLocalSettings
  }
}

export function savePetLocalSettings(settings: PetLocalSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore local persistence failures and keep runtime behavior stable.
  }
}
