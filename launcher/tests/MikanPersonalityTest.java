package dev.capnolithyl.mikan.launcher;
import java.time.LocalDate;
import java.util.*;
public final class MikanPersonalityTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        check(MikanPersonality.battery(5,false,false,false).key.equals("battery:critical"));
        check(MikanPersonality.battery(15,false,false,false).expression==MikanExpression.CONCERNED);
        check(MikanPersonality.battery(25,false,false,false).expression==MikanExpression.POUTY);
        check(MikanPersonality.battery(26,false,false,false)==null);
        check(MikanPersonality.battery(3,true,false,true).expression==MikanExpression.EXCITED);
        check(MikanPersonality.battery(100,false,true,true).key.equals("battery:full"));
        check(MikanPersonality.battery(4,false,false,true)==null);
        check(MikanPersonality.battery(-1,false,false,false)==null);
        check(MikanPersonality.holiday(LocalDate.of(2026,11,26))!=null);
        check(MikanPersonality.holiday(LocalDate.of(2026,11,25))==null);
        check(MikanPersonality.holiday(LocalDate.of(2027,11,25))!=null);
        check(MikanPersonality.holiday(LocalDate.of(2026,12,25))!=null);
        check(MikanHoliday.values().length==18);
        check(MikanHoliday.on(LocalDate.of(2026,11,26))==MikanHoliday.THANKSGIVING);
        check(MikanPersonality.holiday(LocalDate.of(2026,11,26)).portraitAsset.endsWith("mikan_s_cozy_thanksgiving_gathering.png"));
        check(MikanHoliday.on(LocalDate.of(2026,11,27))==null);
        check(MikanHoliday.on(LocalDate.of(2026,4,3))==MikanHoliday.GOOD_FRIDAY);
        check(MikanHoliday.on(LocalDate.of(2026,4,5))==MikanHoliday.EASTER);
        check(MikanHoliday.on(LocalDate.of(2027,3,26))==MikanHoliday.GOOD_FRIDAY);
        check(MikanHoliday.on(LocalDate.of(2027,3,28))==MikanHoliday.EASTER);
        check(MikanHoliday.on(LocalDate.of(2026,5,10))==MikanHoliday.MOTHERS_DAY);
        check(MikanHoliday.on(LocalDate.of(2026,5,25))==MikanHoliday.MEMORIAL_DAY);
        check(MikanHoliday.on(LocalDate.of(2026,6,21))==MikanHoliday.FATHERS_DAY);
        check(MikanHoliday.on(LocalDate.of(2026,9,7))==MikanHoliday.LABOR_DAY);
        check(MikanHoliday.on(LocalDate.of(2026,10,3))==MikanHoliday.GERMAN_UNITY);
        check(MikanHoliday.on(LocalDate.of(2026,11,11))==MikanHoliday.VETERANS_DAY);
        check(MikanHoliday.on(LocalDate.of(2026,3,17))==MikanHoliday.ST_PATRICK);
        check(MikanHoliday.on(LocalDate.of(2026,12,6))==MikanHoliday.NIKOLAUS);
        check(MikanHoliday.on(LocalDate.of(2026,12,24)).asset.equals(MikanHoliday.CHRISTMAS.asset));
        check(MikanHoliday.on(LocalDate.of(2026,12,31)).asset.equals(MikanHoliday.NEW_YEAR.asset));
        check(MikanHoliday.GOOD_FRIDAY.asset==null);
        check(MikanPersonality.idle(6).get(0).expression==MikanExpression.SLEEPY);
        check(MikanPersonality.idle(14).size()>=15);
        MikanPersonality.Rotation r=new MikanPersonality.Rotation();
        List<String> a=Arrays.asList("idle:a","idle:b","idle:c");
        check(r.select(a,0,45000)==0);
        check(r.select(a,45000,45000)==1);
        check(r.select(Arrays.asList("battery:low","idle:a","idle:b","idle:c"),46000,45000)==0);
        r.advance();check(r.select(Arrays.asList("battery:low","idle:a","idle:b","idle:c"),47000,45000)==1);
        check(r.select(a,48000,45000)==0);
        check(r.select(a,92000,45000)==1);
        r.reset();check(r.select(a,100000,45000)==0);
        System.out.println("MikanPersonality tests passed");
    }
}
