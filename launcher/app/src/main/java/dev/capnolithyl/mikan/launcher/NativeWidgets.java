package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Rect;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;
import java.util.*;

/** Device-local Android AppWidget bindings; independent from portable layout backup. */
final class NativeWidgets {
    private static final int HOST_ID=15201, BIND=151, CONFIG=152, LIMIT=12;
    private static final String STORE="nativeWidgetsV1", PENDING="nativeWidgetPending", PAGE="nativeWidgetPendingPage";
    static final class Entry {
        final int id;int page,height;
        Entry(int id,int page,int height){this.id=id;this.page=page;this.height=height;}
    }
    private static final class Host extends AppWidgetHost {
        Host(Activity activity){super(activity,HOST_ID);}
        void detachViews(){clearViews();}
    }
    private final Activity activity;
    private final SharedPreferences prefs;
    private final Runnable changed;
    private final AppWidgetManager manager;
    private final Host host;
    private final LinkedHashMap<Integer,Entry> items=new LinkedHashMap<>();
    private final List<AppWidgetHostView> visible=new ArrayList<>();
    private boolean started,listening;
    private int pending=-1,pendingPage=1;
    NativeWidgets(Activity activity,SharedPreferences prefs,boolean restoring,Runnable changed){
        this.activity=activity;this.prefs=prefs;this.changed=changed;
        manager=AppWidgetManager.getInstance(activity);host=new Host(activity);
        for(String line:prefs.getString(STORE,"").split("\n")){
            try{
                String[] parts=line.split(",");if(parts.length!=3)continue;
                int id=Integer.parseInt(parts[0]),page=Integer.parseInt(parts[1]),height=Integer.parseInt(parts[2]);
                if(id>0&&page>=1&&page<=20&&height>=96&&height<=600&&items.size()<LIMIT)items.put(id,new Entry(id,page,height));
            }catch(RuntimeException ignored){}
        }
        pending=prefs.getInt(PENDING,-1);pendingPage=prefs.getInt(PAGE,1);
        if(pending>0&&(!restoring||items.containsKey(pending))){
            if(!items.containsKey(pending))delete(pending);
            clearPending();
        }
    }
    List<Entry> entries(){return new ArrayList<>(items.values());}
    List<Entry> onPage(int page){List<Entry> result=new ArrayList<>();for(Entry e:items.values())if(e.page==page)result.add(e);return result;}
    int maxPage(){int page=1;for(Entry e:items.values())page=Math.max(page,e.page);return page;}
    private String encoded(){StringBuilder value=new StringBuilder();for(Entry e:items.values()){if(value.length()>0)value.append('\n');value.append(e.id).append(',').append(e.page).append(',').append(e.height);}return value.toString();}
    private void save(){prefs.edit().putString(STORE,encoded()).apply();}
    void move(int id,int page){Entry e=items.get(id);if(e!=null&&page>=1&&page<=20){e.page=page;save();}}
    void resize(int id,int height){Entry e=items.get(id);if(e!=null){e.height=Math.max(96,Math.min(600,height));save();forgetPosition(id);}}
    void removePage(int page){for(Entry e:items.values())if(e.page>page)e.page--;save();}
    void swapPages(int a,int b){if(a>20||b>20)return;for(Entry e:items.values()){if(e.page==a)e.page=b;else if(e.page==b)e.page=a;}save();}
    static String key(Entry entry){return MixedLayout.NATIVE_PREFIX+entry.id;}
    Entry find(String key){if(!MixedLayout.nativeKey(key))return null;try{return items.get(Integer.parseInt(key.substring(MixedLayout.NATIVE_PREFIX.length())));}catch(NumberFormatException ex){return null;}}
    private void forgetPosition(int id){
        try{MixedLayout local=MixedLayout.parse(prefs.getString("nativeMixedGridV1",""));local.forget(MixedLayout.NATIVE_PREFIX+id);prefs.edit().putString("nativeMixedGridV1",local.encodePartition(true)).apply();}catch(RuntimeException ignored){}
    }
    void remove(int id){if(items.remove(id)!=null){save();forgetPosition(id);delete(id);}if(items.isEmpty()&&pending<0)stopListening();}
    MixedLayout.Spec spec(Entry entry,int columns,int widthDp){
        AppWidgetProviderInfo provider=info(entry.id);
        float density=activity.getResources().getDisplayMetrics().density;
        int defaultWidth=provider==null?1:Math.max(1,(int)Math.ceil(provider.minWidth/density));
        int defaultHeight=provider==null?128:Math.max(1,(int)Math.ceil(provider.minHeight/density));
        boolean horizontal=provider!=null&&(provider.resizeMode&AppWidgetProviderInfo.RESIZE_HORIZONTAL)!=0;
        boolean vertical=provider!=null&&(provider.resizeMode&AppWidgetProviderInfo.RESIZE_VERTICAL)!=0;
        int minWidth=horizontal&&provider.minResizeWidth>0?(int)Math.ceil(provider.minResizeWidth/density):defaultWidth;
        int minHeight=vertical&&provider.minResizeHeight>0?(int)Math.ceil(provider.minResizeHeight/density):defaultHeight;
        // Grid rectangles include six dp of spacing. Round up conservatively so
        // the host rectangle meets the provider's declared minimum.
        int minW=Math.max(1,(int)Math.ceil((minWidth+6)*columns/(double)Math.max(1,widthDp)));
        int minH=Math.max(1,(int)Math.ceil((minHeight+6)/44.0));
        int defaultW=Math.max(minW,(int)Math.ceil((defaultWidth+6)*columns/(double)Math.max(1,widthDp)));
        int defaultH=Math.max(minH,(int)Math.ceil((Math.max(entry.height,defaultHeight)+6)/44.0));
        if(!horizontal)minW=defaultW;
        if(!vertical)minH=Math.max(minH,(int)Math.ceil((defaultHeight+6)/44.0));
        int maxW=horizontal?columns:minW,maxH=vertical?12:minH;
        return new MixedLayout.Spec(key(entry),minW,minH,Math.min(columns,defaultW),Math.min(maxH,defaultH),maxW,maxH);
    }
    private void delete(int id){try{host.deleteAppWidgetId(id);}catch(RuntimeException ignored){}}
    private void clearPending(){pending=-1;prefs.edit().remove(PENDING).remove(PAGE).apply();}
    private void cancel(){if(pending>0&&!items.containsKey(pending))delete(pending);clearPending();if(items.isEmpty())stopListening();}
    void start(){started=true;listen();}
    void stop(){started=false;stopListening();}
    private void listen(){if(started&&!listening&&(!items.isEmpty()||pending>0)){try{host.startListening();listening=true;}catch(RuntimeException ignored){}}}
    private void stopListening(){if(listening){try{host.stopListening();}catch(RuntimeException ignored){}listening=false;}}
    void detach(){visible.clear();host.detachViews();}
    private AppWidgetProviderInfo info(int id){try{return manager.getAppWidgetInfo(id);}catch(RuntimeException ignored){return null;}}
    private String label(AppWidgetProviderInfo info){
        try{CharSequence name=info.loadLabel(activity.getPackageManager());if(name!=null&&!name.toString().trim().isEmpty())return name.toString();}catch(RuntimeException ignored){}
        return info.provider.getPackageName();
    }
    String label(Entry entry){AppWidgetProviderInfo info=info(entry.id);return info==null?"Unavailable Android widget":label(info);}
    void pick(int page){
        if(pending>0){new AlertDialog.Builder(activity).setTitle("Widget setup incomplete").setMessage("Cancel the unfinished widget before adding another.").setNegativeButton("Keep",null).setPositiveButton("Cancel setup",(d,w)->{cancel();pick(page);}).show();return;}
        if(items.size()>=LIMIT){toast("Widget limit reached. Remove one first.");return;}
        try{
            List<AppWidgetProviderInfo> providers=new ArrayList<>();
            for(AppWidgetProviderInfo i:manager.getInstalledProviders())if((i.widgetCategory&AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN)!=0)providers.add(i);
            providers.sort(Comparator.comparing((AppWidgetProviderInfo i)->label(i),String.CASE_INSENSITIVE_ORDER));
            if(providers.isEmpty()){toast("No compatible Android widgets found.");return;}
            new WidgetPickerDialog(activity,providers,provider->bind(provider,page)).open();
        }catch(RuntimeException ex){toast("Android widget picker unavailable.");}
    }
    private void bind(AppWidgetProviderInfo provider,int page){
        if(pending>0||items.size()>=LIMIT)return;
        try{
            pending=host.allocateAppWidgetId();pendingPage=Math.max(1,Math.min(20,page));
            if(!prefs.edit().putInt(PENDING,pending).putInt(PAGE,pendingPage).commit())throw new IllegalStateException("Could not save widget setup");
            if(manager.bindAppWidgetIdIfAllowed(pending,provider.provider))configure();
            else {
                Intent intent=new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,pending);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER,provider.provider);
                activity.startActivityForResult(intent,BIND);
            }
        }catch(RuntimeException ex){cancel();toast("Unable to bind this widget.");}
    }
    private void configure(){
        AppWidgetProviderInfo info=info(pending);
        if(info==null){cancel();toast("Widget binding unavailable.");return;}
        if(info.configure!=null){
            try{host.startAppWidgetConfigureActivityForResult(activity,pending,0,CONFIG,null);}
            catch(RuntimeException ex){cancel();toast("Widget configuration unavailable.");}
        }else finish();
    }
    boolean result(int request,int result){
        if(request!=BIND&&request!=CONFIG)return false;
        if(pending<=0)return true;
        if(result!=Activity.RESULT_OK){cancel();toast("Widget setup canceled.");return true;}
        if(request==BIND)configure();else finish();
        return true;
    }
    private void finish(){
        AppWidgetProviderInfo info=info(pending);
        if(info==null||items.size()>=LIMIT){cancel();toast("Widget unavailable.");return;}
        int dp=Math.round(info.minHeight/activity.getResources().getDisplayMetrics().density);
        Entry entry=new Entry(pending,pendingPage,Math.max(128,Math.min(600,dp)));
        items.put(entry.id,entry);
        if(!prefs.edit().putString(STORE,encoded()).remove(PENDING).remove(PAGE).commit()){
            items.remove(entry.id);cancel();toast("Could not save widget.");return;
        }
        pending=-1;listen();toast("Widget added.");changed.run();
    }
    View view(Entry entry){
        AppWidgetProviderInfo info=info(entry.id);
        if(info!=null){
            try{
                AppWidgetHostView view=host.createView(activity,entry.id,info);visible.add(view);
                view.setSaveEnabled(false);
                view.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
                    if(r-l<=0||b-t<=0||(r-l==or-ol&&b-t==ob-ot))return;
                    float density=activity.getResources().getDisplayMetrics().density;
                    int width=Math.round((r-l)/density),height=Math.round((b-t)/density);
                    try{
                        if(android.os.Build.VERSION.SDK_INT>=31)view.updateAppWidgetSize(new Bundle(),Collections.singletonList(new android.util.SizeF(width,height)));
                        else view.updateAppWidgetSize(new Bundle(),width,height,width,height);
                    }catch(RuntimeException ignored){}
                });
                return view;
            }catch(RuntimeException ignored){}
        }
        TextView unavailable=new TextView(activity);unavailable.setText("Android widget unavailable · manage in Settings > Widgets");unavailable.setTextColor(0xffffbf88);unavailable.setGravity(android.view.Gravity.CENTER);return unavailable;
    }
    boolean isTouch(float rawX,float rawY){
        Rect rect=new Rect();for(View v:visible)if(v.isShown()&&v.getGlobalVisibleRect(rect)&&rect.contains((int)rawX,(int)rawY))return true;return false;
    }
    private void toast(String text){Toast.makeText(activity,text,Toast.LENGTH_SHORT).show();}
}
