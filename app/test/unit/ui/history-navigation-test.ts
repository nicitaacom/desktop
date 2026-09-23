import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { getHistoryNavigation } from '../../../src/ui/history/navigation'

describe('History navigation shortcuts', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function navigation(
    markup: string,
    selector: string,
    init: KeyboardEventInit
  ) {
    document.body.innerHTML = markup
    const target = document.querySelector(selector)!
    const event = new window.KeyboardEvent('keydown', {
      bubbles: true,
      ...init,
    })
    target.dispatchEvent(event)
    return getHistoryNavigation(event)
  }

  it('uses Shift+arrows for commits and plain arrows for files', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      for (const shiftKey of [false, true]) {
        assert.deepEqual(
          navigation(
            '<div id="repository"><div id="history"></div></div>',
            '#history',
            { key, shiftKey }
          ),
          {
            kind: shiftKey ? 'commit' : 'file',
            direction: key === 'ArrowUp' ? -1 : 1,
          }
        )
      }
    }
  })

  it('works from the read-only diff textarea', () => {
    assert.deepEqual(
      navigation(
        '<div id="repository"><div id="history"><div class="CodeMirror"><textarea></textarea></div></div></div>',
        'textarea',
        { key: 'ArrowDown' }
      ),
      { kind: 'file', direction: 1 }
    )
  })

  it('continues navigation when replacing the diff leaves focus on body', () => {
    assert.deepEqual(
      navigation('<div id="repository"></div>', 'body', { key: 'ArrowDown' }),
      { kind: 'file', direction: 1 }
    )
  })

  it('leaves typing and dropdowns alone', () => {
    for (const element of [
      '<input>',
      '<textarea></textarea>',
      '<select></select>',
      '<div contenteditable="true"></div>',
    ]) {
      assert.equal(
        navigation(`<div id="repository">${element}</div>`, '#repository > *', {
          key: 'ArrowUp',
          shiftKey: true,
        }),
        null
      )
    }
  })

  it('ignores unrelated keys, extra modifiers, composition and other views', () => {
    for (const init of [
      { key: 'a' },
      { key: 'ArrowUp', ctrlKey: true },
      { key: 'ArrowUp', altKey: true },
      { key: 'ArrowUp', metaKey: true },
      { key: 'ArrowUp', isComposing: true },
    ]) {
      assert.equal(
        navigation('<div id="repository"></div>', '#repository', init),
        null
      )
    }
    assert.equal(
      navigation('<div id="elsewhere"></div>', '#elsewhere', {
        key: 'ArrowDown',
      }),
      null
    )
  })
})
