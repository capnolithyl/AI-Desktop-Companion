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
    private static final int CREAM=0xffffe9d5, PEACH=0xffffbf88, MUTED=0xffe1bda9, PANEL=0xe6312325, BORDER=0xff805439;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayList<App> apps=new ArrayList<>();
    private final Map<String,Drawable.ConstantState> monoCache=new HashMap<>();
    private final ArrayList<String> favorites=new ArrayList<>();
    private SharedPreferences prefs;
    private FrameLayout root;
    private LinearLayout page, results;
    private TextView clock, date, greeting;
    private EditText search;
    private boolean drawer=false;
    private boolean settings=false;
    private LauncherUpdater updater;
    private PortraitStore portraits,characterArt;
    private MikanCard mikanCard;
    private DashboardCards dashboard;
    private TextView ampm;
    private boolean compactClock;
    private String checkedWebUrl="",webStatus="";
    private boolean checkingWeb;
    private HomeFolders folders;
    private int homePage=0;
    private MusicPanel music;
    private final Map<TextView,String> badgeViews=new HashMap<>();
    private final Runnable refreshExtras=new Runnable(){public void run(){refreshExtras();handler.postDelayed(this,2500);}};
    private float touchX,touchY;
    private boolean seekGesture;
    private final Runnable progressTick=new Runnable(){public void run(){if(music!=null)music.updatePosition();handler.postDelayed(this,1000);}};
    private final Runnable tick=new Runnable(){ public void run(){ updateClock(); handler.postDelayed(this,15000); } };
    private static final class App {
        final ComponentName component; final String label; final Drawable icon; final String folderKey;
        App(ComponentName component,String label,Drawable icon){this.component=component;this.label=label;this.icon=icon;this.folderKey=null;}
        App(String key,String label,Drawable icon){this.component=null;this.label=label;this.icon=icon;this.folderKey=key;}
        String key(){return folderKey==null?component.flattenToString():folderKey;}
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(0);
        prefs=getSharedPreferences("launcher",MODE_PRIVATE);
        updater=new LauncherUpdater(this);
        portraits=new PortraitStore(this);
        characterArt=new PortraitStore(this,"mikan-character-art.webp",new String[]{"portraits/character.webp"});
        folders=new HomeFolders(prefs);
        dashboard=new DashboardCards(this,prefs,this::showSettings);
        loadApps();
        restoreFavorites();
        showHome();
    }
    @Override protected void onResume(){
        super.onResume(); loadApps();
        if(LauncherNotifications.allowed(this))LauncherNotifications.refreshIfConnected();
        if(settings) showSettings(); else if(drawer && search!=null) renderResults(search.getText().toString()); else showHome();
        handler.removeCallbacks(tick); handler.post(tick);
        handler.removeCallbacks(refreshExtras);handler.post(refreshExtras);
        handler.removeCallbacks(progressTick);handler.post(progressTick);
        dashboard.resume();
    }
    @Override protected void onPause(){dashboard.pause();handler.removeCallbacks(tick);handler.removeCallbacks(refreshExtras);handler.removeCallbacks(progressTick);super.onPause();}
    @Override protected void onDestroy(){if(dashboard!=null)dashboard.close();super.onDestroy();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);hideKeyboard();homePage=0;showHome();}
    @Override public void onBackPressed(){if(drawer||settings){hideKeyboard();showHome();}else if(homePage!=0){homePage=0;showHome();}}
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
    private Drawable asset(String name){try(java.io.InputStream in=getAssets().open(name)){return Drawable.createFromStream(in,name);}catch(Exception e){return null;}}
    private void createPage(){
        badgeViews.clear();music=null;mikanCard=null;clock=null;date=null;greeting=null;ampm=null;dashboard.detach();
        root=new FrameLayout(this);root.setBackgroundColor(0xff191417);
        ImageView bg=new ImageView(this);bg.setScaleType(ImageView.ScaleType.CENTER_CROP);bg.setImageDrawable(asset(prefs.getString("wallpaper","reading-nook.webp")));
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
    private void loadApps(){
        apps.clear();monoCache.clear();
        Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for(ResolveInfo r:getPackageManager().queryIntentActivities(intent,0)){
            if(r.activityInfo==null||r.activityInfo.packageName.equals(getPackageName()))continue;
            ComponentName c=new ComponentName(r.activityInfo.packageName,r.activityInfo.name);
            String name=r.loadLabel(getPackageManager()).toString();
            apps.add(new App(c,name,r.loadIcon(getPackageManager())));
        }
        apps.sort(Comparator.comparing((App a)->a.label,String.CASE_INSENSITIVE_ORDER).thenComparing(App::key));
    }
    private App find(String key){for(App a:apps)if(a.key().equals(key))return a;if(folders!=null&&folders.exists(key))return new App(key,folders.name(key),getDrawable(android.R.drawable.ic_menu_agenda));return null;}
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
    private void saveFavorites(){prefs.edit().putString("favorites",String.join("\n",favorites)).apply();}
    private void toggle(App app){
        if(favorites.contains(app.key())){favorites.remove(app.key());Toast.makeText(this,"Unpinned "+app.label,Toast.LENGTH_SHORT).show();}
        else{favorites.add(app.key());Toast.makeText(this,"Pinned "+app.label,Toast.LENGTH_SHORT).show();}
        saveFavorites();
        if(drawer)renderResults(search.getText().toString());else showHome();
    }
    private void launch(App app){
        if(app.folderKey!=null){openFolder(app.folderKey);return;}
        try{hideKeyboard();Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(app.component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(intent);}
        catch(Exception e){Toast.makeText(this,"Unable to open "+app.label,Toast.LENGTH_SHORT).show();loadApps();if(drawer)renderResults(search.getText().toString());else showHome();}
    }
    private TextView action(String label,Runnable run){
        TextView b=text(label,14,PEACH,true);b.setGravity(Gravity.CENTER);b.setPadding(dp(12),dp(10),dp(12),dp(10));b.setBackground(shape(PANEL,20,true));b.setMinHeight(dp(48));b.setOnClickListener(v->run.run());return b;
    }
    private void showHome(){
        drawer=false;settings=false;search=null;results=null;homePage=Math.max(0,Math.min(homePage,pageCount()-1));createPage();
        LinearLayout header=horizontal();
        TextView brand=text("Mikan OS",15,CREAM,true);
        ImageView mark=new ImageView(this);mark.setImageDrawable(new MikanMark(MikanMark.CAT,PEACH));LinearLayout.LayoutParams markParams=new LinearLayout.LayoutParams(dp(23),dp(23));markParams.rightMargin=dp(7);header.addView(mark,markParams);
        header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        header.addView(markButton(MikanMark.GEAR,"Launcher settings",this::showSettings),new LinearLayout.LayoutParams(dp(44),dp(44)));page.addView(header);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(true);scroll.setScrollbarFadingEnabled(true);
        page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout body=vertical();scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        gap(body,6);
        boolean showClock=widgetHere("clockPage",1),showWeather=widgetHere("weatherPage",1);
        compactClock=showClock&&showWeather&&canPair();
        LinearLayout clockBlock=vertical();
        if(showClock){
        LinearLayout timeRow=horizontal();clock=text("",compactClock?40:48,CREAM,false);clock.setTypeface(Typeface.create("sans-serif-light",Typeface.NORMAL));clock.setIncludeFontPadding(false);timeRow.addView(clock);
        ImageView paw=new ImageView(this);paw.setImageDrawable(new MikanMark(MikanMark.PAW,PEACH));LinearLayout.LayoutParams pawParams=new LinearLayout.LayoutParams(dp(23),dp(23));pawParams.leftMargin=dp(8);timeRow.addView(paw,pawParams);clockBlock.addView(timeRow);
        if(compactClock){ampm=text("",11,PEACH,false);ampm.setIncludeFontPadding(false);clockBlock.addView(ampm);}
        gap(clockBlock,3);date=text("",15,MUTED,false);date.setIncludeFontPadding(false);clockBlock.addView(date);}
        if(showClock||showWeather){addWidgetRow(body,showClock?clockBlock:null,showWeather?dashboard.weatherView():null,compactClock);gap(body,12);}
        if(widgetHere("mikanPage",1)){
            Drawable art=characterArt.get();
            String url=prefs.getString("mikanWebUrl","");
            String status=url.isEmpty()?"Set up Mikan Web":url.equals(checkedWebUrl)&&!webStatus.isEmpty()?webStatus:"Web shortcut";
            mikanCard=new MikanCard(this,art!=null?art:portraits.get(),art!=null,status,this::openMikan);
            body.addView(mikanCard.view());gap(body,12);
        }
        if(prefs.getBoolean("showFavoritesLabel",false)){body.addView(text("YOUR FAVORITES",12,MUTED,true));gap(body,4);}
        ArrayList<App> pinned=new ArrayList<>();for(String key:favorites){App a=find(key);if(a!=null)pinned.add(a);}
        int dockCount=prefs.getInt("dockCount",5);
        int columns=prefs.getInt("columns",4), perPage=columns*2;
        int start=Math.min(pinned.size(),dockCount+homePage*perPage),end=Math.min(pinned.size(),start+perPage);
        if(start==end)body.addView(text("Pin apps from the drawer or create a folder in settings.",14,MUTED,false));else addGrid(body,pinned.subList(start,end),columns);
        gap(body,10);
        boolean showMusic=widgetHere("musicPage",1),showAgenda=widgetHere("agendaPage",1);
        boolean pair=showMusic&&showAgenda&&canPair();
        if(showMusic)music=new MusicPanel(this,pair);
        if(showMusic||showAgenda){addWidgetRow(body,showMusic?music.view():null,showAgenda?dashboard.agendaView():null,pair);gap(body,10);}
        LinearLayout dock=horizontal();dock.setPadding(0,dp(3),0,dp(3));if(!prefs.getBoolean("floatingDock",true)){dock.setBackground(panelShape(24));dock.setElevation(dp(2));}
        for(int i=0;i<dockCount;i++){if(i<pinned.size())dock.addView(tile(pinned.get(i),false),new LinearLayout.LayoutParams(0,-2,1));else{View blank=new View(this);dock.addView(blank,new LinearLayout.LayoutParams(0,dp(56),1));}}
        LinearLayout nav=horizontal();nav.setGravity(Gravity.CENTER);int count=pageCount();
        if(count>1){
        if(homePage>0)nav.addView(pageArrow("‹",()->changePage(-1)));
        LinearLayout dots=horizontal();dots.setGravity(Gravity.CENTER);for(int i=0;i<count;i++){final int target=i;View dot=new View(this);dot.setBackground(shape(i==homePage?PEACH:0xff967a69,10,false));LinearLayout.LayoutParams d=new LinearLayout.LayoutParams(dp(i==homePage?9:6),dp(i==homePage?9:6));d.setMargins(dp(4),0,dp(4),0);dots.addView(dot,d);dot.setContentDescription("Page "+(i+1));dot.setOnClickListener(v->{homePage=target;showHome();});}nav.addView(dots,new LinearLayout.LayoutParams(-2,dp(36)));
        if(homePage+1<count)nav.addView(pageArrow("›",()->changePage(1)));
        page.addView(nav);gap(page,4);}
        page.addView(dock);gap(page,7);
        page.addView(searchBar(),new LinearLayout.LayoutParams(-1,dp(50)));
        updateClock();refreshExtras();
    }
    private ImageView markButton(int kind,String description,Runnable run){
        ImageView v=new ImageView(this);v.setImageDrawable(new MikanMark(kind,PEACH));v.setScaleType(ImageView.ScaleType.FIT_CENTER);v.setPadding(dp(11),dp(11),dp(11),dp(11));v.setContentDescription(description);v.setFocusable(true);v.setBackground(MikanTheme.ripple(this,18));v.setOnClickListener(w->run.run());return v;
    }
    private View searchBar(){
        LinearLayout bar=horizontal();bar.setBackground(MikanTheme.panel(this,26));bar.setPadding(dp(4),0,dp(4),0);
        bar.addView(markButton(MikanMark.SEARCH,"Search installed apps",this::openAppSearch),new LinearLayout.LayoutParams(dp(42),-1));
        TextView hint=text("Search on Mikan OS",13,MUTED,false);hint.setGravity(Gravity.CENTER_VERTICAL);hint.setSingleLine(true);hint.setEllipsize(android.text.TextUtils.TruncateAt.END);hint.setOnClickListener(v->openAppSearch());bar.addView(hint,new LinearLayout.LayoutParams(0,-1,1));
        bar.addView(markButton(MikanMark.GLOBE,"Search web",()->webSearchDialog("")),new LinearLayout.LayoutParams(dp(42),-1));
        bar.addView(markButton(MikanMark.MIC,"Voice web search",this::voiceSearch),new LinearLayout.LayoutParams(dp(42),-1));
        return bar;
    }
    private void openAppSearch(){showDrawer();search.requestFocus();search.post(()->{if(drawer&&search!=null&&search.hasFocus())((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(search,InputMethodManager.SHOW_IMPLICIT);});}
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
        cell.addView(iconFrame,new LinearLayout.LayoutParams(dp(50),dp(50)));
        if(label){TextView name=text(app.label,11,CREAM,false);name.setGravity(Gravity.TOP|Gravity.CENTER_HORIZONTAL);name.setIncludeFontPadding(false);name.setMaxLines(2);name.setMinLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(3);cell.addView(name,p); }
        cell.setContentDescription(app.label);cell.setOnClickListener(v->launch(app));cell.setOnLongClickListener(v->{if(!drawer&&favorites.contains(app.key())){ClipData data=ClipData.newPlainText("mikan-favorite",app.key());v.startDragAndDrop(data,new View.DragShadowBuilder(v),app.key(),0);}else appOptions(app);return true;});
        if(!drawer)cell.setOnDragListener((v,event)->{if(event.getAction()==android.view.DragEvent.ACTION_DRAG_STARTED)return event.getLocalState() instanceof String;
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_ENTERED)v.setAlpha(.55f);
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_EXITED||event.getAction()==android.view.DragEvent.ACTION_DRAG_ENDED)v.setAlpha(1f);
            if(event.getAction()==android.view.DragEvent.ACTION_DROP){String from=(String)event.getLocalState();int target=favorites.indexOf(app.key()),old=favorites.indexOf(from);if(target>=0&&old>=0&&target!=old){favorites.remove(old);favorites.add(target,from);saveFavorites();handler.post(this::showHome);}return true;}return true;});
        return cell;
    }
    private void addGrid(LinearLayout parent,List<App> items,int columns){
        for(int i=0;i<items.size();i+=columns){LinearLayout row=horizontal();row.setGravity(Gravity.TOP);
            for(int j=0;j<columns;j++){View v=i+j<items.size()?tile(items.get(i+j),true):new View(this);row.addView(v,new LinearLayout.LayoutParams(0,-2,1));}parent.addView(row);}
    }
    private void showDrawer(){
        drawer=true;settings=false;createPage();
        LinearLayout bar=horizontal();bar.addView(action("‹ Home",()->{hideKeyboard();showHome();}));TextView title=text("  All apps",22,CREAM,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));page.addView(bar);gap(page,12);
        search=new EditText(this);search.setSingleLine(true);search.setTextColor(CREAM);search.setHintTextColor(MUTED);search.setTextSize(16);search.setHint("Search installed apps");search.setPadding(dp(18),dp(10),dp(18),dp(10));search.setBackground(shape(PANEL,20,true));page.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        gap(page,8);page.addView(text("Long-press for app options",12,MUTED,false));gap(page,10);
        ScrollView sc=new ScrollView(this);results=vertical();sc.addView(results);page.addView(sc,new LinearLayout.LayoutParams(-1,0,1));
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){renderResults(s.toString());}public void afterTextChanged(Editable s){}});
        page.setFocusableInTouchMode(true);page.requestFocus();renderResults("");
    }
    private void renderResults(String query){
        if(results==null)return;badgeViews.clear();results.removeAllViews();ArrayList<App> matches=new ArrayList<>();String q=query.trim().toLowerCase(Locale.ROOT);
        for(App a:apps)if(a.label.toLowerCase(Locale.ROOT).contains(q)||a.component.getPackageName().toLowerCase(Locale.ROOT).contains(q))matches.add(a);
        if(matches.isEmpty())results.addView(text("No matching apps.",16,MUTED,false));else addGrid(results,matches,prefs.getInt("columns",4));refreshExtras();
    }
    private void hideKeyboard(){if(search!=null){((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(search.getWindowToken(),0);search.clearFocus();}}

    private void showSettings(){
        drawer=false;settings=true;search=null;results=null;createPage();
        LinearLayout top=horizontal();top.addView(action("‹ Home",this::showHome));top.addView(text("  Settings",24,CREAM,true));page.addView(top);gap(page,16);
        ScrollView scroll=new ScrollView(this);LinearLayout body=vertical();scroll.addView(body);page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        body.addView(text("APPEARANCE",12,PEACH,true));gap(body,10);
        setting(body,"Wallpaper: "+(prefs.getString("wallpaper","reading-nook.webp").equals("reading-nook.webp")?"Reading nook":"Study nook"),()->new AlertDialog.Builder(this).setTitle("Wallpaper").setItems(new String[]{"Reading nook","Study nook"},(d,i)->{prefs.edit().putString("wallpaper",i==0?"reading-nook.webp":"study-nook.webp").apply();showSettings();}).show());
        setting(body,"Icons: "+(prefs.getBoolean("themed",true)?"Amber":"Original"),()->{prefs.edit().putBoolean("themed",!prefs.getBoolean("themed",true)).apply();showSettings();});
        setting(body,"Grid: "+prefs.getInt("columns",4)+" columns",()->chooseNumber("columns","Grid columns",new int[]{4,5}));
        setting(body,"Dock: "+prefs.getInt("dockCount",5)+" apps",()->chooseNumber("dockCount","Dock size",new int[]{3,4,5}));
        setting(body,"Favorites heading: "+(prefs.getBoolean("showFavoritesLabel",false)?"Shown":"Hidden"),()->{prefs.edit().putBoolean("showFavoritesLabel",!prefs.getBoolean("showFavoritesLabel",false)).apply();showSettings();});
        setting(body,"Floating dock: "+(prefs.getBoolean("floatingDock",true)?"On":"Off"),()->{prefs.edit().putBoolean("floatingDock",!prefs.getBoolean("floatingDock",true)).apply();showSettings();});
        setting(body,"Manage favorites",this::manageFavorites);
        setting(body,"Create app folder",this::createFolder);
        setting(body,"Manage folders",this::manageFolders);
        gap(body,18);body.addView(text("PAGES & WIDGETS",12,PEACH,true));gap(body,10);
        setting(body,"Minimum home pages: "+prefs.getInt("minPages",1),()->chooseNumber("minPages","Minimum home pages",new int[]{1,2,3,4,5}));
        widgetSetting(body,"Clock","clockPage",1);widgetSetting(body,"Mikan","mikanPage",1);widgetSetting(body,"Music","musicPage",1);
        widgetSetting(body,"Weather","weatherPage",1);widgetSetting(body,"Upcoming events","agendaPage",1);
        setting(body,"Widget layout: "+(prefs.getBoolean("pairWidgets",true)?"Side by side":"Stacked"),()->{prefs.edit().putBoolean("pairWidgets",!prefs.getBoolean("pairWidgets",true)).apply();showSettings();});
        gap(body,10);setting(body,"Weather city: "+dashboard.city(),dashboard::chooseCity);
        setting(body,"Weather units: "+(prefs.getBoolean("weatherF",true)?"°F":"°C"),()->{dashboard.toggleUnits();showSettings();});
        setting(body,"Refresh weather",dashboard::manualWeatherRefresh);
        setting(body,"Calendar access",dashboard::requestCalendar);
        setting(body,"Calendar titles: "+(prefs.getBoolean("agendaTitles",true)?"Shown":"Hidden"),()->{prefs.edit().putBoolean("agendaTitles",!prefs.getBoolean("agendaTitles",true)).apply();showSettings();});
        setting(body,"Notification dots: "+(prefs.getBoolean("badges",false)?"On":"Off"),()->{boolean on=!prefs.getBoolean("badges",false);prefs.edit().putBoolean("badges",on).apply();LauncherNotifications.refreshIfConnected();if(on&&!LauncherNotifications.allowed(this))notificationAccess();showSettings();});
        setting(body,"Notification / music access",this::notificationAccess);
        gap(body,18);body.addView(text("MIKAN",12,PEACH,true));gap(body,10);
        setting(body,"Choose portrait",this::pickPortrait);
        setting(body,"Choose character artwork (transparent PNG)",()->pickImage(74));
        setting(body,"Remove character artwork",()->new AlertDialog.Builder(this).setTitle("Return to portrait?").setNegativeButton("Cancel",null).setPositiveButton("Remove",(d,w)->{characterArt.reset();showSettings();}).show());
        setting(body,"Reset portrait",()->new AlertDialog.Builder(this).setTitle("Reset portrait?").setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,w)->{portraits.reset();showSettings();}).show());
        setting(body,"Mikan Web address",()->editMikanUrl(false));
        setting(body,"Check Mikan Web connection",this::checkMikanWeb);
        gap(body,18);body.addView(text("SYSTEM",12,PEACH,true));gap(body,10);
        setting(body,"Default home app",this::chooseHome);
        setting(body,"Check for launcher updates",()->updater.check());
        body.addView(text("Updates are optional. Home works offline.",13,MUTED,false));
    }
    private void setting(LinearLayout body,String label,Runnable callback){TextView b=action(label,callback);b.setGravity(Gravity.CENTER_VERTICAL);body.addView(b,new LinearLayout.LayoutParams(-1,dp(52)));gap(body,8);}
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
        if(!pinned){new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Pin to favorites","Add to folder"},(d,i)->{if(i==0)toggle(app);else addToFolder(app);}).show();return;}
        new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Unpin","Move to front of dock","Move earlier","Move later","Move to end of home","Move to next page","Move to previous page","Add to folder"},(d,i)->{
            if(i==7){addToFolder(app);return;}
            if(i==0){favorites.remove(app.key());saveFavorites();}
            else{int old=favorites.indexOf(app.key());int target=i==1?0:i==2?Math.max(0,old-1):i==3?Math.min(favorites.size()-1,old+1):i==5?Math.min(favorites.size()-1,old+prefs.getInt("columns",4)*2):i==6?Math.max(prefs.getInt("dockCount",5),old-prefs.getInt("columns",4)*2):favorites.size()-1;target=Math.max(0,Math.min(favorites.size()-1,target));favorites.remove(old);favorites.add(target,app.key());saveFavorites();}
            if(settings)showSettings();else if(drawer)renderResults(search.getText().toString());else showHome();
        }).show();
    }
    private Drawable themedIcon(App app){
        if(app.folderKey!=null)return folders.icon(this,app.folderKey,key->{App item=find(key);return item==null?null:themedIcon(item);});
        if(!prefs.getBoolean("themed",true))return app.icon;
        if(app.component.getPackageName().equals("dev.capnolithyl.mikan.pocket"))return new MikanMark(MikanMark.PAW,PEACH);
        String pkg=app.component.getPackageName();
        if(LauncherIcons.hasCustom(pkg)){Drawable.ConstantState cached=monoCache.get(app.key());if(cached!=null)return cached.newDrawable(getResources());Drawable custom=LauncherIcons.create(this,pkg,app.label,app.icon);if(custom.getConstantState()!=null)monoCache.put(app.key(),custom.getConstantState());return custom;}
        if(Build.VERSION.SDK_INT>=33&&app.icon instanceof AdaptiveIconDrawable){
            Drawable mono=((AdaptiveIconDrawable)app.icon).getMonochrome();
            if(mono!=null){Drawable.ConstantState cached=monoCache.get(app.key());if(cached!=null)return cached.newDrawable(getResources());Drawable d=LauncherIcons.normalizedMonochrome(this,mono,PEACH);if(d!=null){if(d.getConstantState()!=null)monoCache.put(app.key(),d.getConstantState());return d;}}
        }
        return LauncherIcons.create(this,app.component.getPackageName(),app.label,app.icon);
    }
    private boolean canPair(){return prefs.getBoolean("pairWidgets",true)&&getResources().getConfiguration().screenWidthDp>=350&&getResources().getConfiguration().fontScale<=1.2f;}
    private void addWidgetRow(LinearLayout body,View left,View right,boolean pair){
        if(left==null&&right==null)return;
        if(pair&&left!=null&&right!=null){LinearLayout row=horizontal();row.setGravity(Gravity.CENTER_VERTICAL);row.setBaselineAligned(false);boolean equal=music!=null&&left==music.view();int height=equal?-1:-2;row.addView(left,new LinearLayout.LayoutParams(0,height,1));LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(0,height,1);rp.leftMargin=dp(8);row.addView(right,rp);body.addView(row,new LinearLayout.LayoutParams(-1,-2));}
        else{if(left!=null)body.addView(left,new LinearLayout.LayoutParams(-1,-2));if(left!=null&&right!=null)gap(body,8);if(right!=null)body.addView(right,new LinearLayout.LayoutParams(-1,-2));}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==DashboardCards.CALENDAR_REQUEST&&dashboard!=null){dashboard.calendarPermissionChanged();if(!settings&&!drawer)showHome();}}
    private void pickPortrait(){pickImage(73);}
    private void pickImage(int request){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        try{startActivityForResult(i,request);}catch(Exception e){Toast.makeText(this,"No image picker available.",Toast.LENGTH_SHORT).show();}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==75){if(result==RESULT_OK&&data!=null){ArrayList<String> words=data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);if(words!=null&&!words.isEmpty())webSearchDialog(words.get(0));}return;}
        if((request!=73&&request!=74)||result!=RESULT_OK||data==null||data.getData()==null)return;
        final android.net.Uri uri=data.getData();
        new Thread(()->{
            boolean ok=(request==74?characterArt:portraits).importImage(uri);
            runOnUiThread(()->{
                if(isFinishing()||isDestroyed())return;
                Toast.makeText(this,ok?"Mikan artwork saved locally ♡":"Could not read this image.",Toast.LENGTH_SHORT).show();
                if(settings)showSettings();else if(!drawer)showHome();
            });
        },"mikan-portrait-import").start();
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
                if(!settings&&!drawer&&mikanCard!=null)mikanCard.setStatus(status);
            });
        },"mikan-web-check").start();
    }
    private void openMikan(){
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
                prefs.edit().putString("mikanWebUrl",value).apply();checkedWebUrl="";webStatus="";dialog.dismiss();if(openAfter)openMikan();
            }catch(Exception e){field.setError("Enter a valid HTTPS web address.");}
        }));dialog.show();
    }

    private boolean widgetHere(String key,int def){return prefs.getInt(key,def)==homePage+1;}
    private int pageCount(){
        int count=0;for(String key:favorites)if(find(key)!=null)count++;
        int cap=prefs.getInt("columns",4)*2,dock=prefs.getInt("dockCount",5);
        int pages=Math.max(prefs.getInt("minPages",1),(Math.max(0,count-dock)+cap-1)/cap);
        for(String key:new String[]{"clockPage","mikanPage","musicPage","weatherPage","agendaPage"})pages=Math.max(pages,prefs.getInt(key,1));
        return Math.max(1,pages);
    }
    private void changePage(int delta){int next=Math.max(0,Math.min(pageCount()-1,homePage+delta));if(next!=homePage){homePage=next;showHome();}}
    private void widgetSetting(LinearLayout body,String label,String key,int def){
        int p=prefs.getInt(key,def);setting(body,label+": "+(p==0?"Hidden":"Page "+p),()->{
            int count=Math.max(5,pageCount());String[] options=new String[count+1];options[0]="Hidden";for(int i=1;i<=count;i++)options[i]="Page "+i;
            new AlertDialog.Builder(this).setTitle(label+" placement").setItems(options,(d,i)->{prefs.edit().putInt(key,i).apply();showSettings();}).show();
        });
    }
    private void notificationAccess(){
        new AlertDialog.Builder(this).setTitle("Notification access").setMessage("Android grants broad notification access. Mikan Launcher uses only app identifiers for dots and active media sessions for playback controls. Nothing is sent to Mikan Web or stored. You can revoke access at any time.").setNegativeButton("Cancel",null).setPositiveButton("Open Android settings",(d,w)->{
            try{startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));}catch(Exception e){Toast.makeText(this,"Open Android notification access settings.",Toast.LENGTH_LONG).show();}
        }).show();
    }
    private void refreshExtras(){
        boolean enabled=prefs.getBoolean("badges",false)&&LauncherNotifications.allowed(this);
        for(Map.Entry<TextView,String> e:badgeViews.entrySet()){
            boolean show=false;
            if(enabled){App a=find(e.getValue());if(a!=null){if(a.folderKey!=null){for(String k:folders.members(a.folderKey)){App child=find(k);if(child!=null&&child.component!=null&&LauncherNotifications.has(child.component.getPackageName())){show=true;break;}}}else show=LauncherNotifications.has(a.component.getPackageName());}}
            e.getKey().setVisibility(show?View.VISIBLE:View.GONE);
        }
        if(music!=null)music.refresh();
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
    private void refreshScreen(){if(settings)showSettings();else if(drawer&&search!=null)renderResults(search.getText().toString());else showHome();}
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
        String[] names=new String[members.size()];for(int i=0;i<names.length;i++)names[i]=members.get(i).label;
        new AlertDialog.Builder(this).setTitle(folders.name(id)).setItems(names,(d,i)->launch(members.get(i))).setNeutralButton("Edit",(d,w)->folderOptions(id)).setNegativeButton("Close",null).show();
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
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){touchX=event.getX();touchY=event.getY();seekGesture=music!=null&&music.isSeekTouch(event.getRawX(),event.getRawY());}
        if(!seekGesture&&!drawer&&!settings&&event.getActionMasked()==MotionEvent.ACTION_UP&&Math.abs(event.getX()-touchX)>dp(90)&&Math.abs(event.getY()-touchY)<dp(55)){MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();changePage(event.getX()<touchX?1:-1);return true;}
        if(!seekGesture&&!drawer&&!settings&&event.getActionMasked()==MotionEvent.ACTION_UP&&root!=null&&touchY>root.getHeight()-dp(180)&&touchY-event.getY()>dp(70)&&Math.abs(event.getX()-touchX)<dp(90)){
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();showDrawer();return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
