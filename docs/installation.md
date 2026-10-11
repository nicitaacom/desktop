# Installing GitHub Desktop

GitHub Desktop currently supports Windows 7 (or higher) and macOS 10.9 (or higher).

### macOS

Download the `GitHub Desktop.zip`, unpack the application and put it wherever you want.

### Windows

On Windows you have two options:

 - Download the `GitHubDesktopSetup.exe` and run it to install it for the current user.
 - Download the `GitHubDesktopSetup.msi` and run it to install a machine-wide version of GitHub Desktop - each logged-in user will then be able to run GitHub Desktop from the program at `%PROGRAMFILES(x86)\GitHub Desktop Installer\desktop.exe`.

## Linux (custom fork)

This fork's installed application is **always
`/opt/github-desktop-commit-search/desktop`**. The checkout and `dist` are only
build inputs. Deleting all of `~/Documents/GitHub/desktop` after installation must
leave the application, browser login, cyan theme, and saved repositories working.
Never point a menu entry, pinned launcher, command, or OAuth handler at a checkout
or build output. Linux builds reject execution outside the installed `/opt` path
before creating the application window or preparing browser login.

Use this installation workflow:

```bash
# Optional: the existing install_deb shell helper installs the base icon/package.
install_deb "GitHub Desktop" "github-desktop" \
  "https://github.com/shiftkey/desktop/releases/download/release-3.1.1-linux1/GitHubDesktop-linux-3.1.1-linux1.deb" \
  "github-desktop.deb"

git clone --branch commit-search-in-history \
  https://github.com/nicitaacom/desktop.git ~/Documents/GitHub/desktop
cd ~/Documents/GitHub/desktop
yarn install:linux
```

For an existing checkout, update it with `git pull --ff-only` instead of cloning
over it. Run **`yarn install:linux` after every application change**. It installs
dependencies, builds the current source with `yarn build:prod`, copies the entire
package into `/opt`, updates the launchers and browser handlers, and starts the
installed application. It never reuses an old build. Administration is required
only to replace the `/opt` files; run the command as your normal user.

The installer restores `dark-cyan.css` and `github-desktop-accent` from
`~/Documents/txt/github-desktop-accent/` and applies the cyan theme to the freshly
built renderer CSS. The theme file is named **`dark-cyan.css`**, not
`dark-green.css`. It preserves `~/.config/GitHub Desktop`, including accounts,
repository lists, and preferences. It does not reset or copy your profile into
the checkout. Existing main processes are stopped once after replacement so the
new launch cannot activate an outdated build.

Each packaged Linux build contains `build-info.json` with the source revision and
SHA-256 hashes. The installer verifies these hashes, checks for links outside the
package, and stores the installed record at
`~/.local/share/github-desktop-commit-search-build.json`. The application refuses
missing records, mixed application bundles, and a build older than the user's
recorded installation. The cyan CSS can be customized without failing runtime
code verification. Runtime verification reads the installation and user record;
it never needs the source checkout.

The manual `yarn build:prod`, full-directory copy to `/opt`, launcher update, and
cyan-theme application also remain supported. The build command generates the
record automatically. On successful startup the app records a newer manual
installation, so an older user record does not block your newly copied build.
Launching after a manual replacement also checks an existing main process and
relaunches from `/opt` if it has old code in memory, retaining the same profile.

Before reporting an installation fixed, verify:

- The menu entry, `github-desktop` command, and browser scheme handlers resolve
  to `/opt/github-desktop-commit-search/desktop`.
- The installed record matches the current build and its file hashes; the actual
  running main process uses the installed executable.
- The cyan stylesheet matches the user's theme and the existing profile remains.
- With build output temporarily renamed, the installed app still launches and
  its bundled Git executable works. Restore the build directory afterward; never
  delete the user's checkout as a test. Leave the installed application open.

Automation may use `yarn install:linux --no-launch` and then launch the `/opt`
executable directly for this final source-independence check.

## Data Directories

GitHub Desktop will create directories to manage the files and data it needs to function. If you manage a network of computers and want to install GitHub Desktop, here is more information about how things work.

### macOS
 - `~/Library/Application Support/GitHub Desktop/` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

### Windows

 - `%LOCALAPPDATA%\GitHubDesktop\` - contains the latest versions of the app, and some older versions if the user has updated from a previous version.
 - `%APPDATA%\GitHub Desktop\` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

## Log Files

GitHub Desktop will generate logs as part of its normal usage, to assist with troubleshooting. They are located in the data directory that GitHub Desktop uses (see above) under a `logs` subdirectory, organized by date using the format `YYYY-MM-DD.desktop.production.log`, where `YYYY-MM-DD` is the day the log was created.

## Installer Logs

Problems with installing or updating GitHub Desktop are tracked in a separate file which is managed by the updater frameworks used in the app.

### macOS

 - `~/Library/Caches/com.github.GitHubClient.ShipIt/ShipIt_stderr.log` - this file will contain details about why the installation or update failed - check the end of the file for recent activity.

### Windows

 - `%LOCALAPPDATA%\GitHubDesktop\SquirrelSetup.log` - this file will contain details about update attempts for GitHub Desktop after it's been successfully installed.
 - `%LOCALAPPDATA%\SquirrelSetup.log` - information about the initial installation may be found here. As this framework is used by different apps, it may also contain details about other apps. Ensure that you focus on mentions of `GitHubDesktop.exe` in the log.

