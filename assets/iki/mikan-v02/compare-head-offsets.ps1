Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$order = @('hair_back','ear_right','ear_left','body','face','eye_R','eye_L','iris_R','iris_L','mouth','hair_front')
$before = Get-ChildItem "$root\parts","$root\layers" -Filter *.png | Get-FileHash
foreach ($offset in @(20,30,40)) {
 $target = "$root\previews\neutral-head-up-$offset.png"
 if (Test-Path -LiteralPath $target) { throw "Preview already exists: $target" }
 $canvas = New-Object System.Drawing.Bitmap(1100,1500)
 $g = [System.Drawing.Graphics]::FromImage($canvas)
 $g.Clear([System.Drawing.Color]::FromArgb(255,240,241,245))
 foreach ($role in $order) {
  $layer = New-Object System.Drawing.Bitmap("$root\layers\$role.png")
  $dy = if ($role -eq 'body') { 0 } else { -$offset }
  $g.DrawImageUnscaled($layer,0,$dy)
  $layer.Dispose()
 }
 $g.Dispose()
 $canvas.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
 $canvas.Dispose()
 Write-Output $target
}
$after = Get-ChildItem "$root\parts","$root\layers" -Filter *.png | Get-FileHash
if (Compare-Object $before $after -Property Path,Hash) { throw 'Source asset hash mismatch' }
Write-Output 'Verified: all source parts and aligned layer PNG hashes unchanged.'
