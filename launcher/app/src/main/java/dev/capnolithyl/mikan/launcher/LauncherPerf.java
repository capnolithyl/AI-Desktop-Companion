package dev.capnolithyl.mikan.launcher;
import android.os.SystemClock;
import java.util.*;
final class LauncherPerf {
    private final Map<String,ArrayDeque<Long>> samples=new LinkedHashMap<>();
    void record(String name,long start){
        ArrayDeque<Long> values=samples.computeIfAbsent(name,k->new ArrayDeque<>());
        if(values.size()>=60)values.removeFirst();values.addLast(Math.max(0,SystemClock.elapsedRealtime()-start));
    }
    void clear(){samples.clear();}
    String report(){
        StringBuilder out=new StringBuilder("v0.12.1 · This process only\nMilliseconds, last 60 samples per category. Pre-draw is an app-side proxy, not actual display or Home-button latency.\n");
        for(Map.Entry<String,ArrayDeque<Long>> e:samples.entrySet()){
            ArrayList<Long> sorted=new ArrayList<>(e.getValue());Collections.sort(sorted);int n=sorted.size();
            if(n==0)continue;
            double median=(sorted.get((n-1)/2)+sorted.get(n/2))/2.0;long p95=sorted.get(Math.max(0,(int)Math.ceil(n*.95)-1)),max=sorted.get(n-1);
            out.append("\n").append(e.getKey()).append("\n").append("n=").append(n).append("  median=").append(median).append("  p95=").append(p95).append("  max=").append(max).append(" ms\n");
        }
        if(samples.isEmpty())out.append("\nNo samples yet. Return Home from several apps or open the drawer.");
        return out.toString();
    }
}
