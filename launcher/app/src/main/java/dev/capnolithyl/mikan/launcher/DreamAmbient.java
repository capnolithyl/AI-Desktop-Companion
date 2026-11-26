package dev.capnolithyl.mikan.launcher;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;

/** Sparse low-brightness ambient details, anchored to artwork rather than screen coordinates.
 * Works with arbitrary imported and holiday art, no per-image masks or regenerated bitmaps. */
final class DreamAmbient {
    private final Paint ink=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Typeface soft=Typeface.create("sans-serif-light",Typeface.NORMAL);
    private static final String[] SLEEP={"z","z","Z"};
    void draw(Canvas canvas,Rect art,float unit,DreamRules.Period period,int intensity,boolean sleeping,long elapsed){
        int count=DreamRules.particleCount(intensity,period);if(count==0||art.isEmpty())return;
        canvas.save();
        canvas.clipRect(art);
        boolean night=period==DreamRules.Period.NIGHT;
        float strength=intensity==DreamRules.MOTION_FULL?1f:.70f;
        for(int i=0;i<count;i++){
            // Alternate sides to keep most of the center/face unobstructed.
            float lane=.075f+((i*37+13)%19)*.012f;
            if((i&1)==1)lane=1f-lane;
            int duration=11000+(i%4)*2300;
            float phase=DreamRules.phase(elapsed,duration,i*2917);
            float wave=DreamRules.envelope(phase);
            float drift=(float)Math.sin(phase*Math.PI*2+i)*.035f;
            float x=art.left+(lane+drift)*art.width();
            float y=art.top+(.24f+((i*19)%29)*.018f-phase*.15f)*art.height();
            int alpha=Math.round((night?43:period==DreamRules.Period.EVENING?105:76)*wave*strength);
            float radius=unit*(.0018f+(i%3)*.0008f);
            if(period==DreamRules.Period.MORNING){
                glow(canvas,x,y,radius,0xffffd5a0,alpha);
            }else if(period==DreamRules.Period.DAY){
                if(i%3==0)sparkle(canvas,x,y,radius*2.2f,0xffffe1b9,alpha);
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
                ink.setColor(0xffd5b2a8);ink.setAlpha(Math.round(85*strength*DreamRules.envelope(phase)));
                ink.setTextSize(unit*(.019f+phase*.013f));canvas.drawText(SLEEP[i],x,y,ink);
            }
        }
        canvas.restore();
    }
    private void glow(Canvas canvas,float x,float y,float r,int color,int alpha){
        ink.setColor(color);ink.setAlpha(alpha/5);canvas.drawCircle(x,y,r*3f,ink);
        ink.setAlpha(alpha/3);canvas.drawCircle(x,y,r*1.7f,ink);
        ink.setAlpha(alpha);canvas.drawCircle(x,y,r,ink);
    }
    private void sparkle(Canvas canvas,float x,float y,float radius,int color,int alpha){
        ink.setColor(color);ink.setAlpha(alpha);ink.setStrokeCap(Paint.Cap.ROUND);ink.setStrokeWidth(Math.max(1f,radius*.28f));
        canvas.drawLine(x-radius,y,x+radius,y,ink);canvas.drawLine(x,y-radius*1.3f,x,y+radius*1.3f,ink);
    }
}
