# Custom GitHub Desktop: required installation workflow

Read [the Linux installation guide](docs/installation.md#linux-custom-fork) before
changing or installing this fork. These are explicit user requirements:

1. Daily use MUST be `/opt/github-desktop-commit-search/desktop`. Never launch the
   app from this checkout or any other `~/Documents/GitHub/*/dist` directory, and
   never register a launcher or OAuth handler pointing there.
2. Deleting this entire checkout MUST leave the installed application working.
   Install the complete packaged directory, with no links back to source/builds.
3. Keep the cyan theme and the existing `~/.config/GitHub Desktop` profile,
   accounts, and repositories. Never reset user data to test an installation.
4. After EVERY application change, run the relevant checks and `yarn install:linux`.
   It rebuilds and replaces the `/opt` installation and reapplies the cyan theme.
   Never finish with a fix available only in source or an outdated build running.
5. Verify installed build hashes/revision, menu/command/OAuth paths, and the actual
   running process. Restart once if necessary to load changed code and leave the
   installed application open. Do not repeatedly open and close test windows.
6. Verify source independence by temporarily renaming the build output while
   launching from `/opt`, then restoring it. Do not delete the user's source.

Build output under `dist` is an installation artifact, not the user's application.
