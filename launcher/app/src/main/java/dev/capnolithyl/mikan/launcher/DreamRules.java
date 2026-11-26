package dev.capnolithyl.mikan.launcher;

import java.time.LocalDate;

/** Deterministic local screensaver selections; no device or network dependencies. */
final class DreamRules {
    static final int AUTO=0,SLEEPY=1,DAY=2,RANDOM=3;
    static final int COZY=0,MINIMAL=1,DEEP=2;
    static final int BLACK=0,WARM=1,BLURRED=2,TINTED=3;
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
