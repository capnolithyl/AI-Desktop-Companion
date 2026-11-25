package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.role.RoleManager;
import android.content.ComponentName;
import android.content.ClipData;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.text.DateFormat;
import java.util.*;

public class HomeActivity extends Activity {
    private static final String POCKET_PACKAGE="dev.capnolithyl.mikan.pocket";
    private static final int CREAM=0xffffe9d5, PEACH=0xffffbf88, MUTED=0xffe1bda9, PANEL=0xe6312325, BORDER=0xff805439;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayList<App> apps=new ArrayList<>();
    private final android.util.LruCache<String,Drawable.ConstantState> monoCache=new android.util.LruCache<>(96);
    private final android.util.LruCache<String,Drawable.ConstantState> originalIcons=new android.util.LruCache<>(96);
    private final android.util.LruCache<String,Drawable.ConstantState> assetCache=new android.util.LruCache<>(4);
    private final Map<String,App> appIndex=new HashMap<>();
    private final java.util.concurrent.ExecutorService catalogWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private final LauncherPerf perf=new LauncherPerf();
    private boolean foreground,closed,catalogDirty,catalogBusy,catalogRenderPending,receiverRegistered;
    private boolean lastMediaPermission,lastCalendarPermission;
    private long entryStart,entryGeneration;
    private String entryKind;
    private final Runnable catalogRefresh=()->refreshCatalog();
    private final Runnable delayedExtras=()->{if(foreground&&!closed)refreshExtras();};
    private final android.content.BroadcastReceiver packagesChanged=new android.content.BroadcastReceiver(){
        @Override public void onReceive(android.content.Context context,Intent intent){invalidateCatalog();}
    };
    private final ArrayList<String> favorites=new ArrayList<>();
    private SharedPreferences prefs;
    private FrameLayout root;
    private LinearLayout page;
    private GridView results;
    private DrawerAdapter drawerAdapter;
    private int drawerOpenCount;
    private DrawerIndexView drawerIndex;
    private TextView drawerLetter,drawerSortButton,drawerCategoryButton;
    private String drawerCategory="";
    private int[] drawerSections=new int[27];
    private TextView clock, date, greeting, systemStats;
    private DeviceStats.Snapshot statsSnapshot;
    private boolean statsBusy;
    private long lastStats=-30000;
    private final Runnable statsRefresh=()->refreshSystemStats();
    private EditText search;
    private QuickSearchDialog<App> quickSearch;
    private boolean drawer=false;
    private boolean settings=false;
    private SettingsHub.Section settingsSection=SettingsHub.Section.HUB;
    private SettingsHub settingsUi;
    private LauncherUpdater updater;
    private PortraitStore portraits,characterArt,wallpaperArt,lockArt;
    private String pendingIconKey;
    private boolean fileBusy;
    private MikanCard mikanCard;
    private final MikanRemarks remarks=new MikanRemarks();
    private DashboardCards dashboard;
    private TextView ampm;
    private boolean compactClock;
    private String checkedWebUrl="",webStatus="";
    private boolean checkingWeb;
    private HomeFolders folders;
    private int homePage=0;
    private boolean editingHome,editingMixed;
    private int mixedScrollY;
    private ScrollView mixedScroll;
    private static final String[] WIDGET_NAMES={"Clock","Mikan","Music","Weather","Upcoming events"};
    private HomeSlots homeSlots;
    private int selectedSlot=-1;
    private static final String[] WIDGET_PAGES={"clockPage","mikanPage","musicPage","weatherPage","agendaPage"};
    private MusicPanel music;
    private final Map<TextView,String> badgeViews=new HashMap<>();
    private final Runnable refreshExtras=new Runnable(){public void run(){refreshExtras();handler.postDelayed(this,2500);}};
    private float touchX,touchY;
    private boolean seekGesture;
    private final Runnable progressTick=new Runnable(){public void run(){if(music!=null)music.updatePosition();handler.postDelayed(this,1000);}};
    private final Runnable tick=new Runnable(){ public void run(){ updateClock(); refreshSystemStats(); handler.postDelayed(this,15000); } };
    private static final class App {
        final ComponentName component; final String label,searchLabel,searchPackage; final ResolveInfo info; final String folderKey;
        App(ComponentName component,String label,ResolveInfo info){this.component=component;this.label=label;this.info=info;this.folderKey=null;this.searchLabel=QuickAppRank.normalize(label);this.searchPackage=QuickAppRank.normalize(component.getPackageName());}
        App(String key,String label){this.component=null;this.label=label;this.info=null;this.folderKey=key;this.searchLabel=QuickAppRank.normalize(label);this.searchPackage="";}
        String key(){return folderKey==null?component.flattenToString():folderKey;}
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        beginEntry("cold/activity create");
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(0);
        prefs=getSharedPreferences("launcher",MODE_PRIVATE);
        updater=new LauncherUpdater(this);
        portraits=new PortraitStore(this);
        characterArt=new PortraitStore(this,"mikan-character-art.webp",new String[]{"portraits/character.webp"});
        wallpaperArt=new PortraitStore(this,"custom-wallpaper.webp",new String[]{},2048);
        lockArt=new PortraitStore(this,"lock-wallpaper.webp",new String[]{},2048);
        if(state!=null){pendingIconKey=state.getString("pendingIconKey");String saved=state.getString("settingsSection");if(saved!=null)try{settingsSection=SettingsHub.Section.valueOf(saved);settings=true;}catch(IllegalArgumentException ignored){}}
        folders=new HomeFolders(prefs);
        dashboard=new DashboardCards(this,prefs,()->{if(settings)showSettings();},()->openWidgetApp("weather"));
        settingsUi=new SettingsHub(this);
        registerPackageChanges();
        long scan=android.os.SystemClock.elapsedRealtime();applyCatalog(scanApps());perf.record("initial app catalog",scan);
        restoreFavorites();
        lastMediaPermission=LauncherNotifications.allowed(this);
        lastCalendarPermission=checkSelfPermission(android.Manifest.permission.READ_CALENDAR)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        if(settings)showSettings();else showHome();
    }
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putString("pendingIconKey",pendingIconKey);if(settings)out.putString("settingsSection",settingsSection.name());}
    @Override protected void onResume(){
        super.onResume();foreground=true;
        if(entryKind==null)beginEntry("warm resume");
        boolean media=LauncherNotifications.allowed(this),calendar=checkSelfPermission(android.Manifest.permission.READ_CALENDAR)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        if(catalogRenderPending){catalogRenderPending=false;refreshScreen();}
        else if(settings&&(media!=lastMediaPermission||calendar!=lastCalendarPermission))showSettings();
        else if(drawer&&search!=null&&drawerSort()>=2)renderResults(search.getText().toString());
        lastMediaPermission=media;lastCalendarPermission=calendar;
        if(media&&(prefs.getBoolean("badges",false)||MikanRemarks.notificationHintsEnabled(prefs)))handler.postDelayed(()->{if(foreground&&!closed)LauncherNotifications.refreshIfConnected();},120);
        updateClock();observeEntry();
        handler.removeCallbacks(tick);handler.postDelayed(tick,15000);
        handler.removeCallbacks(refreshExtras);handler.postDelayed(refreshExtras,2500);
        handler.removeCallbacks(progressTick);handler.postDelayed(progressTick,1000);
        queueExtras();dashboard.resume();queueSystemStats();
        if(catalogDirty)scheduleCatalog();
    }
    @Override protected void onPause(){
        foreground=false;closeQuickSearch();dashboard.pause();handler.removeCallbacks(statsRefresh);handler.removeCallbacks(tick);handler.removeCallbacks(refreshExtras);handler.removeCallbacks(progressTick);handler.removeCallbacks(delayedExtras);handler.removeCallbacks(catalogRefresh);
        entryKind=null;entryGeneration++;super.onPause();
    }
    @Override protected void onDestroy(){
        closed=true;foreground=false;closeQuickSearch();handler.removeCallbacksAndMessages(null);catalogWorker.shutdownNow();
        if(receiverRegistered)unregisterReceiver(packagesChanged);
        if(dashboard!=null)dashboard.close();super.onDestroy();
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);setIntent(intent);
        closeQuickSearch();if(editingHome||editingMixed){editingHome=false;editingMixed=false;mixedScrollY=0;selectedSlot=-1;homePage=0;showHome();}
        beginEntry("Home intent");
        if(drawer||settings||homePage!=0){hideKeyboard();homePage=0;showHome();}
        else updateClock();
        if(foreground){observeEntry();queueExtras();queueSystemStats();}
    }
    @Override public void onTrimMemory(int level){
        super.onTrimMemory(level);
        // UI_HIDDEN is a normal app switch, not a low-memory signal.
        if(level==android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW||level==android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL||level>=android.content.ComponentCallbacks2.TRIM_MEMORY_MODERATE){
            monoCache.evictAll();originalIcons.evictAll();assetCache.evictAll();PortraitStore.clearCache();
        }
    }
    private void beginEntry(String kind){entryGeneration++;entryKind=kind;entryStart=android.os.SystemClock.elapsedRealtime();}
    private void observeEntry(){
        if(root==null||entryKind==null)return;
        final View target=root;final long started=entryStart,generation=entryGeneration;final String kind=entryKind;
        entryKind=null;
        final android.view.ViewTreeObserver observer=target.getViewTreeObserver();
        if(!observer.isAlive())return;
        observer.addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener(){
            @Override public boolean onPreDraw(){
                android.view.ViewTreeObserver current=target.getViewTreeObserver();if(current.isAlive())current.removeOnPreDrawListener(this);
                if(foreground&&!closed&&root==target&&generation==entryGeneration)perf.record(kind+" to pre-draw",started);
                return true;
            }
        });
        target.invalidate();
    }
    private void queueExtras(){
        if(!foreground||closed)return;
        handler.removeCallbacks(delayedExtras);handler.postDelayed(delayedExtras,100);
    }
    private void registerPackageChanges(){
        android.content.IntentFilter filter=new android.content.IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);filter.addAction(Intent.ACTION_PACKAGE_REMOVED);filter.addAction(Intent.ACTION_PACKAGE_CHANGED);filter.addAction(Intent.ACTION_PACKAGE_REPLACED);filter.addDataScheme("package");
        if(Build.VERSION.SDK_INT>=33)registerReceiver(packagesChanged,filter,android.content.Context.RECEIVER_NOT_EXPORTED);else registerReceiver(packagesChanged,filter);
        receiverRegistered=true;
    }
    private void invalidateCatalog(){catalogDirty=true;if(foreground)scheduleCatalog();}
    private void scheduleCatalog(){handler.removeCallbacks(catalogRefresh);handler.postDelayed(catalogRefresh,300);}
    private void refreshCatalog(){
        if(closed||!foreground||!catalogDirty||catalogBusy)return;
        catalogDirty=false;catalogBusy=true;long started=android.os.SystemClock.elapsedRealtime();
        catalogWorker.execute(()->{
            ArrayList<App> next=null;try{next=scanApps();}catch(RuntimeException ignored){}
            final ArrayList<App> result=next;
            handler.post(()->{
                catalogBusy=false;if(closed)return;
                perf.record("package catalog refresh",started);
                if(result!=null){applyCatalog(result);if(foreground)refreshScreen();else catalogRenderPending=true;}
                else {catalogDirty=true;return;}
                if(catalogDirty&&foreground)scheduleCatalog();
            });
        });
    }
    @Override public void onBackPressed(){if(editingMixed){finishMixedEdit();return;}if(editingHome){finishHomeEdit();return;}if(quickSearch!=null){closeQuickSearch();return;}if(settings){backFromSettings();}else if(drawer){hideKeyboard();showHome();}else if(homePage!=0){homePage=0;showHome();}}
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius,boolean border){
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border)d.setStroke(dp(1),BORDER);return d;
    }
    private GradientDrawable panelShape(int radius){
        return MikanTheme.panel(this,radius);
    }
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout horizontal(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private TextView text(String value,int size,int color,boolean bold){
        TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setTypeface(Typeface.create(bold?"sans-serif-medium":"sans-serif",Typeface.NORMAL));return v;
    }
    private void gap(LinearLayout parent,int size){View v=new View(this);parent.addView(v,new LinearLayout.LayoutParams(1,dp(size)));}
    private Drawable asset(String name){
        Drawable.ConstantState cached=assetCache.get(name);if(cached!=null)return cached.newDrawable(getResources());
        try(java.io.InputStream in=getAssets().open(name)){Drawable result=Drawable.createFromStream(in,name);if(result!=null&&result.getConstantState()!=null)assetCache.put(name,result.getConstantState());return result;}catch(Exception e){return null;}
    }
    private Drawable homeWallpaper(){String name=prefs.getString("wallpaper","reading-nook.webp");Drawable d="custom".equals(name)?wallpaperArt.get():asset(name);return d!=null?d:asset("reading-nook.webp");}
    private void createPage(){
        closeQuickSearch();mixedScroll=null;results=null;drawerAdapter=null;drawerIndex=null;drawerLetter=null;drawerSortButton=null;drawerCategoryButton=null;systemStats=null;handler.removeCallbacks(statsRefresh);
        badgeViews.clear();music=null;mikanCard=null;clock=null;date=null;greeting=null;ampm=null;dashboard.detach();
        root=new FrameLayout(this);root.setBackgroundColor(0xff191417);
        ImageView bg=new ImageView(this);bg.setScaleType(ImageView.ScaleType.CENTER_CROP);bg.setImageDrawable(homeWallpaper());
        root.addView(bg,new FrameLayout.LayoutParams(-1,-1));
        View shade=new View(this);shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xb0191417,0x80221a1a,0xe0191417}));
        root.addView(shade,new FrameLayout.LayoutParams(-1,-1));
        page=vertical();page.setPadding(dp(16),dp(10),dp(16),dp(10));
        root.addView(page,new FrameLayout.LayoutParams(-1,-1));
        root.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){
                android.graphics.Insets b=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
                page.setPadding(dp(16)+b.left,dp(10)+b.top,dp(16)+b.right,dp(10)+Math.max(b.bottom,ime.bottom));
            }else{page.setPadding(dp(16)+insets.getSystemWindowInsetLeft(),dp(10)+insets.getSystemWindowInsetTop(),dp(16)+insets.getSystemWindowInsetRight(),dp(10)+insets.getSystemWindowInsetBottom());}
            return insets;
        });
        setContentView(root);root.requestApplyInsets();
    }
    private ArrayList<App> scanApps(){
        ArrayList<App> found=new ArrayList<>();
        Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        android.content.pm.PackageManager pm=getPackageManager();
        for(ResolveInfo info:pm.queryIntentActivities(intent,0)){
            if(info.activityInfo==null||info.activityInfo.packageName.equals(getPackageName()))continue;
            ComponentName component=new ComponentName(info.activityInfo.packageName,info.activityInfo.name);
            CharSequence label=info.loadLabel(pm);
            found.add(new App(component,label==null?component.getPackageName():label.toString(),info));
        }
        found.sort(Comparator.comparing((App a)->a.label,String.CASE_INSENSITIVE_ORDER).thenComparing(App::key));return found;
    }
    private void applyCatalog(ArrayList<App> next){
        apps.clear();apps.addAll(next);appIndex.clear();
        for(App app:apps)appIndex.put(app.key(),app);
        monoCache.evictAll();originalIcons.evictAll();
    }
    private Drawable originalIcon(App app){
        Drawable.ConstantState cached=originalIcons.get(app.key());if(cached!=null)return cached.newDrawable(getResources());
        Drawable icon=null;try{if(app.info!=null)icon=app.info.loadIcon(getPackageManager());}catch(RuntimeException ignored){}
        if(icon==null)icon=getPackageManager().getDefaultActivityIcon();
        if(icon.getConstantState()!=null)originalIcons.put(app.key(),icon.getConstantState());return icon;
    }
    private App find(String key){App app=appIndex.get(key);if(app!=null)return app;if(folders!=null&&folders.exists(key))return new App(key,folders.name(key));return null;}
    private void restoreFavorites(){
        favorites.clear();
        if(prefs.contains("favorites")){
            for(String key:prefs.getString("favorites","").split("\\n"))if(!key.isEmpty()&&!favorites.contains(key))favorites.add(key);
        }else{
            String[] defaults={"com.google.android.dialer","com.google.android.apps.messaging","com.android.chrome","com.google.android.GoogleCamera","dev.capnolithyl.mikan.pocket","com.google.android.gm","com.google.android.apps.photos","com.google.android.apps.maps","com.google.android.youtube","com.android.settings"};
            for(String pkg:defaults)for(App a:apps)if(a.component.getPackageName().equals(pkg)){favorites.add(a.key());break;}
            saveFavorites();
        }
    }
    private void saveFavorites(){
        SharedPreferences.Editor changes=prefs.edit().putString("favorites",String.join("\n",favorites));
        if(prefs.contains("homeSlotsV1")){ensureHomeSlots();changes.putString("homeSlotsV1",homeSlots.encode());}
        changes.apply();
    }
    private void resetSlotOrder(){
        if(!prefs.contains("homeSlotsV1"))return;
        homeSlots=new HomeSlots();ensureHomeSlots();persistSlots();
    }
    private void toggle(App app){
        if(favorites.contains(app.key())){favorites.remove(app.key());Toast.makeText(this,"Unpinned "+app.label,Toast.LENGTH_SHORT).show();}
        else{favorites.add(app.key());Toast.makeText(this,"Pinned "+app.label,Toast.LENGTH_SHORT).show();}
        saveFavorites();
        if(drawer)renderResults(search.getText().toString());else showHome();
    }
    private void launch(App app){
        if(app.folderKey!=null){openFolder(app.folderKey);return;}
        try{hideKeyboard();Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(app.component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(intent);rememberLaunch(app.key());}
        catch(Exception e){Toast.makeText(this,"Unable to open "+app.label,Toast.LENGTH_SHORT).show();invalidateCatalog();}
    }
    private TextView action(String label,Runnable run){
        TextView b=text(label,14,PEACH,true);b.setGravity(Gravity.CENTER);b.setPadding(dp(12),dp(10),dp(12),dp(10));b.setBackground(shape(PANEL,20,true));b.setMinHeight(dp(48));b.setOnClickListener(v->run.run());return b;
    }
    private void showHome(){
        if(editingHome){showHomeEditor();return;}
        boolean mixed=prefs.getBoolean("mixedHome",false);
        long buildStarted=android.os.SystemClock.elapsedRealtime();
        drawer=false;settings=false;search=null;results=null;homePage=Math.max(0,Math.min(homePage,pageCount()-1));createPage();
        LinearLayout header=horizontal();
        TextView brand=text("Mikan OS",15,CREAM,true);
        ImageView mark=new ImageView(this);mark.setImageDrawable(new MikanMark(MikanMark.CAT,PEACH));LinearLayout.LayoutParams markParams=new LinearLayout.LayoutParams(dp(23),dp(23));markParams.rightMargin=dp(7);header.addView(mark,markParams);
        brand.setSingleLine(true);brand.setEllipsize(android.text.TextUtils.TruncateAt.END);
        header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));brand.setOnLongClickListener(v->{openHomeEditor();return true;});
        if(prefs.getBoolean("showSystemStats",true)){
            systemStats=text("",10,MUTED,false);systemStats.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);systemStats.setIncludeFontPadding(false);systemStats.setMaxLines(2);
            systemStats.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));
            systemStats.setPadding(dp(4),0,dp(4),0);systemStats.setFocusable(true);
            systemStats.setOnClickListener(v->showSystemStatsDetails());
            header.addView(systemStats,new LinearLayout.LayoutParams(0,-2,1));
            renderSystemStats();queueSystemStats();
        }
        if(editingMixed)header.addView(action("Done",this::finishMixedEdit));else header.addView(markButton(MikanMark.GEAR,"Launcher settings",this::openSettings),new LinearLayout.LayoutParams(dp(44),dp(44)));page.addView(header);
        if(editingMixed){page.addView(text("Hold a tile to move · hold ↘ to resize · tap for options",12,MUTED,false));gap(page,6);}
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(true);scroll.setScrollbarFadingEnabled(true);
        page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout body=vertical();scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        body.setOnLongClickListener(v->{openHomeEditor();return true;});scroll.setOnLongClickListener(v->{openHomeEditor();return true;});
        gap(body,6);
        if(mixed){mixedScroll=scroll;renderMixedHome(body);if(editingMixed){final int restoreY=mixedScrollY;scroll.post(()->scroll.scrollTo(0,restoreY));}}
        else {
        LinearLayout topWidgets=vertical(),characterBlock=vertical(),appBlock=vertical(),bottomWidgets=vertical();
        boolean showClock=widgetHere("clockPage",1),showWeather=widgetHere("weatherPage",1);
        compactClock=showClock&&showWeather&&canPair()&&prefs.getBoolean("pairTop",true);
        LinearLayout clockBlock=vertical();
        if(showClock){
        LinearLayout timeRow=horizontal();clock=text("",compactClock?40:48,CREAM,false);clock.setTypeface(Typeface.create("sans-serif-light",Typeface.NORMAL));clock.setIncludeFontPadding(false);timeRow.addView(clock);
        ImageView paw=new ImageView(this);paw.setImageDrawable(new MikanMark(MikanMark.PAW,PEACH));LinearLayout.LayoutParams pawParams=new LinearLayout.LayoutParams(dp(23),dp(23));pawParams.leftMargin=dp(8);timeRow.addView(paw,pawParams);clockBlock.addView(timeRow);
        if(compactClock){ampm=text("",11,PEACH,false);ampm.setIncludeFontPadding(false);clockBlock.addView(ampm);}
        gap(clockBlock,3);date=text("",15,MUTED,false);date.setIncludeFontPadding(false);clockBlock.addView(date);widgetLink(clockBlock,"Open clock app",()->openWidgetApp("clock"));}
        if(showClock||showWeather){addWidgetRow(topWidgets,showClock?clockBlock:null,showWeather?dashboard.weatherView():null,compactClock);gap(topWidgets,12);}
        if(widgetHere("mikanPage",1)){
            Drawable art=characterArt.get();
            boolean pocket=pocketAvailable();
            mikanCard=new MikanCard(this,art!=null?art:portraits.get(),art!=null,pocket?"Open Pocket Mikan":"Open Mikan Web",this::openMikan,this::openRemark);
            characterBlock.addView(mikanCard.view());gap(characterBlock,12);
        }
        if(prefs.getBoolean("showFavoritesLabel",false)){appBlock.addView(text("YOUR FAVORITES",12,MUTED,true));gap(appBlock,4);}
        ArrayList<App> pinned=new ArrayList<>();for(String key:favorites){App a=find(key);if(a!=null)pinned.add(a);}
        int dockCount=prefs.getInt("dockCount",5);
        int columns=prefs.getInt("columns",4), perPage=columns*prefs.getInt("homeRows",2);
        int start=Math.min(pinned.size(),dockCount+homePage*perPage),end=Math.min(pinned.size(),start+perPage);
        if(prefs.contains("homeSlotsV1")){ensureHomeSlots();addPositionedApps(appBlock,columns,perPage);}else if(start==end){TextView empty=text("Pin apps from the drawer or create a folder in settings.",14,MUTED,false);empty.setOnLongClickListener(v->{openHomeEditor();return true;});appBlock.addView(empty);}else addGrid(appBlock,pinned.subList(start,end),columns);
        gap(appBlock,10);
        boolean showMusic=widgetHere("musicPage",1),showAgenda=widgetHere("agendaPage",1);
        boolean pair=showMusic&&showAgenda&&canPair()&&prefs.getBoolean("pairBottom",true);
        if(showMusic){music=new MusicPanel(this,pair);widgetLink(music.view(),"Open music app",()->openWidgetApp("music"));}
        if(showMusic||showAgenda){addWidgetRow(bottomWidgets,showMusic?music.view():null,showAgenda?dashboard.agendaView():null,pair);gap(bottomWidgets,10);}
        int order=prefs.getInt("sectionOrder",0);
        LinearLayout[] sections=order==1?new LinearLayout[]{topWidgets,characterBlock,bottomWidgets,appBlock}:order==2?new LinearLayout[]{appBlock,topWidgets,characterBlock,bottomWidgets}:new LinearLayout[]{topWidgets,characterBlock,appBlock,bottomWidgets};
        for(LinearLayout section:sections)if(section.getChildCount()>0)body.addView(section);
        }
        int dockCount=prefs.getInt("dockCount",5);ArrayList<App> pinned=new ArrayList<>();for(String key:favorites){App app=find(key);if(app!=null)pinned.add(app);}
        LinearLayout dock=horizontal();dock.setOnLongClickListener(v->{openHomeEditor();return true;});dock.setPadding(0,dp(3),0,dp(3));if(!prefs.getBoolean("floatingDock",true)){dock.setBackground(panelShape(24));dock.setElevation(dp(2));}
        for(int i=0;i<dockCount;i++){
            App item=prefs.contains("homeSlotsV1")?(i<favorites.size()?find(favorites.get(i)):null):(i<pinned.size()?pinned.get(i):null);
            final int dockSlot=i;
            if(item!=null){View cell=tile(item,false);if(editingMixed){cell.setOnClickListener(v->chooseDockSlot(dockSlot));cell.setOnLongClickListener(v->{chooseDockSlot(dockSlot);return true;});cell.setOnDragListener(null);}dock.addView(cell,new LinearLayout.LayoutParams(0,-2,1));}
            else{View blank=new View(this);if(editingMixed)blank.setOnClickListener(v->chooseDockSlot(dockSlot));blank.setOnLongClickListener(v->{openHomeEditor();return true;});dock.addView(blank,new LinearLayout.LayoutParams(0,dp(56),1));}
        }
        LinearLayout nav=horizontal();nav.setGravity(Gravity.CENTER);int count=pageCount();
        if(count>1){
        if(homePage>0)nav.addView(pageArrow("‹",()->changePage(-1)));
        LinearLayout dots=horizontal();dots.setGravity(Gravity.CENTER);
        if(count>8){TextView counter=text((homePage+1)+" / "+count,13,MUTED,true);counter.setGravity(Gravity.CENTER);dots.addView(counter);}
        else for(int i=0;i<count;i++){final int target=i;View dot=new View(this);dot.setBackground(shape(i==homePage?PEACH:0xff967a69,10,false));LinearLayout.LayoutParams d=new LinearLayout.LayoutParams(dp(i==homePage?9:6),dp(i==homePage?9:6));d.setMargins(dp(4),0,dp(4),0);dots.addView(dot,d);dot.setContentDescription("Page "+(i+1));dot.setOnClickListener(v->{homePage=target;mixedScrollY=0;showHome();});}
        nav.addView(dots,new LinearLayout.LayoutParams(-2,dp(36)));
        if(homePage+1<count)nav.addView(pageArrow("›",()->changePage(1)));
        page.addView(nav);gap(page,4);}
        page.addView(dock);gap(page,7);
        if(editingMixed)page.addView(action("Manage pages & apps",this::openPageManager));else page.addView(searchBar(),new LinearLayout.LayoutParams(-1,dp(50)));
        updateClock();perf.record("home view build",buildStarted);queueExtras();
    }
    private void widgetLink(View view,String label,Runnable action){
        view.setOnClickListener(v->action.run());view.setFocusable(true);
        view.setAccessibilityDelegate(new View.AccessibilityDelegate(){
            @Override public void onInitializeAccessibilityNodeInfo(View host,android.view.accessibility.AccessibilityNodeInfo info){
                super.onInitializeAccessibilityNodeInfo(host,info);
                info.addAction(new android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK,label));
            }
        });
    }
    private String widgetName(String kind){return "music".equals(kind)?"Music":"weather".equals(kind)?"Weather":"Clock";}
    private String[] widgetPackages(String kind){
        if("music".equals(kind))return new String[]{"com.spotify.music"};
        if("weather".equals(kind))return new String[]{"com.google.android.apps.weather","com.sec.android.daemonapp","com.samsung.android.weather"};
        return new String[]{"com.google.android.deskclock","com.android.deskclock","com.sec.android.app.clockpackage"};
    }
    private App widgetTarget(String kind){
        String key=prefs.getString("widgetApp:"+kind,"");
        if(!key.isEmpty()){App selected=appIndex.get(key);if(selected!=null)return selected;return null;}
        for(String pkg:widgetPackages(kind))for(App app:apps)if(app.component.getPackageName().equals(pkg))return app;
        if(!"music".equals(kind))for(App app:apps)if(app.label.equalsIgnoreCase(widgetName(kind)))return app;
        return null;
    }
    private String widgetTargetLabel(String kind){
        App target=widgetTarget(kind);return target!=null?target.label:("music".equals(kind)?"Spotify (choose if unavailable)":"Choose installed app");
    }
    private void openWidgetApp(String kind){
        App app=widgetTarget(kind);
        if(app!=null){launch(app);return;}
        chooseWidgetApp(kind,true);
    }
    private void chooseWidgetApp(String kind,boolean openAfter){
        ArrayList<App> choices=new ArrayList<>(apps);
        if(choices.isEmpty()){Toast.makeText(this,"No launchable apps available.",Toast.LENGTH_SHORT).show();return;}
        String[] labels=new String[choices.size()+1];
        labels[0]="Automatic ("+("music".equals(kind)?"Spotify":widgetName(kind))+")";
        for(int i=0;i<choices.size();i++)labels[i+1]=choices.get(i).label+" · "+choices.get(i).component.getPackageName();
        new AlertDialog.Builder(this).setTitle(widgetName(kind)+" shortcut").setItems(labels,(dialog,index)->{
            if(index==0){prefs.edit().remove("widgetApp:"+kind).apply();if(openAfter){App target=widgetTarget(kind);if(target!=null)launch(target);else Toast.makeText(this,"Default app unavailable. Choose an installed app.",Toast.LENGTH_SHORT).show();}}
            else {App target=choices.get(index-1);prefs.edit().putString("widgetApp:"+kind,target.key()).apply();if(openAfter)launch(target);}
            if(settings)showSettings();
        }).setNegativeButton("Cancel",null).show();
    }
    private ImageView markButton(int kind,String description,Runnable run){
        ImageView v=new ImageView(this);v.setImageDrawable(new MikanMark(kind,PEACH));v.setScaleType(ImageView.ScaleType.FIT_CENTER);v.setPadding(dp(11),dp(11),dp(11),dp(11));v.setContentDescription(description);v.setFocusable(true);v.setBackground(MikanTheme.ripple(this,18));v.setOnClickListener(w->run.run());return v;
    }
    private View searchBar(){
        LinearLayout bar=horizontal();bar.setBackground(MikanTheme.panel(this,26));bar.setPadding(dp(4),0,dp(4),0);
        bar.addView(markButton(MikanMark.SEARCH,"Search installed apps",this::openAppSearch),new LinearLayout.LayoutParams(dp(42),-1));
        TextView hint=text("Find an app...",13,MUTED,false);hint.setGravity(Gravity.CENTER_VERTICAL);hint.setSingleLine(true);hint.setEllipsize(android.text.TextUtils.TruncateAt.END);hint.setOnClickListener(v->openAppSearch());bar.addView(hint,new LinearLayout.LayoutParams(0,-1,1));
        bar.addView(markButton(MikanMark.GLOBE,"Search web",()->webSearchDialog("")),new LinearLayout.LayoutParams(dp(42),-1));
        bar.addView(markButton(MikanMark.MIC,"Voice web search",this::voiceSearch),new LinearLayout.LayoutParams(dp(42),-1));
        return bar;
    }
    private void openAppSearch(){
        if(!foreground||closed||drawer||settings||editingHome||editingMixed||quickSearch!=null)return;
        final long started=android.os.SystemClock.elapsedRealtime();
        final QuickSearchDialog<App> overlay=new QuickSearchDialog<>(this,new QuickSearchDialog.Source<App>(){
            @Override public List<App> matches(String query){return quickMatches(query);}
            @Override public String label(App app){return app.label;}
            @Override public Drawable icon(App app){return themedIcon(app);}
            @Override public void launch(App app){
                App current=appIndex.get(app.key());
                if(current==null){Toast.makeText(HomeActivity.this,"App is no longer available.",Toast.LENGTH_SHORT).show();return;}
                closeQuickSearch();HomeActivity.this.launch(current);
            }
            @Override public void timing(String name,long start){perf.record(name,start);}
        });
        quickSearch=overlay;
        overlay.setOnDismissListener(dialog->{
            if(quickSearch==overlay)quickSearch=null;
            // A package refresh may have arrived while the dialog was open.
            // Refresh Home after dismissal without touching its page or query.
            if(catalogRenderPending&&foreground&&!closed)handler.post(()->{
                if(catalogRenderPending&&foreground&&!closed&&quickSearch==null){catalogRenderPending=false;refreshScreen();}
            });
        });
        overlay.open(started);
    }
    private void closeQuickSearch(){
        QuickSearchDialog<App> overlay=quickSearch;
        quickSearch=null;
        if(overlay!=null)overlay.close();
    }
    private List<App> quickMatches(String query){
        String normalized=QuickAppRank.normalize(query);
        if(normalized.isEmpty()){
            LinkedHashSet<App> choices=new LinkedHashSet<>();
            for(String key:prefs.getString("quickRecentApps","").split("\\n")){
                App app=appIndex.get(key);if(app!=null)choices.add(app);
            }
            for(String key:favorites){App app=appIndex.get(key);if(app!=null)choices.add(app);}
            ArrayList<App> list=new ArrayList<>(choices);return list.subList(0,Math.min(QuickSearchDialog.LIMIT,list.size()));
        }
        ArrayList<App> matches=new ArrayList<>();
        Map<App,Integer> scores=new HashMap<>();
        for(App app:apps){
            int score=QuickAppRank.scoreNormalized(normalized,app.searchLabel,app.searchPackage);
            if(score>=0){matches.add(app);scores.put(app,score);}
        }
        matches.sort(Comparator.comparingInt((App app)->scores.get(app)).thenComparing(app->app.label,String.CASE_INSENSITIVE_ORDER).thenComparing(App::key));
        return matches.subList(0,Math.min(QuickSearchDialog.LIMIT,matches.size()));
    }
    private void rememberLaunch(String key){
        if(!appIndex.containsKey(key))return;
        LinkedHashSet<String> recent=new LinkedHashSet<>();recent.add(key);
        for(String old:prefs.getString("quickRecentApps","").split("\\n")){if(recent.size()>=12)break;if(appIndex.containsKey(old))recent.add(old);}
        LinkedHashMap<String,Integer> counts=DrawerData.counts(prefs.getString("drawerLaunchCountsV1",""));
        counts.keySet().retainAll(appIndex.keySet());
        if(counts.size()<1000||counts.containsKey(key))counts.put(key,Math.min(1000000,counts.getOrDefault(key,0)+1));
        prefs.edit().putString("quickRecentApps",String.join("\n",recent)).putString("drawerLaunchCountsV1",DrawerData.encode(counts)).apply();
    }
    private void rememberPackageLaunch(String pkg){
        for(App app:apps)if(app.component.getPackageName().equals(pkg)){rememberLaunch(app.key());return;}
    }
    private void webSearchDialog(String initial){
        EditText input=new EditText(this);input.setSingleLine(true);input.setHint("Search the web");input.setText(initial);
        new AlertDialog.Builder(this).setTitle("Web search").setMessage("Opens Google in your browser. Your query leaves the phone only when you choose Search.").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Search",(d,w)->{String q=input.getText().toString().trim();if(q.isEmpty())return;try{startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://www.google.com/search?q="+android.net.Uri.encode(q))));}catch(Exception e){Toast.makeText(this,"No browser available.",Toast.LENGTH_SHORT).show();}}).show();
    }
    private void voiceSearch(){
        new AlertDialog.Builder(this).setTitle("Voice search").setMessage("Use your Android speech recognition provider. It may process audio online. Review the recognized query before opening the web search.").setNegativeButton("Cancel",null).setPositiveButton("Speak",(d,w)->{
            Intent i=new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS,1);
            try{startActivityForResult(i,75);}catch(Exception e){Toast.makeText(this,"Speech recognition unavailable.",Toast.LENGTH_SHORT).show();}
        }).show();
    }
    private TextView pageArrow(String label,Runnable r){TextView v=action(label,r);v.setMinHeight(dp(36));v.setPadding(dp(16),dp(4),dp(16),dp(4));return v;}
    private void queueSystemStats(){
        if(!foreground||closed||systemStats==null)return;
        handler.removeCallbacks(statsRefresh);handler.postDelayed(statsRefresh,180);
    }
    private void refreshSystemStats(){
        if(!foreground||closed||systemStats==null||statsBusy)return;
        long now=android.os.SystemClock.elapsedRealtime();
        if(now-lastStats<30000)return;
        statsBusy=true;lastStats=now;
        catalogWorker.execute(()->{
            DeviceStats.Snapshot result=DeviceStats.read(getApplicationContext());
            handler.post(()->{
                statsBusy=false;if(closed)return;statsSnapshot=result;
                if(foreground)renderSystemStats();
            });
        });
    }
    private void renderSystemStats(){
        if(systemStats==null)return;
        String value=statsSnapshot==null?"RAM · —\nStorage · —":statsSnapshot.compact();
        if(!value.contentEquals(systemStats.getText()))systemStats.setText(value);
        systemStats.setContentDescription((statsSnapshot==null?"Device statistics loading":statsSnapshot.details())+". Tap for details.");
    }
    private void showSystemStatsDetails(){
        queueSystemStats();
        new AlertDialog.Builder(this).setTitle("Device statistics")
            .setMessage(statsSnapshot==null?"Collecting device statistics. Check again in a moment.":statsSnapshot.details())
            .setPositiveButton("Close",null).show();
    }
    private void updateClock(){
        if(drawer||settings)return;
        Date now=new Date();if(clock!=null){boolean use24=android.text.format.DateFormat.is24HourFormat(this);clock.setText(compactClock?new java.text.SimpleDateFormat(use24?"HH:mm":"h:mm",Locale.getDefault()).format(now):android.text.format.DateFormat.getTimeFormat(this).format(now));if(ampm!=null){ampm.setText(use24?"":new java.text.SimpleDateFormat("a",Locale.getDefault()).format(now));ampm.setVisibility(use24?View.GONE:View.VISIBLE);}}
        if(date!=null)date.setText(new java.text.SimpleDateFormat("EEE, MMM d",Locale.getDefault()).format(now));
        int hour=Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if(mikanCard!=null)mikanCard.updateGreeting(hour);
    }
    private View tile(App app,boolean label){
        LinearLayout cell=vertical();cell.setGravity(Gravity.CENTER);cell.setPadding(dp(2),dp(3),dp(2),dp(3));
        ImageView icon=new ImageView(this);icon.setImageDrawable(themedIcon(app));icon.setScaleType(ImageView.ScaleType.FIT_CENTER);int inset=dp(prefs.getBoolean("themed",true)?5:7);icon.setPadding(inset,inset,inset,inset);icon.setBackground(MikanTheme.tile(this));icon.setClipToOutline(true);
        FrameLayout iconFrame=new FrameLayout(this);iconFrame.addView(icon,new FrameLayout.LayoutParams(-1,-1));
        TextView dot=text("•",18,PEACH,true);dot.setGravity(Gravity.CENTER);dot.setBackground(shape(0xff50332b,20,false));dot.setVisibility(View.GONE);FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(dp(16),dp(16),Gravity.TOP|Gravity.RIGHT);iconFrame.addView(dot,bp);badgeViews.put(dot,app.key());
        int size=prefs.getInt("iconSize",50);int maxSize=(getResources().getConfiguration().screenWidthDp-48)/Math.max(prefs.getInt("columns",4),prefs.getInt("dockCount",5));size=Math.max(32,Math.min(size,maxSize));cell.addView(iconFrame,new LinearLayout.LayoutParams(dp(size),dp(size)));
        if(label){TextView name=text(app.label,11,CREAM,false);name.setGravity(Gravity.TOP|Gravity.CENTER_HORIZONTAL);name.setIncludeFontPadding(false);name.setMaxLines(2);name.setMinLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(3);cell.addView(name,p); }
        cell.setContentDescription(app.label);cell.setOnClickListener(v->launch(app));cell.setOnLongClickListener(v->{if(!drawer&&favorites.contains(app.key())&&prefs.contains("homeSlotsV1")){openHomeEditor();}else if(!drawer&&favorites.contains(app.key())){ClipData data=ClipData.newPlainText("mikan-favorite",app.key());v.startDragAndDrop(data,new View.DragShadowBuilder(v),app.key(),0);}else appOptions(app);return true;});
        if(!drawer&&!prefs.contains("homeSlotsV1"))cell.setOnDragListener((v,event)->{if(event.getAction()==android.view.DragEvent.ACTION_DRAG_STARTED)return event.getLocalState() instanceof String;
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_ENTERED)v.setAlpha(.55f);
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_EXITED||event.getAction()==android.view.DragEvent.ACTION_DRAG_ENDED)v.setAlpha(1f);
            if(event.getAction()==android.view.DragEvent.ACTION_DROP){String from=(String)event.getLocalState();int target=favorites.indexOf(app.key()),old=favorites.indexOf(from);if(target>=0&&old>=0&&target!=old){App source=find(from);if(app.folderKey!=null&&source!=null&&source.folderKey==null){handler.post(()->dropOnFolder(source,app.folderKey));}else{favorites.remove(old);favorites.add(target,from);saveFavorites();handler.post(this::showHome);}}return true;}return true;});
        return cell;
    }
    private void addGrid(LinearLayout parent,List<App> items,int columns){
        for(int i=0;i<items.size();i+=columns){LinearLayout row=horizontal();row.setGravity(Gravity.TOP);
            for(int j=0;j<columns;j++){View v=i+j<items.size()?tile(items.get(i+j),true):new View(this);row.addView(v,new LinearLayout.LayoutParams(0,-2,1));}parent.addView(row);}
    }
    // Drawer cells are recycled by GridView. Unlike home tiles, they never enter
    // badgeViews: that map is reserved for the small non-recycled Home grid.
    private final class DrawerCell extends LinearLayout {
        final ImageView icon;
        final TextView dot,name;
        App bound;
        DrawerCell(){
            super(HomeActivity.this);setOrientation(VERTICAL);setGravity(Gravity.CENTER);setPadding(dp(2),dp(3),dp(2),dp(3));
            setLayoutParams(new AbsListView.LayoutParams(-1,-2));
            icon=new ImageView(HomeActivity.this);icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            int inset=dp(prefs.getBoolean("themed",true)?5:7);icon.setPadding(inset,inset,inset,inset);icon.setBackground(MikanTheme.tile(HomeActivity.this));icon.setClipToOutline(true);
            FrameLayout frame=new FrameLayout(HomeActivity.this);frame.addView(icon,new FrameLayout.LayoutParams(-1,-1));
            dot=text("•",18,PEACH,true);dot.setGravity(Gravity.CENTER);dot.setBackground(shape(0xff50332b,20,false));dot.setVisibility(View.GONE);
            frame.addView(dot,new FrameLayout.LayoutParams(dp(16),dp(16),Gravity.TOP|Gravity.RIGHT));
            int size=prefs.getInt("iconSize",50),maxSize=(getResources().getConfiguration().screenWidthDp-68)/drawerColumns();
            size=Math.max(32,Math.min(size,maxSize));addView(frame,new LinearLayout.LayoutParams(dp(size),dp(size)));
            name=text("",11,CREAM,false);name.setGravity(Gravity.TOP|Gravity.CENTER_HORIZONTAL);name.setIncludeFontPadding(false);name.setMaxLines(2);name.setMinLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(3);addView(name,lp);
            // Let GridView own item click, long-click, keyboard and accessibility actions.
            setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
        }
        void bind(App app,boolean badges){
            bound=app;icon.setImageDrawable(themedIcon(app));name.setText(app.label);setContentDescription(app.label);updateBadge(badges);
        }
        void updateBadge(boolean enabled){
            int visibility=enabled&&bound!=null&&LauncherNotifications.has(bound.component.getPackageName())?View.VISIBLE:View.GONE;
            if(dot.getVisibility()!=visibility)dot.setVisibility(visibility);
        }
    }
    private final class DrawerAdapter extends BaseAdapter {
        final ArrayList<App> items=new ArrayList<>();
        String query;
        boolean badges;
        void submit(String raw){
            String next=raw.trim().toLowerCase(Locale.ROOT);query=next;items.clear();
            String normalized=QuickAppRank.normalize(raw);Set<String> hidden=hiddenDrawerApps();Map<String,String> categories=drawerCategories();
            for(App app:apps)if(!hidden.contains(app.key())&&(drawerCategory.isEmpty()||drawerCategory.equals(categories.get(app.key())))&&(normalized.isEmpty()||QuickAppRank.scoreNormalized(normalized,app.searchLabel,app.searchPackage)>=0))items.add(app);
            Comparator<App> alphabet=Comparator.comparingInt((App app)->DrawerData.bucket(app.searchLabel)).thenComparing(app->app.searchLabel).thenComparing(App::key);
            int sort=drawerSort();
            if(sort==1)items.sort(alphabet.reversed());
            else if(sort==2){
                HashMap<String,Integer> order=new HashMap<>();int index=0;for(String key:prefs.getString("quickRecentApps","").split("\n"))order.put(key,index++);
                items.sort(Comparator.comparingInt((App app)->order.getOrDefault(app.key(),Integer.MAX_VALUE)).thenComparing(alphabet));
            }else if(sort==3){
                Map<String,Integer> counts=DrawerData.counts(prefs.getString("drawerLaunchCountsV1",""));
                items.sort(Comparator.comparingInt((App app)->counts.getOrDefault(app.key(),0)).reversed().thenComparing(alphabet));
            }else items.sort(alphabet);
            Arrays.fill(drawerSections,-1);for(int i=0;i<items.size();i++){int bucket=DrawerData.bucket(items.get(i).searchLabel);if(drawerSections[bucket]<0)drawerSections[bucket]=i;}
            notifyDataSetChanged();
        }
        @Override public int getCount(){return items.size();}
        @Override public App getItem(int position){return items.get(position);}
        @Override public long getItemId(int position){return position;}
        @Override public View getView(int position,View recycled,android.view.ViewGroup parent){
            long started=android.os.SystemClock.elapsedRealtime();
            DrawerCell cell=recycled instanceof DrawerCell?(DrawerCell)recycled:new DrawerCell();
            cell.bind(getItem(position),badges);
            perf.record("drawer cell bind",started);return cell;
        }
    }
    private int drawerColumns(){return Math.max(3,Math.min(5,prefs.getInt("drawerColumns",prefs.getInt("columns",4))));}
    private int drawerSort(){return Math.max(0,Math.min(3,prefs.getInt("drawerSort",0)));}
    private String drawerSortName(){return new String[]{"A–Z","Z–A","Recent","Frequent"}[drawerSort()];}
    private LinkedHashSet<String> hiddenDrawerApps(){try{return DrawerData.keys(prefs.getString("drawerHiddenV1",""));}catch(RuntimeException e){return new LinkedHashSet<>();}}
    private LinkedHashMap<String,String> drawerCategories(){try{return DrawerData.categories(prefs.getString("drawerCategoriesV1",""));}catch(RuntimeException e){return new LinkedHashMap<>();}}
    private void reloadDrawer(){
        if(!drawer||results==null||search==null)return;
        if(drawerSortButton!=null)drawerSortButton.setText(drawerSortName());
        if(drawerCategoryButton!=null)drawerCategoryButton.setText(drawerCategory.isEmpty()?"All apps":drawerCategory);
        renderResults(search.getText().toString());results.setSelection(0);
    }
    private void updateDrawerIndex(){
        if(drawerIndex==null||results==null||drawerAdapter==null)return;
        boolean visible=drawerSort()<2&&prefs.getBoolean("drawerIndex",true)&&drawerAdapter.query.isEmpty()&&drawerAdapter.getCount()>0;
        drawerIndex.sections(drawerSections);
        drawerIndex.setVisibility(visible?View.VISIBLE:View.GONE);hideDrawerLetter();
        FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)results.getLayoutParams();int margin=visible?dp(28):0;
        if(lp.rightMargin!=margin){lp.rightMargin=margin;results.setLayoutParams(lp);}
    }
    private int jumpDrawerLetter(int requested){
        if(!drawer||results==null)return -1;int actual=DrawerData.nearest(requested,drawerSections);
        if(actual>=0){results.setSelection(drawerSections[actual]);if(drawerLetter!=null){drawerLetter.setText(DrawerData.letter(actual));drawerLetter.setVisibility(View.VISIBLE);}}
        return actual;
    }
    private void hideDrawerLetter(){if(drawerLetter!=null)drawerLetter.setVisibility(View.GONE);}
    private void chooseDrawerLetter(){
        ArrayList<Integer> letters=new ArrayList<>();ArrayList<String> labels=new ArrayList<>();
        for(int i=0;i<27;i++)if(drawerSections[i]>=0){letters.add(i);labels.add(DrawerData.letter(i));}
        if(!labels.isEmpty())new AlertDialog.Builder(this).setTitle("Jump to letter").setItems(labels.toArray(new String[0]),(d,i)->{jumpDrawerLetter(letters.get(i));hideDrawerLetter();}).setNegativeButton("Cancel",null).show();
    }
    private void chooseDrawerSort(){
        new AlertDialog.Builder(this).setTitle("Sort apps").setSingleChoiceItems(new String[]{"Alphabetical A–Z","Alphabetical Z–A","Recently launched in Mikan","Frequently launched in Mikan"},drawerSort(),(d,i)->{prefs.edit().putInt("drawerSort",i).apply();d.dismiss();reloadDrawer();}).setNegativeButton("Cancel",null).show();
    }
    private void chooseDrawerCategory(){
        TreeSet<String> names=new TreeSet<>();names.addAll(drawerCategories().values());
        ArrayList<String> choices=new ArrayList<>();choices.add("All apps");choices.addAll(names);
        new AlertDialog.Builder(this).setTitle("Filter by category").setItems(choices.toArray(new String[0]),(d,i)->{drawerCategory=i==0?"":choices.get(i);reloadDrawer();}).setNegativeButton("Cancel",null).show();
    }
    private void drawerOptions(){
        new AlertDialog.Builder(this).setTitle("App drawer").setItems(new String[]{"Grid density","Alphabet index: "+(prefs.getBoolean("drawerIndex",true)?"On":"Off"),"Manage hidden apps","Manage categories","Clear local launch history"},(d,i)->{
            if(i==0)new AlertDialog.Builder(this).setTitle("Drawer columns").setSingleChoiceItems(new String[]{"3","4","5"},drawerColumns()-3,(dd,c)->{prefs.edit().putInt("drawerColumns",c+3).apply();dd.dismiss();if(results!=null){results.setNumColumns(drawerColumns());results.setAdapter(drawerAdapter);reloadDrawer();}}).setNegativeButton("Cancel",null).show();
            else if(i==1){prefs.edit().putBoolean("drawerIndex",!prefs.getBoolean("drawerIndex",true)).apply();reloadDrawer();}
            else if(i==2)manageDrawerHidden();
            else if(i==3)manageDrawerCategories();
            else new AlertDialog.Builder(this).setTitle("Clear launch history?").setMessage("Reset Mikan's recent and frequent app suggestions. No system usage history is accessed.").setNegativeButton("Cancel",null).setPositiveButton("Clear",(dd,j)->{prefs.edit().remove("quickRecentApps").remove("drawerLaunchCountsV1").apply();reloadDrawer();}).show();
        }).setNegativeButton("Cancel",null).show();
    }
    private void drawerAppOptions(App app){
        new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"App options","Assign category","Hide from drawer"},(d,i)->{
            if(i==0)appOptions(app);
            else if(i==1)assignDrawerCategory(app);
            else new AlertDialog.Builder(this).setTitle("Hide "+app.label+"?").setMessage("Hidden from the app drawer and drawer search. Home shortcuts and quick search stay available.").setNegativeButton("Cancel",null).setPositiveButton("Hide",(dd,j)->{
                LinkedHashSet<String> hidden=hiddenDrawerApps();if(hidden.size()>=1000&&!hidden.contains(app.key()))return;hidden.add(app.key());prefs.edit().putString("drawerHiddenV1",String.join("\n",hidden)).apply();reloadDrawer();
            }).show();
        }).setNegativeButton("Cancel",null).show();
    }
    private void manageDrawerHidden(){
        ArrayList<App> list=new ArrayList<>(apps);LinkedHashSet<String> hidden=hiddenDrawerApps();
        String[] labels=new String[list.size()];boolean[] checked=new boolean[list.size()];
        for(int i=0;i<list.size();i++){labels[i]=list.get(i).label;checked[i]=hidden.contains(list.get(i).key());}
        new AlertDialog.Builder(this).setTitle("Hidden apps").setMultiChoiceItems(labels,checked,(d,i,on)->checked[i]=on).setNegativeButton("Cancel",null).setNeutralButton("Unhide all",(d,i)->{prefs.edit().remove("drawerHiddenV1").apply();reloadDrawer();}).setPositiveButton("Save",(d,j)->{
            for(int i=0;i<list.size();i++){String key=list.get(i).key();if(checked[i])hidden.add(key);else hidden.remove(key);}
            if(hidden.size()>1000){Toast.makeText(this,"Too many hidden apps.",Toast.LENGTH_SHORT).show();return;}
            prefs.edit().putString("drawerHiddenV1",String.join("\n",hidden)).apply();reloadDrawer();
        }).show();
    }
    private void manageDrawerCategories(){
        ArrayList<App> list=new ArrayList<>(apps);Map<String,String> categories=drawerCategories();String[] labels=new String[list.size()];
        for(int i=0;i<list.size();i++){App app=list.get(i);String category=categories.get(app.key());labels[i]=app.label+(category==null?"":" · "+category);}
        new AlertDialog.Builder(this).setTitle("Assign app categories").setItems(labels,(d,i)->assignDrawerCategory(list.get(i))).setNegativeButton("Close",null).show();
    }
    private void assignDrawerCategory(App app){
        LinkedHashMap<String,String> categories=drawerCategories();TreeSet<String> names=new TreeSet<>(categories.values());
        ArrayList<String> options=new ArrayList<>();options.add("No category");options.add("New category…");options.addAll(names);
        new AlertDialog.Builder(this).setTitle(app.label+" · category").setItems(options.toArray(new String[0]),(d,i)->{
            if(i==1){EditText input=new EditText(this);input.setSingleLine(true);input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(40)});input.setHint("e.g. Games");
                new AlertDialog.Builder(this).setTitle("New category").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Save",(dd,j)->{
                    String name=input.getText().toString().trim();if(!DrawerData.validCategory(name)){Toast.makeText(this,"Enter a valid category name.",Toast.LENGTH_SHORT).show();return;}
                    setDrawerCategory(app,name);
                }).show();
            }else setDrawerCategory(app,i==0?"":options.get(i));
        }).setNegativeButton("Cancel",null).show();
    }
    private void setDrawerCategory(App app,String name){
        Map<String,String> categories=drawerCategories();if(name.isEmpty())categories.remove(app.key());
        else{if(categories.size()>=1000&&!categories.containsKey(app.key()))return;categories.put(app.key(),name);}
        prefs.edit().putString("drawerCategoriesV1",DrawerData.encode(categories)).apply();
        if(!drawerCategory.isEmpty()&&!categories.containsValue(drawerCategory))drawerCategory="";
        reloadDrawer();
    }
    private void showDrawer(){
        long started=android.os.SystemClock.elapsedRealtime();boolean first=drawerOpenCount++==0;
        drawer=true;settings=false;drawerCategory="";createPage();
        LinearLayout bar=horizontal();bar.addView(action("‹ Home",()->{hideKeyboard();showHome();}));TextView title=text("  All apps",22,CREAM,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));page.addView(bar);gap(page,12);
        search=new EditText(this);search.setSingleLine(true);search.setTextColor(CREAM);search.setHintTextColor(MUTED);search.setTextSize(16);search.setHint("Search installed apps");search.setPadding(dp(18),dp(10),dp(18),dp(10));search.setBackground(shape(PANEL,20,true));page.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        gap(page,8);
        LinearLayout tools=horizontal();drawerSortButton=action(drawerSortName(),this::chooseDrawerSort);tools.addView(drawerSortButton,new LinearLayout.LayoutParams(0,-2,1));
        drawerCategoryButton=action("All apps",this::chooseDrawerCategory);drawerCategoryButton.setSingleLine(true);drawerCategoryButton.setEllipsize(android.text.TextUtils.TruncateAt.END);tools.addView(drawerCategoryButton,new LinearLayout.LayoutParams(0,-2,1));
        tools.addView(action("⋯",this::drawerOptions),new LinearLayout.LayoutParams(dp(48),-2));page.addView(tools);gap(page,8);
        // Explicitly constrain grid height to the remaining viewport. No ScrollView
        // wrapper: GridView measures/attaches only the cells it needs.
        FrameLayout viewport=new FrameLayout(this);page.addView(viewport,new LinearLayout.LayoutParams(-1,0,1));
        results=new GridView(this);results.setNumColumns(drawerColumns());results.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);results.setGravity(Gravity.CENTER);
        results.setVerticalSpacing(0);results.setHorizontalSpacing(0);results.setClipToPadding(false);results.setVerticalScrollBarEnabled(true);
        results.setSelector(new android.graphics.drawable.ColorDrawable(0x22ffbf88));results.setDrawSelectorOnTop(true);
        viewport.addView(results,new FrameLayout.LayoutParams(-1,-1));
        drawerIndex=new DrawerIndexView(this,this::jumpDrawerLetter,this::hideDrawerLetter,this::chooseDrawerLetter);FrameLayout.LayoutParams ip=new FrameLayout.LayoutParams(dp(28),-1,Gravity.RIGHT);viewport.addView(drawerIndex,ip);
        drawerLetter=text("",44,CREAM,true);drawerLetter.setGravity(Gravity.CENTER);drawerLetter.setBackground(panelShape(22));drawerLetter.setVisibility(View.GONE);viewport.addView(drawerLetter,new FrameLayout.LayoutParams(dp(96),dp(96),Gravity.CENTER));
        TextView empty=text("No matching apps.",16,MUTED,false);empty.setVisibility(View.GONE);viewport.addView(empty,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));results.setEmptyView(empty);
        drawerAdapter=new DrawerAdapter();results.setAdapter(drawerAdapter);
        final GridView grid=results;final DrawerAdapter adapter=drawerAdapter;final EditText field=search;
        grid.setOnItemClickListener((parent,view,position,id)->{if(drawer&&drawerAdapter==adapter&&position<adapter.getCount())launch(adapter.getItem(position));});
        grid.setOnItemLongClickListener((parent,view,position,id)->{if(drawer&&drawerAdapter==adapter&&position<adapter.getCount()){drawerAppOptions(adapter.getItem(position));return true;}return false;});
        field.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){if(drawer&&search==field)renderResults(s.toString());}public void afterTextChanged(Editable s){}});
        page.setFocusableInTouchMode(true);page.requestFocus();renderResults("");
        perf.record("drawer setup",started);
        observeDrawerDraw(grid,started,first?"drawer first open to pre-draw":"drawer repeat open to pre-draw");
    }
    private void observeDrawerDraw(GridView grid,long started,String metric){
        android.view.ViewTreeObserver observer=grid.getViewTreeObserver();if(!observer.isAlive())return;
        observer.addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener(){
            @Override public boolean onPreDraw(){
                android.view.ViewTreeObserver current=grid.getViewTreeObserver();if(current.isAlive())current.removeOnPreDrawListener(this);
                if(foreground&&!closed&&drawer&&results==grid&&grid.isAttachedToWindow())perf.record(metric,started);
                return true;
            }
        });
    }
    private void renderResults(String query){
        if(!drawer||results==null||drawerAdapter==null)return;
        long started=android.os.SystemClock.elapsedRealtime();
        String next=query.trim().toLowerCase(Locale.ROOT);
        boolean changed=drawerAdapter.query!=null&&!next.equals(drawerAdapter.query);
        drawerAdapter.badges=prefs.getBoolean("badges",false)&&LauncherNotifications.allowed(this);
        drawerAdapter.submit(query);
        if(changed)results.setSelection(0);
        updateDrawerIndex();
        perf.record("drawer filter/submit",started);
        queueExtras();
    }
    private void hideKeyboard(){if(search!=null){((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(search.getWindowToken(),0);search.clearFocus();}}

    private void openSettings(){settingsSection=SettingsHub.Section.HUB;showSettings();}
    private void backFromSettings(){
        hideKeyboard();
        if(settingsSection!=SettingsHub.Section.HUB){settingsSection=SettingsHub.Section.HUB;showSettings();}else showHome();
    }
    private void showSettings(){
        editingMixed=false;editingHome=false;
        if(!settings)settingsSection=SettingsHub.Section.HUB;
        drawer=false;settings=true;search=null;results=null;createPage();
        LinearLayout body=settingsUi.render(page,settingsSection,this::backFromSettings,section->{settingsSection=section;showSettings();});
        switch(settingsSection){
            case HUB: break;
            case APPEARANCE:
                settingsUi.wallpapers(body,prefs.getString("wallpaper","reading-nook.webp"),asset("reading-nook.webp"),asset("study-nook.webp"),name->{prefs.edit().putString("wallpaper",name).apply();showSettings();});
                settingsUi.row(body,"Import custom wallpaper","From an image on your phone",()->pickImage(76));
                if(wallpaperArt.get()!=null){settingsUi.artPreview(body,wallpaperArt.get(),"Custom wallpaper");settingsUi.row(body,"Use custom wallpaper",prefs.getString("wallpaper","").equals("custom")?"Selected":"Tap to apply",()->{prefs.edit().putString("wallpaper","custom").apply();showSettings();});}
                settingsUi.heading(body,"APP ICONS");
                settingsUi.choice(body,"Icon style",new String[]{"Amber","Original"},prefs.getBoolean("themed",true)?0:1,i->{prefs.edit().putBoolean("themed",i==0).apply();showSettings();});
                break;
            case LOCK:
                settingsUi.note(body,"Customize the real Android lockscreen wallpaper. Android retains the clock, notifications and secure unlock.");
                settingsUi.row(body,"Choose lockscreen image","Preview locally before applying",()->pickImage(77));
                if(lockArt.get()!=null){settingsUi.artPreview(body,lockArt.get(),"Lockscreen image");setting(body,"Adjust and apply lockscreen image",()->applyLockWallpaper(lockArt.get()));}
                setting(body,"Use current home wallpaper",()->applyLockWallpaper(homeWallpaper()));
                setting(body,"Open Android wallpaper settings",()->{try{startActivity(new Intent(Intent.ACTION_SET_WALLPAPER));}catch(Exception ex){Toast.makeText(this,"Use Android Settings > Wallpaper & style.",Toast.LENGTH_LONG).show();}});
                break;
            case HOME:
                settingsUi.heading(body,"LAYOUT");
                setting(body,"Edit home screen",this::openHomeEditor);
                settingsUi.toggle(body,"Mixed app & widget grid","Optional live grid; turn off to return to sections",prefs.getBoolean("mixedHome",false),on->{if(on)enableMixedLayout();else prefs.edit().putBoolean("mixedHome",false).apply();showSettings();});
                if(prefs.getBoolean("mixedHome",false))setting(body,"Reset mixed grid positions",()->new AlertDialog.Builder(this).setTitle("Reset mixed grid?").setMessage("Repack widgets and apps. Existing favorites and page assignments remain.").setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,i)->{prefs.edit().remove("mixedGridV1").apply();showSettings();}).show());
                settingsUi.toggle(body,"Header system stats","Small RAM and storage indicators",prefs.getBoolean("showSystemStats",true),on->{prefs.edit().putBoolean("showSystemStats",on).apply();showSettings();});
                settingsUi.choice(body,"App grid",new String[]{"4 columns","5 columns"},prefs.getInt("columns",4)-4,i->{prefs.edit().putInt("columns",i+4).apply();showSettings();});
                settingsUi.choice(body,"Rows per home page",new String[]{"1","2","3","4"},prefs.getInt("homeRows",2)-1,i->{prefs.edit().putInt("homeRows",i+1).apply();showSettings();});
                settingsUi.choice(body,"Icon size",new String[]{"Small","Default","Large"},prefs.getInt("iconSize",50)==42?0:prefs.getInt("iconSize",50)==58?2:1,i->{prefs.edit().putInt("iconSize",new int[]{42,50,58}[i]).apply();showSettings();});
                settingsUi.choice(body,"Dock size",new String[]{"3 apps","4 apps","5 apps"},prefs.getInt("dockCount",5)-3,i->{prefs.edit().putInt("dockCount",i+3).apply();showSettings();});
                settingsUi.toggle(body,"Floating dock","Individual icons without a shared background",prefs.getBoolean("floatingDock",true),on->{prefs.edit().putBoolean("floatingDock",on).apply();showSettings();});
                settingsUi.toggle(body,"Favorites heading","Show the label above your pinned apps",prefs.getBoolean("showFavoritesLabel",false),on->{prefs.edit().putBoolean("showFavoritesLabel",on).apply();showSettings();});
                setting(body,"Minimum home pages: "+prefs.getInt("minPages",1),()->chooseNumber("minPages","Minimum home pages",new int[]{1,2,3,4,5}));
                if(prefs.contains("homeSlotsV1"))setting(body,"Reset app positions",()->new AlertDialog.Builder(this).setTitle("Reset app positions?").setMessage("Return to automatically packed apps. Favorites, folders, dock and widgets remain.").setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,i)->{prefs.edit().remove("homeSlotsV1").apply();homeSlots=null;showSettings();}).show());
                settingsUi.heading(body,"SHORTCUTS & FOLDERS");
                setting(body,"Manage favorites",this::manageFavorites);
                setting(body,"Customize app icons",this::chooseIconApp);
                setting(body,"Create app folder",this::createFolder);
                setting(body,"Manage folders",this::manageFolders);
                break;
            case WIDGETS:
                settingsUi.heading(body,"WIDGET PLACEMENT");
                settingsUi.note(body,"Choose a home page for each widget, or hide it completely.");
                widgetSetting(body,"Clock","clockPage",1);widgetSetting(body,"Mikan","mikanPage",1);widgetSetting(body,"Music","musicPage",1);
                widgetSetting(body,"Weather","weatherPage",1);widgetSetting(body,"Upcoming events","agendaPage",1);
                settingsUi.heading(body,"TAP SHORTCUTS");
                for(String kind:new String[]{"music","weather","clock"})settingsUi.row(body,widgetName(kind)+" opens",widgetTargetLabel(kind),()->chooseWidgetApp(kind,false));
                settingsUi.note(body,"Music controls still control playback. Long-press weather for forecast settings.");
                settingsUi.heading(body,"ARRANGEMENT");
                settingsUi.choice(body,"Widget layout",new String[]{"Side by side","Stacked"},prefs.getBoolean("pairWidgets",true)?0:1,i->{prefs.edit().putBoolean("pairWidgets",i==0).apply();showSettings();});
                settingsUi.toggle(body,"Pair clock and weather","When both are on the same page",prefs.getBoolean("pairTop",true),on->{prefs.edit().putBoolean("pairTop",on).apply();showSettings();});
                settingsUi.toggle(body,"Pair music and calendar","When both are on the same page",prefs.getBoolean("pairBottom",true),on->{prefs.edit().putBoolean("pairBottom",on).apply();showSettings();});
                setting(body,"Section order: "+new String[]{"Default","Widgets first","Apps first"}[Math.max(0,Math.min(2,prefs.getInt("sectionOrder",0)))],()->new AlertDialog.Builder(this).setTitle("Home section order").setItems(new String[]{"Default","Widgets first","Apps first"},(d,i)->{prefs.edit().putInt("sectionOrder",i).apply();showSettings();}).show());
                settingsUi.note(body,"Cards stack automatically when screen width or text size requires it.");
                break;
            case WEATHER:
                settingsUi.heading(body,"FORECAST");
                setting(body,"Weather city: "+dashboard.city(),dashboard::chooseCity);
                settingsUi.choice(body,"Temperature units",new String[]{"°F","°C"},prefs.getBoolean("weatherF",true)?0:1,i->{if((i==0)!=prefs.getBoolean("weatherF",true))dashboard.toggleUnits();showSettings();});
                setting(body,"Refresh weather",dashboard::manualWeatherRefresh);
                settingsUi.note(body,"Open-Meteo forecast. No GPS permission; city lookup uses the internet.");
                settingsUi.heading(body,"CALENDAR");
                settingsUi.row(body,"Calendar access",checkSelfPermission(android.Manifest.permission.READ_CALENDAR)==android.content.pm.PackageManager.PERMISSION_GRANTED?"Allowed":"Not granted",dashboard::requestCalendar);
                settingsUi.toggle(body,"Show calendar titles","Hide event names for more privacy",prefs.getBoolean("agendaTitles",true),on->{prefs.edit().putBoolean("agendaTitles",on).apply();showSettings();});
                setting(body,"Calendar diagnostics",dashboard::calendarDiagnostics);
                settingsUi.note(body,"Long-press Upcoming to refresh events or check local calendar availability.");
                break;
            case MIKAN:
                settingsUi.heading(body,"CHARACTER ART");
                Drawable cutout=characterArt.get();settingsUi.artPreview(body,cutout!=null?cutout:portraits.get(),cutout!=null?"Character artwork active":"Portrait active");
                setting(body,"Choose portrait",this::pickPortrait);
                setting(body,"Choose character artwork",()->pickImage(74));
                setting(body,"Remove character artwork",()->new AlertDialog.Builder(this).setTitle("Return to portrait?").setNegativeButton("Cancel",null).setPositiveButton("Remove",(d,w)->{characterArt.reset();showSettings();}).show());
                setting(body,"Reset portrait",()->new AlertDialog.Builder(this).setTitle("Reset portrait?").setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,w)->{portraits.reset();showSettings();}).show());
                settingsUi.note(body,"Use a transparent PNG for character artwork. Images are stored on this phone.");
                settingsUi.heading(body,"LITTLE REMARKS");
                settingsUi.toggle(body,"Dynamic messages","Contextual remarks and playful greetings",prefs.getBoolean("mikanRemarks",true),on->{prefs.edit().putBoolean("mikanRemarks",on).apply();LauncherNotifications.refreshIfConnected();showSettings();});
                settingsUi.toggle(body,"Notification hints","Mention active messaging and email notifications, never their contents",prefs.getBoolean("mikanNotifyHints",true),on->{prefs.edit().putBoolean("mikanNotifyHints",on).apply();LauncherNotifications.refreshIfConnected();if(on&&!LauncherNotifications.allowed(this))notificationAccess();showSettings();});
                settingsUi.toggle(body,"Weather remarks","Use the existing fresh weather snapshot",prefs.getBoolean("mikanWeatherHints",true),on->{prefs.edit().putBoolean("mikanWeatherHints",on).apply();showSettings();});
                settingsUi.toggle(body,"Calendar reminders","Mention an upcoming event without revealing its title",prefs.getBoolean("mikanCalendarHints",true),on->{prefs.edit().putBoolean("mikanCalendarHints",on).apply();showSettings();});
                settingsUi.row(body,"Notification access",LauncherNotifications.allowed(this)?"Allowed":"Not granted",this::notificationAccess);
                settingsUi.note(body,"Remarks rotate while Home is visible. Tap the artwork for Pocket Mikan, the bubble for its indicated app, or an idle bubble for another remark. No AI, additional network calls, message contents or sender names.");
                settingsUi.heading(body,"COMPANION CONNECTION");
                settingsUi.row(body,"Open Pocket Mikan",pocketAvailable()?"App installed":"App unavailable",this::openMikan);
                settingsUi.note(body,"The home card prefers Pocket Mikan. The saved web address is only a fallback; Pocket Mikan manages its own connection.");
                setting(body,"Open Mikan Web in browser",this::openMikanWeb);
                settingsUi.row(body,"Mikan Web address",prefs.getString("mikanWebUrl","").isEmpty()?"Not configured":"Configured",()->editMikanUrl(false));
                setting(body,"Check Mikan Web connection",this::checkMikanWeb);
                if(!webStatus.isEmpty())settingsUi.note(body,"Last check: "+webStatus);
                break;
            case ACCESS:
                settingsUi.heading(body,"NOTIFICATIONS & MEDIA");
                settingsUi.toggle(body,"Notification dots","Show active app and folder notifications",prefs.getBoolean("badges",false),on->{prefs.edit().putBoolean("badges",on).apply();LauncherNotifications.refreshIfConnected();if(on&&!LauncherNotifications.allowed(this))notificationAccess();showSettings();});
                settingsUi.row(body,"Notification / music access",LauncherNotifications.allowed(this)?"Allowed":"Not granted",this::notificationAccess);
                settingsUi.note(body,"Notification access is optional. Music controls, dots and optional Mikan notification hints use local Android data.");
                settingsUi.heading(body,"ANDROID PERMISSIONS");
                settingsUi.row(body,"Calendar access",checkSelfPermission(android.Manifest.permission.READ_CALENDAR)==android.content.pm.PackageManager.PERMISSION_GRANTED?"Allowed":"Not granted",dashboard::requestCalendar);
                setting(body,"Android app settings",()->{try{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName())));}catch(Exception ex){Toast.makeText(this,"Open Android app settings manually.",Toast.LENGTH_SHORT).show();}});
                break;
            case SYSTEM:
                settingsUi.heading(body,"LAUNCHER");
                setting(body,"Default home app",this::chooseHome);
                setting(body,"Check for launcher updates",()->updater.check());
                setting(body,"Performance diagnostics",this::showPerformance);
                settingsUi.note(body,"Updates are optional. Your home screen works offline.");
                settingsUi.heading(body,"BACKUP & RESTORE");
                setting(body,"Export layout and settings",()->backupPicker(true));
                setting(body,"Restore layout and settings",()->backupPicker(false));
                settingsUi.note(body,"Local JSON backup includes layout, folders and appearance choices, not imported artwork, web address, weather location or Android permissions.");
                break;
        }
    }
    private void setting(LinearLayout body,String label,Runnable callback){
        int split=label.indexOf(": ");
        settingsUi.row(body,split<0?label:label.substring(0,split),split<0?"":label.substring(split+2),callback);
    }
    private void chooseNumber(String key,String title,int[] values){String[] labels=new String[values.length];for(int i=0;i<values.length;i++)labels[i]=Integer.toString(values[i]);new AlertDialog.Builder(this).setTitle(title).setItems(labels,(d,i)->{prefs.edit().putInt(key,values[i]).apply();showSettings();}).show();}
    private void manageFavorites(){
        ArrayList<App> items=new ArrayList<>();for(String key:favorites){App a=find(key);if(a!=null)items.add(a);}
        if(items.isEmpty()){Toast.makeText(this,"Pin apps from the drawer first.",Toast.LENGTH_SHORT).show();return;}
        String[] names=new String[items.size()];for(int i=0;i<items.size();i++)names[i]=(i<prefs.getInt("dockCount",5)?"Dock · ":"Home · ")+items.get(i).label;
        new AlertDialog.Builder(this).setTitle("Manage favorites").setItems(names,(d,i)->appOptions(items.get(i))).show();
    }
    private void appOptions(App app){
        if(app.folderKey!=null){folderOptions(app.folderKey);return;}
        boolean pinned=favorites.contains(app.key());
        if(!pinned){new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Pin to favorites","Add to folder","Customize icon"},(d,i)->{if(i==0)toggle(app);else if(i==1)addToFolder(app);else iconOptions(app);}).show();return;}
        new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Unpin","Move to front of dock","Move earlier","Move later","Move to end of home","Move to next page","Move to previous page","Add to folder","Customize icon"},(d,i)->{
            if(i==8){iconOptions(app);return;}
            if(i==7){addToFolder(app);return;}
            if(i==0){favorites.remove(app.key());saveFavorites();}
            else{int old=favorites.indexOf(app.key());int target=i==1?0:i==2?Math.max(0,old-1):i==3?Math.min(favorites.size()-1,old+1):i==5?Math.min(favorites.size()-1,old+prefs.getInt("columns",4)*prefs.getInt("homeRows",2)):i==6?Math.max(prefs.getInt("dockCount",5),old-prefs.getInt("columns",4)*prefs.getInt("homeRows",2)):favorites.size()-1;target=Math.max(0,Math.min(favorites.size()-1,target));favorites.remove(old);favorites.add(target,app.key());saveFavorites();resetSlotOrder();}
            if(settings)showSettings();else if(drawer)renderResults(search.getText().toString());else showHome();
        }).show();
    }
    private Drawable themedIcon(App app){
        if(app.folderKey!=null)return folders.icon(this,app.folderKey,key->{App item=find(key);return item==null?null:themedIcon(item);});
        String style=prefs.getString("iconStyle:"+app.key(),"default");
        if("custom".equals(style)){Drawable custom=iconStore(app.key()).get();if(custom!=null)return custom;}
        if("original".equals(style)||(!"amber".equals(style)&&!prefs.getBoolean("themed",true)))return originalIcon(app);
        if(app.component.getPackageName().equals("dev.capnolithyl.mikan.pocket"))return new MikanMark(MikanMark.PAW,PEACH);
        Drawable.ConstantState cached=monoCache.get(app.key());if(cached!=null)return cached.newDrawable(getResources());
        String pkg=app.component.getPackageName();Drawable original=originalIcon(app),result=null;
        if(!LauncherIcons.hasCustom(pkg)&&Build.VERSION.SDK_INT>=33&&original instanceof AdaptiveIconDrawable){
            Drawable mono=((AdaptiveIconDrawable)original).getMonochrome();
            if(mono!=null)result=LauncherIcons.normalizedMonochrome(this,mono,PEACH);
        }
        if(result==null)result=LauncherIcons.create(this,pkg,app.label,original);
        if(result.getConstantState()!=null)monoCache.put(app.key(),result.getConstantState());return result;
    }
    private boolean canPair(){return prefs.getBoolean("pairWidgets",true)&&getResources().getConfiguration().screenWidthDp>=350&&getResources().getConfiguration().fontScale<=1.2f;}
    private void addWidgetRow(LinearLayout body,View left,View right,boolean pair){
        if(left==null&&right==null)return;
        if(pair&&left!=null&&right!=null){LinearLayout row=horizontal();row.setGravity(Gravity.CENTER_VERTICAL);row.setBaselineAligned(false);boolean equal=music!=null&&left==music.view();int height=equal?-1:-2;row.addView(left,new LinearLayout.LayoutParams(0,height,1));LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(0,height,1);rp.leftMargin=dp(8);row.addView(right,rp);body.addView(row,new LinearLayout.LayoutParams(-1,-2));}
        else{if(left!=null)body.addView(left,new LinearLayout.LayoutParams(-1,-2));if(left!=null&&right!=null)gap(body,8);if(right!=null)body.addView(right,new LinearLayout.LayoutParams(-1,-2));}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==DashboardCards.CALENDAR_REQUEST&&dashboard!=null){dashboard.calendarPermissionChanged();if(settings)showSettings();}}
    private void pickPortrait(){pickImage(73);}
    private void pickImage(int request){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        try{startActivityForResult(i,request);}catch(Exception e){Toast.makeText(this,"No image picker available.",Toast.LENGTH_SHORT).show();}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==75){if(result==RESULT_OK&&data!=null){ArrayList<String> words=data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);if(words!=null&&!words.isEmpty())webSearchDialog(words.get(0));}return;}
        if(request==78||request==79){if(result==RESULT_OK&&data!=null&&data.getData()!=null)handleBackup(request==78,data.getData());return;}
        if((request!=73&&request!=74&&request!=76&&request!=77&&request!=80)||result!=RESULT_OK||data==null||data.getData()==null)return;
        if(fileBusy)return;
        final String iconKey=pendingIconKey;pendingIconKey=null;
        if(request==80&&iconKey==null)return;
        fileBusy=true;
        final android.net.Uri uri=data.getData();
        new Thread(()->{
            PortraitStore target=request==74?characterArt:request==76?wallpaperArt:request==77?lockArt:request==80?iconStore(iconKey):portraits;
            boolean ok=target.importImage(uri);
            runOnUiThread(()->{
                fileBusy=false;if(isFinishing()||isDestroyed())return;
                if(ok&&request==76)prefs.edit().putString("wallpaper","custom").apply();
                if(ok&&request==80)prefs.edit().putString("iconStyle:"+iconKey,"custom").apply();
                Toast.makeText(this,ok?"Image saved locally ♡":"Could not read this image.",Toast.LENGTH_SHORT).show();
                if(settings)showSettings();else if(drawer&&search!=null)renderResults(search.getText().toString());else showHome();
            });
        },"mikan-portrait-import").start();
    }
    private PortraitStore iconStore(String key){
        String filename=java.util.UUID.nameUUIDFromBytes(key.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        return new PortraitStore(this,"icon-"+filename+".png",new String[]{},256);
    }
    private void chooseIconApp(){
        if(apps.isEmpty())return;
        String[] names=new String[apps.size()];for(int i=0;i<names.length;i++)names[i]=apps.get(i).label;
        new AlertDialog.Builder(this).setTitle("Customize app icon").setItems(names,(d,i)->{if(i<apps.size())iconOptions(apps.get(i));}).show();
    }
    private void iconOptions(App app){
        new AlertDialog.Builder(this).setTitle(app.label+" icon").setItems(new String[]{"Follow global style","Amber","Original","Import custom image","Remove custom image"},(d,i)->{
            if(i==3){pendingIconKey=app.key();pickImage(80);return;}
            if(i==4)iconStore(app.key()).reset();
            prefs.edit().putString("iconStyle:"+app.key(),i==1?"amber":i==2?"original":"default").apply();refreshScreen();
        }).show();
    }
    private void dropOnFolder(App source,String id){
        new AlertDialog.Builder(this).setTitle(folders.name(id)).setItems(new String[]{"Add shortcut to folder","Move shortcut into folder","Reorder favorites"},(d,i)->{
            if(i==2){int old=favorites.indexOf(source.key()),target=favorites.indexOf(id);if(old>=0&&target>=0){favorites.remove(old);favorites.add(target,source.key());}}
            else{ArrayList<String> members=new ArrayList<>(folders.members(id));if(!members.contains(source.key()))members.add(source.key());folders.save(id,folders.name(id),members);if(i==1)favorites.remove(source.key());}
            saveFavorites();refreshScreen();
        }).show();
    }
    private void applyLockWallpaper(Drawable art){
        if(art==null||fileBusy)return;
        LockWallpaperCrop.show(this,art,(bitmap)->{
            if(fileBusy){bitmap.recycle();return;}
            fileBusy=true;
            new Thread(()->{
                boolean success=false;
                try{
                    android.app.WallpaperManager manager=android.app.WallpaperManager.getInstance(this);
                    if(!manager.isWallpaperSupported()||!manager.isSetWallpaperAllowed())throw new IllegalStateException();
                    success=manager.setBitmap(bitmap,new android.graphics.Rect(0,0,bitmap.getWidth(),bitmap.getHeight()),false,android.app.WallpaperManager.FLAG_LOCK)!=0;
                }catch(Exception ignored){}finally{bitmap.recycle();}
                final boolean ok=success;
                runOnUiThread(()->{fileBusy=false;if(!isDestroyed()&&!isFinishing())Toast.makeText(this,ok?"Lockscreen wallpaper applied":"Android could not set the wallpaper",Toast.LENGTH_LONG).show();});
            },"lock-wallpaper").start();
        });
    }
    private void showPerformance(){
        String report=perf.report();
        new AlertDialog.Builder(this).setTitle("Launcher performance").setMessage(report)
            .setNegativeButton("Close",null).setNeutralButton("Reset",(d,w)->perf.clear())
            .setPositiveButton("Copy",(d,w)->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);clipboard.setPrimaryClip(ClipData.newPlainText("Mikan performance",report));Toast.makeText(this,"Diagnostics copied",Toast.LENGTH_SHORT).show();}).show();
    }
    private void backupPicker(boolean export){
        if(fileBusy)return;
        Intent intent=new Intent(export?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);
        if(export)intent.putExtra(Intent.EXTRA_TITLE,"mikan-launcher-settings.json");
        try{startActivityForResult(intent,export?78:79);}catch(Exception ex){Toast.makeText(this,"No file picker available.",Toast.LENGTH_SHORT).show();}
    }
    private void handleBackup(boolean export,android.net.Uri uri){
        if(fileBusy)return;fileBusy=true;
        new Thread(()->{
            try{
                if(export){LauncherBackup.write(this,prefs,uri);runOnUiThread(()->{fileBusy=false;if(!isDestroyed())Toast.makeText(this,"Settings exported",Toast.LENGTH_SHORT).show();});}
                else{Map<String,Object> restored=LauncherBackup.read(this,uri);runOnUiThread(()->{
                    fileBusy=false;if(isDestroyed()||isFinishing())return;
                    new AlertDialog.Builder(this).setTitle("Restore launcher settings?").setMessage("Replace saved layout, folders and supported appearance settings. Imported artwork, private connection settings and Android permissions are not changed.").setNegativeButton("Cancel",null).setPositiveButton("Restore",(d,w)->{
                        boolean saved=LauncherBackup.apply(prefs,restored);homeSlots=null;folders=new HomeFolders(prefs);restoreFavorites();monoCache.evictAll();homePage=0;refreshScreen();Toast.makeText(this,saved?"Settings restored":"Settings changed in memory, but disk save failed. Check available storage.",Toast.LENGTH_LONG).show();
                    }).show();
                });}
            }catch(Exception ex){runOnUiThread(()->{fileBusy=false;if(!isDestroyed())Toast.makeText(this,"Backup could not be "+(export?"saved":"read")+". Existing settings kept.",Toast.LENGTH_LONG).show();});}
        },"launcher-backup").start();
    }
    private void checkMikanWeb(){
        String url=prefs.getString("mikanWebUrl","");
        if(url.isEmpty()){editMikanUrl(false);return;}
        if(checkingWeb)return;
        checkingWeb=true;Toast.makeText(this,"Checking Mikan Web…",Toast.LENGTH_SHORT).show();
        new Thread(()->{
            String result="Web unreachable";
            java.net.HttpURLConnection connection=null;
            try{
                java.net.URL endpoint=new java.net.URL(url);
                if(!"https".equalsIgnoreCase(endpoint.getProtocol())||endpoint.getUserInfo()!=null)throw new java.io.IOException("HTTPS required");
                connection=(java.net.HttpURLConnection)endpoint.openConnection();
                connection.setRequestMethod("HEAD");connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);connection.setUseCaches(false);
                int code=connection.getResponseCode();
                if(code>=200&&code<400)result="Web responded";
                else if(code==401||code==403)result="Web requires access";
                else result="Web HTTP "+code;
            }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
            final String status=result;
            runOnUiThread(()->{
                checkingWeb=false;if(isFinishing()||isDestroyed()||!url.equals(prefs.getString("mikanWebUrl","")))return;
                checkedWebUrl=url;webStatus=status;Toast.makeText(this,status+" · last check only",Toast.LENGTH_LONG).show();
                if(settings&&settingsSection==SettingsHub.Section.MIKAN)showSettings();
                // Web check status stays in settings; the character bubble is for remarks.
            });
        },"mikan-web-check").start();
    }
    private boolean pocketAvailable(){
        for(App app:apps)if(POCKET_PACKAGE.equals(app.component.getPackageName()))return true;
        return false;
    }
    private void openMikan(){
        try{
            Intent intent=getPackageManager().getLaunchIntentForPackage(POCKET_PACKAGE);
            if(intent!=null){intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(intent);rememberPackageLaunch(POCKET_PACKAGE);return;}
        }catch(RuntimeException ignored){}
        Toast.makeText(this,"Pocket Mikan unavailable. Opening web fallback.",Toast.LENGTH_SHORT).show();
        openMikanWeb();
    }
    private void openMikanWeb(){
        String url=prefs.getString("mikanWebUrl","");
        if(url.isEmpty()){editMikanUrl(true);return;}
        try{startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));}
        catch(Exception e){Toast.makeText(this,"No browser available to open Mikan.",Toast.LENGTH_LONG).show();}
    }
    private void editMikanUrl(boolean openAfter){
        EditText field=new EditText(this);field.setSingleLine(true);field.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);
        field.setHint("https://your-mikan-host/");field.setText(prefs.getString("mikanWebUrl",""));
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Mikan Web address")
            .setMessage("Enter the HTTPS address of your Mikan web interface. Saved on this phone only.")
            .setView(field).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String value=field.getText().toString().trim();
            try{
                java.net.URI uri=new java.net.URI(value);
                if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null)throw new IllegalArgumentException();
                prefs.edit().putString("mikanWebUrl",value).apply();checkedWebUrl="";webStatus="";dialog.dismiss();if(openAfter)openMikanWeb();else if(settings)showSettings();
            }catch(Exception e){field.setError("Enter a valid HTTPS web address.");}
        }));dialog.show();
    }

    private boolean widgetHere(String key,int def){return prefs.getInt(key,def)==homePage+1;}
    private int pageCount(){
        int count=0;for(String key:favorites)if(find(key)!=null)count++;
        int cap=prefs.getInt("columns",4)*prefs.getInt("homeRows",2),dock=prefs.getInt("dockCount",5);
        int pages=Math.max(prefs.getInt("minPages",1),(Math.max(0,count-dock)+cap-1)/cap);
        if(prefs.contains("homeSlotsV1")){ensureHomeSlots();pages=Math.max(pages,homeSlots.last()/cap+1);}
        for(String key:WIDGET_PAGES)pages=Math.max(pages,prefs.getInt(key,1));
        return Math.max(1,pages);
    }
    private void enableMixedLayout(){
        ensureHomeSlots();persistSlots();prefs.edit().putBoolean("mixedHome",true).apply();
    }
    private void finishMixedEdit(){editingMixed=false;mixedScrollY=0;showHome();}
    private MixedLayout mixedLayout(){
        try{return MixedLayout.parse(prefs.getString("mixedGridV1",""));}catch(RuntimeException ex){return new MixedLayout();}
    }
    private String widgetGridKey(String key){return "widget:"+key;}
    private String mixedLabel(String key){
        for(int i=0;i<WIDGET_PAGES.length;i++)if(widgetGridKey(WIDGET_PAGES[i]).equals(key))return WIDGET_NAMES[i];
        App app=find(key);return app==null?"Unavailable shortcut":app.label;
    }
    private MixedLayout.Spec mixedWidgetSpec(String key,int columns){
        boolean large=getResources().getConfiguration().screenWidthDp<350||getResources().getConfiguration().fontScale>1.2f;int min=large?columns:2,h=2,w=min;
        if(key.equals("mikanPage")){min=columns>=5&&!large?3:columns;w=columns;h=3;}
        else if(key.equals("clockPage")){h=1;w=large?columns:(canPair()&&prefs.getBoolean("pairTop",true)?2:columns);}
        else if(key.equals("weatherPage"))w=large?columns:(canPair()&&prefs.getBoolean("pairTop",true)?columns-2:columns);
        else if(key.equals("musicPage"))w=large?columns:(canPair()&&prefs.getBoolean("pairBottom",true)?2:columns);
        else if(key.equals("agendaPage"))w=large?columns:(canPair()&&prefs.getBoolean("pairBottom",true)?columns-2:columns);
        return new MixedLayout.Spec(widgetGridKey(key),min,key.equals("mikanPage")?2:1,w,h);
    }
    private void renderMixedHome(LinearLayout body){
        ensureHomeSlots();int columns=prefs.getInt("columns",4),cap=slotCapacity();List<MixedLayout.Spec> specs=new ArrayList<>();
        List<MixedLayout.Spec> top=new ArrayList<>(),middle=new ArrayList<>(),shortcuts=new ArrayList<>(),bottom=new ArrayList<>();
        if(widgetHere("clockPage",1))top.add(mixedWidgetSpec("clockPage",columns));
        if(widgetHere("weatherPage",1))top.add(mixedWidgetSpec("weatherPage",columns));
        if(widgetHere("mikanPage",1))middle.add(mixedWidgetSpec("mikanPage",columns));
        for(int i=0;i<cap;i++){String key=homeSlots.at(homePage*cap+i);if(key!=null)shortcuts.add(new MixedLayout.Spec(key,1,1,1,1));}
        if(widgetHere("musicPage",1))bottom.add(mixedWidgetSpec("musicPage",columns));
        if(widgetHere("agendaPage",1))bottom.add(mixedWidgetSpec("agendaPage",columns));
        int order=prefs.getInt("sectionOrder",0);
        if(order==2)specs.addAll(shortcuts);specs.addAll(top);specs.addAll(middle);if(order==0)specs.addAll(shortcuts);specs.addAll(bottom);if(order==1)specs.addAll(shortcuts);
        MixedLayout model=mixedLayout();LinkedHashMap<String,MixedLayout.Rect> layout=model.resolve(specs,columns);
        if(layout==null){model=new MixedLayout();layout=model.resolve(specs,columns);}
        if(layout==null){body.addView(text("Grid could not fit this page. Manage pages or disable mixed grid in settings.",14,CREAM,false));return;}
        final MixedLayout saved=model;final LinkedHashMap<String,MixedLayout.Rect> current=layout;final int pageAt=homePage;
        MixedHomeGrid grid=new MixedHomeGrid(this,columns,editingMixed,current,specs,new MixedHomeGrid.Callbacks(){
            public void changed(Map<String,MixedLayout.Rect> next){if(editingMixed&&homePage==pageAt)saveMixedChange(saved,next);}
            public void rejected(){Toast.makeText(HomeActivity.this,"That position overlaps another tile or is too small.",Toast.LENGTH_SHORT).show();}
            public void editItem(String key){if(editingMixed&&homePage==pageAt)editMixedItem(key,columns,saved,current,specs);}
        });
        grid.setOnLongClickListener(v->{if(!editingMixed)openHomeEditor();return true;});
        for(MixedLayout.Spec spec:specs){
            MixedLayout.Rect position=current.get(spec.key);View content;
            if(spec.key.startsWith("widget:"))content=buildMixedWidget(spec.key.substring(7),position.w<columns);
            else{App app=find(spec.key);content=app==null?text("Unavailable",11,MUTED,false):tile(app,true);}
            if(content!=null)grid.item(spec.key,content);
        }
        body.addView(grid,new LinearLayout.LayoutParams(-1,-2));
    }
    private View buildMixedWidget(String key,boolean compact){
        switch(key){
            case "clockPage":
                compactClock=compact;LinearLayout clockBlock=vertical();LinearLayout timeRow=horizontal();
                clock=text("",compact?40:48,CREAM,false);clock.setTypeface(Typeface.create("sans-serif-light",Typeface.NORMAL));clock.setIncludeFontPadding(false);timeRow.addView(clock);clockBlock.addView(timeRow);
                if(compact){ampm=text("",11,PEACH,false);clockBlock.addView(ampm);}
                date=text("",15,MUTED,false);clockBlock.addView(date);widgetLink(clockBlock,"Open clock app",()->openWidgetApp("clock"));return clockBlock;
            case "weatherPage":return dashboard.weatherView();
            case "mikanPage":
                Drawable art=characterArt.get();mikanCard=new MikanCard(this,art!=null?art:portraits.get(),art!=null,pocketAvailable()?"Open Pocket Mikan":"Open Mikan Web",this::openMikan,this::openRemark);return mikanCard.view();
            case "musicPage":music=new MusicPanel(this,compact);widgetLink(music.view(),"Open music app",()->openWidgetApp("music"));return music.view();
            case "agendaPage":return dashboard.agendaView();
            default:return null;
        }
    }
    private void saveMixedChange(MixedLayout model,Map<String,MixedLayout.Rect> next){
        Set<String> keep=new HashSet<>(favorites);for(String key:WIDGET_PAGES)keep.add(widgetGridKey(key));
        model.remember(next,keep);prefs.edit().putString("mixedGridV1",model.encode()).apply();mixedScrollY=mixedScroll==null?0:mixedScroll.getScrollY();showHome();
    }
    private void editMixedItem(String key,int columns,MixedLayout model,LinkedHashMap<String,MixedLayout.Rect> current,List<MixedLayout.Spec> specs){
        MixedLayout.Rect old=current.get(key);if(old==null)return;
        if(!key.startsWith("widget:")){
            new AlertDialog.Builder(this).setTitle(mixedLabel(key)).setItems(new String[]{"Manage apps and folders","Unpin shortcut"},(d,i)->{
                if(i==0)openPageManager();else{favorites.remove(key);saveFavorites();mixedScrollY=0;showHome();}
            }).setNegativeButton("Cancel",null).show();return;
        }
        MixedLayout.Spec spec=null;for(MixedLayout.Spec item:specs)if(item.key.equals(key))spec=item;
        if(spec==null)return;
        List<MixedLayout.Rect> sizes=new ArrayList<>();List<String> labels=new ArrayList<>();
        for(int width=spec.minW;width<=columns;width++)for(int height=spec.minH;height<=Math.max(4,old.h);height++){
            MixedLayout.Rect rect=new MixedLayout.Rect(old.x,old.y,width,height);
            if(spec.accepts(rect,columns)&&MixedLayout.vacant(current,key,rect,columns)){sizes.add(rect);labels.add(width+" × "+height+(width==old.w&&height==old.h?" (current)":""));}
        }
        new AlertDialog.Builder(this).setTitle("Resize "+mixedLabel(key)).setItems(labels.toArray(new String[0]),(d,i)->{current.put(key,sizes.get(i));saveMixedChange(model,current);}).setNegativeButton("Cancel",null).show();
    }
    private void chooseDockSlot(int slot){
        if(!editingMixed)return;
        if(slot>favorites.size()){Toast.makeText(this,"Fill the earlier dock slot first.",Toast.LENGTH_SHORT).show();return;}
        ArrayList<App> choices=new ArrayList<>(apps);for(String id:folders.keys()){App folder=find(id);if(folder!=null)choices.add(folder);}
        if(choices.isEmpty())return;String[] labels=new String[choices.size()];for(int i=0;i<labels.length;i++)labels[i]=choices.get(i).label;
        new AlertDialog.Builder(this).setTitle("Dock slot "+(slot+1)).setItems(labels,(d,i)->{
            String key=choices.get(i).key();if(find(key)==null||!editingMixed)return;int from=favorites.indexOf(key);
            if(from==slot)return;
            if(slot<favorites.size()&&from>=0)Collections.swap(favorites,from,slot);
            else if(slot<favorites.size()){String previous=favorites.set(slot,key);favorites.add(previous);}
            else if(from<0)favorites.add(key);
            saveFavorites();showHome();
        }).setNegativeButton("Cancel",null).show();
    }
    private List<String> homeKeys(){
        ArrayList<String> ordered=new ArrayList<>(favorites);
        return new ArrayList<>(ordered.subList(Math.min(ordered.size(),prefs.getInt("dockCount",5)),ordered.size()));
    }
    private void ensureHomeSlots(){
        if(homeSlots==null){
            try{homeSlots=HomeSlots.parse(prefs.getString("homeSlotsV1",""));}
            catch(RuntimeException ex){homeSlots=new HomeSlots();}
        }
        homeSlots.reconcile(homeKeys());
    }
    private void persistSlots(){if(homeSlots!=null)prefs.edit().putString("homeSlotsV1",homeSlots.encode()).apply();}
    private void openHomeEditor(){
        closeQuickSearch();hideKeyboard();drawer=false;settings=false;
        if(prefs.getBoolean("mixedHome",false)){if(editingMixed)return;editingMixed=true;editingHome=false;mixedScrollY=mixedScroll==null?0:mixedScroll.getScrollY();showHome();return;}
        openPageManager();
    }
    private void openPageManager(){
        editingMixed=false;drawer=false;settings=false;
        if(!prefs.contains("homeSlotsV1"))homeSlots=null;
        ensureHomeSlots();editingHome=true;selectedSlot=-1;showHomeEditor();
    }
    private void finishHomeEdit(){editingHome=false;selectedSlot=-1;if(!prefs.contains("homeSlotsV1"))homeSlots=null;showHome();}
    private void addPositionedApps(LinearLayout parent,int columns,int capacity){
        int start=homePage*capacity,last=-1;
        for(int n=0;n<capacity;n++)if(homeSlots.at(start+n)!=null)last=n;
        if(last<0){TextView empty=text("Long-press to edit this page",13,MUTED,false);empty.setMinHeight(dp(52));empty.setGravity(Gravity.CENTER_VERTICAL);empty.setOnLongClickListener(v->{openHomeEditor();return true;});parent.addView(empty);return;}
        for(int row=0;row<=last/columns;row++){
            LinearLayout line=horizontal();line.setGravity(Gravity.TOP);
            for(int col=0;col<columns;col++){
                String key=homeSlots.at(start+row*columns+col);App app=key==null?null:find(key);
                View cell=app==null?new View(this):tile(app,true);
                if(app==null){cell.setMinimumHeight(dp(76));cell.setOnLongClickListener(v->{openHomeEditor();return true;});}
                line.addView(cell,new LinearLayout.LayoutParams(0,-2,1));
            }
            parent.addView(line);
        }
    }
    private void showHomeEditor(){
        ensureHomeSlots();homePage=Math.max(0,Math.min(homePage,editorPageCount()-1));createPage();
        LinearLayout bar=horizontal();bar.addView(action("Done",this::finishHomeEdit));TextView title=text("  Edit Home",21,CREAM,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));page.addView(bar);
        gap(page,8);page.addView(text("Hold and drag a shortcut, or tap it then tap a destination. Changes save immediately.",13,MUTED,false));gap(page,10);
        page.addView(action(prefs.getBoolean("mixedHome",false)?"Back to live grid":"Try live mixed grid",()->{if(!prefs.getBoolean("mixedHome",false)){new AlertDialog.Builder(this).setTitle("Enable mixed grid?").setMessage("Apps and widgets share a scrollable grid. Your existing section layout remains available in Home settings.").setNegativeButton("Cancel",null).setPositiveButton("Enable",(d,i)->{enableMixedLayout();editingHome=false;editingMixed=true;mixedScrollY=0;showHome();}).show();}else{editingHome=false;editingMixed=true;mixedScrollY=0;showHome();}}));gap(page,6);
        LinearLayout nav=horizontal();nav.addView(action("‹",()->editorPage(-1)));TextView position=text("Page "+(homePage+1)+" / "+editorPageCount(),15,CREAM,true);position.setGravity(Gravity.CENTER);nav.addView(position,new LinearLayout.LayoutParams(0,-2,1));nav.addView(action("›",()->editorPage(1)));page.addView(nav);gap(page,8);
        if(selectedSlot>=0){String selected=homeSlots.at(selectedSlot);App app=selected==null?null:find(selected);page.addView(text(app==null?"Select a shortcut":"Moving "+app.label+" · tap a cell",13,PEACH,true));gap(page,6);}
        ScrollView scroll=new ScrollView(this);LinearLayout body=vertical();scroll.addView(body);page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        int cols=prefs.getInt("columns",4),cap=slotCapacity(),start=homePage*cap;
        for(int row=0;row<cap/cols;row++){
            LinearLayout line=horizontal();
            for(int col=0;col<cols;col++){
                int slot=start+row*cols+col;String key=homeSlots.at(slot);App app=key==null?null:find(key);
                LinearLayout cell=vertical();cell.setGravity(Gravity.CENTER);cell.setPadding(dp(3),dp(6),dp(3),dp(6));cell.setBackground(shape(slot==selectedSlot?0xaa74513d:0x443c2a27,12,true));
                if(app!=null){
                    ImageView image=new ImageView(this);image.setImageDrawable(themedIcon(app));image.setScaleType(ImageView.ScaleType.FIT_CENTER);cell.addView(image,new LinearLayout.LayoutParams(dp(38),dp(38)));
                    TextView name=text(app.label,11,CREAM,false);name.setGravity(Gravity.CENTER);name.setMaxLines(2);name.setMinLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);cell.addView(name,new LinearLayout.LayoutParams(-1,-2));
                    cell.setContentDescription(app.label+", slot "+(slot-start+1));
                    cell.setOnLongClickListener(v->{ClipData data=ClipData.newPlainText("mikan-home-slot",String.valueOf(slot));return v.startDragAndDrop(data,new View.DragShadowBuilder(v),Integer.valueOf(slot),0);});
                }else{TextView plus=text(key==null?"+":"Unavailable",key==null?22:11,MUTED,false);plus.setGravity(Gravity.CENTER);cell.addView(plus,new LinearLayout.LayoutParams(-1,dp(62)));cell.setContentDescription((key==null?"Empty slot ":"Unavailable shortcut in slot ")+(slot-start+1));}
                cell.setFocusable(true);cell.setOnClickListener(v->selectHomeSlot(slot));
                cell.setOnDragListener((v,event)->{
                    if(event.getAction()==android.view.DragEvent.ACTION_DRAG_STARTED)return event.getLocalState() instanceof Integer;
                    if(event.getAction()==android.view.DragEvent.ACTION_DRAG_ENTERED)v.setAlpha(.6f);
                    if(event.getAction()==android.view.DragEvent.ACTION_DRAG_EXITED||event.getAction()==android.view.DragEvent.ACTION_DRAG_ENDED)v.setAlpha(1f);
                    if(event.getAction()==android.view.DragEvent.ACTION_DROP){int from=(Integer)event.getLocalState();handler.post(()->moveHomeSlot(from,slot));return true;}
                    return true;
                });
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.setMargins(dp(2),dp(3),dp(2),dp(3));line.addView(cell,lp);
            }body.addView(line);
        }
        gap(body,12);body.addView(text("WIDGETS ON THIS PAGE",12,MUTED,true));
        String[] names={"Clock","Mikan","Music","Weather","Upcoming events"};
        for(int k=0;k<WIDGET_PAGES.length;k++)if(prefs.getInt(WIDGET_PAGES[k],1)==homePage+1){final String widget=WIDGET_PAGES[k];final String name=names[k];body.addView(action(name+" · Move",()->moveEditorWidget(widget,name)));}
        body.addView(text("Use the live mixed grid to position and resize widgets on the page. This manager handles cross-page assignments and folder creation.",12,MUTED,false));gap(body,10);
        LinearLayout controls=horizontal();controls.addView(action("+ Page",this::addEditorPage),new LinearLayout.LayoutParams(0,-2,1));controls.addView(action("Remove",this::removeEditorPage),new LinearLayout.LayoutParams(0,-2,1));page.addView(controls);
        LinearLayout reorder=horizontal();reorder.addView(action("Move page ‹",()->swapEditorPage(-1)),new LinearLayout.LayoutParams(0,-2,1));reorder.addView(action("Move page ›",()->swapEditorPage(1)),new LinearLayout.LayoutParams(0,-2,1));page.addView(reorder);
    }
    private int editorPageCount(){
        int cap=slotCapacity(),count=Math.max(prefs.getInt("minPages",1),homeSlots.last()<0?1:homeSlots.last()/cap+1);
        for(String key:WIDGET_PAGES)count=Math.max(count,prefs.getInt(key,1));return Math.max(1,count);
    }
    private void editorPage(int direction){homePage=Math.max(0,Math.min(editorPageCount()-1,homePage+direction));showHomeEditor();}
    private void selectHomeSlot(int slot){
        if(selectedSlot==slot){selectedSlot=-1;showHomeEditor();return;}
        if(selectedSlot>=0){moveHomeSlot(selectedSlot,slot);return;}
        if(homeSlots.at(slot)!=null){selectedSlot=slot;showHomeEditor();return;}
        ArrayList<App> options=new ArrayList<>();for(App app:apps)if(!favorites.contains(app.key()))options.add(app);
        if(options.isEmpty()){Toast.makeText(this,"All available apps are already pinned.",Toast.LENGTH_SHORT).show();return;}
        String[] labels=new String[options.size()];for(int i=0;i<labels.length;i++)labels[i]=options.get(i).label;
        new AlertDialog.Builder(this).setTitle("Add app to this slot").setItems(labels,(d,i)->{
            App app=appIndex.get(options.get(i).key());if(app==null||!editingHome)return;
            if(homeSlots.at(slot)!=null)return;
            // Legacy dock takes the first N pinned apps; do not silently replace it.
            if(favorites.size()<prefs.getInt("dockCount",5)){Toast.makeText(this,"Fill the dock first, or reduce its size in Home settings.",Toast.LENGTH_LONG).show();return;}
            favorites.add(app.key());saveFavorites();ensureHomeSlots();int from=homeSlots.locate(app.key());if(from>=0&&from!=slot)homeSlots.move(from,slot);persistSlots();showHomeEditor();
        }).setNegativeButton("Cancel",null).show();
    }
    private void moveHomeSlot(int from,int to){
        if(!editingHome)return;ensureHomeSlots();selectedSlot=-1;
        if(from==to){showHomeEditor();return;}
        String source=homeSlots.at(from),target=homeSlots.at(to);
        if(source==null){showHomeEditor();return;}
        if(target!=null&&!source.startsWith("folder:")&&!target.startsWith("folder:")){
            App first=find(source),second=find(target);
            if(first!=null&&second!=null){
                new AlertDialog.Builder(this).setTitle("Move "+first.label).setItems(new String[]{"Swap positions","Create folder"},(d,i)->{
                    if(!editingHome)return;
                    if(i==0){if(homeSlots.move(from,to))persistSlots();showHomeEditor();}
                    else createEditorFolder(from,to,source,target);
                }).setOnCancelListener(d->showHomeEditor()).show();return;
            }
        }
        if(homeSlots.move(from,to))persistSlots();showHomeEditor();
    }
    private void createEditorFolder(int from,int to,String source,String target){
        EditText name=new EditText(this);name.setSingleLine(true);name.setText("Folder");name.selectAll();
        new AlertDialog.Builder(this).setTitle("Name folder").setView(name).setNegativeButton("Cancel",(d,i)->showHomeEditor()).setPositiveButton("Create",(d,i)->{
            if(!editingHome||!source.equals(homeSlots.at(from))||!target.equals(homeSlots.at(to)))return;
            String label=name.getText().toString().trim();if(label.isEmpty())label="Folder";
            String folder=folders.save(null,label,Arrays.asList(target,source));
            favorites.remove(source);favorites.remove(target);favorites.add(folder);
            saveFavorites();ensureHomeSlots();int placed=homeSlots.locate(folder);if(placed>=0&&placed!=to)homeSlots.move(placed,to);persistSlots();showHomeEditor();
        }).setOnCancelListener(d->showHomeEditor()).show();
    }
    private void addEditorPage(){
        int count=editorPageCount();if(count>=20){Toast.makeText(this,"Page limit reached.",Toast.LENGTH_SHORT).show();return;}
        prefs.edit().putInt("minPages",count+1).apply();persistSlots();homePage=count;showHomeEditor();
    }
    private void removeEditorPage(){
        int count=editorPageCount();if(count<=1){Toast.makeText(this,"Keep at least one home page.",Toast.LENGTH_SHORT).show();return;}
        if(!homeSlots.emptyPage(homePage,slotCapacity())){Toast.makeText(this,"Move the apps off this page first.",Toast.LENGTH_SHORT).show();return;}
        for(String key:WIDGET_PAGES)if(prefs.getInt(key,1)==homePage+1){Toast.makeText(this,"Move the widgets off this page first.",Toast.LENGTH_SHORT).show();return;}
        homeSlots.removeEmptyPage(homePage,slotCapacity());SharedPreferences.Editor changes=prefs.edit().putInt("minPages",count-1);
        for(String key:WIDGET_PAGES){int value=prefs.getInt(key,1);if(value>homePage+1)changes.putInt(key,value-1);}
        changes.putString("homeSlotsV1",homeSlots.encode()).apply();selectedSlot=-1;homePage=Math.min(homePage,count-2);showHomeEditor();
    }
    private void swapEditorPage(int direction){
        int other=homePage+direction;if(other<0||other>=editorPageCount())return;
        homeSlots.swapPages(homePage,other,slotCapacity());SharedPreferences.Editor changes=prefs.edit().putInt("minPages",editorPageCount());
        for(String key:WIDGET_PAGES){int value=prefs.getInt(key,1);if(value==homePage+1)changes.putInt(key,other+1);else if(value==other+1)changes.putInt(key,homePage+1);}
        changes.putString("homeSlotsV1",homeSlots.encode()).apply();selectedSlot=-1;homePage=other;showHomeEditor();
    }
    private void moveEditorWidget(String key,String name){
        String[] choices=new String[editorPageCount()];for(int i=0;i<choices.length;i++)choices[i]="Page "+(i+1);
        new AlertDialog.Builder(this).setTitle("Move "+name).setItems(choices,(d,i)->{prefs.edit().putInt(key,i+1).apply();showHomeEditor();}).setNegativeButton("Cancel",null).show();
    }
    private int slotCapacity(){return prefs.getInt("columns",4)*prefs.getInt("homeRows",2);}
    private void changePage(int delta){int next=Math.max(0,Math.min(pageCount()-1,homePage+delta));if(next!=homePage){homePage=next;mixedScrollY=0;showHome();}}
    private void widgetSetting(LinearLayout body,String label,String key,int def){
        int p=prefs.getInt(key,def);setting(body,label+": "+(p==0?"Hidden":"Page "+p),()->{
            int count=Math.max(5,pageCount());String[] options=new String[count+1];options[0]="Hidden";for(int i=1;i<=count;i++)options[i]="Page "+i;
            new AlertDialog.Builder(this).setTitle(label+" placement").setItems(options,(d,i)->{prefs.edit().putInt(key,i).apply();showSettings();}).show();
        });
    }
    private void notificationAccess(){
        new AlertDialog.Builder(this).setTitle("Notification access").setMessage("Android grants broad notification access. Mikan Launcher uses app identifiers for dots and optional notification hints, and active media sessions for playback controls. Message bodies and sender names are not read for hints. No notification data is sent to Mikan Web or persisted. You can revoke access at any time.").setNegativeButton("Cancel",null).setPositiveButton("Open Android settings",(d,w)->{
            try{startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));}catch(Exception e){Toast.makeText(this,"Open Android notification access settings.",Toast.LENGTH_LONG).show();}
        }).show();
    }
    private void refreshMikanRemark(boolean notificationAccess){
        if(mikanCard==null||!foreground||closed)return;
        Set<String> packages=notificationAccess?LauncherNotifications.snapshot():Collections.emptySet();
        String agenda=prefs.getBoolean("mikanCalendarHints",true)?dashboard.upcomingHint():null;
        mikanCard.setRemark(remarks.choose(prefs,packages,agenda,Calendar.getInstance().get(Calendar.HOUR_OF_DAY)));
    }
    private void openRemark(MikanRemarks.Remark remark){
        if(!foreground||closed||drawer||settings||mikanCard==null||!prefs.getBoolean("mikanRemarks",true))return;
        boolean access=MikanRemarks.notificationHintsEnabled(prefs)&&LauncherNotifications.allowed(this);
        switch(remark.action){
            case NONE:
                remarks.advance();refreshMikanRemark(access);return;
            case APP:
                // Recheck notification presence and permission, never launch a different
                // package just because the same category has another active notification.
                if(!access||!LauncherNotifications.has(remark.packageName)){
                    Toast.makeText(this,"That notification is no longer available.",Toast.LENGTH_SHORT).show();
                    refreshMikanRemark(access);return;
                }
                try{
                    Intent intent=getPackageManager().getLaunchIntentForPackage(remark.packageName);
                    if(intent!=null){intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(intent);rememberPackageLaunch(remark.packageName);return;}
                }catch(RuntimeException ignored){}
                Toast.makeText(this,remark.label+" is unavailable.",Toast.LENGTH_SHORT).show();invalidateCatalog();return;
            case WEATHER:
                if(prefs.getBoolean("mikanWeatherHints",true)&&MikanRemarks.weatherHint(prefs)!=null){openWidgetApp("weather");return;}
                break;
            case CALENDAR:
                if(prefs.getBoolean("mikanCalendarHints",true)&&dashboard.upcomingHint()!=null){dashboard.openCalendar();return;}
                break;
        }
        Toast.makeText(this,"That update is no longer current.",Toast.LENGTH_SHORT).show();refreshMikanRemark(access);
    }
    private void refreshExtras(){
        if(!foreground||closed)return;
        long started=android.os.SystemClock.elapsedRealtime();
        boolean hints=mikanCard!=null&&MikanRemarks.notificationHintsEnabled(prefs);
        boolean access=(prefs.getBoolean("badges",false)||hints)&&LauncherNotifications.allowed(this);
        boolean enabled=prefs.getBoolean("badges",false)&&access;
        if(mikanCard!=null)refreshMikanRemark(access&&hints);
        for(Map.Entry<TextView,String> e:badgeViews.entrySet()){
            boolean show=false;
            if(enabled){App a=find(e.getValue());if(a!=null){if(a.folderKey!=null){for(String k:folders.members(a.folderKey)){App child=find(k);if(child!=null&&child.component!=null&&LauncherNotifications.has(child.component.getPackageName())){show=true;break;}}}else show=LauncherNotifications.has(a.component.getPackageName());}}
            int visibility=show?View.VISIBLE:View.GONE;if(e.getKey().getVisibility()!=visibility)e.getKey().setVisibility(visibility);
        }
        if(drawer&&results!=null&&drawerAdapter!=null){
            drawerAdapter.badges=enabled;
            for(int i=0;i<results.getChildCount();i++){View child=results.getChildAt(i);if(child instanceof DrawerCell)((DrawerCell)child).updateBadge(enabled);}
        }
        if(music!=null)music.refresh();
        if(music!=null||enabled)perf.record("media/badge refresh",started);
    }
    private void createFolder(){
        EditText input=new EditText(this);input.setHint("e.g. Music");input.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("New folder").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Next",(d,w)->{
            String name=input.getText().toString().trim();if(name.isEmpty())return;
            chooseFolderMembers(null,name);
        }).show();
    }
    private void chooseFolderMembers(String key,String name){
        String[] names=new String[apps.size()];boolean[] selected=new boolean[apps.size()];List<String> existing=key==null?Collections.emptyList():folders.members(key);
        for(int i=0;i<apps.size();i++){names[i]=apps.get(i).label;selected[i]=existing.contains(apps.get(i).key());}
        new AlertDialog.Builder(this).setTitle(name+" · apps").setMultiChoiceItems(names,selected,(d,i,checked)->selected[i]=checked).setNegativeButton("Cancel",null).setPositiveButton("Save",(d,w)->{
            ArrayList<String> members=new ArrayList<>();for(int i=0;i<selected.length;i++)if(selected[i])members.add(apps.get(i).key());
            if(members.isEmpty()){Toast.makeText(this,"Choose at least one app.",Toast.LENGTH_SHORT).show();return;}
            String id=folders.save(key,name,members);
            // Keep dock and existing shortcuts intact; folders are additional shortcuts.
            if(!favorites.contains(id))favorites.add(id);
            saveFavorites();refreshScreen();
        }).show();
    }
    private void refreshScreen(){if(quickSearch!=null){catalogRenderPending=true;quickSearch.refresh();return;}if(settings)showSettings();else if(drawer&&search!=null)renderResults(search.getText().toString());else showHome();}
    private void manageFolders(){
        List<String> ids=folders.keys();if(ids.isEmpty()){createFolder();return;}
        String[] names=new String[ids.size()];for(int i=0;i<names.length;i++)names[i]=folders.name(ids.get(i));
        new AlertDialog.Builder(this).setTitle("Manage folders").setItems(names,(d,i)->folderOptions(ids.get(i))).setNeutralButton("New folder",(d,w)->createFolder()).show();
    }
    private void folderOptions(String id){
        new AlertDialog.Builder(this).setTitle(folders.name(id)).setItems(new String[]{"Open folder","Edit apps","Rename","Move to dock","Move earlier","Move later","Delete folder"},(d,i)->{
            if(i==0){openFolder(id);return;}if(i==1){chooseFolderMembers(id,folders.name(id));return;}
            if(i==2){EditText input=new EditText(this);input.setSingleLine(true);input.setText(folders.name(id));new AlertDialog.Builder(this).setTitle("Rename folder").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Save",(dd,w)->{String name=input.getText().toString().trim();if(!name.isEmpty()){folders.save(id,name,folders.members(id));refreshScreen();}}).show();return;}
            if(i==6){folders.remove(id);favorites.remove(id);}else{int old=favorites.indexOf(id);if(old<0)return;int pos=i==3?0:i==4?Math.max(0,old-1):Math.min(favorites.size()-1,old+1);favorites.remove(old);favorites.add(pos,id);}
            saveFavorites();refreshScreen();
        }).show();
    }
    private void openFolder(String id){
        ArrayList<App> members=new ArrayList<>();for(String k:folders.members(id)){App a=find(k);if(a!=null&&a.component!=null)members.add(a);}
        ScrollView scroll=new ScrollView(this);LinearLayout grid=vertical();grid.setPadding(dp(12),dp(8),dp(12),dp(8));scroll.addView(grid);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(folders.name(id)).setView(scroll).setNeutralButton("Edit",(d,w)->folderOptions(id)).setNegativeButton("Close",null).create();
        if(members.isEmpty())grid.addView(text("No available apps. Edit folder to add more.",14,CREAM,false));
        for(int n=0;n<members.size();n+=3){LinearLayout row=horizontal();row.setGravity(Gravity.TOP);for(int j=0;j<3;j++){
            if(n+j>=members.size()){row.addView(new View(this),new LinearLayout.LayoutParams(0,1,1));continue;}
            App app=members.get(n+j);LinearLayout tile=vertical();tile.setGravity(Gravity.CENTER);tile.setPadding(dp(4),dp(6),dp(4),dp(6));
            ImageView image=new ImageView(this);image.setImageDrawable(themedIcon(app));image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setPadding(dp(5),dp(5),dp(5),dp(5));image.setBackground(MikanTheme.tile(this));tile.addView(image,new LinearLayout.LayoutParams(dp(48),dp(48)));
            TextView label=text(app.label,12,CREAM,false);label.setGravity(Gravity.CENTER);label.setMaxLines(2);tile.addView(label);tile.setContentDescription(app.label);
            tile.setOnClickListener(v->{dialog.dismiss();launch(app);});tile.setOnLongClickListener(v->{new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Remove from folder","Pin separately","Customize icon"},(d,i)->{
                if(i==0){ArrayList<String> keys=new ArrayList<>(folders.members(id));keys.remove(app.key());folders.save(id,folders.name(id),keys);dialog.dismiss();refreshScreen();openFolder(id);}
                else if(i==1){if(!favorites.contains(app.key())){favorites.add(app.key());saveFavorites();}dialog.dismiss();refreshScreen();}
                else{dialog.dismiss();iconOptions(app);}
            }).show();return true;});row.addView(tile,new LinearLayout.LayoutParams(0,-2,1));
        }grid.addView(row);}
        dialog.show();
    }
    private void addToFolder(App app){
        List<String> ids=folders.keys();if(ids.isEmpty()){createFolder();return;}
        String[] names=new String[ids.size()];for(int i=0;i<names.length;i++)names[i]=folders.name(ids.get(i));
        new AlertDialog.Builder(this).setTitle("Add "+app.label+" to folder").setItems(names,(d,i)->{String id=ids.get(i);ArrayList<String> members=new ArrayList<>(folders.members(id));if(!members.contains(app.key()))members.add(app.key());folders.save(id,folders.name(id),members);refreshScreen();}).show();
    }
    private void chooseHome(){
        try{
            if(Build.VERSION.SDK_INT>=29){RoleManager role=getSystemService(RoleManager.class);if(role!=null&&role.isRoleAvailable(RoleManager.ROLE_HOME)&&!role.isRoleHeld(RoleManager.ROLE_HOME)){startActivityForResult(role.createRequestRoleIntent(RoleManager.ROLE_HOME),1);return;}}
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        }catch(Exception e){new AlertDialog.Builder(this).setMessage("Open Android Settings → Apps → Default apps → Home app.").setPositiveButton("OK",null).show();}
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(quickSearch!=null||editingHome||editingMixed)return super.dispatchTouchEvent(event);
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){touchX=event.getX();touchY=event.getY();seekGesture=music!=null&&music.isSeekTouch(event.getRawX(),event.getRawY());}
        if(!seekGesture&&!drawer&&!settings&&event.getActionMasked()==MotionEvent.ACTION_UP&&Math.abs(event.getX()-touchX)>dp(90)&&Math.abs(event.getY()-touchY)<dp(55)){MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();changePage(event.getX()<touchX?1:-1);return true;}
        if(!seekGesture&&!drawer&&!settings&&event.getActionMasked()==MotionEvent.ACTION_UP&&root!=null&&touchY>root.getHeight()-dp(180)&&touchY-event.getY()>dp(70)&&Math.abs(event.getX()-touchX)<dp(90)){
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();showDrawer();return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
