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
    private final String[] artModes={"Automatic by time of day","Always sleepy","Always daytime","Random by time period"};
    private final String[] styles={"Cozy Mikan","Minimal clock","Deep sleep"};
    private final String[] sizes={"Compact","Large","Extra large"};
    static void openSystemSettings(Activity a){
        try{a.startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS));}
        catch(RuntimeException ex){Toast.makeText(a,"Open Android Settings > Display & touch > Screen saver.",Toast.LENGTH_LONG).show();}
    }
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    @Override protected void onCreate(Bundle saved){
        super.onCreate(saved);prefs=getSharedPreferences("launcher",MODE_PRIVATE);ui=new SettingsHub(this);render();
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
        preview=new DreamView(this,prefs);body.addView(preview,new LinearLayout.LayoutParams(-1,dp(300)));preview.refresh(previewHour);
        ui.heading(body,"APPEARANCE");
        choose("Display style","dreamStyle",styles,0);
        choose("Artwork","dreamArtMode",artModes,0);
        choose("Clock size","dreamClockSize",sizes,1);
        ui.toggle(body,"Holiday artwork","Automatic daytime art can celebrate holidays; nights stay sleepy",prefs.getBoolean("dreamHoliday",true),v->{prefs.edit().putBoolean("dreamHoliday",v).apply();preview.refresh(previewHour);});
        ui.toggle(body,"Battery information","Percentage and actual charging status",prefs.getBoolean("dreamBattery",true),v->{prefs.edit().putBoolean("dreamBattery",v).apply();preview.refresh(previewHour);});
        ui.toggle(body,"Pixel shifting","Reduces fixed-pixel exposure, but cannot prevent OLED burn-in",prefs.getBoolean("dreamShift",true),v->{prefs.edit().putBoolean("dreamShift",v).apply();preview.refresh(previewHour);});
        ui.note(body,"Automatic artwork: morning 6–11, day 11–17, evening 17–22, night 22–6. System clock format. Screen is dimmed at night or in Deep sleep; Android may apply additional dimming or replace the dream in low light.");
        ui.heading(body,"ACTIVATION");
        ui.row(body,"Android screen saver settings","Select Mikan Dream and choose While charging",()->openSystemSettings(this));
        ui.row(body,"Done","Return to previous screen",this::finish);
    }
    private void choose(String title,String key,String[] items,int fallback){
        int index=Math.max(0,Math.min(items.length-1,prefs.getInt(key,fallback)));
        ui.row(body,title,items[index],()->new AlertDialog.Builder(this).setTitle(title).setSingleChoiceItems(items,index,(dialog,i)->{prefs.edit().putInt(key,i).apply();dialog.dismiss();render();}).setNegativeButton("Cancel",null).show());
    }
    @Override protected void onResume(){super.onResume();if(preview!=null)preview.refresh(previewHour);}
    @Override protected void onDestroy(){if(preview!=null)preview.release();super.onDestroy();}
}
