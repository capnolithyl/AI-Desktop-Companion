package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.*;
import android.graphics.drawable.*;
import java.util.*;
import java.util.function.Function;
import org.json.*;

final class HomeFolders {
    private final SharedPreferences prefs;
    private JSONObject data;
    HomeFolders(SharedPreferences prefs){
        this.prefs=prefs;
        try{data=new JSONObject(prefs.getString("foldersV1","{}"));}catch(JSONException e){data=new JSONObject();}
    }
    boolean exists(String id){return data.optJSONObject(id)!=null;}
    String name(String id){JSONObject item=data.optJSONObject(id);return item==null?"Folder":item.optString("name","Folder");}
    List<String> keys(){ArrayList<String> result=new ArrayList<>();Iterator<String> i=data.keys();while(i.hasNext())result.add(i.next());result.sort(Comparator.comparing(this::name,String.CASE_INSENSITIVE_ORDER));return result;}
    List<String> members(String id){
        ArrayList<String> result=new ArrayList<>();JSONObject item=data.optJSONObject(id);JSONArray array=item==null?null:item.optJSONArray("members");
        if(array!=null)for(int i=0;i<array.length();i++){String k=array.optString(i);if(!k.isEmpty()&&!k.startsWith("folder:")&&!result.contains(k))result.add(k);}return result;
    }
    String save(String id,String name,List<String> members){
        if(id==null)id="folder:"+UUID.randomUUID();
        try{JSONObject item=new JSONObject();item.put("name",name.substring(0,Math.min(48,name.length())));item.put("members",new JSONArray(new LinkedHashSet<>(members)));data.put(id,item);persist();}catch(JSONException e){throw new IllegalStateException(e);}
        return id;
    }
    void remove(String id){data.remove(id);persist();}
    private void persist(){prefs.edit().putString("foldersV1",data.toString()).apply();}
    Drawable icon(Context context,String id,Function<String,Drawable> resolve){
        Bitmap b=Bitmap.createBitmap(144,144,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(0xffad7450);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(4);c.drawRoundRect(5,5,139,139,20,20,p);
        List<String> keys=members(id);int i=0;for(String key:keys){if(i==4)break;Drawable d=resolve.apply(key);if(d==null)continue;int x=13+(i%2)*64,y=13+(i/2)*64;Rect old=new Rect(d.getBounds());d.setBounds(x,y,x+54,y+54);d.draw(c);d.setBounds(old);i++;}
        if(i==0){p.setColor(0xffffbf88);p.setStyle(Paint.Style.FILL);p.setTextSize(46);p.setTextAlign(Paint.Align.CENTER);c.drawText("♡",72,88,p);}
        return new BitmapDrawable(context.getResources(),b);
    }
}
