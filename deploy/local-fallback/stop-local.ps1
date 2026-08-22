[CmdletBinding()]
param(
    [switch]$RemoveVolumes
)

$ErrorActionPreference = 'Stop'
$previousLocation = Get-Location
Push-Location -LiteralPath $PSScriptRoot

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI was not found. Install/start Docker Desktop, then run this script again.'
    }

    if (-not (Test-Path -LiteralPath '.env')) {
        throw 'deploy/local-fallback/.env was not found. Run start-local.ps1 once first.'
    }

    $composeArgs = @(
        'compose',
        '--project-name', 'authsys-local',
        '--env-file', '.env',
        '-f', 'docker-compose.local.yml'
    )

    if ($RemoveVolumes) {
        Write-Warning 'Removing local fallback volumes will delete local users, OAuth clients, sessions, and logs.'
        & docker @composeArgs down -v
    }
    else {
        & docker @composeArgs down
    }

    exit $LASTEXITCODE
}
finally {
    Set-Location -LiteralPath $previousLocation
    Pop-Location
}
