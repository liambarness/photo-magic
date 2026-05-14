$Host.UI.RawUI.WindowTitle = 'Photo Magic'
Set-Location $PSScriptRoot

Write-Host ''
Write-Host '  Photo Magic - Building...'
Write-Host ''

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '  Build failed. Press any key to exit.'
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

Write-Host ''
Write-Host '  Starting server on port 80...'
Write-Host ''

$hostname = [System.Net.Dns]::GetHostName()

Write-Host '  ----------------------------------------'
Write-Host '  Photo Magic is running!'
Write-Host ''
Write-Host "  This PC:    http://localhost"
Write-Host "  Other PCs:  http://$hostname"
Write-Host '  ----------------------------------------'
Write-Host ''
Write-Host '  Close this window to stop the server.'
Write-Host ''

npm run start
