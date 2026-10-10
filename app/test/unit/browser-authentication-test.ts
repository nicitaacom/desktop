import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { SignInStore, SignInStep } from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function setup() {
  const account = new Account(
    'octocat',
    getDotComAPIEndpoint(),
    'test-token',
    [],
    '',
    1,
    'Octocat',
    'free'
  )
  const authentication = {
    prepare: mock.fn(async (): Promise<string | null> => null),
    openBrowser: mock.fn(async (_url: string) => true),
    requestToken: mock.fn(
      async (_endpoint: string, _code: string): Promise<string | null> =>
        'test-token'
    ),
    fetchUser: mock.fn(async (_endpoint: string, _token: string) => account),
  }
  const store = new SignInStore(
    new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore()),
    authentication
  )
  const completed = mock.fn((_account: Account) => {})
  store.onDidAuthenticate(completed)
  store.beginDotComSignIn()
  return { store, authentication, completed, account }
}

function callback(store: SignInStore) {
  const state = store.getState()
  assert.ok(state?.kind === SignInStep.Authentication && state.oauthState)
  return {
    name: 'oauth' as const,
    state: state.oauthState.state,
    code: 'test-code',
  }
}

function expectRetry(store: SignInStore, message: RegExp) {
  const state = store.getState()
  assert.ok(state?.kind === SignInStep.Authentication)
  assert.equal(state.loading, false)
  assert.equal(state.oauthState, undefined)
  assert.match(state.error!.message, message)
}

describe('browser authentication', () => {
  it('prepares the handler before opening the browser and completes the callback', async () => {
    const { store, authentication, completed, account } = setup()
    const prepared = deferred<string | null>()
    authentication.prepare.mock.mockImplementation(() => prepared.promise)
    const launch = store.authenticateWithBrowser()
    assert.equal(authentication.openBrowser.mock.callCount(), 0)
    prepared.resolve(null)
    await launch
    assert.equal(authentication.openBrowser.mock.callCount(), 1)
    const action = callback(store)
    assert.equal(
      new URL(
        authentication.openBrowser.mock.calls[0].arguments[0]
      ).searchParams.get('state'),
      action.state
    )
    await store.resolveOAuthRequest(action)
    assert.equal(store.getState()?.kind, SignInStep.Success)
    assert.equal(completed.mock.callCount(), 1)
    assert.equal(completed.mock.calls[0].arguments[0], account)
  })

  it('shows a preparation failure without opening the browser and supports retry', async () => {
    const { store, authentication } = setup()
    authentication.prepare.mock.mockImplementationOnce(
      async () => 'Could not prepare GitHub login. Please retry.'
    )
    await store.authenticateWithBrowser()
    expectRetry(store, /prepare GitHub login/)
    assert.equal(authentication.openBrowser.mock.callCount(), 0)
    await store.authenticateWithBrowser()
    assert.equal(authentication.openBrowser.mock.callCount(), 1)
    assert.ok(callback(store))
  })

  it('handles both false and rejected browser-opening results', async () => {
    const { store, authentication } = setup()
    authentication.openBrowser.mock.mockImplementationOnce(async () => false)
    await store.authenticateWithBrowser()
    expectRetry(store, /default browser/)
    authentication.openBrowser.mock.mockImplementationOnce(async () => {
      throw new Error('browser unavailable')
    })
    await store.authenticateWithBrowser()
    expectRetry(store, /browser unavailable/)
  })

  it('ignores double submissions and cancellation during preparation', async () => {
    const { store, authentication } = setup()
    const prepared = deferred<string | null>()
    authentication.prepare.mock.mockImplementation(() => prepared.promise)
    const launch = store.authenticateWithBrowser()
    await store.authenticateWithBrowser()
    assert.equal(authentication.prepare.mock.callCount(), 1)
    store.reset()
    prepared.resolve(null)
    await launch
    assert.equal(authentication.openBrowser.mock.callCount(), 0)
    assert.equal(store.getState(), null)
  })

  it('rejects mismatched state and only exchanges a duplicated callback once', async () => {
    const { store, authentication, completed } = setup()
    await store.authenticateWithBrowser()
    const action = callback(store)
    await store.resolveOAuthRequest({ ...action, state: 'wrong-state' })
    assert.equal(authentication.requestToken.mock.callCount(), 0)
    const token = deferred<string | null>()
    authentication.requestToken.mock.mockImplementation(() => token.promise)
    const first = store.resolveOAuthRequest(action)
    await store.resolveOAuthRequest(action)
    assert.equal(authentication.requestToken.mock.callCount(), 1)
    token.resolve('test-token')
    await first
    await store.resolveOAuthRequest(action)
    assert.equal(completed.mock.callCount(), 1)
  })

  it('does not finish a cancelled session when token exchange completes', async () => {
    const { store, authentication, completed } = setup()
    await store.authenticateWithBrowser()
    const token = deferred<string | null>()
    authentication.requestToken.mock.mockImplementation(() => token.promise)
    const resolution = store.resolveOAuthRequest(callback(store))
    store.reset()
    token.resolve('test-token')
    await resolution
    assert.equal(authentication.fetchUser.mock.callCount(), 0)
    assert.equal(completed.mock.callCount(), 0)
    assert.equal(store.getState(), null)
  })

  it('does not finish a later session when an earlier user request completes', async () => {
    const { store, authentication, completed, account } = setup()
    await store.authenticateWithBrowser()
    const user = deferred<Account>()
    authentication.fetchUser.mock.mockImplementation(() => user.promise)
    const resolution = store.resolveOAuthRequest(callback(store))
    await Promise.resolve()
    assert.equal(authentication.fetchUser.mock.callCount(), 1)
    store.beginDotComSignIn()
    await store.authenticateWithBrowser()
    const newState = store.getState()
    user.resolve(account)
    await resolution
    assert.equal(store.getState(), newState)
    assert.equal(completed.mock.callCount(), 0)
  })

  it('clears loading after token and user API failures', async () => {
    const { store, authentication } = setup()
    authentication.requestToken.mock.mockImplementationOnce(async () => null)
    await store.authenticateWithBrowser()
    await store.resolveOAuthRequest(callback(store))
    expectRetry(store, /retry/)
    await store.authenticateWithBrowser()
    authentication.fetchUser.mock.mockImplementationOnce(async () => {
      throw new Error('user unavailable')
    })
    await store.resolveOAuthRequest(callback(store))
    expectRetry(store, /connection and retry/)
  })

  it('does not send a cancellation result when dismissing a successful login', async () => {
    const { store } = setup()
    const result = mock.fn()
    store.beginDotComSignIn(result)
    await store.authenticateWithBrowser()
    await store.resolveOAuthRequest(callback(store))
    store.reset()
    assert.equal(result.mock.callCount(), 1)
    assert.equal(result.mock.calls[0].arguments[0].kind, 'success')
  })
})
