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
if ($css -match '(?i)\.consultation-meta\s*>\s*span\s*\{\s*display\s*:\s*none') {
  throw 'The mobile consultation header must keep its subtitle visible'
}
if ($css -notmatch '(?i)\.top-bar\s*\{\s*grid-template-columns\s*:\s*55px\s+minmax\(0,1fr\)\s+auto') {
  throw 'The mobile header must keep logo, text and copy button in one row'
}
if ($titleCss -notmatch '(?i)(?:^|;)\s*flex\s*:\s*0\s+1\s+auto\s*(?:;|$)') {
  throw 'The header title must not push the tariff badge away from it'
}
if ($css -notmatch '(?i)\.tariff-badge\s*\{[^}]*font-size\s*:\s*10px[^}]*white-space\s*:\s*nowrap') {
  throw 'The mobile tariff badge must keep its compact label inside the frame'
}
if ($css -notmatch '(?is)@media\s*\(max-width:\s*820px\)[^{]*\{.*?\.tariff-badge\s*\{[^}]*flex\s*:\s*0\s+0\s+auto[^}]*width\s*:\s*max-content') {
  throw 'The mobile tariff badge frame must not shrink below its label width'
}

Write-Output 'Consultation header title wrapping: OK'
