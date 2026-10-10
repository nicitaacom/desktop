import { constants } from 'fs'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import { execFile } from '../lib/exec-file'
import { desktopName } from '../../package.json'

/** Keep this identity separate from the standard GitHub Desktop installation. */
export const LinuxDesktopName = desktopName

const authenticationProtocols = [
  'x-github-desktop-auth',
  'x-github-desktop-dev-auth',
]

interface ILinuxProtocolOptions {
  readonly executablePath: string
  /** Required when launched with the Electron binary rather than a packaged app. */
  readonly appPath?: string
  readonly dataHome?: string
  readonly protocol: string
  readonly queryDefault?: (mimeType: string) => Promise<string>
  readonly setDefault?: (desktop: string, mimeType: string) => Promise<void>
  readonly updateDatabase?: (applications: string) => Promise<void>
}

function quoteExecArgument(value: string) {
  if (/[\r\n\u0000]/.test(value) || !isAbsolute(value)) {
    throw new Error('The login launcher requires an absolute executable path.')
  }

  // Escape quoted Exec arguments, then escape backslashes for the desktop
  // entry string value. Literal percent signs must not become field codes.
  const escaped = value
    .replace(/([\\`"$])/g, '\\$1')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '%%')
  return `"${escaped}"`
}

function updateDesktopEntry(existing: string, exec: string) {
  const lines = existing.trimEnd().split('\n')
  const start = lines.indexOf('[Desktop Entry]')
  if (start === -1) {
    throw new Error('The custom Desktop launcher is missing its Desktop Entry.')
  }
  const nextGroup = lines.findIndex(
    (line, index) => index > start && line.startsWith('[')
  )
  const end = nextGroup === -1 ? lines.length : nextGroup
  const entryLines = lines.slice(start + 1, end)
  const existingMimeTypes =
    entryLines
      .find(line => line.startsWith('MimeType='))
      ?.slice('MimeType='.length)
      .split(';')
      .filter(value => value.length > 0) ?? []
  const mimeTypes = new Set([
    ...existingMimeTypes,
    ...authenticationProtocols.map(p => `x-scheme-handler/${p}`),
  ])
  const values = new Map([
    ['Type', 'Application'],
    ['Exec', exec],
    ['MimeType', Array.from(mimeTypes).join(';') + ';'],
    ['Terminal', 'false'],
    ['Hidden', 'false'],
  ])
  const entry = entryLines.filter(line => {
    const key = line.split('=', 1)[0]
    return !values.has(key)
  })
  return [
    ...lines.slice(0, start + 1),
    ...entry,
    ...Array.from(values, ([key, value]) => `${key}=${value}`),
    ...lines.slice(end),
    '',
  ].join('\n')
}

/** Create/repair the launcher before registering and verifying the callback. */
export async function prepareLinuxAuthentication(
  options: ILinuxProtocolOptions
) {
  if (!authenticationProtocols.includes(options.protocol)) {
    throw new Error('Unsupported authentication protocol.')
  }
  await access(options.executablePath, constants.X_OK)

  const dataHome = options.dataHome ?? process.env.XDG_DATA_HOME
  const applications = join(
    dataHome && isAbsolute(dataHome)
      ? dataHome
      : join(homedir(), '.local/share'),
    'applications'
  )
  await mkdir(applications, { recursive: true })
  const desktopPath = join(applications, LinuxDesktopName)
  let existing: string
  try {
    existing = await readFile(desktopPath, 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e
    }
    existing = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=GitHub Desktop (custom)',
      'Comment=Custom GitHub Desktop',
      'Icon=github-desktop',
      'Categories=Development;RevisionControl;',
      'StartupWMClass=GitHub Desktop',
      'Terminal=false',
      '',
    ].join('\n')
  }

  const args = [
    options.executablePath,
    ...(options.appPath ? [options.appPath] : []),
  ]
  const updated = updateDesktopEntry(
    existing,
    `${args.map(quoteExecArgument).join(' ')} %u`
  )
  if (existing !== updated) {
    const temporaryPath = `${desktopPath}.${process.pid}.tmp`
    try {
      await writeFile(temporaryPath, updated, { mode: 0o644 })
      await rename(temporaryPath, desktopPath)
    } finally {
      await unlink(temporaryPath).catch(() => {})
    }
  }
  // Refresh even after a previously failed update so Retry can repair the cache.
  if (options.updateDatabase) {
    await options.updateDatabase(applications)
  } else {
    await execFile('update-desktop-database', [applications], { timeout: 5000 })
  }

  // Electron 42 delegates to xdg-settings, whose XFCE backend does not
  // implement default-url-scheme-handler. xdg-mime works across these desktops.
  const mimeType = `x-scheme-handler/${options.protocol}`
  const queryDefault = async () => {
    if (options.queryDefault) {
      return options.queryDefault(mimeType)
    }
    const { stdout } = await execFile(
      'xdg-mime',
      ['query', 'default', mimeType],
      {
        timeout: 5000,
      }
    )
    return stdout.trim()
  }
  if ((await queryDefault()) !== LinuxDesktopName) {
    if (options.setDefault) {
      await options.setDefault(LinuxDesktopName, mimeType)
    } else {
      await execFile('xdg-mime', ['default', LinuxDesktopName, mimeType], {
        timeout: 5000,
      })
    }
  }
  if ((await queryDefault()) !== LinuxDesktopName) {
    throw new Error(
      'Linux did not select this Desktop for GitHub login callbacks.'
    )
  }
}
