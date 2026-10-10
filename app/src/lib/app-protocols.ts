/** The callback scheme used by the OAuth application bundled with this build. */
export function getAuthenticationProtocol() {
  return __DEV_SECRETS__ ? 'x-github-desktop-dev-auth' : 'x-github-desktop-auth'
}

/** Find an app URL without interpreting any other arguments as CLI commands. */
export function findAppURL(
  argv: ReadonlyArray<string>,
  protocols: ReadonlySet<string>
): string | undefined {
  return argv.find(arg => {
    // Reject control characters before URL parsing, which would strip them.
    if (/[\u0000-\u0020\u007f]/.test(arg)) {
      return false
    }

    try {
      const url = new URL(arg)
      return (
        protocols.has(url.protocol.slice(0, -1)) &&
        arg.toLowerCase().startsWith(`${url.protocol}//`) &&
        url.hostname.length > 0
      )
    } catch {
      return false
    }
  })
}
