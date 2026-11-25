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
    private List<String> previous=new ArrayList<>();
    private long changedAt;
    private int index;
    static boolean notificationHintsEnabled(SharedPreferences p){
        return p.getBoolean("mikanRemarks",true)&&p.getBoolean("mikanNotifyHints",true)&&p.getInt("mikanPage",1)>0;
    }
    private static boolean any(Set<String> packages,String... names){
        for(String name:names)if(packages.contains(name))return true;return false;
    }
    String choose(SharedPreferences prefs,Set<String> packages,String agenda,int hour){
        if(!prefs.getBoolean("mikanRemarks",true)){previous.clear();index=0;return null;}
        List<String> options=new ArrayList<>();
        if(notificationHintsEnabled(prefs)){
            if(any(packages,"com.whatsapp","com.whatsapp.w4b"))options.add("Psst! WhatsApp has notifications for you ♡");
            if(any(packages,"com.google.android.apps.messaging","com.android.messaging","com.samsung.android.messaging"))options.add("Your Messages app has something waiting!");
            if(any(packages,"com.google.android.gm","com.microsoft.office.outlook","com.samsung.android.email.provider","com.fsck.k9","net.thunderbird.android"))options.add("You've got mail notifications. Inbox adventure?");
            if(any(packages,"org.thoughtcrime.securesms","org.telegram.messenger","com.facebook.orca","com.discord"))options.add("One of your chat apps has notifications ♡");
        }
        if(prefs.getBoolean("mikanCalendarHints",true)&&agenda!=null)options.add(agenda);
        if(prefs.getBoolean("mikanWeatherHints",true)){
            String weather=weatherHint(prefs);if(weather!=null)options.add(weather);
        }
        options.add(hour<5?"Even cats need their beauty sleep!":hour<12?"Coffee first, world domination later.":hour<18?"Don't forget a little stretch and water ♡":"A cozy evening sounds purrfect.");
        options.add("Your little pocket companion is on duty ♡");
        options.add("One task at a time. You've got this!");
        options.add("I vote for a tiny coffee break.");
        long now=SystemClock.elapsedRealtime();
        if(!options.equals(previous)){previous=new ArrayList<>(options);index=0;changedAt=now;}
        else if(now-changedAt>=ROTATE_MS){index=(index+1)%options.size();changedAt=now;}
        return options.get(index);
    }
    private static String weatherHint(SharedPreferences prefs){
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
