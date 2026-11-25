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
        final MikanExpression expression;
        Remark(String text,Action action,String packageName,String label,MikanExpression expression){this.text=text;this.action=action;this.packageName=packageName;this.label=label;this.expression=expression;}
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
        if(packages.contains(pkg))options.add(new Remark(text,Action.APP,pkg,label,MikanExpression.SURPRISED));
    }
    private static Remark idle(String text,MikanExpression expression){return new Remark(text,Action.NONE,"","",expression);}
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
        if(prefs.getBoolean("mikanCalendarHints",true)&&agenda!=null)options.add(new Remark(agenda,Action.CALENDAR,"","Calendar",MikanExpression.CONCERNED));
        if(prefs.getBoolean("mikanWeatherHints",true)){
            Remark weather=weatherRemark(prefs);if(weather!=null)options.add(weather);
        }
        options.add(idle(hour<7||hour>=22?"Even cats need their beauty sleep!":hour<12?"Coffee first, world domination later.":hour<18?"Don't forget a little stretch and water ♡":"A cozy evening sounds purrfect.",MikanExpression.idle(hour)));
        options.add(idle("Your little pocket companion is on duty ♡",MikanExpression.DEFAULT));
        options.add(idle("Tiny victories deserve a celebration! ♡",MikanExpression.EXCITED));
        options.add(idle("I vote for a tiny coffee break.",MikanExpression.SMUG));
        // Compare stable action identities, not a changing countdown or temperature.
        // Otherwise calendar countdowns can continually reset the rotation.
        List<String> keys=new ArrayList<>();for(Remark option:options)keys.add(option.key());
        long now=SystemClock.elapsedRealtime();
        if(!keys.equals(previous)){previous=keys;index=0;changedAt=now;}
        else if(now-changedAt>=ROTATE_MS){index=(index+1)%options.size();changedAt=now;}
        return options.get(index);
    }
    static String weatherHint(SharedPreferences prefs){Remark remark=weatherRemark(prefs);return remark==null?null:remark.text;}
    private static Remark weatherRemark(SharedPreferences prefs){
        long age=System.currentTimeMillis()-prefs.getLong("weatherAt",0);
        if(age<0||age>=WEATHER_TTL||prefs.getString("weatherCoords","").isEmpty())return null;
        try{
            JSONObject data=new JSONObject(prefs.getString("weatherJson",""));
            int code=data.getInt("code");double c=data.getDouble("temperature");
            if(!Double.isFinite(c))return null;
            boolean f=prefs.getBoolean("weatherF",true);
            String temp=Math.round(f?c*9/5+32:c)+"°"+(f?"F":"C");
            String text=null;
            if(code>=95&&code<=99)text="Thunderstorms in the latest weather update. Cozy indoors?";
            else if((code>=71&&code<=77)||code==85||code==86)text="Snow and "+temp+" outside. Stay warm ♡";
            else if((code>=51&&code<=67)||(code>=80&&code<=82))text="Looks rainy out there. Umbrella time!";
            else if(c<=5)text="Brrr, "+temp+" outside. Bundle up!";
            else if(c>=28)text="It's "+temp+" outside. Remember your water!";
            else if(code<=1&&code>=0)text=(data.optBoolean("day",true)?"Clear skies and ":"A clear night at ")+temp+". Nice!";
            else if(code==2||code==3||code==45||code==48)text="It's "+temp+" out. A good day for something cozy.";
            if(text!=null)return new Remark(text,Action.WEATHER,"","Weather",MikanExpression.weather(code,c));
        }catch(Exception ignored){}
        return null;
    }
}
