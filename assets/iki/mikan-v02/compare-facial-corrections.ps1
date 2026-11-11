$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
public static class Facial {
 public static Rectangle Bounds(Bitmap b){int l=b.Width,t=b.Height,r=-1,d=-1;for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++)if(b.GetPixel(x,y).A>32){l=Math.Min(l,x);t=Math.Min(t,y);r=Math.Max(r,x);d=Math.Max(d,y);}return new Rectangle(l,t,r-l+1,d-t+1);}
 public static Bitmap Warp(Bitmap s){
 Bitmap d=new Bitmap(s.Width,s.Height);
 // Inverse of a smooth, monotonic chin lift; landmarks above y=550 remain fixed.
 for(int y=0;y<d.Height;y++)for(int x=0;x<d.Width;x++){
 double sy=y;
 if(y>550 && y<616){double lo=550,hi=630;for(int k=0;k<18;k++){double m=(lo+hi)/2,t=(m-550)/80;double fy=m-14*(t*t*(3-2*t));if(fy<y)lo=m;else hi=m;}sy=(lo+hi)/2;}
 else if(y>=616)sy=y+14;
 double cheek=0.018*Math.Sin(Math.PI*Math.Max(0,Math.Min(1,(sy-500)/130.0)));
 double sx=550+(x-550)/(1+cheek);
 int ix=(int)Math.Floor(sx),iy=(int)Math.Floor(sy); if(ix<0||iy<0||ix+1>=s.Width||iy+1>=s.Height)continue;
 double fx=sx-ix,fy2=sy-iy;
 Color[] c={s.GetPixel(ix,iy),s.GetPixel(ix+1,iy),s.GetPixel(ix,iy+1),s.GetPixel(ix+1,iy+1)};
 double[] w={(1-fx)*(1-fy2),fx*(1-fy2),(1-fx)*fy2,fx*fy2};
 double a=0,r=0,g=0,b=0;for(int k=0;k<4;k++){double z=w[k]*c[k].A;a+=z;r+=z*c[k].R;g+=z*c[k].G;b+=z*c[k].B;}if(a>0)d.SetPixel(x,y,Color.FromArgb((int)a,(int)(r/a),(int)(g/a),(int)(b/a)));
 }return d;
 }
 public static void Mask(Bitmap b,Bitmap mask,bool outside){for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){var c=b.GetPixel(x,y);if(c.A==0)continue;int a=mask.GetPixel(x,y).A;if(outside)a=255-a;b.SetPixel(x,y,Color.FromArgb(c.A*a/255,c.R,c.G,c.B));}}
 public static void Tint(Bitmap b){for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){var c=b.GetPixel(x,y);if(c.A==0||c.R<120||y<545)continue;double t=.12; b.SetPixel(x,y,Color.FromArgb(c.A,(int)(c.R*(1-t)+238*t),(int)(c.G*(1-t)+143*t),(int)(c.B*(1-t)+154*t)));}}
 public static Bitmap EyeMask(Rectangle crop,float scale){
 Bitmap b=new Bitmap(1100,1500);
 using(var g=Graphics.FromImage(b))using(var p=new GraphicsPath()){
 g.SmoothingMode=SmoothingMode.AntiAlias;
 g.TranslateTransform(400,403);g.ScaleTransform(scale,scale);g.TranslateTransform(-crop.X,-crop.Y);
 p.AddBezier(578,473,760,366,1045,295,1198,376);
 p.AddBezier(1198,376,1270,416,1316,492,1310,548);
 p.AddBezier(1310,548,1312,578,1296,591,1260,597);
 p.AddBezier(1260,597,1040,622,827,702,655,610);
 p.AddBezier(655,610,610,585,586,526,578,473);
 p.CloseFigure();g.FillPath(Brushes.White,p);
 }return b;
 }
}
'@
$root=$PSScriptRoot
$out="$root\facial-correction"
New-Item "$out\previews","$out\masks" -ItemType Directory -Force | Out-Null
$before=Get-ChildItem "$root\parts","$root\layers-refined","$root\reference" -Filter *.png | Get-FileHash
$eyeSrc=New-Object System.Drawing.Bitmap("$root\parts\eye_left_open.png")
$crop=[Facial]::Bounds($eyeSrc)
$scale=120.0/$crop.Width
$eye=New-Object System.Drawing.Bitmap(1100,1500)
$g=[System.Drawing.Graphics]::FromImage($eye);$g.InterpolationMode='HighQualityBicubic'
$g.DrawImage($eyeSrc,[System.Drawing.RectangleF]::new(400,403,120,[float]($crop.Height*$scale)),$crop,[System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose();$eyeSrc.Dispose()
$mask=[Facial]::EyeMask($crop,$scale)
$mask.Save("$out\masks\eye_R.png")
$eyeOther=$eye.Clone();$eyeOther.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
$maskOther=$mask.Clone();$maskOther.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
$maskOther.Save("$out\masks\eye_L.png")
$order=@('hair_back','ear_right','ear_left','body','face','eye_R','eye_L','iris_R','iris_L','lash_R','lash_L','mouth','hair_front')
$cases=@(@('01-baseline',0,0,0),@('test-iris-46',46,0,0),@('02-eyes-only',50,0,0),@('test-iris-54',54,0,0),@('03-eyes-lower-face',50,1,0),@('04-eyes-face-mouth-tint',50,1,1))
foreach($case in $cases){
$name=$case[0];$size=[int]$case[1];$dir="$out\$name"
New-Item "$dir\layers" -ItemType Directory -Force | Out-Null
foreach($role in $order){
 if($role -like 'lash_*' -and $size -eq 0){continue}
 if($role -like 'eye_*' -and $size -gt 0){$layer=if($role -eq 'eye_R'){$eye.Clone()}else{$eyeOther.Clone()}}
 elseif($role -like 'lash_*'){
 $layer=if($role -eq 'lash_R'){$eye.Clone()}else{$eyeOther.Clone()}
 $m=if($role -eq 'lash_R'){$mask}else{$maskOther}
 [Facial]::Mask($layer,$m,$true)
 }
 elseif($role -like 'iris_*' -and $size -gt 0){
 $source=if($role -eq 'iris_R'){'iris_left'}else{'iris_right'}
 $b=New-Object System.Drawing.Bitmap("$root\parts\$source.png")
 $r=[Facial]::Bounds($b);$factor=$size/[double][math]::Max($r.Width,$r.Height)
 $w=$r.Width*$factor;$h=$r.Height*$factor
 $cx=if($role -eq 'iris_R'){470}else{629}
 $layer=New-Object System.Drawing.Bitmap(1100,1500)
 $g=[System.Drawing.Graphics]::FromImage($layer);$g.InterpolationMode='HighQualityBicubic'
 $g.DrawImage($b,[System.Drawing.RectangleF]::new([float]($cx-$w/2),[float](439-$h/2),[float]$w,[float]$h),$r,[System.Drawing.GraphicsUnit]::Pixel)
 $g.Dispose();$b.Dispose()
 $m=if($role -eq 'iris_R'){$mask}else{$maskOther}
 [Facial]::Mask($layer,$m,$false)
 }
 else{$layer=New-Object System.Drawing.Bitmap("$root\layers-refined\$role.png")}
 if($role -eq 'face' -and $case[2]){$warped=[Facial]::Warp($layer);$layer.Dispose();$layer=$warped}
 if($role -eq 'mouth' -and $case[3]){[Facial]::Tint($layer)}
 $layer.Save("$dir\layers\$role.png");$layer.Dispose()
}
$canvas=New-Object System.Drawing.Bitmap(1100,1500)
$g=[System.Drawing.Graphics]::FromImage($canvas);$g.Clear([System.Drawing.Color]::FromArgb(255,240,241,245))
foreach($role in $order){$p="$dir\layers\$role.png";if(Test-Path $p){$b=New-Object System.Drawing.Bitmap($p);$g.DrawImageUnscaled($b,0,0);$b.Dispose()}}
$g.Dispose();$canvas.Save("$out\previews\$name.png");$canvas.Dispose()
}
$eye.Dispose();$eyeOther.Dispose();$mask.Dispose();$maskOther.Dispose()
$after=Get-ChildItem "$root\parts","$root\layers-refined","$root\reference" -Filter *.png | Get-FileHash
if(Compare-Object $before $after -Property Path,Hash){throw 'Original PNG changed'}
$before|ConvertTo-Json|Set-Content "$out\source-hashes.json"
# Labeled close-up comparison, using only already composed outputs.
foreach($set in @(@('comparison',@('01-baseline','02-eyes-only','03-eyes-lower-face','04-eyes-face-mouth-tint')),@('iris-sizes',@('test-iris-46','02-eyes-only','test-iris-54')))){
$names=$set[1];$sheet=New-Object System.Drawing.Bitmap([int](400*$names.Count),560)
$g=[System.Drawing.Graphics]::FromImage($sheet);$g.Clear([System.Drawing.Color]::WhiteSmoke)
$font=New-Object System.Drawing.Font('Arial',13)
for($i=0;$i -lt $names.Count;$i++){
$b=New-Object System.Drawing.Bitmap("$out\previews\$($names[$i]).png")
$g.DrawString($names[$i],$font,[System.Drawing.Brushes]::Black,$i*400+10,10)
$g.DrawImage($b,[System.Drawing.Rectangle]::new($i*400,40,400,520),[System.Drawing.Rectangle]::new(300,170,500,650),[System.Drawing.GraphicsUnit]::Pixel)
$b.Dispose()
}
$g.Dispose();$font.Dispose();$sheet.Save("$out\previews\$($set[0]).png");$sheet.Dispose()
}
'Created isolated facial comparisons. Original source, baseline layers and references verified unchanged.'

