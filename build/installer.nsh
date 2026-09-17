; Voice NSIS customisations.
;
; We rely on the build config (package.json -> build.nsis):
;   - oneClick: true       -> no wizard screen, just an unattended install
;   - perMachine: false    -> install per-user into
;                            %LocalAppData%\Programs\Voice (no admin)
;   - deleteAppDataOnUninstall: false  -> preserve user data on uninstall
;
; After install, our main.js self-relaunches Voice via
; app.relaunch() 12 s after spawning the installer. We deliberately do
; NOT pass /restartapplications to NSIS because it triggers UAC on some
; Windows configurations even when perMachine is false. See
; electron/main.js :: runSilentInstaller.
