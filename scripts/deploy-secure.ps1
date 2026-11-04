$ErrorActionPreference = "Stop"

Write-Host "HIREhub Hadrian deployment" -ForegroundColor Magenta
Write-Host "Paste the private key for your funded TEST wallet. Input is hidden."
$secureKey = Read-Host "Private key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not $plainKey.StartsWith("0x") -or $plainKey.Length -ne 66) {
        throw "Expected a 32-byte private key beginning with 0x."
    }

    $env:PRIVATE_KEY = $plainKey
    npm run deploy:hadrian
    if ($LASTEXITCODE -ne 0) {
        throw "Hadrian deployment failed with exit code $LASTEXITCODE."
    }
}
finally {
    Remove-Item Env:PRIVATE_KEY -ErrorAction SilentlyContinue
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plainKey = $null
    $secureKey.Dispose()
}
