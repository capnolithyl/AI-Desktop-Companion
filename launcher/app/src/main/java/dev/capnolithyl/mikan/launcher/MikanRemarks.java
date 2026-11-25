package dev.capnolithyl.mikan.launcher;

import android.content.SharedPreferences;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/** Local, deterministic remarks; never consumes notification content or calls an AI. */
final class MikanRemarks {
    private static final long ROTATE_MS=45000,WEATHER_TTL=30*60*1000L;
    enum Action { NONE, APP, WEATHER, CALENDAR }
    static final class Remark {
        final String text,packageName,label;
        final Action action;
        Remark(String text,Action action,String packageName,String label){this.text=text;this.action=action;this.packageName=packageName;this.label=label;}
        String key(){return action==Action.NONE?text:action.name()+":"+packageName;}
        boolean actionable(){return action!=Action.NONE;}
    }
    private List<String> previous=new ArrayList<>();
    private long changedAt;
    private int index;
    static boolean notificationHintsEnabled(SharedPreferences p){
        return p.getBoolean("mikanRemarks",true)&&p.getBoolean("mikanNotifyHints",true)&&p.getInt("mikanPage",1)>0;
    }
    private static void addApp(List<Remark> options,Set<String> packages,String pkg,String label,String text){
        if(packages.contains(pkg))options.add(new Remark(text,Action.APP,pkg,label));
    }
    private static Remark idle(String text){return new Remark(text,Action.NONE,"","");}
    void advance(){if(!previous.isEmpty()){index=(index+1)%previous.size();changedAt=SystemClock.elapsedRealtime();}}
    Remark choose(SharedPreferences prefs,Set<String> packages,String agenda,int hour){
        if(!prefs.getBoolean("mikanRemarks",true)){previous.clear();index=0;return null;}
        List<Remark> options=new ArrayList<>();
        if(notificationHintsEnabled(prefs)){
            addApp(options,packages,"com.whatsapp","WhatsApp","Psst! WhatsApp has notifications for you ♡");
            addApp(options,packages,"com.whatsapp.w4b","WhatsApp Business","WhatsApp Business has notifications for you ♡");
            addApp(options,packages,"com.google.android.apps.messaging","Messages","Your Messages app has something waiting!");
            addApp(options,packages,"com.android.messaging","Messages","Your Messages app has something waiting!");
            addApp(options,packages,"com.samsung.android.messaging","Messages","Your Messages app has something waiting!");
            addApp(options,packages,"com.google.android.gm","Gmail","Gmail has mail notifications. Inbox adventure?");
            addApp(options,packages,"com.microsoft.office.outlook","Outlook","Outlook has notifications for you ♡");
            addApp(options,packages,"com.samsung.android.email.provider","Email","You've got email notifications!");
            addApp(options,packages,"com.fsck.k9","K-9 Mail","K-9 Mail has notifications for you!");
            addApp(options,packages,"net.thunderbird.android","Thunderbird","Thunderbird has mail notifications!");
            addApp(options,packages,"org.thoughtcrime.securesms","Signal","Signal has notifications for you ♡");
            addApp(options,packages,"org.telegram.messenger","Telegram","Telegram has notifications for you ♡");
            addApp(options,packages,"com.facebook.orca","Messenger","Messenger has notifications for you ♡");
            addApp(options,packages,"com.discord","Discord","Discord has notifications for you ♡");
        }
        if(prefs.getBoolean("mikanCalendarHints",true)&&agenda!=null)options.add(new Remark(agenda,Action.CALENDAR,"","Calendar"));
        if(prefs.getBoolean("mikanWeatherHints",true)){
            String weather=weatherHint(prefs);if(weather!=null)options.add(new Remark(weather,Action.WEATHER,"","Weather"));
        }
        options.add(idle(hour<5?"Even cats need their beauty sleep!":hour<12?"Coffee first, world domination later.":hour<18?"Don't forget a little stretch and water ♡":"A cozy evening sounds purrfect."));
        options.add(idle("Your little pocket companion is on duty ♡"));
        options.add(idle("One task at a time. You've got this!"));
        options.add(idle("I vote for a tiny coffee break."));
        // Compare stable action identities, not a changing countdown or temperature.
        // Otherwise calendar countdowns can continually reset the rotation.
        List<String> keys=new ArrayList<>();for(Remark option:options)keys.add(option.key());
        long now=SystemClock.elapsedRealtime();
        if(!keys.equals(previous)){previous=keys;index=0;changedAt=now;}
        else if(now-changedAt>=ROTATE_MS){index=(index+1)%options.size();changedAt=now;}
        return options.get(index);
    }
    static String weatherHint(SharedPreferences prefs){
        long age=System.currentTimeMillis()-prefs.getLong("weatherAt",0);
        if(age<0||age>=WEATHER_TTL||prefs.getString("weatherCoords","").isEmpty())return null;
        try{
            JSONObject data=new JSONObject(prefs.getString("weatherJson",""));
            int code=data.getInt("code");double c=data.getDouble("temperature");
            if(!Double.isFinite(c))return null;
            boolean f=prefs.getBoolean("weatherF",true);
            String temp=Math.round(f?c*9/5+32:c)+"°"+(f?"F":"C");
            if(code>=95&&code<=99)return "Thunderstorms in the latest weather update. Cozy indoors?";
            if((code>=71&&code<=77)||code==85||code==86)return "Snow and "+temp+" outside. Stay warm ♡";
            if((code>=51&&code<=67)||(code>=80&&code<=82))return "Looks rainy out there. Umbrella time!";
            if(c<=5)return "Brrr, "+temp+" outside. Bundle up!";
            if(c>=28)return "It's "+temp+" outside. Remember your water!";
            if(code<=1&&code>=0)return (data.optBoolean("day",true)?"Clear skies and ":"A clear night at ")+temp+". Nice!";
            if(code==2||code==3||code==45||code==48)return "It's "+temp+" out. A good day for something cozy.";
        }catch(Exception ignored){}
        return null;
    }
}
