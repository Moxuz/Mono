[CmdletBinding()]
param(
    [switch]$WithKafka
)

$ErrorActionPreference = 'Stop'
$previousLocation = Get-Location
Push-Location -LiteralPath $PSScriptRoot

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI was not found. Install/start Docker Desktop, then run this script again.'
    }

    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Warning 'Created deploy/local-fallback/.env from .env.example. Add local OAuth client credentials before testing SSO.'
    }

    $composeArgs = @(
        'compose',
        '--project-name', 'authsys-local',
        '--env-file', '.env',
        '-f', 'docker-compose.local.yml'
    )

    if ($WithKafka) {
        $composeArgs += @('--profile', 'kafka')
    }

    & docker @composeArgs up -d --build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    & docker @composeArgs ps
    exit $LASTEXITCODE
}
finally {
    Set-Location -LiteralPath $previousLocation
    Pop-Location
}
