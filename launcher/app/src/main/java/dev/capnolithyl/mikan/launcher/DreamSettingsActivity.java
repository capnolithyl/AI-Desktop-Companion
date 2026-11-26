package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Accessible from Android's screensaver Customize button and launcher settings. */
public final class DreamSettingsActivity extends Activity {
    private SharedPreferences prefs;
    private DreamView preview;
    private LinearLayout body;
    private SettingsHub ui;
    private int previewHour=-1;
    private boolean landscapePreview=false,importing=false;
    private android.app.Dialog fullPreview;
    private DreamView fullScene;
    private final java.util.concurrent.ExecutorService worker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private static final int PICK_PACK=173;
    private DreamArtPack pack;
    private final String[] artModes={"Automatic by time of day","Always sleepy","Always daytime","Random by time period"};
    private final String[] styles={"Cozy Mikan","Minimal clock","Deep sleep"};
    private final String[] sizes={"Compact","Large","Extra large"};
    static void openSystemSettings(Activity a){
        try{a.startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS));}
        catch(RuntimeException ex){Toast.makeText(a,"Open Android Settings > Display & touch > Screen saver.",Toast.LENGTH_LONG).show();}
    }
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    @Override protected void onCreate(Bundle saved){
        super.onCreate(saved);prefs=getSharedPreferences("launcher",MODE_PRIVATE);ui=new SettingsHub(this);pack=new DreamArtPack(this);
        if(saved!=null){previewHour=saved.getInt("hour",-1);landscapePreview=saved.getBoolean("landscape");}
        render();
    }
    private void render(){
        if(preview!=null)preview.release();
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(0xff191417);scroll.setFillViewport(true);
        body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(12),dp(16),dp(16));scroll.addView(body);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        setContentView(scroll);
        TextView title=new TextView(this);title.setText("Mikan Dream Mode");title.setTextSize(25);title.setTextColor(0xffffe9d5);body.addView(title);
        ui.note(body,"A little companion while your phone recharges. Touch the actual screensaver to exit normally.");
        ui.row(body,"Preview time",previewHour<0?"Current time":DreamRules.period(previewHour).name().toLowerCase(java.util.Locale.ROOT),()->new AlertDialog.Builder(this).setTitle("Preview artwork").setItems(new String[]{"Current time","Morning","Day","Evening","Night"},(d,i)->{previewHour=new int[]{-1,8,13,19,23}[i];render();}).show());
        ui.row(body,"Preview orientation",landscapePreview?"Landscape":"Portrait",()->{landscapePreview=!landscapePreview;render();});
        preview=new DreamView(this,prefs);preview.previewAspect(aspect());
        int available=Math.max(dp(100),getResources().getDisplayMetrics().widthPixels-dp(48));
        int height=Math.min(dp(340),Math.round(available/aspect()));int width=Math.round(height*aspect());
        LinearLayout.LayoutParams previewParams=new LinearLayout.LayoutParams(width,height);previewParams.gravity=android.view.Gravity.CENTER_HORIZONTAL;body.addView(preview,previewParams);preview.refresh(previewHour);
        ui.row(body,"Fullscreen preview","No charger needed · tap to close",this::fullscreen);
        ui.heading(body,"APPEARANCE");
        choose("Display style","dreamStyle",styles,0);
        choose("Artwork","dreamArtMode",artModes,0);
        choose("Clock size","dreamClockSize",sizes,1);
        choose("Artwork size","dreamArtworkSize",new String[]{"Compact","Large","Extra large"},1);
        ui.heading(body,"BACKGROUND");
        choose("Background style","dreamBackground",new String[]{"Pure black","Warm gradient","Blurred artwork","Blurred artwork + warm tint"},DreamRules.TINTED);
        choose("Blend strength","dreamBlend",new String[]{"Subtle","Medium","Strong"},1);
        ui.note(body,"Cozy Mikan blends the portrait edges into a time-aware amber, cocoa or mocha backdrop. Minimal clock and Deep sleep remain black; Pure black retains the original portrait treatment. Night backgrounds are deliberately darker.");
        ui.heading(body,"AMBIENT ANIMATION");
        choose("Animation intensity","dreamMotion",new String[]{"Off","Subtle","Full"},DreamRules.MOTION_SUBTLE);
        ui.note(body,"Full now makes brighter, larger effects travel farther across the artwork and its margins. Open Fullscreen preview to see motion. Minimal clock and Deep sleep stay still.");
        ui.note(body,android.animation.ValueAnimator.areAnimatorsEnabled()?"Android animations: enabled.":"Android animations: disabled. Dream effects respect this system setting. Check Android Accessibility > Color and motion > Remove animations, or Battery Saver.");
        ui.heading(body,"ARTWORK PACK");
        ui.row(body,"Import Dream artwork ZIP",importing?"Importing…":pack.installed()?"Custom pack installed · replace all four images":"Select one ZIP containing morning, day, evening and night",this::pickPack);
        if(pack.installed())ui.row(body,"Remove imported pack","Restore bundled artwork",()->new AlertDialog.Builder(this).setTitle("Remove Dream artwork?").setMessage("Only removes the imported copy. Your original ZIP is untouched.").setNegativeButton("Cancel",null).setPositiveButton("Remove",(d,i)->{if(importing)return;if(pack.remove()){render();}else Toast.makeText(this,"Could not remove pack.",Toast.LENGTH_SHORT).show();}).show());
        ui.note(body,"Holiday artwork takes precedence in automatic mode. Turn it off to preview your normal time-of-day images today. Imported art stays on this device, outside layout backups.");
        ui.toggle(body,"Holiday artwork","Automatic daytime art can celebrate holidays; nights stay sleepy",prefs.getBoolean("dreamHoliday",true),v->{prefs.edit().putBoolean("dreamHoliday",v).apply();preview.refresh(previewHour);});
        ui.toggle(body,"Battery information","Percentage and actual charging status",prefs.getBoolean("dreamBattery",true),v->{prefs.edit().putBoolean("dreamBattery",v).apply();preview.refresh(previewHour);});
        ui.toggle(body,"Pixel shifting","Reduces fixed-pixel exposure, but cannot prevent OLED burn-in",prefs.getBoolean("dreamShift",true),v->{prefs.edit().putBoolean("dreamShift",v).apply();preview.refresh(previewHour);});
        ui.note(body,"Automatic artwork: morning 6–11, day 11–17, evening 17–22, night 22–6. System clock format. Screen is dimmed at night or in Deep sleep; Android may apply additional dimming or replace the dream in low light.");
        ui.heading(body,"ACTIVATION");
        ui.row(body,"Android screen saver settings","Select Mikan Dream and choose While charging",()->openSystemSettings(this));
        ui.row(body,"Done","Return to previous screen",this::finish);
    }
    private float aspect(){
        android.util.DisplayMetrics metrics=new android.util.DisplayMetrics();getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        float portrait=(float)Math.min(metrics.widthPixels,metrics.heightPixels)/Math.max(1,Math.max(metrics.widthPixels,metrics.heightPixels));
        return landscapePreview?1f/portrait:portrait;
    }
    private void fullscreen(){
        if(fullPreview!=null)return;
        android.app.Dialog dialog=new android.app.Dialog(this,android.R.style.Theme_Material_NoActionBar_Fullscreen);
        fullPreview=dialog;fullScene=new DreamView(this,prefs);fullScene.previewAspect(aspect());fullScene.refresh(previewHour);
        fullScene.setOnClickListener(view->dialog.dismiss());dialog.setContentView(fullScene);
        dialog.setOnDismissListener(d->{if(fullScene!=null)fullScene.release();fullScene=null;fullPreview=null;});
        dialog.show();fullScene.setMotionActive(true);android.view.Window window=dialog.getWindow();
        if(window!=null){window.setLayout(-1,-1);window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);}
    }
    private void pickPack(){
        if(importing)return;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
        try{startActivityForResult(intent,PICK_PACK);}catch(RuntimeException ex){Toast.makeText(this,"No Android file picker available.",Toast.LENGTH_SHORT).show();}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=PICK_PACK||result!=RESULT_OK||data==null||data.getData()==null||importing)return;
        android.net.Uri uri=data.getData();importing=true;render();
        worker.execute(()->{
            String error=null;
            try{pack.install(uri);}catch(Exception ex){error="Invalid Dream ZIP. Expected four WebP files named morning, day, evening and night.";}
            final String message=error;
            runOnUiThread(()->{importing=false;if(isDestroyed()||isFinishing())return;render();Toast.makeText(this,message==null?"Dream artwork installed ♡":message,Toast.LENGTH_LONG).show();});
        });
    }
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);state.putInt("hour",previewHour);state.putBoolean("landscape",landscapePreview);}
    private void choose(String title,String key,String[] items,int fallback){
        int index=Math.max(0,Math.min(items.length-1,prefs.getInt(key,fallback)));
        ui.row(body,title,items[index],()->new AlertDialog.Builder(this).setTitle(title).setSingleChoiceItems(items,index,(dialog,i)->{prefs.edit().putInt(key,i).apply();dialog.dismiss();render();}).setNegativeButton("Cancel",null).show());
    }
    @Override protected void onResume(){super.onResume();if(preview!=null)preview.refresh(previewHour);if(fullScene!=null){fullScene.refresh(previewHour);fullScene.setMotionActive(true);}}
    @Override protected void onPause(){if(fullScene!=null)fullScene.setMotionActive(false);super.onPause();}
    @Override protected void onDestroy(){if(fullPreview!=null)fullPreview.dismiss();if(preview!=null)preview.release();worker.shutdown();super.onDestroy();}
}
