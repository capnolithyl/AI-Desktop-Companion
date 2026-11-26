package dev.capnolithyl.mikan.launcher;

import java.time.LocalDate;

/** Deterministic local screensaver selections; no device or network dependencies. */
final class DreamRules {
    static final int AUTO=0,SLEEPY=1,DAY=2,RANDOM=3;
    static final int COZY=0,MINIMAL=1,DEEP=2;
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
