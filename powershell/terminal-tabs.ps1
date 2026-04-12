# Add the following line to $PROFILE to load this file automatically:
# . 'C:\repos\dotfiles\powershell\terminal-tabs.ps1'

# Navigate to preferred starting directory (first match wins)
if ($PWD.Path -eq $env:USERPROFILE) {
    $startDirs = @("Q:\repos\roslyn", "C:\repos\roslyn", "C:\repos")
    foreach ($d in $startDirs) {
        if (Test-Path $d) { Set-Location $d; break }
    }
}

$script:TerminalTabsOriginalPrompt = if ($script:TerminalTabsOriginalPrompt) {
    $script:TerminalTabsOriginalPrompt
}
elseif (Test-Path Function:\prompt) {
    $function:prompt
}
else {
    $null
}

function Initialize-PSReadLineColors {
    if (-not (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue)) {
        Import-Module PSReadLine -ErrorAction SilentlyContinue
    }

    if (-not (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue)) {
        return
    }

    Set-PSReadLineOption -Colors @{
        Command   = '#C3E88D'
        Comment   = '#82AAFF'
        Default   = '#D0D0D0'
        Error     = '#D78787'
        Keyword   = '#DFAFDF'
        Member    = '#89DDFF'
        Number    = '#B2CCD6'
        Operator  = '#D0D0D0'
        Parameter = '#82AAFF'
        String    = '#FFFFAF'
        Type      = '#AFDFDF'
        Variable  = '#D7AFD7'
    }
}

function Initialize-FileInfoColors {
    if ($PSStyle -and $PSStyle.FileInfo) {
        $PSStyle.FileInfo.Directory = $PSStyle.Foreground.BrightBlue
    }
}

function Get-WindowsTerminalTabColorIndex {
    param(
        [string]$RepoName
    )

    if ([string]::IsNullOrWhiteSpace($RepoName)) {
        return 238
    }

    switch ($RepoName.ToLowerInvariant()) {
        'roslyn'  { return 24 }
        'roslyn2' { return 23 }
        'roslyn3' { return 22 }
    }

    # Use darker 256-color entries so active/inactive tab differences stay subtle.
    $palette = @(
        17,
        22,
        23,
        24,
        52,
        53,
        58,
        60
    )

    [uint32]$hash = 2166136261
    foreach ($character in $RepoName.ToLowerInvariant().ToCharArray()) {
        [uint64]$nextHash = ([uint64]($hash -bxor [uint32][char]$character) * 16777619)
        $hash = [uint32]($nextHash % 4294967296)
    }

    return $palette[[int]($hash % $palette.Count)]
}

function Get-WindowsTerminalTabAppearance {
    param(
        [string]$Path = (Get-Location).Path
    )

    $repoRoot = 'Q:\repos'
    $repoName = $null

    if ($Path.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativePath = $Path.Substring($repoRoot.Length).TrimStart('\')
        if ($relativePath.Length -gt 0) {
            $repoName = $relativePath.Split('\', 2)[0]
        }
    }

    $title = if ($repoName) {
        $repoName
    }
    else {
        $leaf = Split-Path -Path $Path -Leaf
        if ([string]::IsNullOrEmpty($leaf)) { $Path } else { $leaf }
    }

    [pscustomobject]@{
        Title = $title
        ColorIndex = Get-WindowsTerminalTabColorIndex -RepoName $repoName
    }
}

function Set-WindowsTerminalTabAppearance {
    param(
        [string]$Path = (Get-Location).Path
    )

    $appearance = Get-WindowsTerminalTabAppearance -Path $Path
    $host.UI.RawUI.WindowTitle = $appearance.Title

    if ($env:WT_SESSION) {
        [Console]::Write("`e[2;15;$($appearance.ColorIndex),|")
    }
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

Initialize-PSReadLineColors
Initialize-FileInfoColors

Remove-Alias ac -Force -ErrorAction SilentlyContinue
function ac {
    $repoRoot = 'Q:\repos\copilot-agent-runtime'
    $copilotDevCli = Join-Path $repoRoot 'dist-cli\index.js'
    $buildMarker = Join-Path $repoRoot 'dist-cli\app.js'
    $buildInputs = @(
        (Join-Path $repoRoot 'src'),
        (Join-Path $repoRoot 'package.json'),
        (Join-Path $repoRoot 'package-lock.json'),
        (Join-Path $repoRoot 'esbuild.ts'),
        (Join-Path $repoRoot 'tsconfig.json')
    )

    $needsBuild = (-not (Test-Path $copilotDevCli)) -or (-not (Test-Path $buildMarker))
    if (-not $needsBuild) {
        $builtAt = (Get-Item $buildMarker).LastWriteTimeUtc

        foreach ($inputPath in $buildInputs) {
            if (-not (Test-Path $inputPath)) {
                continue
            }

            $inputItem = Get-Item $inputPath
            if ($inputItem -is [System.IO.DirectoryInfo]) {
                $candidate = (Get-ChildItem $inputPath -Recurse -File | Measure-Object -Property LastWriteTimeUtc -Maximum).Maximum
            }
            else {
                $candidate = $inputItem.LastWriteTimeUtc
            }

            if ($candidate -and $candidate -gt $builtAt) {
                $needsBuild = $true
                break
            }
        }
    }

    if ($needsBuild) {
        Push-Location $repoRoot
        try {
            & npm run build
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to build Copilot in $repoRoot."
            }
        }
        finally {
            Pop-Location
        }
    }

    & node --enable-source-maps --report-on-fatalerror $copilotDevCli --yolo @args
}

Remove-Alias acc -Force -ErrorAction SilentlyContinue
function acc { & copilot --yolo @args }

Remove-Alias ci -Force -ErrorAction SilentlyContinue
function ci { code-insiders @args }
