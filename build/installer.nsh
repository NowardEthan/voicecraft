; Voice NSIS customisations.
;
; We rely on the build config (package.json -> build.nsis):
;   - oneClick: true       -> no wizard screen, just an unattended install
;   - perMachine: false    -> install per-user into
;                            %LocalAppData%\Programs\Voice (no admin)
;   - deleteAppDataOnUninstall: false  -> preserve user data on uninstall
;
; Installation is started only after explicit user confirmation.
; electron-updater calls NSIS silently and forces VoiceCraft to reopen
; after the installer finishes (quitAndInstall(true, true)).
