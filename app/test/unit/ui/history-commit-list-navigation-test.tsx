import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { CommitList } from '../../../src/ui/history/commit-list'
import { fireEvent, render, waitFor } from '../../helpers/ui/render'

const originalResizeObserver = globalThis.ResizeObserver
const originalWindowResizeObserver = window.ResizeObserver

beforeEach(() => {
  // Render the real virtualized rows, rather than testing a shortcut parser.
  globalThis.ResizeObserver = class implements ResizeObserver {
    public constructor(private readonly callback: ResizeObserverCallback) {}

    public observe(target: HTMLElement) {
      Object.defineProperties(target, {
        offsetWidth: { configurable: true, value: 350 },
        offsetHeight: { configurable: true, value: 400 },
      })
      this.callback(
        [
          {
            target,
            contentRect: target.getBoundingClientRect(),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          },
        ],
        this
      )
    }

    public unobserve() {}

    public disconnect() {}
  }
  window.ResizeObserver = globalThis.ResizeObserver
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
  window.ResizeObserver = originalWindowResizeObserver
})

const identity = new CommitIdentity('Test', 'test@example.com', new Date())
const commits = ['newest', 'newer', 'older', 'oldest'].map(
  sha => new Commit(sha, sha, sha, '', identity, identity, [], [], [])
)

async function renderHistory(selectedSHAs = ['newer'], withShortcut = true) {
  const directions: number[] = []
  const listSelections: ReadonlyArray<string>[] = []

  function History() {
    const [selection, setSelection] = React.useState(selectedSHAs)
    return (
      <div id="repository">
        <CommitList
          gitHubRepository={null}
          isLocalRepository={true}
          commitSHAs={commits.map(c => c.sha)}
          commitLookup={new Map(commits.map(c => [c.sha, c]))}
          selectedSHAs={selection}
          localCommitSHAs={[]}
          emoji={new Map()}
          accounts={[]}
          preferAbsoluteDates={false}
          onNavigateCommit={
            withShortcut
              ? direction => {
                  directions.push(direction)
                  const index = commits.findIndex(c => c.sha === selection[0])
                  const next = commits[index + direction]
                  if (next !== undefined) {
                    setSelection([next.sha])
                  }
                }
              : undefined
          }
          onCommitsSelected={selected => {
            const shas = selected.map(c => c.sha)
            listSelections.push(shas)
            setSelection(shas)
          }}
        />
      </div>
    )
  }

  const view = render(<History />)
  await waitFor(() => {
    assert.equal(view.container.querySelectorAll('[role="option"]').length, 4)
  })
  const rows = () =>
    Array.from(view.container.querySelectorAll<HTMLElement>('[role="option"]'))
  const selected = () =>
    rows()
      .filter(row => row.getAttribute('aria-selected') === 'true')
      .map(row => commits[rows().indexOf(row)].sha)

  return { ...view, rows, selected, directions, listSelections }
}

describe('History commit list keyboard navigation', () => {
  it('consumes repeated Shift+Down when the window shortcut has deferred', async () => {
    // No window navigation listener: reproduce the path that used to reach
    // List's Shift+Arrow range-selection handler during overlay transitions.
    const view = await renderHistory()
    for (const expected of ['older', 'oldest']) {
      const focused = view
        .rows()
        .find(r => r.getAttribute('aria-selected') === 'true')!
      assert.equal(
        fireEvent.keyDown(focused, { key: 'ArrowDown', shiftKey: true }),
        false
      )
      assert.deepEqual(view.selected(), [expected])
    }
    // Even the last row must consume the key instead of starting a range.
    fireEvent.keyDown(view.rows()[3], { key: 'ArrowDown', shiftKey: true })
    assert.deepEqual(view.selected(), ['oldest'])
    assert.deepEqual(view.directions, [1, 1, 1])
    assert.deepEqual(view.listSelections, [])
  })

  it('collapses an existing range to one commit and reverses with Shift+Up', async () => {
    const view = await renderHistory(['newer', 'older'])
    fireEvent.keyDown(view.rows()[2], { key: 'ArrowDown', shiftKey: true })
    assert.deepEqual(view.selected(), ['older'])
    fireEvent.keyDown(view.rows()[2], { key: 'ArrowUp', shiftKey: true })
    assert.deepEqual(view.selected(), ['newer'])
    assert.deepEqual(view.directions, [1, -1])
    assert.deepEqual(view.listSelections, [])
  })

  it('keeps Shift+click range selection available', async () => {
    const view = await renderHistory()
    fireEvent.mouseDown(view.rows()[3], { button: 0, shiftKey: true })
    assert.equal(view.selected().length, 3)
    assert.deepEqual(view.listSelections, [['newer', 'older', 'oldest']])
    assert.deepEqual(view.directions, [])
  })

  it('preserves keyboard range selection for commit lists outside History', async () => {
    const view = await renderHistory(['newer'], false)
    fireEvent.keyDown(view.rows()[1], { key: 'ArrowDown', shiftKey: true })
    assert.equal(view.selected().length, 2)
    assert.deepEqual(view.directions, [])
  })
})
