package dev.capnolithyl.mikan.launcher;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/** Small device-local task list. Due dates are local calendar dates, not alarm timestamps. */
final class LocalTasks {
    static final int LIMIT=100, TITLE_LIMIT=200;
    static final class Task {
        final String id,title;
        final LocalDate due;
        final boolean done;
        Task(String id,String title,LocalDate due,boolean done){this.id=id;this.title=title;this.due=due;this.done=done;}
    }
    private final LinkedHashMap<String,Task> tasks=new LinkedHashMap<>();
    int size(){return tasks.size();}
    int pending(){int n=0;for(Task task:tasks.values())if(!task.done)n++;return n;}
    Task get(String id){return tasks.get(id);}
    static String clean(String title){return title==null?"":title.trim();}
    boolean put(String id,String title,LocalDate due){
        title=clean(title);
        if(title.isEmpty()||title.length()>TITLE_LIMIT)return false;
        Task old=id==null?null:tasks.get(id);
        if(id!=null&&old==null||old==null&&size()>=LIMIT)return false;
        String key=old==null?UUID.randomUUID().toString():old.id;
        tasks.put(key,new Task(key,title,due,old!=null&&old.done));return true;
    }
    void toggle(String id){Task task=get(id);if(task!=null)tasks.put(id,new Task(id,task.title,task.due,!task.done));}
    void remove(String id){tasks.remove(id);}
    List<Task> ordered(){
        List<Task> result=new ArrayList<>(tasks.values());
        result.sort(Comparator.comparing((Task t)->t.done).thenComparing(t->t.due,Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }
    static int urgency(Task task,LocalDate today){
        if(task.done||task.due==null)return 0;
        if(task.due.isBefore(today))return 2;
        return task.due.equals(today)?1:0;
    }
    String encode(){
        StringBuilder out=new StringBuilder();
        for(Task task:tasks.values()){
            if(out.length()>0)out.append('\n');
            out.append(task.id).append('\t').append(task.done?"1":"0").append('\t').append(task.due==null?"":task.due).append('\t')
                .append(Base64.getEncoder().encodeToString(task.title.getBytes(StandardCharsets.UTF_8)));
        }
        return out.toString();
    }
    static LocalTasks parse(String raw){
        LocalTasks result=new LocalTasks();
        if(raw==null||raw.length()>200000)return result;
        for(String line:raw.split("\n")){
            if(result.size()>=LIMIT)break;
            try{
                String[] fields=line.split("\t",-1);
                if(fields.length!=4||!UUID.fromString(fields[0]).toString().equals(fields[0])||(!fields[1].equals("0")&&!fields[1].equals("1"))||result.tasks.containsKey(fields[0]))continue;
                LocalDate due=fields[2].isEmpty()?null:LocalDate.parse(fields[2]);
                String title=clean(new String(Base64.getDecoder().decode(fields[3]),StandardCharsets.UTF_8));
                if(title.isEmpty()||title.length()>TITLE_LIMIT)continue;
                result.tasks.put(fields[0],new Task(fields[0],title,due,fields[1].equals("1")));
            }catch(RuntimeException ignored){}
        }
        return result;
    }
}
