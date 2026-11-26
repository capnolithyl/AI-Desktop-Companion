package dev.capnolithyl.mikan.launcher;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;

/** Visible, time-aware ambient details, anchored around the artwork and blended margins.
 * Works with arbitrary imported and holiday art, no per-image masks or regenerated bitmaps. */
final class DreamAmbient {
    private final Paint ink=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Typeface soft=Typeface.create("sans-serif-light",Typeface.NORMAL);
    private static final String[] SLEEP={"z","z","Z"};
    void draw(Canvas canvas,Rect art,float sceneWidth,float sceneHeight,float unit,DreamRules.Period period,int intensity,boolean sleeping,long elapsed){
        int count=DreamRules.particleCount(intensity,period);if(count==0||art.isEmpty())return;
        canvas.save();
        canvas.clipRect(0,0,sceneWidth,sceneHeight);
        boolean night=period==DreamRules.Period.NIGHT;
        float strength=intensity==DreamRules.MOTION_FULL?1f:.70f;
        for(int i=0;i<count;i++){
            // Use the dim blended margins as well as the art itself, while
            // keeping the clock/footer and most of the face unobstructed.
            float lane=-.055f+((i*37+13)%19)*.018f;
            if((i&1)==1)lane=1f-lane;
            int duration=DreamRules.particleDuration(intensity,i);
            float phase=DreamRules.phase(elapsed,duration,i*2317+duration/5);
            float wave=DreamRules.envelope(phase);
            float drift=(float)Math.sin(phase*Math.PI*2+i)*.065f;
            float x=Math.max(unit*.035f,Math.min(sceneWidth-unit*.035f,art.left+(lane+drift)*art.width()));
            float start=.36f+((i*19)%29)*.020f;
            float y=art.top+(start-phase*(night?.20f:.32f))*art.height();
            int alpha=Math.round(DreamRules.particleAlpha(intensity,period)*wave);
            float radius=unit*DreamRules.particleRadius(intensity,period,i);
            if(period==DreamRules.Period.MORNING){
                glow(canvas,x,y,radius,0xffffd5a0,alpha);
            }else if(period==DreamRules.Period.DAY){
                if(i%2==0)sparkle(canvas,x,y,radius*1.8f,0xffffedcf,alpha);
                else glow(canvas,x,y,radius,0xffffd2a0,alpha);
            }else if(period==DreamRules.Period.EVENING){
                glow(canvas,x,y,radius*1.5f,0xffffb965,alpha);
            }else{
                sparkle(canvas,x,y,radius*1.8f,0xffc8bedf,alpha);
            }
        }
        // A few slowly drifting, dim sleep symbols; only for the selected sleepy artwork.
        if(night&&sleeping){
            int n=intensity==DreamRules.MOTION_FULL?3:2;
            ink.setTypeface(soft);ink.setTextAlign(Paint.Align.CENTER);
            for(int i=0;i<n;i++){
                float phase=DreamRules.phase(elapsed,9000,i*3000);
                float x=art.left+(.69f+phase*.12f)*art.width();
                float y=art.top+(.46f-phase*.13f)*art.height();
                ink.setColor(0xffd5b2a8);ink.setAlpha(Math.round(155*strength*DreamRules.envelope(phase)));
                ink.setTextSize(unit*(.028f+phase*.018f));canvas.drawText(SLEEP[i],x,y,ink);
            }
        }
        canvas.restore();
    }
    private void glow(Canvas canvas,float x,float y,float r,int color,int alpha){
        ink.setColor(0xff1d100d);ink.setAlpha(alpha/3);canvas.drawCircle(x,y,r*1.3f,ink);
        ink.setColor(color);ink.setAlpha(alpha/7);canvas.drawCircle(x,y,r*3f,ink);
        ink.setAlpha(alpha/3);canvas.drawCircle(x,y,r*1.7f,ink);
        ink.setAlpha(alpha);canvas.drawCircle(x,y,r,ink);
    }
    private void sparkle(Canvas canvas,float x,float y,float radius,int color,int alpha){
        ink.setStrokeCap(Paint.Cap.ROUND);
        ink.setColor(0xff25140e);ink.setAlpha(alpha/2);ink.setStrokeWidth(Math.max(2f,radius*.48f));
        canvas.drawLine(x-radius,y,x+radius,y,ink);canvas.drawLine(x,y-radius*1.3f,x,y+radius*1.3f,ink);
        ink.setColor(color);ink.setAlpha(alpha);ink.setStrokeWidth(Math.max(1f,radius*.24f));
        canvas.drawLine(x-radius,y,x+radius,y,ink);canvas.drawLine(x,y-radius*1.3f,x,y+radius*1.3f,ink);
    }
}
