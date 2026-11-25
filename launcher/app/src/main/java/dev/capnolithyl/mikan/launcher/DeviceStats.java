package dev.capnolithyl.mikan.launcher;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Environment;
import android.os.StatFs;
import java.util.Locale;

/** Local snapshot, no permissions, network or continuous monitoring. */
final class DeviceStats {
    static final class Snapshot {
        final long ramTotal,ramAvailable,storageTotal,storageAvailable;
        Snapshot(long rt,long ra,long st,long sa){ramTotal=rt;ramAvailable=ra;storageTotal=st;storageAvailable=sa;}
        private static String gib(long bytes){return String.format(Locale.getDefault(),"%.1f",bytes/1073741824.0);}
        private static String gb(long bytes){return String.format(Locale.getDefault(),"%.0f",bytes/1000000000.0);}
        private static long used(long total,long available){return Math.max(0,total-Math.min(total,Math.max(0,available)));}
        String compact(){
            String ram=ramTotal>0?gib(used(ramTotal,ramAvailable))+"/"+gib(ramTotal)+" GiB":"—";
            String storage=storageTotal>0?gb(used(storageTotal,storageAvailable))+"/"+gb(storageTotal)+" GB":"—";
            return "RAM "+ram+"\nStorage "+storage;
        }
        String details(){
            return (ramTotal>0?"RAM (estimated used)\n"+gib(used(ramTotal,ramAvailable))+" / "+gib(ramTotal)+" GiB\n"+gib(ramAvailable)+" GiB available":"RAM unavailable")+
                "\n\n"+(storageTotal>0?"Internal data storage\n"+gb(used(storageTotal,storageAvailable))+" / "+gb(storageTotal)+" GB\n"+gb(storageAvailable)+" GB available":"Storage unavailable")+
                "\n\nRAM use is total minus Android's available memory estimate, not an app-by-app total. Storage is the usable internal data filesystem, not advertised device capacity. Snapshot updates while Home is visible, at most every 30 seconds.";
        }
    }
    static Snapshot read(Context context){
        long rt=0,ra=0,st=0,sa=0;
        try{
            ActivityManager am=context.getSystemService(ActivityManager.class);
            if(am!=null){ActivityManager.MemoryInfo info=new ActivityManager.MemoryInfo();am.getMemoryInfo(info);rt=info.totalMem;ra=Math.max(0,Math.min(rt,info.availMem));}
        }catch(RuntimeException ignored){}
        try{
            StatFs fs=new StatFs(Environment.getDataDirectory().getAbsolutePath());
            st=fs.getTotalBytes();sa=Math.max(0,Math.min(st,fs.getAvailableBytes()));
        }catch(RuntimeException ignored){}
        return new Snapshot(rt,ra,st,sa);
    }
}
