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
        check(DreamRules.background(DreamRules.TINTED,DreamRules.COZY)==DreamRules.TINTED);
        check(DreamRules.background(DreamRules.TINTED,DreamRules.MINIMAL)==DreamRules.BLACK);
        check(DreamRules.background(DreamRules.WARM,DreamRules.DEEP)==DreamRules.BLACK);
        check(DreamRules.background(-1,DreamRules.COZY)==DreamRules.BLACK);
        check(DreamRules.background(99,DreamRules.COZY)==DreamRules.TINTED);
        check(DreamRules.feather(0)<DreamRules.feather(1)&&DreamRules.feather(1)<DreamRules.feather(2));
        check(DreamRules.palette(DreamRules.Period.DAY)[1]!=DreamRules.palette(DreamRules.Period.NIGHT)[1]);
        int[] uniform={0xffa06530,0xffa06530,0xffa06530,0xffa06530};
        check(java.util.Arrays.equals(uniform,DreamRules.blurRgb(uniform,2,2,3)));
        int[] sharp={0xff000000,0xffffffff,0xff000000};
        int[] soft=DreamRules.blurRgb(sharp,3,1,1);
        check((soft[0]&255)>0&&(soft[1]&255)<255&&soft[0]==soft[2]);
        check(sharp[1]==0xffffffff);
        check(DreamRules.blurRgb(new int[]{0xff123456},1,1,24)[0]==0xff123456);
        System.out.println("DreamRules tests passed");
    }
}
