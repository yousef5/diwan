; Included into the NSIS installer by electron-builder (electron-builder.cjs → nsis.include).
;
; customUnInstall: if the user turned on "Open whatsapp: links in Diwan", Electron registered the
; per-user handler HKCU\Software\Classes\whatsapp with the command "<install dir>\Diwan.exe" "--" "%1".
; Uninstalling must not leave that dead handler behind, but it must never touch another app's (e.g.
; WhatsApp Desktop's): the key goes only when its command runs THIS install's exe. An update runs the
; old uninstaller too; the exe stays where it is then, so the handler is kept.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    ReadRegStr $R0 HKCU "Software\Classes\whatsapp\shell\open\command" ""
    StrCpy $R1 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrLen $R2 $R1
    StrCpy $R3 0
    ; substring search, case-insensitive like Windows paths (StrCmp ignores case)
    diwan_whatsapp_loop:
      StrCpy $R4 $R0 $R2 $R3
      StrCmp $R4 "" diwan_whatsapp_done
      StrCmp $R4 $R1 diwan_whatsapp_ours
      IntOp $R3 $R3 + 1
      Goto diwan_whatsapp_loop
    diwan_whatsapp_ours:
      DeleteRegKey HKCU "Software\Classes\whatsapp"
    diwan_whatsapp_done:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  ${EndIf}
!macroend
