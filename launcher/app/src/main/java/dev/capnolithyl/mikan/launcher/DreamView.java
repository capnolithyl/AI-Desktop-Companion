package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.BatteryManager;
import android.view.View;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Date;

/** Shared dream and preview scene, with bounded opt-in ambient redraws. */
final class DreamView extends View {
    private final SharedPreferences prefs;
    private final ExpressionArt art;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Typeface light=Typeface.create("sans-serif-light",Typeface.NORMAL);
    private final Typeface regular=Typeface.create("sans-serif",Typeface.NORMAL);
    private Drawable portrait;
    private final DreamBackgrounds backdrop=new DreamBackgrounds();
    private final DreamAmbient ambient=new DreamAmbient();
    private int motion=DreamRules.MOTION_OFF;
    private boolean motionActive, sleepingArt;
    private long motionStart;
    private final Runnable motionFrame=new Runnable(){
        @Override public void run(){
            if(!canAnimate())return;
            invalidate();postDelayed(this,DreamRules.frameDelay(motion,period));
        }
    };
    private DreamRules.Period period=DreamRules.Period.DAY;
    private int backgroundMode,blendStrength;
    private float previewAspect=0;
    private int artworkSize;
    private final DreamArtPack pack;
    private String artKey="",clock="",date="",greeting="",battery="",batteryStatus="",chargeEstimate="",alarm="";
    private DreamDetails.Weather weather;
    private final DreamFooter detailsFooter=new DreamFooter();
    private int style,clockSize,color,batteryPercent=-1;
    private boolean showBattery,shift,night;
    private long minute;
    DreamView(Context context,SharedPreferences prefs){
        super(context);this.prefs=prefs;art=new ExpressionArt(context);pack=new DreamArtPack(context);setBackgroundColor(Color.BLACK);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
    }
    void previewAspect(float aspect){previewAspect=aspect;requestLayout();invalidate();}
    void refresh(){refresh(-1);}
    void refresh(int previewHour){
        LocalDate today=LocalDate.now();
        int hour=previewHour>=0?previewHour:LocalTime.now().getHour();
        DreamRules.Period current=DreamRules.period(hour);period=current;
        int mode=prefs.getInt("dreamArtMode",DreamRules.AUTO);
        style=prefs.getInt("dreamStyle",DreamRules.COZY);
        motion=DreamRules.motion(prefs.getInt("dreamMotion",DreamRules.MOTION_SUBTLE),style,android.animation.ValueAnimator.areAnimatorsEnabled());
        backgroundMode=DreamRules.background(prefs.getInt("dreamBackground",DreamRules.TINTED),style);
        blendStrength=DreamRules.blend(prefs.getInt("dreamBlend",1));
        clockSize=prefs.getInt("dreamClockSize",1);
        artworkSize=Math.max(0,Math.min(2,prefs.getInt("dreamArtworkSize",1)));
        showBattery=prefs.getBoolean("dreamBattery",true);shift=prefs.getBoolean("dreamShift",true);
        night=current==DreamRules.Period.NIGHT||style==DreamRules.DEEP;
        DreamRules.Period chosen=DreamRules.artwork(mode,today,current);
        String holiday=DreamRules.holiday(mode,prefs.getBoolean("dreamHoliday",true),today,current);
        sleepingArt=chosen==DreamRules.Period.NIGHT&&holiday==null;
        String next=style==DreamRules.MINIMAL?"none":chosen.name()+":"+holiday+":"+pack.revision();
        if(!next.equals(artKey)){
            artKey=next;
            portrait=null;
            if(style!=DreamRules.MINIMAL){
                if(holiday==null)portrait=pack.load(chosen);
                if(portrait==null)portrait=art.get(chosen.expression,holiday==null?DreamRules.dedicated(chosen):holiday);
            }
        }
        backdrop.prepare(portrait,artKey,backgroundMode,blendStrength);
        Date now=new Date();
        if(previewHour>=0){java.util.Calendar cal=java.util.Calendar.getInstance();cal.set(java.util.Calendar.HOUR_OF_DAY,previewHour);now=cal.getTime();}
        clock=android.text.format.DateFormat.getTimeFormat(getContext()).format(now);
        date=today.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL));
        greeting=current.greeting;
        if(holiday!=null){MikanHoliday festival=MikanHoliday.on(today);if(festival!=null)greeting=festival.text;}
        color=style==DreamRules.DEEP?0xff805d51:current.color;
        long actualNow=System.currentTimeMillis();
        batteryPercent=-1;chargeEstimate="";batteryStatus="";
        battery=showBattery?batteryLabel(actualNow):"";minute=actualNow/60000L;
        weather=prefs.getBoolean("dreamWeather",false)?DreamDetails.weather(prefs,actualNow):null;
        alarm=prefs.getBoolean("dreamAlarm",true)?DreamDetails.alarm(getContext(),actualNow):"";
        setContentDescription(clock+", "+date+(showBattery?", "+battery:"")+(chargeEstimate.isEmpty()?"":", "+chargeEstimate)+(weather==null?"":", "+weather.description())+(alarm.isEmpty()?"":", "+alarm));
        invalidate();scheduleMotion();
    }
    void setMotionActive(boolean active){
        if(active&&!motionActive)motionStart=android.os.SystemClock.uptimeMillis();
        motionActive=active;scheduleMotion();invalidate();
    }
    private boolean canAnimate(){return motionActive&&motion!=DreamRules.MOTION_OFF&&portrait!=null&&isAttachedToWindow()&&getWindowVisibility()==VISIBLE&&isShown()&&android.animation.ValueAnimator.areAnimatorsEnabled();}
    private void scheduleMotion(){if(motionFrame==null)return;removeCallbacks(motionFrame);if(canAnimate())postDelayed(motionFrame,DreamRules.frameDelay(motion,period));}
    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();scheduleMotion();}
    @Override protected void onWindowVisibilityChanged(int visibility){super.onWindowVisibilityChanged(visibility);scheduleMotion();}
    @Override public void onVisibilityAggregated(boolean visible){super.onVisibilityAggregated(visible);scheduleMotion();}
    @Override protected void onDetachedFromWindow(){removeCallbacks(motionFrame);super.onDetachedFromWindow();}
    boolean dim(){return night;}
    void release(){setMotionActive(false);portrait=null;art.clear();backdrop.clear();artKey="";}
    private String batteryLabel(long now){
        try{
            Intent i=getContext().registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if(i==null)return "Battery unavailable";
            int level=i.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=i.getIntExtra(BatteryManager.EXTRA_SCALE,-1);
            batteryPercent=DreamRules.batteryPercent(level,scale);
            if(batteryPercent<0)return "Battery unavailable";
            int status=i.getIntExtra(BatteryManager.EXTRA_STATUS,-1),plugged=i.getIntExtra(BatteryManager.EXTRA_PLUGGED,0);
            if(level<scale&&plugged!=0&&(status==BatteryManager.BATTERY_STATUS_CHARGING||status==BatteryManager.BATTERY_STATUS_NOT_CHARGING))chargeEstimate=chargeEstimate(now);
            batteryStatus=status==BatteryManager.BATTERY_STATUS_FULL?"Fully charged":status==BatteryManager.BATTERY_STATUS_CHARGING?"Charging":plugged!=0?"Plugged in":"On battery";
            return batteryPercent+"% · "+batteryStatus;
        }catch(RuntimeException ex){batteryPercent=-1;chargeEstimate="";return "Battery unavailable";}
    }
    private String chargeEstimate(long now){
        if(android.os.Build.VERSION.SDK_INT<28)return "";
        try{
            BatteryManager manager=getContext().getSystemService(BatteryManager.class);
            if(manager==null)return "";
            long finish=DreamRules.chargeFinishAt(now,manager.computeChargeTimeRemaining());
            if(finish<0)return "";
            java.time.ZoneId zone=java.time.ZoneId.systemDefault();
            LocalDate today=java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
            LocalDate day=java.time.Instant.ofEpochMilli(finish).atZone(zone).toLocalDate();
            String when=(day.equals(today)?"":DreamRules.alarmDay(today,day)+" ")+android.text.format.DateFormat.getTimeFormat(getContext()).format(new Date(finish));
            return "Est. full by "+when;
        }catch(RuntimeException ex){return "";}
    }
    private void line(Canvas canvas,String value,float x,float baseline,float size,float maxWidth,int ink,Typeface font){
        paint.setTypeface(font);paint.setTextSize(size);paint.setColor(ink);paint.setTextAlign(Paint.Align.CENTER);
        float width=paint.measureText(value);if(width>maxWidth&&width>0)paint.setTextSize(size*maxWidth/width);
        canvas.drawText(value,x,baseline,paint);
    }
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float w=getWidth(),h=getHeight();if(w<=0||h<=0)return;
        canvas.save();
        if(previewAspect>0){float fitW=Math.min(w,h*previewAspect),fitH=fitW/previewAspect;canvas.translate((w-fitW)/2,(h-fitH)/2);w=fitW;h=fitH;canvas.clipRect(0,0,w,h);}
        boolean landscape=w>h;
        float unit=Math.min(w,h),margin=unit*.07f;
        float dx=shift?DreamRules.shiftX(minute)*unit*.009f:0,dy=shift?DreamRules.shiftY(minute)*unit*.009f:0;
        backdrop.draw(canvas,w,h,period,backgroundMode,blendStrength,dx,dy);
        canvas.save();canvas.translate(dx,dy);
        boolean withArt=portrait!=null&&style!=DreamRules.MINIMAL;
        float cx=landscape&&withArt?w*.29f:w*.5f;
        float cy=landscape?h*.43f:withArt?h*.15f:h*.44f;
        float textWidth=landscape&&withArt?w*.49f:w-2*margin;
        float size=unit*(clockSize==0?.17f:clockSize==2?.27f:.22f);
        boolean hasGreeting=style!=DreamRules.MINIMAL,hasWeather=weather!=null,hasAlarm=!alarm.isEmpty();
        boolean hasBar=showBattery&&batteryPercent>=0,hasEstimate=!chargeEstimate.isEmpty();
        float footerWidth=Math.min(textWidth,unit*1.02f);
        boolean columns=DreamRules.footerColumns(footerWidth,unit,hasWeather||hasAlarm,showBattery);
        float footerUnits=DreamRules.footerHeight(hasGreeting,hasWeather,hasAlarm,showBattery,hasBar,hasEstimate,columns);
        float footerEnd=h*(withArt||landscape?.935f:.88f);
        float footerUnit=unit;
        // Reserve date clearance even in landscape or a nearly square preview.
        if(footerUnits>0)footerUnit=Math.min(unit,Math.max(1,footerEnd-cy-unit*.125f)/footerUnits);
        float footerTop=footerEnd-footerUnits*footerUnit;
        if(withArt){
            float factor=artworkSize==0?.78f:artworkSize==2?1.08f:1f;
            boolean integrated=backgroundMode!=DreamRules.BLACK;
            float areaW=(landscape?w*.40f:w*(integrated?.96f:.90f))*factor;
            float areaH=(landscape?h*.78f:h*(integrated?.63f:.60f))*factor;
            float aw=Math.max(1,portrait.getIntrinsicWidth()),ah=Math.max(1,portrait.getIntrinsicHeight());
            float scale=Math.min(areaW/aw,areaH/ah);
            float width=aw*scale,height=ah*scale;
            float ax=landscape?w*.75f:w*.5f,ay=landscape?h*.49f:h*.53f;
            if(!landscape&&footerUnits>0){
                float top=Math.max(h*.22f,cy+unit*.14f),end=footerTop-unit*.035f;
                float available=Math.max(unit*.10f,end-top);
                if(height>available){float fit=available/height;width*=fit;height*=fit;}
                ay=Math.max(top+height/2,Math.min(ay,end-height/2));
            }
            portrait.setBounds(Math.round(ax-width/2),Math.round(ay-height/2),Math.round(ax+width/2),Math.round(ay+height/2));
            int alpha=style==DreamRules.DEEP?75:night?145:integrated?255:215;
            if(!integrated||!backdrop.drawPortrait(canvas,portrait.getBounds(),alpha)){portrait.setAlpha(alpha);portrait.draw(canvas);}
            if(canAnimate())ambient.draw(canvas,portrait.getBounds(),w,h,unit,period,motion,sleepingArt,android.os.SystemClock.uptimeMillis()-motionStart);
        }
        line(canvas,clock,cx,cy,size,textWidth,color,light);
        line(canvas,date,cx,cy+unit*.075f,unit*.041f,textWidth,color,regular);
        detailsFooter.draw(canvas,cx,footerTop,footerWidth,footerUnit,color,night,columns,
            hasGreeting?greeting:"",weather,alarm,showBattery,batteryPercent,batteryStatus,chargeEstimate);
        canvas.restore();canvas.restore();
    }
}
