package dev.capnolithyl.mikan.launcher;

import android.content.SharedPreferences;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.time.LocalDate;
import org.json.JSONObject;

/** Local, deterministic remarks; never consumes notification content or calls an AI. */
final class MikanRemarks {
    private static final long ROTATE_MS=45000,WEATHER_TTL=30*60*1000L;
    enum Action { NONE, APP, WEATHER, CALENDAR }
    static final class Remark {
        final String text,packageName,label;
        final Action action;
        final MikanExpression expression;
        final String identity,portraitAsset;
        Remark(String text,Action action,String packageName,String label,MikanExpression expression){
            this(text,action,packageName,label,expression,action.name()+":"+packageName);
        }
        Remark(String text,Action action,String packageName,String label,MikanExpression expression,String identity){this(text,action,packageName,label,expression,identity,null);}
        Remark(String text,Action action,String packageName,String label,MikanExpression expression,String identity,String portraitAsset){this.text=text;this.action=action;this.packageName=packageName;this.label=label;this.expression=expression;this.identity=identity;this.portraitAsset=portraitAsset;}
        String key(){return identity;}
        boolean actionable(){return action!=Action.NONE;}
    }
    private final MikanPersonality.Rotation rotation=new MikanPersonality.Rotation();
    static boolean notificationHintsEnabled(SharedPreferences p){
        return p.getBoolean("mikanRemarks",true)&&p.getBoolean("mikanNotifyHints",true)&&p.getInt("mikanPage",1)>0;
    }
    private static void addApp(List<Remark> options,Set<String> packages,String pkg,String label,String text){
        if(packages.contains(pkg))options.add(new Remark(text,Action.APP,pkg,label,MikanExpression.SURPRISED));
    }
    private static Remark local(MikanPersonality.Line line){return new Remark(line.text,Action.NONE,"","",line.expression,line.key,line.portraitAsset);}
    private static void addDelivery(List<Remark> options,Set<String> packages,String pkg,String label){
        if(packages.contains(pkg))options.add(new Remark(label+" has a notification. Want to take a look?",Action.APP,pkg,label,MikanExpression.EXCITED));
    }
    void advance(){rotation.advance();}
    Remark choose(SharedPreferences prefs,Set<String> packages,String agenda,int hour,LocalDate date,MikanPersonality.Line battery,MikanHealth webStatus){
        if(!prefs.getBoolean("mikanRemarks",true)){rotation.reset();return null;}
        List<Remark> options=new ArrayList<>();
        boolean batteryEnabled=prefs.getBoolean("mikanBatteryHints",true)&&battery!=null;
        boolean critical=batteryEnabled&&"battery:critical".equals(battery.key);
        if(critical)options.add(local(battery));
        MikanPersonality.Line holiday=prefs.getBoolean("mikanHolidayHints",true)?MikanPersonality.holiday(date):null;
        if(holiday!=null)options.add(local(holiday));
        if(batteryEnabled&&!critical)options.add(local(battery));
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
            addApp(options,packages,"com.openai.chatgpt","ChatGPT","Psst! ChatGPT has something waiting for you ♡");
            if(prefs.getBoolean("mikanDeliveryHints",true)){
                addDelivery(options,packages,"com.ups.mobile.android","UPS");
                addDelivery(options,packages,"com.fedex.ida.android","FedEx");
                addDelivery(options,packages,"com.aftership.AfterShip","AfterShip");
                addDelivery(options,packages,"com.route.app","Route");
                addDelivery(options,packages,"com.shopify.arrive","Shop");
            }
        }
        if(prefs.getBoolean("mikanCalendarHints",true)&&agenda!=null)options.add(new Remark(agenda,Action.CALENDAR,"","Calendar",MikanExpression.CONCERNED));
        if(prefs.getBoolean("mikanWeatherHints",true)){
            Remark weather=weatherRemark(prefs);if(weather!=null)options.add(weather);
        }
        if(prefs.getBoolean("mikanWebHints",false)&&webStatus!=null){
            options.add(new Remark(webStatus.remark,Action.NONE,"","",webStatus.expression,"health:"+webStatus.name()));
        }
        for(MikanPersonality.Line line:MikanPersonality.idle(hour)){
            if(holiday!=null&&holiday.portraitAsset!=null&&line.expression==MikanExpression.DEFAULT)
                options.add(local(new MikanPersonality.Line(line.key,line.text,line.expression,holiday.portraitAsset)));
            else options.add(local(line));
        }
        List<String> keys=new ArrayList<>();for(Remark option:options)keys.add(option.key());
        return options.get(rotation.select(keys,SystemClock.elapsedRealtime(),ROTATE_MS));
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
