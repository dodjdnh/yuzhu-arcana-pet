export const petConfig = {
  layout: {
    screenHeightRatio: 0.35,
    fallbackWindowWidth: 240,
    fallbackWindowHeight: 390,
    minWindowWidth: 196,
    maxWindowWidth: 262,
    windowWidthRatio: 0.5,
    rightMargin: 28,
    bottomMargin: 30,
    spriteHeightRatio: 0.78,
    spriteBaselineOffset: 12,
    spriteAnchorXRatio: 0.76,
  },
  appearance: {
    defaultScale: 0.14,
    enableSoftShadow: true,
    enableParticles: true,
    enableStars: true,
    hoverLiftPx: 4,
  },
  bubble: {
    maxWidth: 156,
    interactionDurationMs: 1700,
  },
  interaction: {
    clickCooldownMs: 1200,
    dragStartThresholdPx: 6,
    dragSettleMinMs: 650,
    dragSettleMaxMs: 900,
    idleActionMinMs: 4000,
    idleActionMaxMs: 9000,
    idleActionDurationMs: 1400,
    maxStarsPerBurst: 3,
    hitbox: {
      leftRatio: 0.4,
      topRatio: 0.08,
      widthRatio: 0.44,
      heightRatio: 0.84,
    },
  },
  debugSamples: {
    softIdle: '……只是稍微靠近一点而已。',
    shy: '别突然这样看着我。',
    attention: '嗯？我有在听。',
    magic: '安静一点，魔术还没结束。',
    annoyed: '……别闹了。',
  },
  idle: {
    postEventQuietMs: 2000,
    murmurCooldownMs: 90000,
    murmurLines: [
      '……',
      '在看什么？',
      '今天也很安静呢。',
      '别一直盯着我。',
      '……无聊。',
    ],
  },
  debug: {
    showPanelByDefault: false,
  },
} as const

export const petClickLines = [
  '……别戳。',
  '有什么事？',
  '我在听。',
  '真闲呢。',
  '……嗯？',
] as const

export const petDragLines = [
  '不要随便移动我。',
  '……放好。',
  '你很无聊吗？',
] as const
