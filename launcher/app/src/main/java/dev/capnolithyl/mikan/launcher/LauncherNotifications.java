package dev.capnolithyl.mikan.launcher;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.*;

public final class LauncherNotifications extends NotificationListenerService {
    private static volatile Set<String> packages=Collections.emptySet();
    private static volatile boolean snapshotReady;
    static boolean briefingEnabled(android.content.SharedPreferences prefs){return prefs.getInt("briefingPage",0)>0&&prefs.getBoolean("briefingNotify",true);}
    static boolean ready(){return connected!=null&&snapshotReady;}
    static ComponentName component(Context context){return new ComponentName(context,LauncherNotifications.class);}
    static boolean allowed(Context context){
        try{
            if(Build.VERSION.SDK_INT>=27)return context.getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(component(context));
            String value=Settings.Secure.getString(context.getContentResolver(),"enabled_notification_listeners");
            if(value!=null)for(String part:value.split(":"))if(component(context).equals(ComponentName.unflattenFromString(part)))return true;
        }catch(RuntimeException ignored){}
        return false;
    }
    static boolean has(String pkg){return packages.contains(pkg);}
    static Set<String> snapshot(){return packages;}
    @Override public void onListenerConnected(){connected=this;refresh();}
    @Override public void onListenerDisconnected(){if(connected==this)connected=null;packages=Collections.emptySet();snapshotReady=false;}
    @Override public void onNotificationPosted(StatusBarNotification n){refresh();}
    @Override public void onNotificationRemoved(StatusBarNotification n){refresh();}
    private void refresh(){
        android.content.SharedPreferences prefs=getSharedPreferences("launcher",MODE_PRIVATE);
        if(!prefs.getBoolean("badges",false)&&!MikanRemarks.notificationHintsEnabled(prefs)&&!briefingEnabled(prefs)){packages=Collections.emptySet();snapshotReady=false;return;}
        updateSnapshot();
    }
    // Refresh on demand after enabling dots, including notifications that were already posted.
    private static volatile LauncherNotifications connected;
    @Override public void onCreate(){super.onCreate();}
    @Override public void onDestroy(){if(connected==this)connected=null;packages=Collections.emptySet();snapshotReady=false;super.onDestroy();}
    static void refreshIfConnected(){LauncherNotifications s=connected;if(s!=null)s.refresh();}
    private void updateSnapshot(){
        try{
            Set<String> next=new HashSet<>();StatusBarNotification[] active=getActiveNotifications();
            if(active!=null)for(StatusBarNotification n:active){
                Notification notification=n.getNotification();if(notification==null||n.isOngoing()||(notification.flags&Notification.FLAG_GROUP_SUMMARY)!=0)continue;
                next.add(n.getPackageName());
            }
            packages=Collections.unmodifiableSet(next);snapshotReady=active!=null;
        }catch(RuntimeException ignored){packages=Collections.emptySet();snapshotReady=false;}
    }
}
