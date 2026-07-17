[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet("Insiders", "Stable")]
    [string] $Edition = "Insiders",

    [switch] $SettingsOnly,
    [switch] $ExtensionsOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$extensionsPath = Join-Path $scriptDir "extensions.txt"
$settingsPath = Join-Path $scriptDir "settings.json"
$keybindingsPath = Join-Path $scriptDir "keybindings.json"

function Resolve-CodeCommand {
    param([string] $Edition)

    if ($Edition -eq "Insiders") {
        $command = Get-Command code-insiders -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }

        $localCommand = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
        if (Test-Path $localCommand) {
            return $localCommand
        }

        throw "Could not find VS Code Insiders command. Install VS Code Insiders or add code-insiders to PATH."
    }

    $command = Get-Command code -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $localCommand = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"
    if (Test-Path $localCommand) {
        return $localCommand
    }

    throw "Could not find VS Code command. Install VS Code or add code to PATH."
}

if ($SettingsOnly -and $ExtensionsOnly) {
    throw "Use either -SettingsOnly or -ExtensionsOnly, not both."
}

$userDirName = if ($Edition -eq "Insiders") { "Code - Insiders" } else { "Code" }
$userDir = Join-Path $env:APPDATA "$userDirName\User"
$codeCommand = Resolve-CodeCommand $Edition

if (-not $ExtensionsOnly) {
    if ($PSCmdlet.ShouldProcess($userDir, "Create VS Code user settings directory")) {
        New-Item -ItemType Directory -Force $userDir | Out-Null
    }

    foreach ($file in @($settingsPath, $keybindingsPath)) {
        $target = Join-Path $userDir (Split-Path -Leaf $file)
        if ($PSCmdlet.ShouldProcess($target, "Copy $(Split-Path -Leaf $file)")) {
            Copy-Item -Force $file $target
        }
    }
}

if (-not $SettingsOnly) {
    $extensions = Get-Content $extensionsPath |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith("#") }

    foreach ($extension in $extensions) {
        if ($PSCmdlet.ShouldProcess($extension, "Install VS Code extension")) {
            & $codeCommand --install-extension $extension
        }
    }
}
