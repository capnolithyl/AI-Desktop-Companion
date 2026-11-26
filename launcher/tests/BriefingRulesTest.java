package dev.capnolithyl.mikan.launcher;
import java.time.*;
public final class BriefingRulesTest {
    static void check(boolean b){if(!b)throw new AssertionError();}
    public static void main(String[] args){
        LocalDate date=LocalDate.of(2026,11,1);ZoneId zone=ZoneId.of("America/Detroit");
        BriefingRules.Day day=new BriefingRules.Day(date,zone);
        check(day.end-day.start==25*60*60*1000L);
        long now=day.start+6*60*60*1000L;
        check(day.remaining(now+1,now+100,false,now));
        check(!day.remaining(now-100,now-1,false,now));
        check(!day.remaining(day.end,day.end+1,false,now));
        check(day.remaining(day.utcStart,day.utcEnd,true,now));
        check(!day.remaining(day.utcStart-86400000L,day.utcStart,true,now));
        LocalTasks tasks=new LocalTasks();tasks.put(null,"Yesterday",date.minusDays(1));tasks.put(null,"Today",date);tasks.put(null,"Later",null);
        BriefingRules.TaskSummary s=BriefingRules.tasks(tasks.ordered(),date);
        check(s.open==3&&s.overdue==1&&s.today==1);
        tasks.toggle(tasks.ordered().get(0).id);check(BriefingRules.tasks(tasks.ordered(),date).overdue==0);
        check(BriefingRules.greeting(9).startsWith("Good morning"));
        check(BriefingRules.greeting(15).startsWith("Good afternoon"));
        System.out.println("BriefingRules tests passed");
    }
}
