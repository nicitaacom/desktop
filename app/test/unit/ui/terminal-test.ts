import assert from 'node:assert'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import type { Terminal as XTerm } from '@xterm/xterm'

import type { Terminal as TerminalComponent } from '../../../src/ui/terminal'
import { captureClipboardWrites } from '../../helpers/ui/electron'

describe('Terminal copy shortcuts', () => {
  const originalDarwin = __DARWIN__
  let XTermTerminal: typeof XTerm
  let Terminal: typeof TerminalComponent
  let terminal: TerminalComponent
  let handleKey: (event: KeyboardEvent) => boolean
  let selection: string
  let clipboardCapture: ReturnType<typeof captureClipboardWrites>

  before(async () => {
    // xterm probes canvas support at import time; jsdom has no canvas renderer.
    const canvasContext = mock.method(
      window.HTMLCanvasElement.prototype,
      'getContext',
      () => null
    )
    try {
      XTermTerminal = (await import('@xterm/xterm')).Terminal
      Terminal = (await import('../../../src/ui/terminal')).Terminal
    } finally {
      canvasContext.mock.restore()
    }
  })

  beforeEach(() => {
    Object.assign(globalThis, { __DARWIN__: false })
    clipboardCapture = captureClipboardWrites()
    selection = 'Failed to run tasks!\n  warning: résumé 🐙'
    mock.method(
      XTermTerminal.prototype,
      'attachCustomKeyEventHandler',
      (handler: typeof handleKey) => {
        handleKey = handler
      }
    )
    mock.method(XTermTerminal.prototype, 'getSelection', () => selection)
    // Mount without a DOM ref: these tests exercise the registered keyboard
    // handler without requiring a canvas renderer.
    terminal = new Terminal({})
    terminal.componentDidMount()
  })

  afterEach(() => {
    terminal.componentWillUnmount()
    clipboardCapture.restore()
    mock.restoreAll()
    Object.assign(globalThis, { __DARWIN__: originalDarwin })
  })

  function keyEvent(init: KeyboardEventInit, type = 'keydown') {
    return new window.KeyboardEvent(type, {
      key: 'c',
      bubbles: true,
      cancelable: true,
      ...init,
    })
  }

  for (const shiftKey of [false, true]) {
    it(`copies the exact selection with Ctrl${
      shiftKey ? '+Shift' : ''
    }+C`, () => {
      const event = keyEvent({
        key: shiftKey ? 'C' : 'c',
        ctrlKey: true,
        shiftKey,
      })
      const stopPropagation = mock.method(event, 'stopPropagation')

      assert.equal(handleKey(event), false)
      assert.deepEqual(clipboardCapture.writes, [selection])
      assert.equal(event.defaultPrevented, true)
      assert.equal(stopPropagation.mock.callCount(), 1)
      assert.equal(terminal.Terminal?.getSelection(), selection)
    })
  }

  it('copies with Cmd+C on macOS and leaves Ctrl+C alone', () => {
    Object.assign(globalThis, { __DARWIN__: true })

    assert.equal(handleKey(keyEvent({ metaKey: true })), false)
    assert.equal(handleKey(keyEvent({ ctrlKey: true })), true)
    assert.equal(handleKey(keyEvent({ metaKey: true, shiftKey: true })), true)
    assert.deepEqual(clipboardCapture.writes, [selection])
  })

  it('leaves the clipboard and default behavior untouched without a selection', () => {
    selection = ''
    for (const shiftKey of [false, true]) {
      const event = keyEvent({ ctrlKey: true, shiftKey })
      assert.equal(handleKey(event), true)
      assert.equal(event.defaultPrevented, false)
    }
    assert.deepEqual(clipboardCapture.writes, [])
  })

  it('does not copy on keyup or keypress, unrelated keys, or extra modifiers', () => {
    const events = [
      keyEvent({ ctrlKey: true }, 'keyup'),
      keyEvent({ ctrlKey: true }, 'keypress'),
      keyEvent({}),
      keyEvent({ ctrlKey: true, key: 'x' }),
      keyEvent({ ctrlKey: true, altKey: true }),
      keyEvent({ ctrlKey: true, metaKey: true }),
      keyEvent({ metaKey: true }),
      keyEvent({ key: 'Escape' }),
    ]
    for (const event of events) {
      assert.equal(handleKey(event), true)
      assert.equal(event.defaultPrevented, false)
    }
    assert.deepEqual(clipboardCapture.writes, [])
  })

  it('continues to let Tab and Shift+Tab navigate outside the terminal', () => {
    for (const shiftKey of [false, true]) {
      const event = keyEvent({ key: 'Tab', shiftKey })
      assert.equal(handleKey(event), false)
      assert.equal(event.defaultPrevented, false)
    }
    assert.deepEqual(clipboardCapture.writes, [])
  })
})
