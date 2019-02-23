
; CapsLock either sends a CapsLock (in gaming mode) or an Escape (in work mode)
CapsLock::
if (GamingMode)
{
  SendInput {Blind}{CapsLock}
  CapsLockOn := !CapsLockOn
}
else
{
  SendInput {Escape}
}
return

; F1 toggles gaming mode, making sure that CapsLock is reset when we toggle
F1::
if (GamingMode)
{
  if (CapsLockOn)
  {
    SendInput {Blind}{CapsLock}
    CapsLockOn := !CapsLockOn
  }
  MsgBox, Turning gaming mode off
}
else
{
  MsgBox, Turning gaming mode on
}
GamingMode := !GamingMode
return

