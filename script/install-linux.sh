#!/usr/bin/env bash
# Always build and install the current checkout. Never launch its dist binary.
set -euo pipefail

installedDir=/opt/github-desktop-commit-search

verify_package() {
  python3 - "$1" <<'PY'
import hashlib, json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
record = json.loads((root / 'build-info.json').read_text())
for name, expected in record['files'].items():
    path = root / name
    if not path.resolve().is_relative_to(root.resolve()):
        raise SystemExit(f'External build dependency: {path}')
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Build verification failed: {path}')
for path in root.rglob('*'):
    if path.is_symlink() and not path.resolve().is_relative_to(root.resolve()):
        raise SystemExit(f'External source dependency: {path}')
if not os.access(root / 'desktop', os.X_OK):
    raise SystemExit('The packaged executable is missing')
print('Verified build:', record['sourceCommit'])
PY
}

# Run only the file replacement with root privileges. User data is never touched.
if [[ ${1:-} == --install-root ]]; then
  [[ $(id -u) == 0 ]] || { echo 'Root privileges required' >&2; exit 1; }
  packageDir=$2
  stageDir=$(mktemp -d /opt/github-desktop-commit-search-staging.XXXXXX)
  trap 'rm -rf -- "$stageDir"' EXIT
  cp -aL -- "$packageDir/." "$stageDir/"
  chmod 755 "$stageDir"
  chown -R root:root "$stageDir"
  verify_package "$stageDir"
  if [[ -e $installedDir ]]; then
    mkdir -p /opt/github-desktop-commit-search-backups
    backupDir=$(mktemp -d /opt/github-desktop-commit-search-backups/install.XXXXXX)
    mv -- "$installedDir" "$backupDir/app"
    if ! mv -- "$stageDir" "$installedDir"; then
      mv -- "$backupDir/app" "$installedDir"
      exit 1
    fi
  else
    mv -- "$stageDir" "$installedDir"
  fi
  echo "Installed: $installedDir"
  exit 0
fi

[[ $(uname -s) == Linux ]] || { echo 'This installer requires Linux' >&2; exit 1; }
[[ $(id -u) != 0 ]] || { echo 'Run as your normal user; installation requests admin authentication' >&2; exit 1; }
[[ ${1:-} == '' || ${1:-} == --no-launch ]] || { echo 'Usage: yarn install:linux [--no-launch]' >&2; exit 1; }

checkoutDir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$checkoutDir"
themeSource=$HOME/Documents/txt/github-desktop-accent
[[ -f $themeSource/dark-cyan.css && -f $themeSource/github-desktop-accent ]] || {
  echo "Missing cyan theme files in $themeSource" >&2; exit 1;
}
mkdir -p "$HOME/.local/share/github-desktop-accent" "$HOME/.local/bin"
cp -- "$themeSource/dark-cyan.css" "$HOME/.local/share/github-desktop-accent/"
cp -- "$themeSource/github-desktop-accent" "$HOME/.local/bin/"
chmod +x "$HOME/.local/bin/github-desktop-accent"

yarn install --frozen-lockfile
yarn build:prod
case $(uname -m) in
  x86_64) architecture=x64 ;;
  aarch64) architecture=arm64 ;;
  *) echo 'Unsupported architecture' >&2; exit 1 ;;
esac
packageDir=$checkoutDir/dist/desktop-linux-$architecture
chmod 755 "$packageDir"
APP_CSS="$packageDir/resources/app/renderer.css" "$HOME/.local/bin/github-desktop-accent"
python3 - "$packageDir" <<'PY'
import hashlib, json, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
path = root / 'build-info.json'
record = json.loads(path.read_text())
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
if record['sourceCommit'] != revision:
    raise SystemExit('The packaged build does not match the current checkout')
record['sourceBranch'] = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
record['sourceDirty'] = bool(subprocess.check_output(['git', 'status', '--porcelain'], text=True))
record['files']['resources/app/renderer.css'] = hashlib.sha256((root / 'resources/app/renderer.css').read_bytes()).hexdigest()
path.write_text(json.dumps(record, indent=2) + '\n')
PY
verify_package "$packageDir"

