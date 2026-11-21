# DSH extension update manager

The host bundle registers `extension_update_check` as an on-demand compatibility
and release check. It uses the same installed manifest inspection as the standalone
compatibility script and fetches release information only from MMS-21/dsh-extensions.
The first managed package is Render UI.

In DSH Desktop, open **Plugins → Extension Updates** to check compatibility
and download an eligible Render UI release.

For the standard Windows Desktop profile, exit DSH, run
`install-desktop.ps1` from this directory, then reopen DSH.
To try the bundle in a development profile, link this directory as
`@local/dsh-plugin-update-manager` and include it in `dsh.profile.bundles`. Desktop
defaults to its packaged runtime and standard Desktop profile. Supply `runtimeRoot`
and `profileDir` in the bundle config for custom installations.

The release workflow builds the package on Windows, runs the unit and Chrome tests,
and packages the extension with its checksum and exact DSH peers. Release tags must
match `render-ui-v<package-version>`. Bump the version before tagging. The tag
publishes the package and metadata to GitHub Releases after the build job passes.
Run the native Desktop smoke fixture against the intended DSH version before
creating a release tag.

Use `extension_update_stage` to download an eligible release, verify the
archive bytes, and stage it under the Desktop profile's `.extension-updates`
directory. Installing the staged archive, rollback, and a Desktop Refresh
action require integration with the Desktop plugin manager.
