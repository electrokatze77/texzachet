$ErrorActionPreference = 'Stop'

$html = Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot '..\index.html')
$consult = [string]::Concat([char[]](0x43A, 0x43E, 0x43D, 0x441, 0x430, 0x43B, 0x442))
$desktopSource = "1234 RU $consult preview 2.mp4"
$mobileSource = "mobile 1234 RU $consult preview 2.mp4"

if ($html -notmatch ('<source src="' + [regex]::Escape($desktopSource) + '" type="video/mp4">')) {
  throw 'The desktop recommendations preview must use the requested source file.'
}

if ($html -notmatch ('<source src="' + [regex]::Escape($mobileSource) + '" type="video/mp4">')) {
  throw 'The mobile recommendations preview must use the requested source file.'
}
