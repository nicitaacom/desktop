import { createHash } from 'crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'

export const LinuxInstallationPath = '/opt/github-desktop-commit-search'
export const LinuxInstalledExecutable = join(LinuxInstallationPath, 'desktop')
export const LinuxBuildRecordPath = join(
  homedir(),
  '.local/share/github-desktop-commit-search-build.json'
)

interface IBuildRecord {
  readonly sourceCommit: string
  readonly builtAt: string
  readonly files: Readonly<Record<string, string>>
}

/** Remember successful manual installs as well as installs made by the script. */
export async function saveLinuxBuildRecord(contents: Buffer) {
  await mkdir(dirname(LinuxBuildRecordPath), { recursive: true })
  const temporaryPath = `${LinuxBuildRecordPath}.${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, contents, { mode: 0o644 })
    await rename(temporaryPath, LinuxBuildRecordPath)
  } finally {
    await unlink(temporaryPath).catch(() => {})
  }
}

/** Refuse source builds and installations containing files from another build. */
export async function verifyLinuxInstallation(
  executablePath: string,
  applicationPath: string,
  sourceCommit: string,
  readContents: (path: string) => Promise<Buffer> = readFile,
  saveRecord?: (contents: Buffer) => Promise<void>
): Promise<string | null> {
  if (executablePath !== LinuxInstalledExecutable) {
    return 'Run GitHub Desktop from /opt/github-desktop-commit-search/desktop. Source and dist builds are not installed applications. Run yarn install:linux in your checkout to rebuild and install the latest version.'
  }

  if (applicationPath !== join(LinuxInstallationPath, 'resources/app')) {
    return 'GitHub Desktop must use its installed application files in /opt/github-desktop-commit-search/resources/app.'
  }

  try {
    const recordContents = await readContents(
      join(dirname(executablePath), 'build-info.json')
    )
    const record: IBuildRecord = JSON.parse(recordContents.toString('utf8'))
    if (record.sourceCommit !== sourceCommit) {
      throw new Error('The installed revision does not match this build.')
    }
    const builtAt = Date.parse(record.builtAt)
    if (!Number.isFinite(builtAt)) {
      throw new Error('The build timestamp is missing or invalid.')
    }
    let latestRecord: IBuildRecord | undefined
    try {
      latestRecord = JSON.parse(
        (await readContents(LinuxBuildRecordPath)).toString('utf8')
      )
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e
      }
    }
    const latestBuiltAt = latestRecord
      ? Date.parse(latestRecord.builtAt)
      : undefined
    if (
      latestBuiltAt !== undefined &&
      (!Number.isFinite(latestBuiltAt) || latestBuiltAt > builtAt)
    ) {
      throw new Error('A newer installation is recorded for this user.')
    }
    // The renderer CSS is intentionally customizable by the user's cyan theme.
    for (const name of ['main.js', 'renderer.js']) {
      const key = `resources/app/${name}`
      const digest = createHash('sha256')
        .update(await readContents(join(applicationPath, name)))
        .digest('hex')
      if (record.files[key] !== digest) {
        throw new Error('The installed application contains mixed build files.')
      }
      if (
        latestRecord !== undefined &&
        latestBuiltAt === builtAt &&
        (latestRecord.sourceCommit !== record.sourceCommit ||
          latestRecord.files[key] !== digest)
      ) {
        throw new Error('A newer installation is recorded for this user.')
      }
    }
    if (
      saveRecord &&
      (latestBuiltAt === undefined || latestBuiltAt < builtAt)
    ) {
      await saveRecord(recordContents)
    }
    return null
  } catch {
    return 'This GitHub Desktop installation is incomplete or does not match its build record. Run yarn install:linux in your checkout to replace it with the latest complete build. Your repositories and login data will be kept.'
  }
}
