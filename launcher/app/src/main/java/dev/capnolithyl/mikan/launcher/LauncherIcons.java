package dev.capnolithyl.mikan.launcher;
import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.*;

final class LauncherIcons {
    // Adaptive monochrome layers include generous transparent safe-zone margins.
    // Normalize the visible artwork, not the entire adaptive icon canvas.
    static Drawable normalizedMonochrome(Context context,Drawable source,int tint){
        final int size=144;
        Drawable d=source.getConstantState()==null?source:source.getConstantState().newDrawable();
        Bitmap rendered=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888);
        Rect old=new Rect(d.getBounds());d.setBounds(0,0,size,size);d.draw(new Canvas(rendered));d.setBounds(old);
        int[] pixels=new int[size*size];rendered.getPixels(pixels,0,size,0,0,size,size);
        int left=size,top=size,right=-1,bottom=-1;
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)if((pixels[y*size+x]>>>24)>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        if(right<left||bottom<top){rendered.recycle();return null;}
        int width=right-left+1,height=bottom-top+1;float scale=124f/Math.max(width,height);
        float w=width*scale,h=height*scale;Bitmap result=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);paint.setColorFilter(new PorterDuffColorFilter(tint,PorterDuff.Mode.SRC_IN));
        new Canvas(result).drawBitmap(rendered,new Rect(left,top,right+1,bottom+1),new RectF((size-w)/2,(size-h)/2,(size+w)/2,(size+h)/2),paint);
        rendered.recycle();return new BitmapDrawable(context.getResources(),result);
    }
    static Drawable create(Context context,String pkg,String label,Drawable original){
        // Recognizable warm line-art for common apps. Other apps keep their shape
        // with a luminance-based amber filter instead of an opaque solid tint.
        int size=144;Bitmap b=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);c.scale(3,3);
        Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(0xffffbf88);p.setStrokeWidth(3.3f);p.setStrokeJoin(Paint.Join.ROUND);p.setStrokeCap(Paint.Cap.ROUND);p.setStyle(Paint.Style.STROKE);
        Path path=new Path();
        if(pkg.equals("com.google.android.gm")){c.drawRoundRect(5,10,43,38,5,5,p);path.moveTo(7,13);path.lineTo(24,26);path.lineTo(41,13);c.drawPath(path,p);}
        else if(pkg.equals("com.google.android.youtube")){c.drawRoundRect(4,9,44,39,8,8,p);p.setStyle(Paint.Style.FILL);path.moveTo(19,15);path.lineTo(33,24);path.lineTo(19,33);path.close();c.drawPath(path,p);}
        else if(pkg.equals("com.google.android.apps.maps")){path.moveTo(24,43);path.cubicTo(14,31,9,24,9,18);path.cubicTo(9,-1,39,-1,39,18);path.cubicTo(39,25,34,31,24,43);path.close();c.drawPath(path,p);c.drawCircle(24,17,5,p);}
        else if(pkg.equals("com.google.android.apps.messaging")){path.moveTo(12,37);path.lineTo(5,43);path.lineTo(6,30);path.cubicTo(-1,8,12,5,24,5);path.cubicTo(49,5,51,38,24,38);path.close();c.drawPath(path,p);c.drawLine(14,19,34,19,p);c.drawLine(14,26,30,26,p);}
        else if(pkg.equals("com.google.android.GoogleCamera")){c.drawRoundRect(4,13,44,39,5,5,p);c.drawCircle(24,26,9,p);c.drawLine(15,8,29,8,p);}
        else if(pkg.equals("com.android.chrome")){c.drawCircle(24,24,19,p);c.drawCircle(24,24,8,p);c.drawLine(24,16,40,16,p);c.drawLine(17,28,8,12,p);c.drawLine(27,32,20,42,p);}
        else if(pkg.equals("com.google.android.apps.photos")){p.setStyle(Paint.Style.FILL);for(int i=0;i<4;i++){c.save();c.rotate(i*90,24,24);c.drawArc(12,2,36,26,180,180,true,p);c.restore();}c.drawCircle(24,24,3,p);}
        else if(pkg.equals("com.google.android.dialer")){path.moveTo(8,6);path.lineTo(17,5);path.lineTo(21,15);path.lineTo(15,20);path.cubicTo(20,30,25,33,29,34);path.lineTo(34,28);path.lineTo(44,33);path.lineTo(42,42);path.cubicTo(27,49,0,22,8,6);path.close();c.drawPath(path,p);}
        else{
            Drawable d=original.getConstantState()==null?original:original.getConstantState().newDrawable();d=d.mutate();
            d.setColorFilter(new ColorMatrixColorFilter(new float[]{.2126f,.7152f,.0722f,0,0,.155f,.522f,.053f,0,0,.105f,.353f,.036f,0,0,0,0,0,1,0}));return d;
        }
        return new BitmapDrawable(context.getResources(),b);
    }
}
