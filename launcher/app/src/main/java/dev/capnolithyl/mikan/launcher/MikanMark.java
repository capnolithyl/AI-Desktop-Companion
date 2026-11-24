package dev.capnolithyl.mikan.launcher;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

final class MikanMark extends Drawable {
    static final int CAT=0,PAW=1,SPARK=2;
    private final int kind;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    MikanMark(int kind,int color){this.kind=kind;paint.setColor(color);paint.setStrokeJoin(Paint.Join.ROUND);paint.setStrokeCap(Paint.Cap.ROUND);}
    @Override public void draw(Canvas canvas){
        Rect bounds=getBounds();if(bounds.isEmpty())return;canvas.save();
        float side=Math.min(bounds.width(),bounds.height());
        canvas.translate(bounds.left+(bounds.width()-side)/2f,bounds.top+(bounds.height()-side)/2f);canvas.scale(side/32f,side/32f);
        Path path=new Path();
        if(kind==CAT){
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(2.25f);
            path.moveTo(5,14);path.lineTo(4,4);path.quadTo(4,2,6,3);path.lineTo(12,9);path.quadTo(16,7,20,9);path.lineTo(26,3);path.quadTo(28,2,28,5);path.lineTo(27,14);path.cubicTo(35,32,-3,32,5,14);path.close();canvas.drawPath(path,paint);
        }else if(kind==PAW){
            paint.setStyle(Paint.Style.FILL);
            canvas.drawOval(3,10,10,19,paint);canvas.drawOval(10,3,16,13,paint);canvas.drawOval(17,3,23,13,paint);canvas.drawOval(24,10,31,19,paint);
            path.moveTo(16,16);path.cubicTo(10,16,5,23,8,27);path.cubicTo(11,31,14,26,16,26);path.cubicTo(19,26,22,31,25,27);path.cubicTo(28,23,22,16,16,16);path.close();canvas.drawPath(path,paint);
        }else{
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(3);canvas.drawLine(15,12,14,4,paint);canvas.drawLine(21,15,27,9,paint);canvas.drawLine(23,21,30,21,paint);
        }
        canvas.restore();
    }
    @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
    @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
