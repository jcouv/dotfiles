# Add the following line to $PROFILE to load this file automatically:
# . 'C:\repos\dotfiles\powershell\terminal-tabs.ps1'

$script:TerminalTabsOriginalPrompt = if ($script:TerminalTabsOriginalPrompt) {
    $script:TerminalTabsOriginalPrompt
}
elseif (Test-Path Function:\prompt) {
    $function:prompt
}
else {
    $null
}

function Set-WindowsTerminalTabAppearance {
    param(
        [string]$Path = (Get-Location).Path
    )

    $leaf = Split-Path -Path $Path -Leaf
    if ([string]::IsNullOrEmpty($leaf)) {
        $leaf = $Path
    }

    $host.UI.RawUI.WindowTitle = $leaf

    $colorIndex = switch -Regex ($leaf) {
        '^roslyn$'  { 4; break }
        '^roslyn2$' { 6; break }
        '^roslyn3$' { 2; break }
        default     { 8; break }
    }

    [Console]::Write("`e[2;15;${colorIndex},|")
}

function global:prompt {
    Set-WindowsTerminalTabAppearance

    if ($null -ne $script:TerminalTabsOriginalPrompt) {
        & $script:TerminalTabsOriginalPrompt
    }
    else {
        "PS $($executionContext.SessionState.Path.CurrentLocation)> "
    }
}