if sudo -n true 2>/dev/null; then
  sudo bash "$checkoutDir/script/install-linux.sh" --install-root "$packageDir"
elif [[ -t 0 ]]; then
  sudo bash "$checkoutDir/script/install-linux.sh" --install-root "$packageDir"
else
  # Avoid pkexec iterating over the host's unusually high descriptor limit.
  (ulimit -n 1024; pkexec /bin/bash "$checkoutDir/script/install-linux.sh" --install-root "$packageDir")
fi
verify_package "$installedDir"

applicationsDir=${XDG_DATA_HOME:-$HOME/.local/share}/applications
mkdir -p "$applicationsDir"
cat > "$applicationsDir/github-desktop-commit-search.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=GitHub Desktop (commit search)
Comment=GitHub Desktop with commit title search in the History tab
Exec=/opt/github-desktop-commit-search/desktop %U
Icon=github-desktop
Categories=Development;RevisionControl;
StartupWMClass=GitHub Desktop
Terminal=false
Hidden=false
MimeType=x-scheme-handler/x-github-desktop-auth;x-scheme-handler/x-github-desktop-dev-auth;x-scheme-handler/x-github-client;
EOF
# Override the packaged .deb's launcher so it cannot start the old application.
sed 's/^Hidden=false$/Hidden=true/' "$applicationsDir/github-desktop-commit-search.desktop" > "$applicationsDir/github-desktop.desktop"
ln -sfn "$installedDir/desktop" "$HOME/.local/bin/github-desktop"
update-desktop-database "$applicationsDir"
desktop-file-validate "$applicationsDir/github-desktop-commit-search.desktop"
for protocol in x-github-desktop-auth x-github-desktop-dev-auth x-github-client; do
  xdg-mime default github-desktop-commit-search.desktop "x-scheme-handler/$protocol"
  [[ $(xdg-mime query default "x-scheme-handler/$protocol") == github-desktop-commit-search.desktop ]]
done
cp -- "$installedDir/build-info.json" "$HOME/.local/share/github-desktop-commit-search-build.json"

# Stop previous main processes so a new launch cannot activate outdated code.
python3 - <<'PY'
import os, pathlib, signal, time
targets = []
for process in pathlib.Path('/proc').iterdir():
    if not process.name.isdigit():
        continue
    try:
        if process.stat().st_uid != os.getuid():
            continue
        args = (process / 'cmdline').read_bytes().split(b'\0')
        executable = args[0].decode()
        actual_executable = os.readlink(process / 'exe').removesuffix(' (deleted)')
        is_installed = (
            os.path.realpath(executable) == '/opt/github-desktop-commit-search/desktop'
            or actual_executable == '/opt/github-desktop-commit-search/desktop'
            or (actual_executable.startswith('/opt/github-desktop-commit-search-backups/') and actual_executable.endswith('/app/desktop'))
            or actual_executable == '/usr/lib/github-desktop/github-desktop'
        )
        is_source = any(
            path.startswith(str(pathlib.Path.home() / 'Documents/GitHub') + '/') and '/dist/desktop-linux-' in path and path.endswith('/desktop')
            for path in [executable, actual_executable]
        )
        if (is_installed or is_source) and not any(arg.startswith(b'--type=') for arg in args):
            targets.append(int(process.name))
    except (OSError, UnicodeError):
        pass
for pid in targets:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
deadline = time.monotonic() + 10
while any(pathlib.Path(f'/proc/{pid}').exists() for pid in targets):
    if time.monotonic() >= deadline:
        raise SystemExit('Previous Desktop is still running; close it before launching the installed build')
    time.sleep(0.1)
PY

if [[ ${1:-} != --no-launch ]]; then
  gtk-launch github-desktop-commit-search
fi
echo "Latest build installed; cyan theme and existing GitHub Desktop profile preserved."
