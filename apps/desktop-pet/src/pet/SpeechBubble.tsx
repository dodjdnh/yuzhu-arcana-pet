import type { SpeechBubbleState } from './stateMachine'
import { useEffect, useState } from 'react'

interface SpeechBubbleProps {
  bubble: SpeechBubbleState | null
}

export function SpeechBubble({ bubble }: SpeechBubbleProps) {
  const [visibleBubble, setVisibleBubble] = useState<SpeechBubbleState | null>(bubble)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (bubble) {
      const openTimer = window.setTimeout(() => {
        setVisibleBubble(bubble)
        setClosing(false)
      }, 0)

      return () => {
        window.clearTimeout(openTimer)
      }
    }

    if (!visibleBubble) {
      return
    }

    const closeStartTimer = window.setTimeout(() => {
      setClosing(true)
    }, 180)

    const closeEndTimer = window.setTimeout(() => {
      setVisibleBubble(null)
      setClosing(false)
    }, 360)

    return () => {
      window.clearTimeout(closeStartTimer)
      window.clearTimeout(closeEndTimer)
    }
  }, [bubble, visibleBubble])

  if (!visibleBubble) {
    return null
  }

  return (
    <div
      className={`speech-bubble speech-bubble--${visibleBubble.tone}${
        closing ? ' speech-bubble--closing' : ''
      }`}
    >
      <span className="speech-bubble__star speech-bubble__star--one">✦</span>
      <span className="speech-bubble__star speech-bubble__star--two">✧</span>
      <div className="speech-bubble__body">{visibleBubble.text}</div>
    </div>
  )
}
