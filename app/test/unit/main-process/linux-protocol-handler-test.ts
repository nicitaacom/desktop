import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  LinuxDesktopName,
  prepareLinuxAuthentication,
} from '../../../src/main-process/linux-protocol-handler'

describe(
  'Linux login callback registration',
  { skip: process.platform !== 'linux' },
  () => {
    let dataHome: string
    let desktopPath: string
    let executablePath: string
    let selected: boolean
    let registrationCount: number
    let databaseUpdates: number

    beforeEach(async () => {
      dataHome = await mkdtemp(join(tmpdir(), 'desktop-login-'))
      executablePath = join(dataHome, 'custom desktop $`"%\\')
      await writeFile(executablePath, '', { mode: 0o755 })
      await mkdir(join(dataHome, 'applications'))
      desktopPath = join(dataHome, 'applications', LinuxDesktopName)
      selected = false
      registrationCount = 0
      databaseUpdates = 0
    })

    afterEach(async () => {
      await rm(dataHome, { recursive: true, force: true })
    })

    function options() {
      return {
        dataHome,
        executablePath,
        protocol: 'x-github-desktop-dev-auth',
        queryDefault: async () =>
          selected ? LinuxDesktopName : 'github-desktop.desktop',
        setDefault: async (desktop: string, mimeType: string) => {
          assert.equal(desktop, LinuxDesktopName)
          assert.equal(mimeType, 'x-scheme-handler/x-github-desktop-dev-auth')
          registrationCount++
          selected = true
        },
        updateDatabase: async (applications: string) => {
          assert.equal(applications, join(dataHome, 'applications'))
          databaseUpdates++
        },
      }
    }

    it('creates a launcher with both schemes and safely quoted URL arguments', async () => {
      await prepareLinuxAuthentication(options())
      const entry = await readFile(desktopPath, 'utf8')
      assert.ok(entry.includes('x-scheme-handler/x-github-desktop-dev-auth;'))
      assert.ok(entry.includes('x-scheme-handler/x-github-desktop-auth;'))
      assert.ok(entry.includes('Exec="'))
      assert.ok(entry.includes('custom desktop \\\\$\\\\`\\\\"%%\\\\\\\\" %u'))
      assert.ok(entry.includes('Hidden=false'))
      assert.equal(registrationCount, 1)
      assert.equal(databaseUpdates, 1)
    })

    it('repairs stale paths and preserves launcher metadata and action groups', async () => {
      await writeFile(
        desktopPath,
        [
          '[Desktop Entry]',
          'Name=My custom Desktop',
          'Icon=my-icon',
          'Exec=/removed/desktop %U',
          'Hidden=true',
          'MimeType=x-scheme-handler/x-github-client;',
          '[Desktop Action Example]',
          'Exec=/another/program',
          '',
        ].join('\n')
      )
      await prepareLinuxAuthentication(options())
      const entry = await readFile(desktopPath, 'utf8')
      assert.ok(entry.includes('Name=My custom Desktop\nIcon=my-icon'))
      assert.ok(!entry.includes('/removed/desktop'))
      assert.ok(entry.includes('x-scheme-handler/x-github-client;'))
      assert.ok(
        entry.includes('[Desktop Action Example]\nExec=/another/program')
      )
      assert.equal(registrationCount, 1)
    })

    it('does not rewrite an unchanged launcher and repairs a changed association', async () => {
      await prepareLinuxAuthentication(options())
      const first = await stat(desktopPath)
      await prepareLinuxAuthentication(options())
      assert.equal((await stat(desktopPath)).mtimeMs, first.mtimeMs)
      assert.equal(registrationCount, 1)
      selected = false
      await prepareLinuxAuthentication(options())
      assert.equal(registrationCount, 2)
      assert.equal(databaseUpdates, 3)
    })

    it('includes the app path for an unpackaged Electron invocation', async () => {
      await prepareLinuxAuthentication({
        ...options(),
        appPath: join(dataHome, 'resources app'),
      })
      assert.ok(
        (await readFile(desktopPath, 'utf8')).includes(
          `" "${join(dataHome, 'resources app')}" %u`
        )
      )
    })

    it('reports registration failures and verifies the effective association', async () => {
      await assert.rejects(
        prepareLinuxAuthentication({
          ...options(),
          setDefault: async () => {
            throw new Error('could not register')
          },
        }),
        /could not register/
      )
      await assert.rejects(
        prepareLinuxAuthentication({
          ...options(),
          setDefault: async () => {},
        }),
        /did not select/
      )
    })

    it('retries the database update after failure even if the launcher already exists', async () => {
      await assert.rejects(
        prepareLinuxAuthentication({
          ...options(),
          updateDatabase: async () => {
            throw new Error('missing utility')
          },
        }),
        /missing utility/
      )
      assert.equal(registrationCount, 0)
      await prepareLinuxAuthentication(options())
      assert.equal(registrationCount, 1)
    })

    it('reports unwritable storage and missing executables before registration', async () => {
      const file = join(dataHome, 'not-a-directory')
      await writeFile(file, '')
      await assert.rejects(
        prepareLinuxAuthentication({ ...options(), dataHome: file })
      )
      await assert.rejects(
        prepareLinuxAuthentication({
          ...options(),
          executablePath: join(dataHome, 'missing'),
        })
      )
      assert.equal(registrationCount, 0)
    })
  }
)
