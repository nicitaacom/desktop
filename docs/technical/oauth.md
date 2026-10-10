# Developer OAuth App

Because GitHub Desktop uses [OAuth web application flow](https://developer.github.com/v3/oauth/#web-application-flow)
to interact with the GitHub API and perform actions on behalf of a user, it
needs to be bundled with a Client ID and Secret.

For external contributors, we have bundled a developer OAuth application
with the Desktop application so that you can complete the sign in flow locally
without needing to configure your own application.

These are listed in [app/app-info.ts](https://github.com/desktop/desktop/blob/85cf9dbae5055cc4f0de9fb4f7046cd32607e877/app/app-info.ts#L9-L10).

**DO NOT TRUST THIS CLIENT ID AND SECRET! THIS IS ONLY FOR TESTING PURPOSES!!**

The limitation with this developer application is that **this will not work
with GitHub Enterprise**. You will see  sign-in will fail on the OAuth callback
due to the credentials not being present there.

## Provide your own Client ID and Secret

The OAuth client ID and Client Secret are bundled into the application with
webpack. If you want to provide your own Client ID and Client Secret, set these
environment variables:

 - `DESKTOP_OAUTH_CLIENT_ID`
 - `DESKTOP_OAUTH_CLIENT_SECRET`

## Linux browser callbacks

The custom build uses `github-desktop-commit-search.desktop` as its Linux
desktop identity. Before opening browser sign-in, it repairs that launcher in
`$XDG_DATA_HOME/applications` (or `~/.local/share/applications`) to point to the
running executable and declares both GitHub authentication schemes. Existing
launcher names, icons, and other MIME types are preserved.

It refreshes the desktop database, selects the current build's authentication
scheme using `xdg-mime`, and verifies the selected handler. These operations
require `xdg-utils`, `desktop-file-utils`, and a writable user application
directory. Registration uses `xdg-mime` because Electron 42's `xdg-settings`
implementation does not support URL scheme handlers on XFCE.

Callback URLs are processed both at startup and when another instance forwards
its arguments to the running app. OAuth state must match the active sign-in
request; cancelled requests and duplicate callbacks cannot finish a new session.
Registration, browser, and API failures appear in the sign-in UI with a retry
action. A fresh sign-in repairs associations changed by another installation.
