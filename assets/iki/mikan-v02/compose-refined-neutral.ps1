$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
public static class RefineGeometry {
 public static Rectangle Bounds(Bitmap b) {int l=b.Width,t=b.Height,r=-1,d=-1;for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++)if(b.GetPixel(x,y).A>32){l=Math.Min(l,x);t=Math.Min(t,y);r=Math.Max(r,x);d=Math.Max(d,y);}return new Rectangle(l,t,r-l+1,d-t+1);}
 public static void FitIris(Bitmap iris, Bitmap eye) {
  for(int y=0;y<iris.Height;y++)for(int x=0;x<iris.Width;x++){var c=iris.GetPixel(x,y);if(c.A==0)continue;var e=eye.GetPixel(x,y); double white=Math.Max(0,Math.Min(1,(Math.Min(e.R,Math.Min(e.G,e.B))-95)/100.0));iris.SetPixel(x,y,Color.FromArgb((int)(c.A*e.A/255.0*white),c.R,c.G,c.B));}
 }
}
'@
$root=$PSScriptRoot
$backup="$root\backups\before-neutral-refinement"
$mapping=Get-Content "$root\notes\refinement-generation.json" -Raw | ConvertFrom-Json
if (!(Test-Path "$backup\parts")) {
 New-Item "$backup\parts" -ItemType Directory -Force | Out-Null
 Get-ChildItem "$root\parts" -Filter *.png | Get-FileHash | ConvertTo-Json | Set-Content "$backup\parts-sha256.json"
 foreach($m in $mapping){Copy-Item -LiteralPath "$root\parts\$($m.name).png" -Destination "$backup\parts"}
 foreach($m in $mapping){Copy-Item -LiteralPath $m.source -Destination "$root\parts\$($m.name).png"}
}
New-Item "$root\layers-refined" -ItemType Directory -Force | Out-Null
$placements=@(
 @('hair_back','hair_back',180,120,740,1120),
 @('ear_left','ear_right',270,60,190,240),
 @('ear_right','ear_left',640,60,190,240),
 @('body_upper','body',140,590,820,820),
 @('face_base','face',350,180,400,450),
 @('eye_left_open','eye_R',400,400,120,64),
 @('eye_right_open','eye_L',580,400,120,64),
 @('iris_left','iris_R',440,410,58,58),
 @('iris_right','iris_L',608,405,58,58),
 @('mouth_neutral','mouth',512,539,76,20),
 @('hair_front','hair_front',220,20,660,700)
)
$placements | ConvertTo-Json -Depth 4 | Set-Content "$root\notes\refined-layout.json"
$canvas=New-Object System.Drawing.Bitmap(1100,1500)
$g=[System.Drawing.Graphics]::FromImage($canvas)
$g.Clear([System.Drawing.Color]::FromArgb(255,240,241,245))
foreach($p in $placements){
 $src=New-Object System.Drawing.Bitmap("$root\parts\$($p[0]).png")
 $box=[RefineGeometry]::Bounds($src)
 $layer=New-Object System.Drawing.Bitmap(1100,1500)
 $lg=[System.Drawing.Graphics]::FromImage($layer)
 $lg.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $dest=New-Object System.Drawing.Rectangle([int]$p[2],[int]$p[3],[int]$p[4],[int]$p[5])
 $lg.DrawImage($src,$dest,$box,[System.Drawing.GraphicsUnit]::Pixel)
 $lg.Dispose()
 if($p[1] -like 'iris_*'){
  $eyeName=$p[1].Replace('iris_','eye_')
  $eye=New-Object System.Drawing.Bitmap("$root\layers-refined\$eyeName.png")
  [RefineGeometry]::FitIris($layer,$eye)
  $eye.Dispose()
 }
 $layer.Save("$root\layers-refined\$($p[1]).png",[System.Drawing.Imaging.ImageFormat]::Png)
 $g.DrawImageUnscaled($layer,0,0)
 $src.Dispose();$layer.Dispose()
}
$g.Dispose()
$canvas.Save("$root\previews\neutral-refined-up-30.png",[System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$old=Get-Content "$backup\parts-sha256.json" -Raw | ConvertFrom-Json
foreach($n in @('ear_left','ear_right','body_upper','hair_back')){
 $path="$root\parts\$n.png"
 $expected=($old | Where-Object Path -eq $path).Hash
 if((Get-FileHash $path).Hash -ne $expected){throw "Preserved source changed: $n"}
}
Write-Output 'Composed refined preview. Verified ears, body and back-hair source hashes unchanged.'

