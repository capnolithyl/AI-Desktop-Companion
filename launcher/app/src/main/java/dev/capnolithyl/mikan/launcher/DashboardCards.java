package dev.capnolithyl.mikan.launcher;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.CalendarContract;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Foreground-only dashboard data. Calendar never leaves the device. */
final class DashboardCards {
    static final int CALENDAR_REQUEST=81;
    private static final int PEACH=0xffffbf88,CREAM=0xffffe9d5,MUTED=0xffe1bda9;
    private static final long WEATHER_TTL=30*60*1000L, RETRY_DELAY=5*60*1000L;
    private final Activity activity;
    private final SharedPreferences prefs;
    private final Runnable settingsRefresh;
    private final ExecutorService io=Executors.newFixedThreadPool(2);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private boolean resumed,closed,weatherBusy,calendarBusy,cityBusy,weatherFailed;
    private long lastAttempt=-RETRY_DELAY,lastCalendar=-60000;
    private int locationRevision=0;
    private boolean forcePending;
    private LinearLayout weatherRoot,agendaRoot;
    private TextView weatherTemp,weatherCondition,weatherRange,weatherNote;
    private WeatherGlyph weatherGlyph;
    private final Runnable tick=new Runnable(){
        @Override public void run(){if(!resumed||closed)return;refreshWeather(false);refreshCalendar(false);handler.postDelayed(this,60000);}
    };

    DashboardCards(Activity activity,SharedPreferences prefs,Runnable settingsRefresh){this.activity=activity;this.prefs=prefs;this.settingsRefresh=settingsRefresh;}
    void resume(){resumed=true;handler.removeCallbacks(tick);handler.post(tick);}
    void pause(){resumed=false;handler.removeCallbacks(tick);}
    void close(){closed=true;pause();detach();io.shutdownNow();}
    void detach(){weatherRoot=null;agendaRoot=null;weatherTemp=null;weatherCondition=null;weatherRange=null;weatherNote=null;weatherGlyph=null;}
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private TextView label(String value,int size,int color,boolean bold){
        TextView v=new TextView(activity);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);
        if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private LinearLayout vertical(){LinearLayout l=new LinearLayout(activity);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout horizontal(){LinearLayout l=new LinearLayout(activity);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private void gap(LinearLayout l,int n){l.addView(new View(activity),new LinearLayout.LayoutParams(1,dp(n)));}
    private LinearLayout panel(){
        LinearLayout l=vertical();l.setPadding(dp(11),dp(10),dp(11),dp(10));
        GradientDrawable bg=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xf34d342b,0xed302326});
        bg.setCornerRadius(dp(23));bg.setStroke(dp(1),0xff906044);l.setBackground(bg);l.setElevation(dp(2));return l;
    }
    private void toast(String s){if(!closed&&!activity.isFinishing())Toast.makeText(activity,s,Toast.LENGTH_SHORT).show();}
    private boolean canDialog(){return !closed&&resumed&&!activity.isFinishing()&&!activity.isDestroyed();}

