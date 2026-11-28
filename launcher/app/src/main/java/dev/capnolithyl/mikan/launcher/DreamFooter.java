package dev.capnolithyl.mikan.launcher;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;

/** Small, theme-colored Canvas footer. No emoji fonts, bitmaps or network work. */
final class DreamFooter {
    private final Paint ink=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path=new Path();
    private final Typeface regular=Typeface.create("sans-serif",Typeface.NORMAL);
    private final Typeface medium=Typeface.create("sans-serif-medium",Typeface.NORMAL);
    private int color;
    private boolean dim;

    void draw(Canvas c,float cx,float top,float width,float u,int color,boolean dim,boolean columns,
              String greeting,DreamDetails.Weather weather,String alarm,boolean battery,int percent,String status,String estimate){
        this.color=color;this.dim=dim;
        boolean env=weather!=null||!alarm.isEmpty(),hasBar=battery&&percent>=0,hasEstimate=!estimate.isEmpty();
        float envHeight=DreamRules.footerEnvironment(weather!=null,!alarm.isEmpty())*u;
        float batteryHeight=DreamRules.footerBattery(battery,hasBar,hasEstimate)*u;
        if(!greeting.isEmpty()){
            text(c,greeting,cx,top+.039f*u,.041f*u,width,true,true);
            top+=(env||battery?.078f:.055f)*u;
        }
        if(columns){
            float gap=.052f*u,col=(width-gap)/2,left=cx-width/2;
            environment(c,left,top,col,u,weather,alarm);
            battery(c,left+col+gap,top,col,u,percent,status,estimate);
            setInk(false);ink.setAlpha(dim?28:52);ink.setStrokeWidth(Math.max(1,u*.0015f));
            c.drawLine(cx,top+.006f*u,cx,top+Math.max(envHeight,batteryHeight)-.006f*u,ink);
        }else{
            float col=Math.min(width,u*.68f),left=cx-col/2;
            if(env){environment(c,left,top,col,u,weather,alarm);top+=envHeight+(battery?.025f*u:0);}
            if(battery)battery(c,left,top,col,u,percent,status,estimate);
        }
    }
    private void setInk(boolean primary){
        ink.setColor(color);ink.setAlpha(primary?255:dim?175:212);
        ink.setStyle(Paint.Style.FILL);
    }
    private void text(Canvas c,String value,float x,float baseline,float size,float maxWidth,boolean primary,boolean centered){
        setInk(primary);ink.setTypeface(primary?medium:regular);ink.setTextSize(size);
        ink.setTextAlign(centered?Paint.Align.CENTER:Paint.Align.LEFT);
        float measured=ink.measureText(value);
        if(measured>maxWidth&&measured>0)ink.setTextSize(size*Math.max(1,maxWidth)/measured);
        c.drawText(value,x,baseline,ink);
    }
    private void environment(Canvas c,float x,float y,float width,float u,DreamDetails.Weather weather,String alarm){
        float iconSize=.063f*u,offset=.081f*u,tx=x+offset,tw=width-offset;
        if(weather!=null){
            icon(c,DreamRules.weatherIcon(weather.code),weather.day,x,y+.012f*u,iconSize);
            text(c,weather.temperature.isEmpty()?"Weather":weather.temperature,tx,y+.042f*u,.049f*u,tw,true,false);
            String condition=(weather.cached?"Cached · ":"")+weather.condition;
            text(c,condition,tx,y+.085f*u,.033f*u,tw,false,false);
            y+=(.105f+(!alarm.isEmpty()?.022f:0))*u;
        }
        if(!alarm.isEmpty()){
            icon(c,8,true,x,y+.008f*u,iconSize);
            text(c,"Next alarm",tx,y+.035f*u,.032f*u,tw,false,false);
            String value=alarm.startsWith("Next alarm · ")?alarm.substring("Next alarm · ".length()):alarm;
            text(c,value,tx,y+.076f*u,.038f*u,tw,true,false);
        }
    }
    private void battery(Canvas c,float x,float y,float width,float u,int percent,String status,String estimate){
        float iconSize=.063f*u,tx=x+.081f*u,tw=width-.081f*u;
        icon(c,9,true,x,y+.010f*u,iconSize);
        text(c,percent<0?"Battery":percent+"%",tx,y+.044f*u,.052f*u,tw,true,false);
        text(c,percent<0?"Unavailable":status,tx,y+.085f*u,.033f*u,tw,false,false);
        float next=y+.105f*u;
        if(percent>=0){
            float height=.012f*u,top=next+.002f*u;
            setInk(false);ink.setAlpha(dim?48:64);c.drawRoundRect(x,top,x+width,top+height,height/2,height/2,ink);
            if(percent>0){float fill=width*percent/100f,rad=Math.min(height/2,fill/2);
                setInk(true);ink.setAlpha(dim?160:235);c.drawRoundRect(x,top,x+fill,top+height,rad,rad,ink);}
            next+=.035f*u;
        }
        if(!estimate.isEmpty())text(c,estimate,x,next+.035f*u,.033f*u,width,false,false);
    }
    private void sun(Canvas c,float x,float y,float radius){
        c.drawCircle(x,y,radius,ink);
        for(int i=0;i<8;i++){double a=i*Math.PI/4;float dx=(float)Math.cos(a),dy=(float)Math.sin(a);
            c.drawLine(x+dx*(radius+2),y+dy*(radius+2),x+dx*(radius+4),y+dy*(radius+4),ink);}
    }
    private void moon(Canvas c,float x,float y,float radius){
        path.reset();path.moveTo(x+radius*.30f,y-radius);
        path.cubicTo(x-radius*.25f,y-radius*.18f,x+radius*.1f,y+radius*.38f,x+radius,y+radius*.25f);
        path.cubicTo(x+radius*.65f,y+radius*1.12f,x-radius*.65f,y+radius*1.15f,x-radius,y+radius*.15f);
        path.cubicTo(x-radius*1.15f,y-radius*.55f,x-radius*.45f,y-radius*1.12f,x+radius*.30f,y-radius);path.close();c.drawPath(path,ink);
    }
    private void cloud(Canvas c,float dy){
        path.reset();path.moveTo(6,17+dy);
        path.cubicTo(0,17+dy,1,9+dy,6,9+dy);
        path.cubicTo(7,2+dy,16,2+dy,17,9+dy);
        path.cubicTo(24,8+dy,25,17+dy,19,17+dy);
        path.close();c.drawPath(path,ink);
    }
    private void icon(Canvas c,int kind,boolean day,float x,float y,float size){
        c.save();c.translate(x,y);c.scale(size/24,size/24);
        setInk(true);ink.setStyle(Paint.Style.STROKE);ink.setStrokeWidth(1.55f);ink.setStrokeCap(Paint.Cap.ROUND);ink.setStrokeJoin(Paint.Join.ROUND);
        switch(kind){
            case DreamRules.WEATHER_CLEAR:
                if(day)sun(c,12,12,6);else moon(c,12,12,8);break;
            case DreamRules.WEATHER_PARTLY:
                // Draw a small sun/moon above and left of the cloud.
                if(day)sun(c,7,6,3);else moon(c,7,6,4);
                c.save();c.translate(4,5);c.scale(.82f,.82f);cloud(c,0);c.restore();break;
            case DreamRules.WEATHER_CLOUD:cloud(c,2);break;
            case DreamRules.WEATHER_FOG:
                cloud(c,-2);c.drawLine(3,19,21,19,ink);c.drawLine(7,23,18,23,ink);break;
            case DreamRules.WEATHER_RAIN:
                cloud(c,-3);for(int i=5;i<=17;i+=6)c.drawLine(i,18,i-2,22,ink);break;
            case DreamRules.WEATHER_SNOW:
                cloud(c,-3);for(int i=5;i<=17;i+=6){c.drawLine(i-1.5f,20,i+1.5f,20,ink);c.drawLine(i,18.5f,i,21.5f,ink);}break;
            case DreamRules.WEATHER_STORM:
                cloud(c,-3);path.reset();path.moveTo(13,15);path.lineTo(9,20);path.lineTo(13,20);path.lineTo(10,24);c.drawPath(path,ink);break;
            case 8:
                c.drawCircle(12,13,8,ink);c.drawLine(12,13,12,8,ink);c.drawLine(12,13,16,15,ink);
                c.drawLine(3,5,7,2,ink);c.drawLine(17,2,21,5,ink);c.drawLine(6,20,4,23,ink);c.drawLine(18,20,20,23,ink);break;
            case 9:
                c.drawRoundRect(2,6,20,18,2,2,ink);c.drawLine(22,10,22,14,ink);
                path.reset();path.moveTo(11,8);path.lineTo(8,13);path.lineTo(12,13);path.lineTo(10,16);c.drawPath(path,ink);break;
            default:
                c.drawCircle(12,12,9,ink);path.reset();path.moveTo(9,9);path.cubicTo(9,5,16,5,16,9);path.cubicTo(16,12,12,12,12,15);c.drawPath(path,ink);
                c.drawPoint(12,18,ink);break;
        }
        ink.setStyle(Paint.Style.FILL);c.restore();
    }
}
