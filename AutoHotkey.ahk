
#IfWinActive ahk_exe vlc.exe

h::send, {left}  ; Makes the 'h' key send a left-arrow key, but only in VLC.
j::send, {down}
k::send, {up}
l::send, {right}

^u::send, {Volume_Up}   ; Makes the Ctrl-u key send volume-up key, but only in VLC.
^d::send, {Volume_Down}

u::send, {Volume_Up}   ; Makes the u key send volume-up key, but only in VLC.
d::send, {Volume_Down}

#IfWinActive

$Volume_Mute::playpause()
playpause()
{
  Process,Exist, vlc.exe
  If ( ErrorLevel != 0 )
  {
    ; SoundBeep
    ControlSend , , {space}, ahk_exe vlc.exe
    Return
  }
  Send {Volume_Mute}

  SetTitleMatchMode, 2
  If (WinExist("Netflix - Google Chrome"))
  {
    ; TODO: this is still not working!!!@#$!!
    ; Chrome_RenderWidgetHostHWND1  

    ; WinActivate "Netflix - Google Chrome"
    ; Send {space}
    ;CoordMode, ToolTip, Screen
    ControlSend , , {space}, "Netflix - Google Chrome"
    ;click, -800, 500, 2
  }
}


#IfWinActive  ahk_exe chrome.exe
; !d::SoundBeep
; ^l::SoundBeep

!j::send, {down}
!k::send, {up}
#IfWinActive

!j::send, {down}
!k::send, {up}
