param(
    [string]$LegacyEnvDirectory = 'C:\code\chemisttasker\env',
    [string]$DestinationDirectory = (Join-Path $PSScriptRoot '..\env')
)

$ErrorActionPreference = 'Stop'

$sourceBackend = Join-Path $LegacyEnvDirectory 'backend.prod.env'
$sourceWeb = Join-Path $LegacyEnvDirectory 'web.prod.env'
$sourceMobile = Join-Path $LegacyEnvDirectory 'mobile.prod.env'

foreach ($source in @($sourceBackend, $sourceWeb, $sourceMobile)) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing legacy environment file: $source"
    }
}

New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null

$stagingBackend = Join-Path $DestinationDirectory 'staging.integrations.env'
$stagingWeb = Join-Path $DestinationDirectory 'staging.web.env'
$stagingMobile = Join-Path $DestinationDirectory 'staging.mobile.env'

Copy-Item -LiteralPath $sourceBackend -Destination $stagingBackend -Force
Copy-Item -LiteralPath $sourceWeb -Destination $stagingWeb -Force
Copy-Item -LiteralPath $sourceMobile -Destination $stagingMobile -Force

function Set-DotEnvValue {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [AllowEmptyString()] [string]$Value
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    $found = $false
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {
            $lines.Add("$Name=$Value")
            $found = $true
        } else {
            $lines.Add($line)
        }
    }
    if (-not $found) {
        $lines.Add("$Name=$Value")
    }
    [System.IO.File]::WriteAllLines($Path, $lines)
}

# Keep credentials available while blocking automatic messages from staging.
Set-DotEnvValue -Path $stagingBackend -Name 'STAGING_EMAIL_BACKEND' -Value 'django.core.mail.backends.console.EmailBackend'
Set-DotEnvValue -Path $stagingBackend -Name 'STAGING_USE_AZURE_STORAGE' -Value 'True'

# The mobile file is for a separate Expo staging build. Docker Compose does not read it.
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_API_URL' -Value 'https://staging.chemisttasker.com.au/api/v1'
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_WS_URL' -Value 'wss://staging.chemisttasker.com.au/ws'
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_WEB_URL' -Value 'https://staging.chemisttasker.com.au'
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_SSL_PINNING_ENABLED' -Value 'false'
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_SSL_PINNED_PUBLIC_KEY_HASHES' -Value ''
Set-DotEnvValue -Path $stagingMobile -Name 'EXPO_PUBLIC_SHOW_NETWORK_DIAGNOSTICS' -Value 'true'

Write-Output 'Prepared ignored staging environment files:'
Write-Output "  $stagingBackend"
Write-Output "  $stagingWeb"
Write-Output "  $stagingMobile"
Write-Output 'SMTP credentials were copied, but staging email delivery remains in console mode.'
Write-Output 'Review the files without printing their values, then copy them to the VPS.'
