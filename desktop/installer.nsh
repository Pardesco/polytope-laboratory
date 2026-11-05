!include nsDialogs.nsh
!include FileFunc.nsh

!ifndef BUILD_UNINSTALLER
Var polytopeDesktopCheckbox
Var polytopeDesktopChecked
!macro customPageAfterChangeDir
  Page custom polytopeShortcutPage polytopeShortcutLeave
  ; Defined here so MUI macros and plugins are available when these compile.
Function polytopeShortcutPage
  ; Skip on updates. ${isUpdated} needs the StdUtils plugin, which is not loaded
  ; when custom pages compile, so read the --updated switch directly.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose where to launch Polytope Laboratory."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 24u "A Start menu shortcut will be installed."
  Pop $0
  ${NSD_CreateCheckbox} 0 30u 100% 16u "Create a desktop shortcut"
  Pop $polytopeDesktopCheckbox
  ${NSD_Check} $polytopeDesktopCheckbox
  nsDialogs::Show
FunctionEnd
Function polytopeShortcutLeave
  ${NSD_GetState} $polytopeDesktopCheckbox $polytopeDesktopChecked
FunctionEnd
!macroend
!macro customInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
  ${AndIf} $polytopeDesktopChecked == ${BST_UNCHECKED}
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
!endif
