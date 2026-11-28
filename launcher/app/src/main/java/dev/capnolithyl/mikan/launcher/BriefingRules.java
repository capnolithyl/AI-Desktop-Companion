package dev.capnolithyl.mikan.launcher;

import java.time.*;
import java.util.List;

/** Pure local briefing calculations. No notification contents or calendar titles. */
final class BriefingRules {
    static final class Day {
        final long start,end,utcStart,utcEnd;
        Day(LocalDate date,ZoneId zone){
            start=date.atStartOfDay(zone).toInstant().toEpochMilli();
            end=date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
            utcStart=date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            utcEnd=date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
        }
        boolean remaining(long begin,long finish,boolean allDay,long now){
            if(finish<begin)return false;
            if(allDay)return begin<utcEnd&&finish>utcStart;
            return begin<end&&finish>=Math.max(now,start);
        }
    }
    static final class TaskSummary {
        final int open,today,overdue;
        TaskSummary(int open,int today,int overdue){this.open=open;this.today=today;this.overdue=overdue;}
        String label(){
            if(open==0)return "All caught up ♡";
            String text=open+(open==1?" open task":" open tasks");
            if(today>0)text+=" · "+today+" due today";
            if(overdue>0)text+=" · "+overdue+" overdue";
            return text;
        }
    }
    static TaskSummary tasks(List<LocalTasks.Task> tasks,LocalDate day){
        int open=0,today=0,overdue=0;
        for(LocalTasks.Task task:tasks)if(!task.done){
            open++;
            int urgency=LocalTasks.urgency(task,day);
            if(urgency==1)today++;else if(urgency==2)overdue++;
        }
        return new TaskSummary(open,today,overdue);
    }
    static String greeting(int hour){
        if(hour<5||hour>=22)return "Still awake? Time for a cozy little check-in ♡";
        if(hour<12)return "Good morning! Coffee first, then adventures ♡";
        if(hour<18)return "Good afternoon! Let's see how today's going ♡";
        return "Good evening! Time to wind down ♡";
    }
    static String encouragement(TaskSummary tasks){
        if(tasks.overdue>0)return "One little step at a time. No need to do everything at once.";
        if(tasks.today>0)return "Tiny victories count. I'm cheering for you!";
        return "Remember a little water and a cat-sized stretch ♡";
    }
}
