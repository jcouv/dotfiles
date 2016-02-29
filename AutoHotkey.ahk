#IfWinActive ahk_exe vlc.exe

h::send, {left}  ; Makes the 'h' key send a left-arrow key, but only in VLC.
j::send, {down}
k::send, {up}
l::send, {right}

^u::send, {Volume_Up}   ; Makes the Ctrl-u key send volume-up key, but only in VLC.
^d::send, {Volume_Down}

#IfWinActive
