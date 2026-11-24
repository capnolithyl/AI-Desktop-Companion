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
    private final ArrayList<String> favorites=new ArrayList<>();
    private SharedPreferences prefs;
    private FrameLayout root;
    private LinearLayout page, results;
    private TextView clock, date, greeting;
    private EditText search;
    private boolean drawer=false;
    private boolean settings=false;
    private LauncherUpdater updater;
    private float touchX,touchY;
    private final Runnable tick=new Runnable(){ public void run(){ updateClock(); handler.postDelayed(this,15000); } };
    private static final class App {
        final ComponentName component; final String label; final Drawable icon;
        App(ComponentName component,String label,Drawable icon){this.component=component;this.label=label;this.icon=icon;}
        String key(){return component.flattenToString();}
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(0);
        prefs=getSharedPreferences("launcher",MODE_PRIVATE);
        updater=new LauncherUpdater(this);
        loadApps();
        restoreFavorites();
        showHome();
    }
    @Override protected void onResume(){
        super.onResume(); loadApps();
        if(settings) showSettings(); else if(drawer && search!=null) renderResults(search.getText().toString()); else showHome();
        handler.removeCallbacks(tick); handler.post(tick);
    }
    @Override protected void onPause(){handler.removeCallbacks(tick);super.onPause();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);hideKeyboard();showHome();}
    @Override public void onBackPressed(){if(drawer||settings){hideKeyboard();showHome();}}
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius,boolean border){
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border)d.setStroke(dp(1),BORDER);return d;
    }
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout horizontal(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private TextView text(String value,int size,int color,boolean bold){
        TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private void gap(LinearLayout parent,int size){View v=new View(this);parent.addView(v,new LinearLayout.LayoutParams(1,dp(size)));}
    private Drawable asset(String name){try(java.io.InputStream in=getAssets().open(name)){return Drawable.createFromStream(in,name);}catch(Exception e){return null;}}
    private void createPage(){
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
        apps.clear();
        Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for(ResolveInfo r:getPackageManager().queryIntentActivities(intent,0)){
            if(r.activityInfo==null||r.activityInfo.packageName.equals(getPackageName()))continue;
            ComponentName c=new ComponentName(r.activityInfo.packageName,r.activityInfo.name);
            String name=r.loadLabel(getPackageManager()).toString();
            apps.add(new App(c,name,r.loadIcon(getPackageManager())));
        }
        apps.sort(Comparator.comparing((App a)->a.label,String.CASE_INSENSITIVE_ORDER).thenComparing(App::key));
    }
    private App find(String key){for(App a:apps)if(a.key().equals(key))return a;return null;}
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
        try{hideKeyboard();Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(app.component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(intent);}
        catch(Exception e){Toast.makeText(this,"Unable to open "+app.label,Toast.LENGTH_SHORT).show();loadApps();if(drawer)renderResults(search.getText().toString());else showHome();}
    }
    private TextView action(String label,Runnable run){
        TextView b=text(label,14,PEACH,true);b.setGravity(Gravity.CENTER);b.setPadding(dp(12),dp(10),dp(12),dp(10));b.setBackground(shape(PANEL,20,true));b.setMinHeight(dp(48));b.setOnClickListener(v->run.run());return b;
    }
    private void showHome(){
        drawer=false;settings=false;search=null;results=null;createPage();
        LinearLayout header=horizontal();
        TextView brand=text("MIKAN OS  ♡",13,PEACH,true);
        header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        header.addView(action("⚙",this::showSettings));page.addView(header);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(false);
        page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout body=vertical();scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        gap(body,16);
        clock=text("",48,CREAM,false);body.addView(clock);
        date=text("",16,MUTED,false);body.addView(date);gap(body,20);
        LinearLayout card=horizontal();card.setPadding(dp(12),dp(12),dp(14),dp(12));card.setBackground(shape(PANEL,26,true));
        ImageView portrait=new ImageView(this);portrait.setImageDrawable(asset("mikan-chat-avatar.webp"));portrait.setScaleType(ImageView.ScaleType.CENTER_CROP);portrait.setBackground(shape(0xff50332b,24,false));portrait.setClipToOutline(true);
        card.addView(portrait,new LinearLayout.LayoutParams(dp(108),dp(132)));
        LinearLayout copy=vertical();copy.setPadding(dp(14),0,0,0);card.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        copy.addView(text("Mikan ♡",20,PEACH,true));gap(copy,8);
        greeting=text("",19,CREAM,true);copy.addView(greeting);gap(copy,7);
        copy.addView(text("Your cozy little corner.",13,MUTED,false));gap(copy,10);
        copy.addView(text("●  Local mode",12,PEACH,false));body.addView(card);gap(body,22);
        body.addView(text("YOUR FAVORITES",12,MUTED,true));gap(body,8);
        ArrayList<App> pinned=new ArrayList<>();for(String key:favorites){App a=find(key);if(a!=null)pinned.add(a);}
        int dockCount=prefs.getInt("dockCount",5);
        if(pinned.size()<=dockCount)body.addView(text("Long-press apps in the drawer to add favorites.",14,MUTED,false));
        else addGrid(body,pinned.subList(dockCount,pinned.size()),prefs.getInt("columns",4));
        gap(body,12);
        LinearLayout dock=horizontal();dock.setPadding(dp(4),dp(8),dp(4),dp(8));dock.setBackground(shape(PANEL,28,true));
        for(int i=0;i<dockCount;i++){if(i<pinned.size())dock.addView(tile(pinned.get(i),false),new LinearLayout.LayoutParams(0,-2,1));else{View blank=new View(this);dock.addView(blank,new LinearLayout.LayoutParams(0,dp(60),1));}}
        page.addView(dock);gap(page,10);
        TextView drawerButton=action("⌕   Search apps  ·  Swipe up",this::showDrawer);page.addView(drawerButton,new LinearLayout.LayoutParams(-1,dp(52)));
        updateClock();
    }
    private void updateClock(){
        if(drawer||settings||clock==null||date==null||greeting==null)return;
        Date now=new Date();clock.setText(android.text.format.DateFormat.getTimeFormat(this).format(now));
        date.setText(DateFormat.getDateInstance(DateFormat.FULL).format(now));
        int hour=Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        greeting.setText(hour<5?"Still awake? ♡":hour<12?"Good morning ♡":hour<18?"Good afternoon ♡":"Good evening ♡");
    }
    private View tile(App app,boolean label){
        LinearLayout cell=vertical();cell.setGravity(Gravity.CENTER);cell.setPadding(dp(3),dp(6),dp(3),dp(6));
        ImageView icon=new ImageView(this);icon.setImageDrawable(themedIcon(app));icon.setScaleType(ImageView.ScaleType.FIT_CENTER);icon.setPadding(dp(7),dp(7),dp(7),dp(7));icon.setBackground(shape(0xff50332b,18,true));
        cell.addView(icon,new LinearLayout.LayoutParams(dp(50),dp(50)));
        if(label){TextView name=text(app.label,11,CREAM,false);name.setGravity(Gravity.CENTER);name.setMaxLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(32));p.topMargin=dp(4);cell.addView(name,p);}
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
        if(results==null)return;results.removeAllViews();ArrayList<App> matches=new ArrayList<>();String q=query.trim().toLowerCase(Locale.ROOT);
        for(App a:apps)if(a.label.toLowerCase(Locale.ROOT).contains(q)||a.component.getPackageName().toLowerCase(Locale.ROOT).contains(q))matches.add(a);
        if(matches.isEmpty())results.addView(text("No matching apps.",16,MUTED,false));else addGrid(results,matches,prefs.getInt("columns",4));
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
        setting(body,"Manage favorites",this::manageFavorites);
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
        boolean pinned=favorites.contains(app.key());
        if(!pinned){new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Pin to favorites"},(d,i)->toggle(app)).show();return;}
        new AlertDialog.Builder(this).setTitle(app.label).setItems(new String[]{"Unpin","Move to front of dock","Move earlier","Move later","Move to end of home"},(d,i)->{
            if(i==0){favorites.remove(app.key());saveFavorites();}
            else{int old=favorites.indexOf(app.key());int target=i==1?0:i==2?Math.max(0,old-1):i==3?Math.min(favorites.size()-1,old+1):favorites.size()-1;favorites.remove(old);favorites.add(target,app.key());saveFavorites();}
            if(settings)showSettings();else if(drawer)renderResults(search.getText().toString());else showHome();
        }).show();
    }
    private Drawable themedIcon(App app){
        if(!prefs.getBoolean("themed",true))return app.icon;
        if(app.component.getPackageName().equals("dev.capnolithyl.mikan.pocket"))return getDrawable(dev.capnolithyl.mikan.launcher.R.drawable.mikan_icon);
        if(Build.VERSION.SDK_INT>=33&&app.icon instanceof AdaptiveIconDrawable){
            Drawable mono=((AdaptiveIconDrawable)app.icon).getMonochrome();
            if(mono!=null){Drawable d=mono.getConstantState()==null?mono:mono.getConstantState().newDrawable();d=d.mutate();d.setTint(PEACH);return d;}
        }
        return LauncherIcons.create(this,app.component.getPackageName(),app.label,app.icon);
    }
    private void chooseHome(){
        try{
            if(Build.VERSION.SDK_INT>=29){RoleManager role=getSystemService(RoleManager.class);if(role!=null&&role.isRoleAvailable(RoleManager.ROLE_HOME)&&!role.isRoleHeld(RoleManager.ROLE_HOME)){startActivityForResult(role.createRequestRoleIntent(RoleManager.ROLE_HOME),1);return;}}
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        }catch(Exception e){new AlertDialog.Builder(this).setMessage("Open Android Settings → Apps → Default apps → Home app.").setPositiveButton("OK",null).show();}
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){touchX=event.getX();touchY=event.getY();}
        if(!drawer&&!settings&&event.getActionMasked()==MotionEvent.ACTION_UP&&root!=null&&touchY>root.getHeight()-dp(180)&&touchY-event.getY()>dp(70)&&Math.abs(event.getX()-touchX)<dp(90)){
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();showDrawer();return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
