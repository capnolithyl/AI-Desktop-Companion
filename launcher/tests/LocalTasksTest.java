package dev.capnolithyl.mikan.launcher;
import java.time.LocalDate;
import java.util.*;
public final class LocalTasksTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        LocalDate today=LocalDate.of(2026,11,25);
        LocalTasks tasks=new LocalTasks();
        check(!tasks.put(null," ",null));
        check(tasks.put(null,"Undated",null));
        check(tasks.put(null,"Today",today));
        check(tasks.put(null,"Yesterday 🐾\ttext\nmore",today.minusDays(1)));
        check(tasks.pending()==3);
        List<LocalTasks.Task> sorted=tasks.ordered();String id=sorted.get(0).id;
        check(LocalTasks.urgency(sorted.get(0),today)==2);
        check(LocalTasks.urgency(sorted.get(1),today)==1);
        check(sorted.get(2).due==null);
        tasks.toggle(id);check(tasks.pending()==2&&tasks.ordered().get(2).done);
        tasks=LocalTasks.parse(tasks.encode());check(tasks.get(id).done&&tasks.get(id).title.contains("\ttext\n"));
        check(tasks.put(id,"Edited",today.plusDays(1))&&tasks.get(id).done);
        tasks.toggle(id);check(LocalTasks.urgency(tasks.get(id),today)==0);
        tasks.remove(id);check(tasks.size()==2);
        check(LocalTasks.parse("garbage\n"+tasks.encode()).size()==2);
        check(!tasks.put("missing","No",null));
        for(int i=tasks.size();i<LocalTasks.LIMIT;i++)check(tasks.put(null,"Task "+i,null));
        check(!tasks.put(null,"Overflow",null)&&LocalTasks.parse(tasks.encode()).size()==LocalTasks.LIMIT);
        System.out.println("LocalTasks tests passed");
    }
}
