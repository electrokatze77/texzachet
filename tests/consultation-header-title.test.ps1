$ErrorActionPreference = 'Stop'

$cssPath = Join-Path $PSScriptRoot '..\consultation\consultation.css'
$css = Get-Content -Raw -Encoding UTF8 -LiteralPath $cssPath

$titleRules = [regex]::Matches($css, '(?s)\.consultation-meta\s+strong\s*\{([^}]*)\}')
if ($titleRules.Count -eq 0) { throw 'Missing consultation header title CSS rules' }
$titleCss = ($titleRules | ForEach-Object { $_.Groups[1].Value }) -join ';'

if ($titleCss -notmatch '(?i)(?:^|;)\s*white-space\s*:\s*normal\s*(?:;|$)') {
  throw 'The consultation header title must be allowed to wrap'
}
if ($titleCss -notmatch '(?i)(?:^|;)\s*overflow-wrap\s*:\s*anywhere\s*(?:;|$)') {
  throw 'The consultation header title must wrap long text safely'
}
if ($titleCss -match '(?i)(?:^|;)\s*text-overflow\s*:\s*ellipsis\s*(?:;|$)') {
  throw 'The consultation header title must not be truncated with an ellipsis'
}

Write-Output 'Consultation header title wrapping: OK'
