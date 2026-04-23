param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $projectRoot 'config.js'
$logDir = Join-Path $projectRoot '.local-logs'

function Get-ConfigNumber {
    param(
        [string]$Name,
        [int]$DefaultValue
    )

    if (-not (Test-Path $configPath)) {
        return $DefaultValue
    }

    $match = Select-String -Path $configPath -Pattern "const\s+$Name\s*=\s*(\d+)"
    if ($match -and $match.Matches.Count -gt 0) {
        return [int]$match.Matches[0].Groups[1].Value
    }

    return $DefaultValue
}

function Resolve-NodePath {
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        'C:\Program Files\nodejs\node.exe',
        'C:\Program Files (x86)\nodejs\node.exe'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Node.js not found. Install Node.js first."
}

function Test-PortListening {
    param([int]$Port)

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $connectTask = $client.ConnectAsync('127.0.0.1', $Port)
        $didConnect = $connectTask.Wait(500)
        $isConnected = $didConnect -and $client.Connected
        $client.Close()
        return $isConnected
    } catch {
        return $false
    }
}

function Start-ServiceIfNeeded {
    param(
        [string]$Name,
        [int]$Port,
        [string]$ScriptName,
        [int]$TimeoutSeconds = 20
    )

    if (Test-PortListening -Port $Port) {
        Write-Host "$Name is already listening on port $Port."
        return $true
    }

    $stdoutPath = Join-Path $logDir "$Name.out.log"
    $stderrPath = Join-Path $logDir "$Name.err.log"

    Start-Process `
        -FilePath $script:nodePath `
        -ArgumentList $ScriptName `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -WindowStyle Hidden | Out-Null

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-PortListening -Port $Port) {
            Write-Host "$Name started on port $Port."
            return $true
        }
    }

    Write-Warning "$Name failed to start on port $Port. Check $stdoutPath and $stderrPath."
    return $false
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$nodePath = Resolve-NodePath
$cmsPort = Get-ConfigNumber -Name 'local_cms_port' -DefaultValue 4000
$aiPort = Get-ConfigNumber -Name 'local_ai_port' -DefaultValue 3000
$siteUrl = "http://localhost:$cmsPort/"

Write-Host "Project root: $projectRoot"
Write-Host "Node: $nodePath"

$cmsOk = Start-ServiceIfNeeded -Name 'cms-server' -Port $cmsPort -ScriptName 'cms-server.js'
$aiOk = Start-ServiceIfNeeded -Name 'ai-server' -Port $aiPort -ScriptName 'server.js'

if (-not $NoBrowser -and $cmsOk) {
    Start-Process $siteUrl
}

Write-Host ''
Write-Host "Site URL: $siteUrl"
Write-Host "CMS API: http://localhost:$cmsPort/content-api/website-data"
Write-Host "AI API:  http://localhost:$aiPort/api/chat"

if (-not $aiOk) {
    Write-Warning "AI backend is not available yet. The site and CMS can still be used."
}
