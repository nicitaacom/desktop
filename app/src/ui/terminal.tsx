import {
  ITerminalOptions,
  ITerminalInitOnlyOptions,
  Terminal as XTermTerminal,
} from '@xterm/xterm'
import React from 'react'
import { clipboard } from 'electron'
import { getMonospaceFontFamily } from './get-monospace-font-family'
import { TerminalOutput } from '../lib/git'

export const defaultTerminalOptions: Readonly<ITerminalOptions> = {
  convertEol: true,
  fontFamily: getMonospaceFontFamily(),
  fontSize: 12,
  screenReaderMode: true,
}

export type TerminalProps = ITerminalOptions &
  ITerminalInitOnlyOptions & {
    readonly terminalOutput?: TerminalOutput
    readonly hideCursor?: boolean
    /** Fit columns to the container; optionally fill its height as well. */
    readonly autoFit?: boolean
    readonly fitHeight?: boolean
  }

export class Terminal extends React.Component<TerminalProps> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private terminal: XTermTerminal | null = null
  private resizeObserver: ResizeObserver | null = null
  private resizeFrame: number | null = null

  public get Terminal() {
    return this.terminal
  }

  public write(data: TerminalOutput) {
    if (Array.isArray(data)) {
      data.forEach(chunk => this.terminal?.write(chunk))
    } else {
      this.terminal?.write(data)
    }
  }

  public componentWillUnmount(): void {
    this.resizeObserver?.disconnect()
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame)
    }
    this.terminal?.dispose()
  }

  public componentDidMount() {
    const { terminalOutput, hideCursor, autoFit, fitHeight, ...initOpts } =
      this.props
    this.terminal = new XTermTerminal({
      ...defaultTerminalOptions,
      ...initOpts,

      rows: fitHeight ? 1 : this.props.rows ?? 20,
      cols: this.props.cols ?? 80,
    })

    this.terminal.attachCustomKeyEventHandler((key: KeyboardEvent) => {
      const copyModifier = __DARWIN__
        ? key.metaKey && !key.ctrlKey && !key.shiftKey
        : key.ctrlKey && !key.metaKey

      if (
        key.type === 'keydown' &&
        key.key.toLowerCase() === 'c' &&
        copyModifier &&
        !key.altKey
      ) {
        // xterm selections aren't DOM selections. Copy them explicitly before
        // the terminal can consume the shortcut or clear the selection.
        const selection = this.terminal?.getSelection()
        if (selection) {
          clipboard.writeText(selection)
          key.preventDefault()
          key.stopPropagation()
          return false
        }
      }

      if (key.key === 'Tab') {
        // We don't want to handle tab key events in the terminal as it
        // breaks tab navigation in the app. The terminal is read only and
        // doesn't support tab input, so we can safely ignore it.
        return false
      }
      return true
    })

    if (this.terminalRef.current) {
      this.terminal.open(this.terminalRef.current)

      if (hideCursor !== false) {
        this.terminal.write('\x1b[?25l') // hide cursor
      }
      if (terminalOutput) {
        this.write(terminalOutput)
      }
      if (autoFit) {
        this.resizeObserver = new ResizeObserver(this.scheduleFit)
        this.resizeObserver.observe(this.terminalRef.current)
        this.scheduleFit()
      }
    }
  }

  public componentDidUpdate() {
    if (this.props.autoFit) {
      this.scheduleFit()
    }
  }

  private scheduleFit = () => {
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame)
    }
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null
      const terminal = this.terminal
      const container = this.terminalRef.current
      const element = terminal?.element
      const screen = element?.querySelector<HTMLElement>('.xterm-screen')
      if (
        !terminal ||
        !container ||
        !element ||
        !screen ||
        screen.clientWidth === 0 ||
        screen.clientHeight === 0
      ) {
        return
      }
      const style = getComputedStyle(element)
      const horizontalPadding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const verticalPadding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const cellWidth = screen.clientWidth / terminal.cols
      const cellHeight = screen.clientHeight / terminal.rows
      const viewport = element.querySelector<HTMLElement>('.xterm-viewport')
      const scrollbar = viewport
        ? viewport.offsetWidth - viewport.clientWidth
        : 0
      const cols = Math.max(
        2,
        Math.floor(
          (container.clientWidth - horizontalPadding - scrollbar) / cellWidth
        )
      )
      const rows = this.props.fitHeight
        ? Math.max(
            1,
            Math.floor((container.clientHeight - verticalPadding) / cellHeight)
          )
        : this.props.rows ?? 20
      if (cols !== terminal.cols || rows !== terminal.rows) {
        terminal.resize(cols, rows)
      }
    })
  }

  public render() {
    return <div className="terminal-container" ref={this.terminalRef}></div>
  }
}
