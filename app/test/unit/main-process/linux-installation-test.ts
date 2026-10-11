import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHash } from 'crypto'
import { join } from 'path'
import {
  LinuxInstallationPath,
  LinuxInstalledExecutable,
  LinuxBuildRecordPath,
  verifyLinuxInstallation,
} from '../../../src/main-process/linux-installation'

const applicationPath = join(LinuxInstallationPath, 'resources/app')
const revision = 'fixed-revision'

function fixture() {
  const contents = new Map<string, Buffer>()
  const files: Record<string, string> = {}
  for (const name of ['main.js', 'renderer.js']) {
    const data = Buffer.from(`installed ${name}`)
    contents.set(join(applicationPath, name), data)
    files[`resources/app/${name}`] = createHash('sha256')
      .update(data)
      .digest('hex')
  }
  contents.set(
    join(LinuxInstallationPath, 'build-info.json'),
    Buffer.from(
      JSON.stringify({
        sourceCommit: revision,
        builtAt: '2026-10-11T12:00:00Z',
        files,
      })
    )
  )
  const readContents = async (path: string) => {
    const data = contents.get(path)
    if (data === undefined) {
      throw Object.assign(new Error('missing installed file'), {
        code: 'ENOENT',
      })
    }
    return data
  }
  return { contents, readContents }
}

describe('required Linux installation', () => {
  it('allows a complete installed build without reading anything from its checkout', async () => {
    const { readContents } = fixture()
    assert.equal(
      await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        revision,
        readContents
      ),
      null
    )
  })

  it('blocks source builds before they can open a window or change the installed launcher', async () => {
    for (const executable of [
      '/home/kali/Documents/GitHub/desktop/dist/desktop-linux-x64/desktop',
      '/home/kali/Documents/GitHub/desktop-cyan-build-fork/dist/desktop-linux-x64/desktop',
      '/usr/bin/electron',
    ]) {
      assert.match(
        (await verifyLinuxInstallation(executable, applicationPath, revision))!,
        /Run GitHub Desktop from \/opt/
      )
    }
  })

  it('blocks loading application code from a checkout through the installed binary', async () => {
    assert.match(
      (await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        '/home/kali/Documents/GitHub/desktop/out',
        revision
      ))!,
      /installed application files/
    )
  })

  it('rejects a build record for a different revision', async () => {
    const { readContents } = fixture()
    assert.match(
      (await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        'old-revision',
        readContents
      ))!,
      /latest complete build/
    )
  })

  it('rejects a complete old installation when this user has installed a newer build', async () => {
    const { contents, readContents } = fixture()
    contents.set(
      LinuxBuildRecordPath,
      Buffer.from(
        JSON.stringify({
          sourceCommit: 'newer-revision',
          builtAt: '2026-10-12T12:00:00Z',
          files: {},
        })
      )
    )
    assert.match(
      (await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        revision,
        readContents
      ))!,
      /latest complete build/
    )
  })

  it('accepts and records a newer manual copy without requiring the old checkout', async () => {
    const { contents, readContents } = fixture()
    contents.set(
      LinuxBuildRecordPath,
      Buffer.from(
        JSON.stringify({
          sourceCommit: 'old-revision',
          builtAt: '2026-10-10T12:00:00Z',
          files: {},
        })
      )
    )
    let saved: Buffer | undefined
    assert.equal(
      await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        revision,
        readContents,
        async data => {
          saved = data
        }
      ),
      null
    )
    assert.equal(JSON.parse(saved!.toString('utf8')).sourceCommit, revision)
  })

  it('does not record a failed installation as the newest build', async () => {
    const { contents, readContents } = fixture()
    contents.set(join(applicationPath, 'main.js'), Buffer.from('outdated code'))
    let recorded = false
    assert.notEqual(
      await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        revision,
        readContents,
        async () => {
          recorded = true
        }
      ),
      null
    )
    assert.equal(recorded, false)
  })

  for (const name of ['main.js', 'renderer.js']) {
    it(`rejects an outdated or modified ${name}`, async () => {
      const { contents, readContents } = fixture()
      contents.set(join(applicationPath, name), Buffer.from('outdated code'))
      assert.match(
        (await verifyLinuxInstallation(
          LinuxInstalledExecutable,
          applicationPath,
          revision,
          readContents
        ))!,
        /latest complete build/
      )
    })
  }

  it('rejects missing or invalid installation records', async () => {
    const { contents, readContents } = fixture()
    for (const data of [
      undefined,
      Buffer.from('invalid'),
      Buffer.from('null'),
    ]) {
      const path = join(LinuxInstallationPath, 'build-info.json')
      if (data === undefined) {
        contents.delete(path)
      } else {
        contents.set(path, data)
      }
      assert.match(
        (await verifyLinuxInstallation(
          LinuxInstalledExecutable,
          applicationPath,
          revision,
          readContents
        ))!,
        /latest complete build/
      )
    }
  })

  it('allows the cyan stylesheet without treating customization as outdated code', async () => {
    const { contents, readContents } = fixture()
    contents.set(
      join(applicationPath, 'renderer.css'),
      Buffer.from('cyan theme')
    )
    assert.equal(
      await verifyLinuxInstallation(
        LinuxInstalledExecutable,
        applicationPath,
        revision,
        readContents
      ),
      null
    )
  })
})
