package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.net.Uri;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Deliberately limited to portable launcher configuration, not private endpoints or artwork. */
final class LauncherBackup {
    private static final int LIMIT=1024*1024;
    private static final Set<String> BOOL=new HashSet<>(Arrays.asList("themed","showFavoritesLabel","floatingDock","pairWidgets","pairTop","pairBottom","weatherF","agendaTitles","badges","showSystemStats","mikanRemarks","mikanNotifyHints","mikanWeatherHints","mikanCalendarHints","mikanExpressions","mikanBatteryHints","mikanHolidayHints","mikanDeliveryHints","mikanWebHints","mixedHome","drawerIndex","briefingNotify","dreamHoliday","dreamBattery","dreamShift","dreamWeather","dreamAlarm"));
    private static final Set<String> PAGES=new HashSet<>(Arrays.asList("clockPage","mikanPage","musicPage","weatherPage","agendaPage","devicePage","tasksPage","briefingPage","contactsPage"));
    private static final String ICON="iconStyle:";
    private static boolean component(String key){return key.length()<=512&&ComponentName.unflattenFromString(key)!=null&&!key.contains("\n")&&!key.contains("\r");}
    private static boolean folder(String key){return key.matches("folder:[0-9a-fA-F-]{36}");}
    private static boolean known(String k){return BOOL.contains(k)||PAGES.contains(k)||Arrays.asList("columns","dockCount","minPages","homeRows","iconSize","sectionOrder","wallpaper","favorites","foldersV1","homeSlotsV1","mixedGridV1","drawerSort","drawerColumns","drawerHiddenV1","drawerCategoriesV1","dreamArtMode","dreamStyle","dreamClockSize","dreamArtworkSize","dreamBackground","dreamBlend","dreamMotion").contains(k);}
    private static int integer(Object value,int min,int max)throws IOException{
        if(!(value instanceof Number))throw new IOException("Expected integer");
        double n=((Number)value).doubleValue();if(n!=Math.rint(n)||n<min||n>max)throw new IOException("Out of range");
        return (int)n;
    }
    private static Object checked(String key,Object v)throws Exception{
        if(BOOL.contains(key)){if(!(v instanceof Boolean))throw new IOException("Expected boolean");return v;}
        if(PAGES.contains(key))return integer(v,0,1000);
        switch(key){
            case "columns":return integer(v,4,5);
            case "dockCount":return integer(v,3,5);
            case "minPages":return integer(v,1,1000);
            case "homeRows":return integer(v,1,4);
            case "sectionOrder":return integer(v,0,2);
            case "iconSize":int size=integer(v,42,58);if(size!=42&&size!=50&&size!=58)throw new IOException("Invalid icon size");return size;
            case "wallpaper":if(!"reading-nook.webp".equals(v)&&!"study-nook.webp".equals(v))throw new IOException("Invalid wallpaper");return v;
            case "dreamArtMode":return integer(v,0,3);
            case "dreamStyle":return integer(v,0,2);
            case "dreamClockSize":return integer(v,0,2);
            case "dreamArtworkSize":return integer(v,0,2);
            case "dreamBackground":return integer(v,0,3);
            case "dreamBlend":return integer(v,0,2);
            case "dreamMotion":return integer(v,0,2);
            case "drawerSort":return integer(v,0,3);
            case "drawerColumns":return integer(v,3,5);
            case "drawerHiddenV1":{
                if(!(v instanceof String))throw new IOException("Invalid hidden apps");Set<String> hidden=DrawerData.keys((String)v);for(String item:hidden)if(!component(item))throw new IOException("Invalid app");return String.join("\n",hidden);
            }
            case "drawerCategoriesV1":{
                if(!(v instanceof String))throw new IOException("Invalid categories");Map<String,String> categories=DrawerData.categories((String)v);for(String item:categories.keySet())if(!component(item))throw new IOException("Invalid app");return DrawerData.encode(categories);
            }
            case "mixedGridV1":{
                if(!(v instanceof String))throw new IOException("Invalid mixed grid");MixedLayout layout=MixedLayout.parse((String)v);
                for(String item:layout.keys())if(!component(item)&&!folder(item)&&!Arrays.asList("widget:clockPage","widget:mikanPage","widget:musicPage","widget:weatherPage","widget:agendaPage","widget:devicePage","widget:tasksPage","widget:briefingPage","widget:contactsPage").contains(item))throw new IOException("Invalid grid item");return layout.encode();
            }
            case "homeSlotsV1":{
                if(!(v instanceof String))throw new IOException("Invalid home slots");HomeSlots slots=HomeSlots.parse((String)v);for(String shortcut:slots.keys())if(!component(shortcut)&&!folder(shortcut))throw new IOException("Invalid shortcut");return slots.encode();
            }
            case "favorites":{
                if(!(v instanceof String)||((String)v).length()>250000)throw new IOException("Invalid favorites");
                LinkedHashSet<String> keys=new LinkedHashSet<>();
                for(String item:((String)v).split("\n")){if(item.isEmpty())continue;if(!component(item)&&!folder(item))throw new IOException("Invalid shortcut");keys.add(item);}
                if(keys.size()>1000)throw new IOException("Too many shortcuts");return String.join("\n",keys);
            }
            case "foldersV1":{
                if(!(v instanceof String))throw new IOException("Invalid folders");
                JSONObject src=new JSONObject((String)v),out=new JSONObject();if(src.length()>200)throw new IOException("Too many folders");
                Iterator<String> keys=src.keys();while(keys.hasNext()){
                    String id=keys.next();if(!folder(id))throw new IOException("Invalid folder ID");
                    JSONObject item=src.getJSONObject(id);String name=item.getString("name");if(name.isEmpty()||name.length()>48)throw new IOException("Invalid folder name");
                    JSONArray members=item.getJSONArray("members");if(members.length()>1000)throw new IOException("Too many apps");
                    LinkedHashSet<String> list=new LinkedHashSet<>();for(int i=0;i<members.length();i++){String member=members.getString(i);if(!component(member))throw new IOException("Invalid app");list.add(member);}
                    out.put(id,new JSONObject().put("name",name).put("members",new JSONArray(list)));
                }return out.toString();
            }
            default:
                if(key.startsWith(ICON)&&component(key.substring(ICON.length()))&&Arrays.asList("default","amber","original").contains(v))return v;
                throw new IOException("Unsupported setting");
        }
    }
    static void write(Context c,SharedPreferences prefs,Uri uri)throws Exception{
        JSONObject settings=new JSONObject();
        for(Map.Entry<String,?> entry:prefs.getAll().entrySet()){
            String k=entry.getKey();Object v=entry.getValue();
            if(!known(k)&&!k.startsWith(ICON))continue;
            if(k.equals("wallpaper")&&"custom".equals(v)||k.startsWith(ICON)&&"custom".equals(v))continue;
            settings.put(k,checked(k,v));
        }
        byte[] bytes=new JSONObject().put("format","mikan-launcher-settings").put("schema",1).put("settings",settings).toString(2).getBytes(StandardCharsets.UTF_8);
        if(bytes.length>LIMIT)throw new IOException("Backup too large");
        try(OutputStream out=c.getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("No output");out.write(bytes);}
    }
    static Map<String,Object> read(Context c,Uri uri)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        try(InputStream in=c.getContentResolver().openInputStream(uri)){
            if(in==null)throw new IOException("No input");byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>LIMIT)throw new IOException("Backup too large");out.write(buffer,0,n);}
        }
        JSONObject root=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
        if(!"mikan-launcher-settings".equals(root.optString("format"))||root.optInt("schema",-1)!=1)throw new IOException("Unknown format");
        JSONObject settings=root.getJSONObject("settings");Map<String,Object> result=new HashMap<>();
        Iterator<String> keys=settings.keys();while(keys.hasNext()){String k=keys.next();result.put(k,checked(k,settings.get(k)));}
        if(!result.containsKey("favorites"))throw new IOException("Missing layout");
        JSONObject folders=new JSONObject((String)result.getOrDefault("foldersV1","{}"));
        for(String key:((String)result.get("favorites")).split("\n"))if(folder(key)&&!folders.has(key))throw new IOException("Missing folder");
        if(result.containsKey("homeSlotsV1")){Set<String> favorites=new HashSet<>(Arrays.asList(((String)result.get("favorites")).split("\\n")));for(String key:HomeSlots.parse((String)result.get("homeSlotsV1")).keys())if(!favorites.contains(key))throw new IOException("Unknown positioned shortcut");}
        return result;
    }
    static boolean apply(SharedPreferences prefs,Map<String,Object> restored){
        SharedPreferences.Editor editor=prefs.edit();
        for(Map.Entry<String,?> entry:prefs.getAll().entrySet()){
            String k=entry.getKey();
            if(known(k)&&!k.equals("wallpaper")||k.startsWith(ICON)&&!"custom".equals(entry.getValue()))editor.remove(k);
        }
        for(Map.Entry<String,Object> e:restored.entrySet()){
            if(e.getKey().startsWith(ICON)&&"custom".equals(prefs.getString(e.getKey(),"default")))continue;
            Object v=e.getValue();if(v instanceof Boolean)editor.putBoolean(e.getKey(),(Boolean)v);else if(v instanceof Integer)editor.putInt(e.getKey(),(Integer)v);else editor.putString(e.getKey(),(String)v);
        }
        return editor.commit();
    }
}
