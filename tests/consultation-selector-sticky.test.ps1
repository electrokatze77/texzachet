$ErrorActionPreference = 'Stop'

$cssPath = Join-Path $PSScriptRoot '..\consultation\consultation.css'
$css = Get-Content -Raw -Encoding UTF8 -LiteralPath $cssPath
$htmlPath = Join-Path $PSScriptRoot '..\consultation\index.html'
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath $htmlPath

$modelBarRules = [regex]::Matches($css, '(?s)\.model-bar\s*\{([^}]*)\}')
if ($modelBarRules.Count -eq 0) { throw 'Missing .model-bar CSS rules' }
$stickyRule = $modelBarRules | Where-Object { $_.Groups[1].Value -match '(?i)(?:^|;)\s*position\s*:\s*sticky\s*(?:;|$)' } | Select-Object -Last 1
$finalRule = if ($stickyRule) { $stickyRule.Groups[1].Value } else { '' }

if ($finalRule -notmatch '(?i)(?:^|;)\s*position\s*:\s*sticky\s*(?:;|$)') {
  throw 'The final .model-bar rule must keep the selector bar sticky'
}
if ($finalRule -notmatch '(?i)(?:^|;)\s*top\s*:\s*0\s*(?:;|$)') {
  throw 'The sticky selector bar must be anchored to the viewport top'
}
if ($finalRule -notmatch '(?i)(?:^|;)\s*z-index\s*:\s*\d+') {
  throw 'The sticky selector bar must layer above report content'
}
if ($html -notmatch '(?s)</div>\s*</header>\s*<div class="model-bar"') {
  throw 'The model selector bar must be outside the top header container'
}

Write-Output 'Consultation selector sticky layout: OK'
