Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System.Drawing;
public static class BoundsMikan {
 public static Rectangle Get(Bitmap b) { int l=b.Width,t=b.Height,r=0,d=0; for(int y=0;y<b.Height;y++) for(int x=0;x<b.Width;x++) if(b.GetPixel(x,y).A>32){l=System.Math.Min(l,x);t=System.Math.Min(t,y);r=System.Math.Max(r,x);d=System.Math.Max(d,y);} return new Rectangle(l,t,r-l+1,d-t+1); }
}
'@
$root = $PSScriptRoot
$placements = @(
 @('hair_back','hair_back',180,150,740,1120),
 @('ear_left','ear_right',270,90,190,240),
 @('ear_right','ear_left',640,90,190,240),
 @('body_upper','body',140,590,820,820),
 @('face_base','face',350,180,400,480),
 @('eye_left_open','eye_R',405,425,115,58),
 @('eye_right_open','eye_L',580,425,115,58),
 @('iris_left','iris_R',448,437,46,46),
 @('iris_right','iris_L',607,437,46,46),
 @('mouth_neutral','mouth',512,565,76,16),
 @('hair_front','hair_front',220,50,660,700)
)
$canvas = New-Object System.Drawing.Bitmap(1100,1500)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.Clear([System.Drawing.Color]::FromArgb(255,240,241,245))
foreach($p in $placements){
 $src = New-Object System.Drawing.Bitmap("$root\parts\$($p[0]).png")
 $box = [BoundsMikan]::Get($src)
 $layer = New-Object System.Drawing.Bitmap(1100,1500)
 $lg = [System.Drawing.Graphics]::FromImage($layer)
 $lg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $dest = New-Object System.Drawing.Rectangle([int]$p[2],[int]$p[3],[int]$p[4],[int]$p[5])
 $lg.DrawImage($src,$dest,$box,[System.Drawing.GraphicsUnit]::Pixel)
 $lg.Dispose()
 $layer.Save("$root\layers\$($p[1]).png",[System.Drawing.Imaging.ImageFormat]::Png)
 $g.DrawImageUnscaled($layer,0,0)
 $src.Dispose(); $layer.Dispose()
}
$g.Dispose()
$canvas.Save("$root\previews\neutral-assembled.png",[System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
