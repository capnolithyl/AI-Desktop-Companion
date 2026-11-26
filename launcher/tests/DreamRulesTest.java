package dev.capnolithyl.mikan.launcher;
import java.time.LocalDate;
public final class DreamRulesTest {
    private static void check(boolean condition){if(!condition)throw new AssertionError();}
    public static void main(String[] args){
        check(DreamRules.period(5)==DreamRules.Period.NIGHT);
        check(DreamRules.period(6)==DreamRules.Period.MORNING);
        check(DreamRules.period(10)==DreamRules.Period.MORNING);
        check(DreamRules.period(11)==DreamRules.Period.DAY);
        check(DreamRules.period(17)==DreamRules.Period.EVENING);
        check(DreamRules.period(22)==DreamRules.Period.NIGHT);
        LocalDate thanksgiving=LocalDate.of(2026,11,26);
        check(DreamRules.artwork(DreamRules.SLEEPY,thanksgiving,DreamRules.Period.DAY)==DreamRules.Period.NIGHT);
        check(DreamRules.artwork(DreamRules.DAY,thanksgiving,DreamRules.Period.NIGHT)==DreamRules.Period.DAY);
        check(DreamRules.artwork(DreamRules.RANDOM,thanksgiving,DreamRules.Period.DAY)==DreamRules.artwork(DreamRules.RANDOM,thanksgiving,DreamRules.Period.DAY));
        check(DreamRules.holiday(DreamRules.AUTO,true,thanksgiving,DreamRules.Period.DAY)!=null);
        check(DreamRules.holiday(DreamRules.AUTO,true,thanksgiving,DreamRules.Period.NIGHT)==null);
        check(DreamRules.holiday(DreamRules.DAY,true,thanksgiving,DreamRules.Period.DAY)==null);
        check(DreamRules.holiday(DreamRules.AUTO,false,thanksgiving,DreamRules.Period.DAY)==null);
        for(long minute=-100;minute<100;minute++){check(Math.abs(DreamRules.shiftX(minute))<=2);check(Math.abs(DreamRules.shiftY(minute))<=2);}
        check(DreamRules.dedicated(DreamRules.Period.MORNING).equals("portraits/dream/morning.webp"));
        System.out.println("DreamRules tests passed");
    }
}
