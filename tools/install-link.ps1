# Wire this plugin into a DSH profile using directory junctions (no file copies).
#
# Three changes, all reversible with -Uninstall:
#   1. <DshHome>/plugins/<name>                          -> junction to -Source
#   2. <DshHome>/profiles/<ProfileName>/package.json     -> + dependencies entry
#                                                        -> + dsh.profile.bundles entry
#   3. <DshHome>/profiles/<ProfileName>/node_modules/<pkgName> -> junction
#
# Messages are ASCII on purpose: Windows PowerShell 5.1 parses a BOM-less .ps1 as
# ANSI, and non-ASCII bytes break the tokenizer.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\tools\install-link.ps1
#   powershell -ExecutionPolicy Bypass -File .\tools\install-link.ps1 -Uninstall
#   powershell -ExecutionPolicy Bypass -File .\tools\install-link.ps1 -DshHome D:\dsh -ProfileName web

param(
    [switch]$Uninstall,
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
    [string]$Source = (Split-Path -Parent $PSScriptRoot),
    [string]$ProfileName = 'desktop'
)

$ErrorActionPreference = 'Stop'

$sourcePkg = Join-Path $Source 'package.json'
if (-not (Test-Path -LiteralPath $sourcePkg)) {
    throw "No package.json in: $Source`nUse -Source <plugin directory>."
}
function Read-Utf8([string]$Path) {
    [System.IO.File]::ReadAllText($Path, (New-Object System.Text.UTF8Encoding $false))
}
$pkg = (Read-Utf8 $sourcePkg | ConvertFrom-Json)
if (-not $pkg.name) { throw "package.json has no 'name' field: $sourcePkg" }

$pkgName    = $pkg.name
$pluginName = ($pkgName -split '/')[-1]

$dshPlugins  = Join-Path $DshHome 'plugins'
$profileDir  = Join-Path $DshHome "profiles\$ProfileName"
$profileJson = Join-Path $profileDir 'package.json'
$linkDir     = Join-Path $dshPlugins $pluginName
$nmJunction  = Join-Path $profileDir "node_modules\$pkgName"

$depSpec    = 'link:' + ($linkDir -replace '\\', '/')
$depLine    = '    "' + $pkgName + '": "' + $depSpec + '",'
$bundleLine = '        "' + $pkgName + '",'

if (-not (Test-Path -LiteralPath $profileJson)) {
    throw "Profile not found: $profileJson`nUse -DshHome / -ProfileName to point at a real profile."
}

if ($Uninstall) {
    if (Test-Path -LiteralPath $nmJunction) {
        Remove-Item -LiteralPath $nmJunction -Recurse -Force -Confirm:$false
        Write-Host "removed junction: $nmJunction"
    }
    $raw = Read-Utf8 $profileJson
    $depRe    = '(?m)^\s*"' + [regex]::Escape($pkgName) + '":\s*"link:[^"]*",?\r?\n?'
    $bundleRe = '(?m)^\s*"' + [regex]::Escape($pkgName) + '",?\r?\n?'
    $raw = [regex]::Replace($raw, $depRe, '')
    $raw = [regex]::Replace($raw, $bundleRe, '')
    [System.IO.File]::WriteAllText($profileJson, $raw, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "reverted package.json (dependencies + bundles)"
    Write-Host "UNINSTALL DONE - plugins junction kept: $linkDir"
    exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $Source 'lib/client.js'))) {
    throw "Cannot find lib\client.js in: $Source"
}
Write-Host "[0/4] source OK: $Source  ($pkgName)"

if (Test-Path -LiteralPath $linkDir) {
    $existing = Get-Item -LiteralPath $linkDir -Force
    if ($existing.LinkType) {
        Write-Host "[1/4] plugins junction already exists -> $($existing.Target -join ';')"
    } else {
        Write-Host "[1/4] WARNING: $linkDir exists but is a real directory, not a junction. Left untouched."
    }
} else {
    New-Item -ItemType Junction -Path $linkDir -Target $Source | Out-Null
    Write-Host "[1/4] created junction: $linkDir -> $Source"
}