    String city(){return prefs.getString("weatherCity","Not set");}
    private String coordinates(){return prefs.getString("weatherCoords","");}
    void toggleUnits(){prefs.edit().putBoolean("weatherF",!prefs.getBoolean("weatherF",true)).apply();renderWeather();}
    View weatherView(){
        weatherRoot=panel();
        LinearLayout row=horizontal();weatherRoot.addView(row);
        weatherGlyph=new WeatherGlyph(activity);row.addView(weatherGlyph,new LinearLayout.LayoutParams(dp(40),dp(43)));
        LinearLayout copy=vertical();copy.setPadding(dp(6),0,0,0);row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        weatherTemp=label("Weather",22,CREAM,true);weatherTemp.setMaxLines(1);weatherTemp.setEllipsize(TextUtils.TruncateAt.END);copy.addView(weatherTemp);
        gap(copy,3);weatherCondition=label("",11,MUTED,false);weatherCondition.setMaxLines(2);copy.addView(weatherCondition);
        gap(weatherRoot,5);weatherRange=label("",11,CREAM,false);weatherRoot.addView(weatherRange);
        gap(weatherRoot,4);weatherNote=label("",10,MUTED,false);weatherNote.setMaxLines(2);weatherNote.setEllipsize(TextUtils.TruncateAt.END);weatherRoot.addView(weatherNote);
        weatherRoot.setOnClickListener(v->{if(coordinates().isEmpty())chooseCity();else weatherOptions();});
        weatherRoot.setFocusable(true);
        renderWeather();if(resumed)refreshWeather(false);return weatherRoot;
    }
    private void weatherOptions(){
        new AlertDialog.Builder(activity).setTitle("Weather · "+city()).setItems(new String[]{"Refresh now","Change city","Switch to "+(prefs.getBoolean("weatherF",true)?"Celsius":"Fahrenheit"),"Clear weather location"},(d,i)->{
            if(i==0)manualWeatherRefresh();else if(i==1)chooseCity();else if(i==2)toggleUnits();else{
                locationRevision++;forcePending=false;weatherFailed=false;lastAttempt=-RETRY_DELAY;
                prefs.edit().remove("weatherCity").remove("weatherCoords").remove("weatherJson").remove("weatherAt").apply();renderWeather();
            }
        }).show();
    }
    void chooseCity(){
        EditText input=new EditText(activity);input.setSingleLine(true);input.setHint("City, state or postal code");input.setText(coordinates().isEmpty()?"":city());
        new AlertDialog.Builder(activity).setTitle("Weather location").setMessage("Search Open-Meteo by city. No GPS or precise location permission. Your search is sent to Open-Meteo.").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Search",(d,w)->{
            String name=input.getText().toString().trim();if(name.length()<2){toast("Enter at least two characters.");return;}searchCity(name);
        }).show();
    }
    private void searchCity(String query){
        if(cityBusy||closed)return;cityBusy=true;toast("Looking up cities…");
        io.execute(()->{
            List<String> names=new ArrayList<>(),coords=new ArrayList<>();
            boolean success=false;
            try{
                JSONObject result=json("https://geocoding-api.open-meteo.com/v1/search?name="+Uri.encode(query)+"&count=8&language=en&format=json");
                JSONArray array=result.optJSONArray("results");
                if(array!=null)for(int i=0;i<array.length();i++){
                    JSONObject item=array.getJSONObject(i);double lat=item.getDouble("latitude"),lon=item.getDouble("longitude");
                    if(!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
                    String name=item.optString("name");if(name.isEmpty())continue;
                    String region=item.optString("admin1"),country=item.optString("country");
                    String display=name+(!region.isEmpty()&&!region.equals(name)?", "+region:"")+(!country.isEmpty()?", "+country:"");
                    names.add(display);coords.add(Double.toString(lat)+","+Double.toString(lon));
                }
                success=true;
            }catch(Exception ignored){}
            final boolean ok=success;
            handler.post(()->{
                cityBusy=false;if(!canDialog())return;
                if(!ok){toast("City lookup unavailable. Try again online.");return;}
                if(names.isEmpty()){toast("No matching cities. Try another spelling.");return;}
                new AlertDialog.Builder(activity).setTitle("Choose your city").setItems(names.toArray(new String[0]),(d,i)->{
                    locationRevision++;lastAttempt=-RETRY_DELAY;weatherFailed=false;
                    prefs.edit().putString("weatherCity",names.get(i)).putString("weatherCoords",coords.get(i)).remove("weatherJson").remove("weatherAt").apply();
                    renderWeather();refreshWeather(true);if(weatherRoot==null)settingsRefresh.run();
                }).setNegativeButton("Cancel",null).show();
            });
        });
    }
    void manualWeatherRefresh(){
        if(coordinates().isEmpty()){chooseCity();return;}
        toast("Refreshing weather…");refreshWeather(true);
    }
    private void refreshWeather(boolean force){
        if(closed||!resumed||coordinates().isEmpty()||(!force&&weatherRoot==null))return;
        if(weatherBusy){if(force)forcePending=true;return;}
        long age=System.currentTimeMillis()-prefs.getLong("weatherAt",0);
        if(!force&&age>=0&&age<WEATHER_TTL&&!prefs.getString("weatherJson","").isEmpty())return;
        long now=SystemClock.elapsedRealtime();
        if(!force&&now-lastAttempt<RETRY_DELAY)return;
        lastAttempt=now;weatherBusy=true;
        String coords=coordinates();int revision=locationRevision;renderWeather();
        io.execute(()->{
            String data=null;
            try{
                String[] parts=coords.split(",");
                JSONObject response=json("https://api.open-meteo.com/v1/forecast?latitude="+Uri.encode(parts[0])+"&longitude="+Uri.encode(parts[1])+"&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1");
                JSONObject current=response.getJSONObject("current"),daily=response.getJSONObject("daily");
                double temperature=current.getDouble("temperature_2m"),high=daily.getJSONArray("temperature_2m_max").getDouble(0),low=daily.getJSONArray("temperature_2m_min").getDouble(0);
                if(!Double.isFinite(temperature)||!Double.isFinite(high)||!Double.isFinite(low))throw new IOException("Invalid weather");
                JSONObject snapshot=new JSONObject();snapshot.put("temperature",temperature);snapshot.put("high",high);snapshot.put("low",low);snapshot.put("code",current.getInt("weather_code"));snapshot.put("day",current.optInt("is_day",1)==1);
                data=snapshot.toString();
            }catch(Exception ignored){}
            final String result=data;
            handler.post(()->{
                weatherBusy=false;if(closed)return;
                if(revision==locationRevision&&coords.equals(coordinates())){
                    weatherFailed=result==null;
                    if(result!=null)prefs.edit().putString("weatherJson",result).putLong("weatherAt",System.currentTimeMillis()).apply();
                    if(force)toast(result==null?"Weather unavailable; cached data kept.":"Weather updated.");
                }
                renderWeather();
                if(forcePending){forcePending=false;refreshWeather(true);}
            });
        });
    }
    private String degrees(double c){boolean f=prefs.getBoolean("weatherF",true);return Math.round(f?c*9/5+32:c)+"°"+(f?"F":"C");}
    private void renderWeather(){
        if(weatherRoot==null)return;
        weatherGlyph.setWeather(2,false);
        weatherRange.setText("");weatherRange.setVisibility(View.GONE);
        if(coordinates().isEmpty()){
            weatherTemp.setText("Weather");weatherTemp.setTextSize(17);weatherCondition.setText("Tap to choose a city");weatherNote.setText("Open-Meteo");return;
        }
        try{
            JSONObject data=new JSONObject(prefs.getString("weatherJson",""));
            int code=data.getInt("code");boolean day=data.optBoolean("day",true);
            weatherGlyph.setWeather(code,day);
            weatherTemp.setTextSize(22);weatherTemp.setText(degrees(data.getDouble("temperature")));
            weatherCondition.setText(condition(code));
            weatherRange.setVisibility(View.VISIBLE);weatherRange.setText("H: "+degrees(data.getDouble("high"))+"  L: "+degrees(data.getDouble("low")));
            long age=System.currentTimeMillis()-prefs.getLong("weatherAt",0);
            String prefix=weatherBusy?"Updating · ":weatherFailed||age<0||age>=WEATHER_TTL?"Cached · ":"";
            weatherNote.setText(prefix+city().split(",")[0]+" · Open-Meteo");
        }catch(Exception e){
            weatherTemp.setTextSize(17);weatherTemp.setText("Weather");weatherCondition.setText(weatherBusy?"Refreshing…":weatherFailed?"Unavailable · tap to retry":"Tap to refresh");weatherNote.setText(city().split(",")[0]+" · Open-Meteo");
        }
    }
    private static String condition(int code){
        if(code==0)return "Clear";if(code==1)return "Mostly clear";if(code==2)return "Partly cloudy";if(code==3)return "Overcast";
        if(code==45||code==48)return "Fog";if(code>=51&&code<=57)return "Drizzle";if(code>=61&&code<=67)return "Rain";
        if(code>=71&&code<=77)return "Snow";if(code>=80&&code<=82)return "Showers";if(code==85||code==86)return "Snow showers";if(code>=95&&code<=99)return "Thunderstorm";return "Conditions unavailable";
    }
    private static JSONObject json(String url)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(7000);c.setReadTimeout(7000);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","MikanLauncher/0.7");
        try{
            if(c.getResponseCode()!=200)throw new IOException("HTTP "+c.getResponseCode());
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>512*1024)throw new IOException("Response too large");out.write(buffer,0,n);}
                return new JSONObject(out.toString("UTF-8"));
            }
        }finally{c.disconnect();}
    }

    private boolean calendarAllowed(){return activity.checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    void requestCalendar(){
        if(calendarAllowed()){new AlertDialog.Builder(activity).setTitle("Calendar access enabled").setMessage("Events are read from calendars visible on this phone, and never sent to Mikan or stored by the launcher. Revoke permission in Android app settings.").setPositiveButton("OK",null).show();return;}
        new AlertDialog.Builder(activity).setTitle("Upcoming events").setMessage("Allow read-only access to your Android calendars to display the next two events on your home screen. No calendar data leaves the phone.").setNegativeButton("Cancel",null).setPositiveButton("Allow",(d,w)->activity.requestPermissions(new String[]{Manifest.permission.READ_CALENDAR},CALENDAR_REQUEST)).show();
    }
    void calendarPermissionChanged(){lastCalendar=-60000;refreshCalendar(true);}
    View agendaView(){
        agendaRoot=panel();agendaRoot.setMinimumHeight(dp(128));agendaRoot.setFocusable(true);agendaRoot.setOnClickListener(v->{if(calendarAllowed())openCalendar();else requestCalendar();});
        renderAgenda(null,calendarAllowed()?"Loading events…":"Tap to enable calendar");
        if(resumed)refreshCalendar(true);return agendaRoot;
    }
    private void openCalendar(){
        try{Uri uri=ContentUris.withAppendedId(CalendarContract.CONTENT_URI.buildUpon().appendPath("time").build(),System.currentTimeMillis());activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}
        catch(Exception e){toast("No calendar app available.");}
    }
    private static final class Event {
        final String title;final long begin,end;final boolean allDay;
        Event(String title,long begin,long end,boolean allDay){this.title=title;this.begin=begin;this.end=end;this.allDay=allDay;}
    }
    private void refreshCalendar(boolean force){
        if(closed||agendaRoot==null||!resumed)return;
        if(!calendarAllowed()){renderAgenda(null,"Tap to enable calendar");return;}
        if(calendarBusy)return;
        long now=SystemClock.elapsedRealtime();if(!force&&now-lastCalendar<60000)return;
        lastCalendar=now;calendarBusy=true;
        io.execute(()->{
            List<Event> events=new ArrayList<>();String error=null;
            long start=System.currentTimeMillis(),end=start+7*24*60*60*1000L;
            try{
                Uri.Builder builder=CalendarContract.Instances.CONTENT_URI.buildUpon();ContentUris.appendId(builder,start-86400000L);ContentUris.appendId(builder,end+86400000L);
                String[] columns={CalendarContract.Instances.TITLE,CalendarContract.Instances.BEGIN,CalendarContract.Instances.END,CalendarContract.Instances.ALL_DAY};
                java.util.Calendar local=java.util.Calendar.getInstance();java.util.Calendar utc=java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC"));utc.clear();utc.set(local.get(java.util.Calendar.YEAR),local.get(java.util.Calendar.MONTH),local.get(java.util.Calendar.DAY_OF_MONTH));long utcToday=utc.getTimeInMillis(),utcEnd=utcToday+8*86400000L;
                try(Cursor c=activity.getContentResolver().query(builder.build(),columns,CalendarContract.Instances.VISIBLE+"=1 AND "+CalendarContract.Instances.STATUS+"!="+CalendarContract.Events.STATUS_CANCELED,null,CalendarContract.Instances.BEGIN+" ASC")){
                    if(c==null)throw new IOException("No calendar provider");
                    while(events.size()<2&&c.moveToNext()){
                        String title=c.getString(0);long begin=c.getLong(1),finish=c.getLong(2);boolean allDay=c.getInt(3)!=0;
                        if(allDay?(finish<=utcToday||begin>=utcEnd):(finish<start||begin>end))continue;
                        events.add(new Event(title==null||title.isEmpty()?"Calendar event":title,begin,finish,allDay));
                    }
                }
            }catch(Exception ignored){error="Calendar unavailable";}
            final String message=error;
            handler.post(()->{calendarBusy=false;if(closed||!resumed||agendaRoot==null)return;if(!calendarAllowed()){renderAgenda(null,"Tap to enable calendar");return;}renderAgenda(events,message);});
        });
    }
    private String eventDate(Event e){
        SimpleDateFormat df=new SimpleDateFormat("EEE, MMM d",Locale.getDefault());if(e.allDay)df.setTimeZone(TimeZone.getTimeZone("UTC"));
        return df.format(new Date(e.begin));
    }
    private void renderAgenda(List<Event> events,String message){
        if(agendaRoot==null)return;agendaRoot.removeAllViews();
        TextView heading=label("Upcoming",15,PEACH,true);agendaRoot.addView(heading);
        gap(agendaRoot,8);View rule=new View(activity);rule.setBackgroundColor(0x447f5740);agendaRoot.addView(rule,new LinearLayout.LayoutParams(-1,dp(1)));gap(agendaRoot,7);
        if(message!=null||events==null||events.isEmpty()){TextView empty=label(message!=null?message:"No events in the next 7 days ♡",12,MUTED,false);agendaRoot.addView(empty);return;}
        for(Event e:events){
            TextView day=label(eventDate(e),10,PEACH,true);agendaRoot.addView(day);gap(agendaRoot,2);
            TextView title=label("•  "+(prefs.getBoolean("agendaTitles",true)?e.title:"Calendar event"),12,CREAM,true);title.setMaxLines(2);title.setEllipsize(TextUtils.TruncateAt.END);agendaRoot.addView(title);
            java.text.DateFormat time=android.text.format.DateFormat.getTimeFormat(activity);
            TextView when=label(e.allDay?"All day":time.format(new Date(e.begin))+" – "+time.format(new Date(e.end)),10,MUTED,false);agendaRoot.addView(when);gap(agendaRoot,7);
        }
    }
    private static final class WeatherGlyph extends View {
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);int code=2;boolean day=false;
        WeatherGlyph(Activity a){super(a);setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);}
        void setWeather(int code,boolean day){this.code=code;this.day=day;invalidate();}
        @Override protected void onDraw(Canvas c){
            super.onDraw(c);float side=Math.min(getWidth(),getHeight());c.save();c.translate((getWidth()-side)/2,(getHeight()-side)/2);c.scale(side/48f,side/48f);paint.setStyle(Paint.Style.FILL);
            if(code<=2){
                paint.setColor(0xffffba71);c.drawCircle(19,17,12,paint);
                if(!day){paint.setColor(0xff4c342e);c.drawCircle(24,13,11,paint);}
                else{paint.setStrokeWidth(2);paint.setStrokeCap(Paint.Cap.ROUND);for(int i=0;i<8;i++){double a=i*Math.PI/4;c.drawLine(19+(float)Math.cos(a)*15,17+(float)Math.sin(a)*15,19+(float)Math.cos(a)*18,17+(float)Math.sin(a)*18,paint);}}
            }
            if(code!=0){paint.setColor(0xffffe9d5);c.drawCircle(17,30,9,paint);c.drawCircle(29,25,11,paint);c.drawCircle(38,32,8,paint);c.drawRoundRect(9,29,46,40,5,5,paint);}
            if(code>=51&&code<=99){paint.setColor(0xffe9a46d);paint.setStrokeWidth(2);paint.setStrokeCap(Paint.Cap.ROUND);for(int x=15;x<=37;x+=11)c.drawLine(x,42,x-2,46,paint);}
            c.restore();
        }
    }
}
