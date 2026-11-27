package dev.capnolithyl.mikan.launcher;

import java.time.LocalDate;

/** Deterministic local screensaver selections; no device or network dependencies. */
final class DreamRules {
    static final int AUTO=0,SLEEPY=1,DAY=2,RANDOM=3;
    static final int COZY=0,MINIMAL=1,DEEP=2;
    static final int BLACK=0,WARM=1,BLURRED=2,TINTED=3;
    static final int MOTION_OFF=0,MOTION_SUBTLE=1,MOTION_FULL=2;
    static int batteryPercent(int level,int scale){return level<0||scale<=0||level>scale?-1:Math.round(100f*level/scale);}
    // Same 30-minute freshness threshold as the dashboard; do not present an old
    // observation as current conditions after six hours of unattended charging.
    static int weatherFreshness(long sampled,long now){
        if(sampled<=0||sampled>now)return 0;
        long age=now-sampled;
        return age<30*60*1000L?1:age<6*60*60*1000L?2:0;
    }
    static String temperature(double celsius,boolean fahrenheit){
        return Math.round(fahrenheit?celsius*9/5+32:celsius)+"°"+(fahrenheit?"F":"C");
    }
    static String alarmDay(LocalDate today,LocalDate date){
        if(date.equals(today))return "Today";
        if(date.equals(today.plusDays(1)))return "Tomorrow";
        return date.format(java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.MEDIUM));
    }
    static int motion(int requested,int style,boolean systemEnabled){return style==COZY&&systemEnabled?Math.max(0,Math.min(2,requested)):MOTION_OFF;}
    static int frameDelay(int motion,Period period){return motion==MOTION_OFF?0:period==Period.NIGHT?(motion==MOTION_FULL?166:250):(motion==MOTION_FULL?83:125);}
    static int particleCount(int motion,Period period){return motion==MOTION_OFF?0:period==Period.NIGHT?(motion==MOTION_FULL?7:3):(motion==MOTION_FULL?16:7);}
    static float particleRadius(int motion,Period period,int index){return motion==MOTION_OFF?0:(period==Period.NIGHT?.0028f:.0048f)*(motion==MOTION_FULL?1f:.65f)*(1f+(index%3)*.32f);}
    static int particleAlpha(int motion,Period period){return motion==MOTION_OFF?0:period==Period.NIGHT?(motion==MOTION_FULL?105:60):(motion==MOTION_FULL?225:145);}
    static int particleDuration(int motion,int index){return (motion==MOTION_FULL?5500:8500)+(index%4)*1300;}
    static float phase(long elapsed,int duration,int offset){return Math.floorMod(elapsed+offset,(long)duration)/(float)duration;}
    static float envelope(float phase){return (float)Math.sin(Math.PI*Math.max(0f,Math.min(1f,phase)));}
    static int background(int requested,int style){return style!=COZY?BLACK:Math.max(BLACK,Math.min(TINTED,requested));}
    static int blend(int requested){return Math.max(0,Math.min(2,requested));}
    static float feather(int strength){return new float[]{.075f,.15f,.23f}[blend(strength)];}
    static int[] palette(Period period){
        switch(period){
            case MORNING:return new int[]{0xff291a16,0xff94603c,0xff38201b};
            case DAY:return new int[]{0xff251811,0xff795034,0xff352219};
            case EVENING:return new int[]{0xff231419,0xff754333,0xff301c20};
            default:return new int[]{0xff100b0d,0xff39241e,0xff140e11};
        }
    }
    /** Two-pass box blur over a small opaque thumbnail; edge samples clamp. */
    static int[] blurRgb(int[] source,int w,int h,int radius){
        if(w<1||h<1||w>128||h>128||source.length!=w*h||radius<0||radius>24)throw new IllegalArgumentException("Invalid blur dimensions");
        int[] tmp=new int[source.length],out=new int[source.length];int n=2*radius+1;
        for(int pass=0;pass<2;pass++){
            int[] in=pass==0?source:tmp,dest=pass==0?tmp:out;
            for(int y=0;y<h;y++)for(int x=0;x<w;x++){
                int red=0,green=0,blue=0;
                for(int i=-radius;i<=radius;i++){
                    int sx=pass==0?Math.max(0,Math.min(w-1,x+i)):x;
                    int sy=pass==1?Math.max(0,Math.min(h-1,y+i)):y;
                    int pixel=in[sy*w+sx];red+=(pixel>>>16)&255;green+=(pixel>>>8)&255;blue+=pixel&255;
                }
                dest[y*w+x]=0xff000000|((red/n)<<16)|((green/n)<<8)|(blue/n);
            }
        }
        return out;
    }
    enum Period {
        MORNING(MikanExpression.EXCITED,"Good morning ♡",0xffedbb91),
        DAY(MikanExpression.SMUG,"Keeping you company ♡",0xfff0c6a0),
        EVENING(MikanExpression.DEFAULT,"A cozy evening ♡",0xffdfab87),
        NIGHT(MikanExpression.SLEEPY,"Sweet dreams ♡",0xffb98773);
        final MikanExpression expression;
        final String greeting;
        final int color;
        Period(MikanExpression expression,String greeting,int color){this.expression=expression;this.greeting=greeting;this.color=color;}
    }
    static Period period(int hour){
        return hour>=6&&hour<11?Period.MORNING:hour>=11&&hour<17?Period.DAY:hour>=17&&hour<22?Period.EVENING:Period.NIGHT;
    }
    static Period artwork(int mode,LocalDate date,Period current){
        if(mode==SLEEPY)return Period.NIGHT;
        if(mode==DAY)return Period.DAY;
        if(mode==RANDOM)return Period.values()[Math.floorMod((int)(date.toEpochDay()+current.ordinal()),4)];
        return current;
    }
    static String holiday(int mode,boolean enabled,LocalDate date,Period period){
        if(mode!=AUTO||!enabled||period==Period.NIGHT)return null;
        MikanHoliday holiday=MikanHoliday.on(date);
        return holiday==null?null:holiday.asset;
    }
    static String dedicated(Period period){return "portraits/dream/"+period.name().toLowerCase(java.util.Locale.ROOT)+".webp";}
    // Small bounded offsets applied to ALL lit content; never shifts the black background.
    static int shiftX(long minute){int[] values={0,1,-1,2,-2,1,-1};return values[Math.floorMod(minute,values.length)];}
    static int shiftY(long minute){int[] values={-1,2,0,-2,1,0,2,1,-1};return values[Math.floorMod(minute,values.length)];}
}
