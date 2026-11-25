package dev.capnolithyl.mikan.launcher;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

final class MikanMark extends Drawable {
    static final int CAT=0,PAW=1,SPARK=2,SEARCH=3,GLOBE=4,MIC=5,CALENDAR=6,GEAR=7;
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
        }else if(kind==SEARCH||kind==GLOBE||kind==MIC||kind==CALENDAR||kind==GEAR){
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(2.3f);
            if(kind==SEARCH){canvas.drawCircle(13,13,8,paint);canvas.drawLine(19,19,27,27,paint);}
            else if(kind==GLOBE){canvas.drawCircle(16,16,12,paint);canvas.drawOval(10,4,22,28,paint);canvas.drawLine(4,16,28,16,paint);}
            else if(kind==MIC){canvas.drawRoundRect(11,3,21,20,5,5,paint);canvas.drawArc(7,8,25,25,0,180,false,paint);canvas.drawLine(16,25,16,29,paint);canvas.drawLine(11,29,21,29,paint);}
            else if(kind==CALENDAR){canvas.drawRoundRect(4,6,28,28,4,4,paint);canvas.drawLine(4,12,28,12,paint);canvas.drawLine(10,3,10,9,paint);canvas.drawLine(22,3,22,9,paint);canvas.drawCircle(11,18,1,paint);canvas.drawCircle(21,18,1,paint);}
            else{canvas.drawCircle(16,16,9,paint);canvas.drawCircle(16,16,3,paint);for(int i=0;i<8;i++){canvas.save();canvas.rotate(i*45,16,16);canvas.drawLine(16,3,16,7,paint);canvas.restore();}}
        }else{
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(3);canvas.drawLine(15,12,14,4,paint);canvas.drawLine(21,15,27,9,paint);canvas.drawLine(23,21,30,21,paint);
        }
        canvas.restore();
    }
    @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
    @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