$raw     = Read-Utf8 $profileJson
$changed = $false

if ($raw -match '"' + [regex]::Escape($pkgName) + '"') {
    Write-Host "[2/4] package.json already references this package, skipped"
} else {
    $depAnchor = '"dependencies": {'
    if ($raw -notmatch [regex]::Escape($depAnchor)) {
        throw "No dependencies block in $profileJson. Nothing was modified."
    }
    $raw = [regex]::Replace($raw, [regex]::Escape($depAnchor), { $depAnchor + "`n" + $depLine }, 1)

    $bundleAnchor = '"bundles": ['
    if ($raw -notmatch [regex]::Escape($bundleAnchor)) {
        throw "No dsh.profile.bundles array in $profileJson. dependencies was NOT written - the file is unchanged."
    }
    $raw = [regex]::Replace($raw, [regex]::Escape($bundleAnchor), { $bundleAnchor + "`n" + $bundleLine }, 1)
    $changed = $true
    Write-Host "[2/4] dependencies entry inserted"
    Write-Host "[3/4] dsh.profile.bundles entry inserted"
}

if ($changed) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $bak   = "$profileJson.bak-$stamp"
    Copy-Item -LiteralPath $profileJson -Destination $bak -Force
    [System.IO.File]::WriteAllText($profileJson, $raw, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "      backup -> $bak"
}

Write-Host ""
Write-Host "==== VERIFY ===="
if (Test-Path -LiteralPath $nmJunction) {
    Write-Host "[3/4] node_modules junction already exists, skipped"
} else {
    $nmParent = Split-Path -Parent $nmJunction
    if (-not (Test-Path -LiteralPath $nmParent)) { New-Item -ItemType Directory -Path $nmParent -Force | Out-Null }
    New-Item -ItemType Junction -Path $nmJunction -Target $linkDir | Out-Null
    Write-Host "[3/4] created junction: $nmJunction -> $linkDir"
}
$j = Get-Item -LiteralPath $nmJunction -Force
Write-Host ("node_modules LinkType : " + $j.LinkType)
Write-Host ("node_modules Target   : " + ($j.Target -join ';'))

$check     = Read-Utf8 $profileJson | ConvertFrom-Json
$hasDep    = $null -ne $check.dependencies.PSObject.Properties[$pkgName]
$hasBundle = @($check.dsh.profile.bundles) -contains $pkgName
Write-Host ("dependencies has pkg  : " + $hasDep)
Write-Host ("bundles has pkg       : " + $hasBundle)
Write-Host ("client.js visible     : " + (Test-Path -LiteralPath (Join-Path $nmJunction 'lib/client.js')))

if ($hasDep -and $hasBundle) {
    Write-Host ""
    Write-Host "MANUAL STEP (required): add these two rows to the profile patch"
    Write-Host "  $profileDir\cordis.patch.yml"
    Write-Host ""
    Write-Host "  - insert:"
    Write-Host "      - id: jianbao"
    Write-Host "        name: '@zws/dsh-jianbao'"
    Write-Host "        inject: [tools, systemPrompt]"
    Write-Host "        config:"
    Write-Host "          presetId: jianbao"
    Write-Host "      - id: jianbao-preset"
    Write-Host "        name: '@zws/dsh-jianbao/preset'"
    Write-Host ""
    Write-Host "The first row mounts the workspace host half; the second declares the"
    Write-Host "jianbao agent preset. Without them there is no fiber, so the browser half"
    Write-Host "is never scanned and the tab never appears."
    Write-Host ""
    Write-Host "INSTALL OK - fully quit and restart DSH for this to take effect (no HMR)."
} else {
    Write-Host ""
    Write-Host "INSTALL INCOMPLETE - see any False above."
    exit 1
}
