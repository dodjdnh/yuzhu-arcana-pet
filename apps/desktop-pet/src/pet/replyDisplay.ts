export type ReplyDisplayMode = 'short' | 'medium' | 'long'

export interface ReplyDisplayMetrics {
  mode: ReplyDisplayMode
  lineCount: number
  charCount: number
  truncatedText: string
  expandable: boolean
}

interface ReplyDisplayThresholds {
  shortMaxChars: number
  shortMaxLines: number
  mediumMaxChars: number
  longLineThreshold: number
  veryLongChars: number
  previewChars: number
}

function countLines(text: string) {
  return Math.max(1, text.split(/\r?\n/).length)
}

function trimForPreview(text: string, previewChars: number) {
  const value = text.trim()
  if (value.length <= previewChars) {
    return value
  }

  const sliced = value.slice(0, previewChars).trimEnd()
  return `${sliced}……`
}

export function resolveReplyDisplayMetrics(
  text: string,
  thresholds: ReplyDisplayThresholds,
): ReplyDisplayMetrics {
  const normalized = String(text ?? '').trim()
  const charCount = Array.from(normalized).length
  const lineCount = countLines(normalized)

  let mode: ReplyDisplayMode = 'medium'
  if (charCount <= thresholds.shortMaxChars && lineCount <= thresholds.shortMaxLines) {
    mode = 'short'
  } else if (
    charCount > thresholds.mediumMaxChars ||
    lineCount > thresholds.longLineThreshold
  ) {
    mode = 'long'
  }

  const expandable = charCount > thresholds.veryLongChars
  const truncatedText =
    mode === 'long' && expandable
      ? trimForPreview(normalized, thresholds.previewChars)
      : normalized

  return {
    mode,
    lineCount,
    charCount,
    truncatedText,
    expandable,
  }
}
