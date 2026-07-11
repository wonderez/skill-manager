$dirs = @("C:\Users\刘红博\.claude\skills", "C:\Users\刘红博\.gemini\config\skills")
foreach ($d in $dirs) {
    if (Test-Path $d) {
        Write-Host "Checking $d"
        Get-ChildItem -Path $d -Force | Where-Object { $_.Attributes -match 'ReparsePoint' } | ForEach-Object {
            if (-not (Test-Path $_.FullName)) {
                Write-Host "Removing broken link: $($_.FullName)"
                cmd /c rmdir "`"$($_.FullName)`""
            }
        }
    }
}
