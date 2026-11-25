package dev.capnolithyl.mikan.launcher;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Environment;
import android.os.StatFs;
import java.util.Locale;

/** Local snapshot, no permissions, network or continuous monitoring. */
final class DeviceStats {
    static final class Snapshot {
        final long ramTotal,ramAvailable,storageTotal,storageAvailable;
        final int batteryPercent;
        final String batteryState;
        Snapshot(long rt,long ra,long st,long sa,int batteryPercent,String batteryState){ramTotal=rt;ramAvailable=ra;storageTotal=st;storageAvailable=sa;this.batteryPercent=batteryPercent;this.batteryState=batteryState;}
        String batteryLabel(){return batteryPercent<0?"Battery unavailable":"Battery "+batteryPercent+"% · "+batteryState;}
        private static String gib(long bytes){return String.format(Locale.getDefault(),"%.1f",bytes/1073741824.0);}
        private static String gb(long bytes){return String.format(Locale.getDefault(),"%.0f",bytes/1000000000.0);}
        private static long used(long total,long available){return Math.max(0,total-Math.min(total,Math.max(0,available)));}
        String compact(){
            String ram=ramTotal>0?gib(used(ramTotal,ramAvailable))+"/"+gib(ramTotal)+" GiB":"—";
            String storage=storageTotal>0?gb(used(storageTotal,storageAvailable))+"/"+gb(storageTotal)+" GB":"—";
            return "RAM "+ram+"\nStorage "+storage;
        }
        String details(){
            return batteryLabel()+"\n\n"+(ramTotal>0?"RAM (estimated used)\n"+gib(used(ramTotal,ramAvailable))+" / "+gib(ramTotal)+" GiB\n"+gib(ramAvailable)+" GiB available":"RAM unavailable")+
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
        int percent=-1;String state="Unknown";
        try{
            Intent battery=context.registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if(battery!=null){
                int level=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=battery.getIntExtra(BatteryManager.EXTRA_SCALE,-1);
                if(level>=0&&scale>0&&level<=scale)percent=Math.round(level*100f/scale);
                int status=battery.getIntExtra(BatteryManager.EXTRA_STATUS,BatteryManager.BATTERY_STATUS_UNKNOWN);
                boolean plugged=battery.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)!=0;
                if(status==BatteryManager.BATTERY_STATUS_FULL)state="Full";
                else if(status==BatteryManager.BATTERY_STATUS_CHARGING)state="Charging";
                else if(plugged)state="Plugged in";
                else if(status==BatteryManager.BATTERY_STATUS_DISCHARGING||status==BatteryManager.BATTERY_STATUS_NOT_CHARGING)state="On battery";
            }
        }catch(RuntimeException ignored){}
        return new Snapshot(rt,ra,st,sa,percent,state);
    }
}
