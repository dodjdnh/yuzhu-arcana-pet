import type { SpeechBubbleState } from './stateMachine'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { ReplyDisplayMetrics } from './replyDisplay'

interface SpeechBubbleProps {
  bubble: SpeechBubbleState | null
  metrics: ReplyDisplayMetrics | null
  scale?: number
  debugVisible?: boolean
  placement?: {
    anchor: 'left' | 'right'
    leftPx: number
    topPx: number
    widthPx: number
    leftSpace: number
    rightSpace: number
  } | null
  onMeasuredSizeChange?: (
    size:
      | {
          mode: ReplyDisplayMetrics['mode']
          width: number
          height: number
        }
      | null,
  ) => void
  onInteractiveRegionChange?: (
    region:
      | {
          leftRatio: number
          topRatio: number
          widthRatio: number
          heightRatio: number
        }
      | null,
  ) => void
}

export function SpeechBubble({
  bubble,
  metrics,
  scale = 1,
  debugVisible = false,
  placement = null,
  onMeasuredSizeChange,
  onInteractiveRegionChange,
}: SpeechBubbleProps) {
  const [visibleBubble, setVisibleBubble] = useState<SpeechBubbleState | null>(bubble)
  const [visibleMetrics, setVisibleMetrics] = useState<ReplyDisplayMetrics | null>(metrics)
  const [closing, setClosing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (bubble) {
      const openTimer = window.setTimeout(() => {
        setVisibleBubble(bubble)
        setVisibleMetrics(metrics)
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
      setVisibleMetrics(null)
      setClosing(false)
    }, 360)

    return () => {
      window.clearTimeout(closeStartTimer)
      window.clearTimeout(closeEndTimer)
    }
  }, [bubble, metrics, visibleBubble])

  useEffect(() => {
    setExpanded(false)
  }, [bubble?.text])

  useEffect(() => {
    if (!visibleBubble || !visibleMetrics || !bubbleRef.current) {
      onMeasuredSizeChange?.(null)
      return
    }

    const node = bubbleRef.current
    const reportSize = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        onMeasuredSizeChange?.(null)
        return
      }

      onMeasuredSizeChange?.({
        mode: visibleMetrics.mode,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    reportSize()
    const resizeObserver = new ResizeObserver(() => {
      reportSize()
    })
    resizeObserver.observe(node)
    window.addEventListener('resize', reportSize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', reportSize)
      onMeasuredSizeChange?.(null)
    }
  }, [expanded, onMeasuredSizeChange, visibleBubble, visibleMetrics])

  useEffect(() => {
    if (!visibleBubble || visibleMetrics?.mode !== 'long' || !bubbleRef.current) {
      onInteractiveRegionChange?.(null)
      return
    }

    const node = bubbleRef.current
    const reportRegion = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        onInteractiveRegionChange?.(null)
        return
      }

      onInteractiveRegionChange?.({
        leftRatio: rect.left / window.innerWidth,
        topRatio: rect.top / window.innerHeight,
        widthRatio: rect.width / window.innerWidth,
        heightRatio: rect.height / window.innerHeight,
      })
    }

    reportRegion()
    const resizeObserver = new ResizeObserver(() => {
      reportRegion()
    })
    resizeObserver.observe(node)
    window.addEventListener('resize', reportRegion)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', reportRegion)
      onInteractiveRegionChange?.(null)
    }
  }, [expanded, onInteractiveRegionChange, visibleBubble, visibleMetrics?.mode])

  const displayedText = useMemo(() => {
    if (!visibleBubble || !visibleMetrics) {
      return ''
    }

    if (visibleMetrics.mode !== 'long') {
      return visibleBubble.text
    }

    return expanded ? visibleBubble.text : visibleMetrics.truncatedText
  }, [expanded, visibleBubble, visibleMetrics])

  if (!visibleBubble) {
    return null
  }

  const mode = visibleMetrics?.mode ?? 'short'
  const isInteractiveLongPanel = mode === 'long'
  const anchor = placement?.anchor ?? 'left'

  return (
    <div
      ref={bubbleRef}
      className={`speech-bubble speech-bubble--${visibleBubble.tone} speech-bubble--${mode}${
        closing ? ' speech-bubble--closing' : ''
      } speech-bubble--anchor-${anchor}${debugVisible ? ' speech-bubble--debug' : ''}`}
      style={
        {
          '--bubble-scale': scale,
          '--bubble-left': placement ? `${placement.leftPx}px` : undefined,
          '--bubble-top': placement ? `${placement.topPx}px` : undefined,
          '--bubble-placement-width': placement ? `${placement.widthPx}px` : undefined,
        } as CSSProperties
      }
    >
      {debugVisible && placement ? (
        <span className="speech-bubble__debug-label">
          {anchor} L:{placement.leftSpace} R:{placement.rightSpace}
        </span>
      ) : null}
      {mode !== 'long' ? (
        <>
          <span className="speech-bubble__star speech-bubble__star--one">✦</span>
          <span className="speech-bubble__star speech-bubble__star--two">✧</span>
        </>
      ) : null}
      <div
        className={`speech-bubble__body${
          isInteractiveLongPanel ? ' speech-bubble__body--panel' : ''
        }`}
      >
        {mode === 'long' ? (
          <>
            <div className="speech-bubble__panel-header">
              <span>回复内容</span>
              <small>{visibleMetrics?.charCount ?? 0} 字</small>
            </div>
            <div className="speech-bubble__panel-scroll">{displayedText}</div>
            {visibleMetrics?.expandable ? (
              <button
                type="button"
                className="speech-bubble__toggle"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '收起' : '展开全文'}
              </button>
            ) : null}
          </>
        ) : (
          displayedText
        )}
      </div>
    </div>
  )
}
