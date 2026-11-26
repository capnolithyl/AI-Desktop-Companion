package dev.capnolithyl.mikan.launcher;

import android.app.AlarmManager;
import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;
import org.json.JSONObject;

/** Read-only screen saver details. No network, scheduled alarms or new permissions. */
final class DreamDetails {
    static String weather(SharedPreferences prefs,long now){
        if(prefs.getString("weatherCoords","").isEmpty())return "Weather · Set a city on Home";
        int freshness=DreamRules.weatherFreshness(prefs.getLong("weatherAt",0),now);
        if(freshness==0)return "Weather · No recent data";
        try{
            JSONObject data=new JSONObject(prefs.getString("weatherJson",""));
            double c=data.getDouble("temperature");
            if(!Double.isFinite(c)||c < -100||c > 70)return "Weather · Unavailable";
            int code=data.getInt("code");
            String condition=DashboardCards.condition(code);
            return (freshness==2?"Cached · ":"")+DreamRules.temperature(c,prefs.getBoolean("weatherF",true))+" · "+condition;
        }catch(Exception ignored){return "Weather · Unavailable";}
    }
    static String alarm(Context context,long now){
        try{
            AlarmManager manager=context.getSystemService(AlarmManager.class);
            if(manager==null)return "Next alarm · Unavailable";
            AlarmManager.AlarmClockInfo alarm=manager.getNextAlarmClock();
            if(alarm==null||alarm.getTriggerTime()<=now)return "No upcoming alarm";
            long time=alarm.getTriggerTime();
            ZoneId zone=ZoneId.systemDefault();
            LocalDate today=Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
            LocalDate date=Instant.ofEpochMilli(time).atZone(zone).toLocalDate();
            String label=DreamRules.alarmDay(today,date);
            return "Next alarm · "+label+" "+android.text.format.DateFormat.getTimeFormat(context).format(new Date(time));
        }catch(RuntimeException ignored){return "Next alarm · Unavailable";}
    }
}
