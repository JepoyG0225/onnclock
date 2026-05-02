; OnClock Desktop — custom NSIS hooks
; Runs inside .onInit — before NSIS checks for a running instance.
; Force-kills any existing OnClock Desktop process so the installer
; never shows the "please close manually" dialog.

!macro customInit
  ; Kill any running instance silently before the running-app check
  nsExec::ExecToLog '"taskkill" /F /IM "OnClock Desktop.exe" /T'
  Sleep 800
!macroend
