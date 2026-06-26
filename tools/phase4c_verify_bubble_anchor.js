const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function moveDesktopPetWindow(x, y) {
  const script = `
$signature = @'
using System;
using System.Runtime.InteropServices;
public static class Win32MoveWindow {
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@
if (-not ('Win32MoveWindow' -as [type])) { Add-Type $signature }
$p = Get-Process desktop_pet -ErrorAction Stop | Select-Object -First 1
[Win32MoveWindow]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, ${Math.round(x)}, ${Math.round(y)}, 0, 0, 0x0001 -bor 0x0040) | Out-Null
`
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    stdio: 'pipe',
  })
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = (error) => {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen)
        this.ws.removeEventListener('error', onError)
      }
      this.ws.addEventListener('open', onOpen)
      this.ws.addEventListener('error', onError)
    })

    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!payload.id) {
        return
      }

      const pending = this.pending.get(payload.id)
      if (!pending) {
        return
      }

      this.pending.delete(payload.id)
      if (payload.error) {
        pending.reject(new Error(payload.error.message))
        return
      }

      pending.resolve(payload.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return result.result?.value
  }

  async close() {
    if (!this.ws) {
      return
    }
    this.ws.close()
    await wait(120)
  }
}

async function getPageTarget() {
  const response = await fetch('http://127.0.0.1:9222/json/list')
  const targets = await response.json()
  const pageTarget = targets.find((target) => target.url === 'http://127.0.0.1:1420/')
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('desktop pet page target not found on CDP port 9222')
  }
  return pageTarget
}

async function preparePage(cdp) {
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.evaluate(`(() => {
    window.localStorage.setItem(
      'desktop-pet:local-settings:v1',
      JSON.stringify({
        debugPanelOpen: true,
        particleEnabled: true,
        scale: 1,
        windowPosition: null,
      }),
    )
    return true
  })()`)
  await cdp.send('Page.reload', { ignoreCache: true })
  await wait(2200)
}

async function clickButton(cdp, name) {
  await cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((node) => {
      return (node.textContent || '').trim() === ${JSON.stringify(name)}
    })
    if (!button) {
      throw new Error('Button not found: ' + ${JSON.stringify(name)})
    }
    button.click()
    return true
  })()`)
  await wait(900)
}

async function readBubble(cdp) {
  return await cdp.evaluate(`(() => {
    const bubble = document.querySelector('.speech-bubble')
    const debugValue = Array.from(document.querySelectorAll('.debug-panel p'))
      .map((node) => node.textContent || '')
      .find((text) => text.includes('气泡'))

    if (!bubble) {
      return { exists: false, debugValue }
    }

    const rect = bubble.getBoundingClientRect()
    const computed = window.getComputedStyle(bubble)
    return {
      exists: true,
      className: bubble.className,
      debugValue,
      inlineStyle: bubble.getAttribute('style'),
      computedTop: computed.top,
      computedLeft: computed.left,
      computedTransform: computed.transform,
      bubbleTopVar: computed.getPropertyValue('--bubble-top').trim(),
      bubbleLeftVar: computed.getPropertyValue('--bubble-left').trim(),
      bubbleWidthVar: computed.getPropertyValue('--bubble-placement-width').trim(),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      scrollY: Math.round(window.scrollY),
      documentScrollTop: Math.round(document.documentElement.scrollTop),
    }
  })()`)
}

async function captureScreenshot(cdp, filePath) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
}

async function main() {
  const pageTarget = await getPageTarget()
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl)
  await cdp.connect()

  try {
    await preparePage(cdp)
    const screenInfo = await cdp.evaluate(`(() => ({
      screenWidth: window.screen.availWidth || window.screen.width,
      screenHeight: window.screen.availHeight || window.screen.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }))()`)

    const y = Math.max(
      40,
      Math.round(screenInfo.screenHeight - screenInfo.innerHeight - 80),
    )
    const cases = [
      { slug: 'left_short', x: 0, button: 'Simulate short reply' },
      {
        slug: 'center_medium',
        x: Math.round((screenInfo.screenWidth - screenInfo.innerWidth) / 2),
        button: 'Simulate medium reply',
      },
      {
        slug: 'right_long',
        x: Math.round(screenInfo.screenWidth - screenInfo.innerWidth - 2),
        button: 'Simulate long reply',
      },
      {
        slug: 'left_very_long',
        x: 0,
        button: 'Simulate very long reply',
      },
    ]

    const results = []
    for (const testCase of cases) {
      moveDesktopPetWindow(testCase.x, y)
      await wait(500)
      await clickButton(cdp, testCase.button)
      const bubble = await readBubble(cdp)
      await captureScreenshot(
        cdp,
        path.join(__dirname, `phase4c_anchor_${testCase.slug}.png`),
      )
      results.push({ ...testCase, bubble })
    }

    console.log(JSON.stringify({ screenInfo, results }, null, 2))
  } finally {
    await cdp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
