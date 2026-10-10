import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findAppURL } from '../../src/lib/app-protocols'
import { parseAppURL } from '../../src/lib/parse-app-url'

const protocols = new Set([
  'x-github-client',
  'x-github-desktop-auth',
  'x-github-desktop-dev-auth',
])

describe('callback command line arguments', () => {
  for (const scheme of protocols) {
    it(`recognizes ${scheme} on initial launch and second instance`, () => {
      const url = `${scheme}://oauth?code=test-code&state=test-state`
      for (const argv of [
        ['/opt/custom desktop/desktop', url],
        [
          '/opt/custom desktop/desktop',
          '--original-process-start-time=123',
          url,
        ],
        ['/usr/bin/electron', '/custom desktop/resources/app', url],
      ]) {
        const result = findAppURL(argv, protocols)
        assert.equal(result, url)
        assert.deepEqual(parseAppURL(result!), {
          name: 'oauth',
          code: 'test-code',
          state: 'test-state',
        })
      }
    })
  }

  it('does not accept arbitrary schemes, paths, malformed URLs or control characters', () => {
    for (const value of [
      'https://github.com/login',
      '/tmp/x-github-desktop-auth://oauth',
      'x-github-desktop-auth:oauth',
      'x-github-desktop-auth://',
      'x-github-desktop-auth://[',
      'x-github-desktop-auth://oa\nuth?code=test&state=test',
      '--cli-open=/some/repository',
    ]) {
      assert.equal(findAppURL(['/opt/desktop', value], protocols), undefined)
    }
  })

  it('rejects incomplete OAuth callbacks in the existing action parser', () => {
    for (const query of ['code=test', 'state=test', '']) {
      assert.equal(
        parseAppURL(`x-github-desktop-auth://oauth?${query}`).name,
        'unknown'
      )
    }
  })
})
