; Bachelor:Re NSIS installer hooks
; The directory page accepts any path the user types — including RELATIVE ones
; like ..\..\BachelorRe. NSIS would otherwise keep them relative to wherever the
; installer was launched from and copy files somewhere unexpected, so normalize
; $INSTDIR to an absolute path before any file is copied.

!macro NSIS_HOOK_PREINSTALL
  StrCmp "$INSTDIR" "" _skip_renormalize
    GetFullPathName $R0 "$INSTDIR"
    StrCpy $INSTDIR "$R0"
    SetOutPath "$INSTDIR"
_skip_renormalize:
!macroend
