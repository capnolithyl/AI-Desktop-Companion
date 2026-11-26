package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Set;

/** The daily briefing shares dashboard snapshots; no independent worker or NAS call. */
final class BriefingPanel {
    private static final int CREAM=0xffffe9d5,PEACH=0xffffbf88,MUTED=0xffe1bda9;
    private final Activity activity;
    private final SharedPreferences prefs;
    private final DashboardCards dashboard;
    private final TaskPanel tasks;
    private final Runnable notificationAccess;
    private TextView date,greeting,weather,calendar,taskText,notifications,encouragement;
    BriefingPanel(Activity activity,SharedPreferences prefs,DashboardCards dashboard,TaskPanel tasks,Runnable notificationAccess){
        this.activity=activity;this.prefs=prefs;this.dashboard=dashboard;this.tasks=tasks;this.notificationAccess=notificationAccess;
    }
    void detach(){date=greeting=weather=calendar=taskText=notifications=encouragement=null;}
    View view(){
        LinearLayout card=vertical();card.setPadding(dp(14),dp(12),dp(14),dp(12));card.setBackground(MikanTheme.panel(activity,23));
        LinearLayout header=new LinearLayout(activity);header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout title=vertical();title.addView(text("MIKAN'S DAILY BRIEFING",11,PEACH,true));date=text("",13,MUTED,false);title.addView(date);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        ImageView paw=new ImageView(activity);paw.setImageDrawable(new MikanMark(MikanMark.PAW,PEACH));header.addView(paw,new LinearLayout.LayoutParams(dp(28),dp(28)));card.addView(header);
        greeting=text("",18,CREAM,true);greeting.setPadding(0,dp(10),0,dp(10));card.addView(greeting);
        weather=row(card,MikanMark.WEATHER,"Weather",dashboard::openBriefingWeather);
        calendar=row(card,MikanMark.CALENDAR,"Calendar",dashboard::openBriefingCalendar);
        taskText=row(card,MikanMark.WIDGET,"Tasks",tasks::manage);
        notifications=row(card,MikanMark.SPARK,"Notifications",()->{
            if(prefs.getBoolean("briefingNotify",true)&&!LauncherNotifications.allowed(activity))notificationAccess.run();
            else if(prefs.getBoolean("briefingNotify",true))new android.app.AlertDialog.Builder(activity).setTitle("Notifications")
                .setMessage("Apps with active notifications only. Open your notification shade to see their contents.").setPositiveButton("Close",null).show();
        });
        encouragement=text("",12,PEACH,false);encouragement.setPadding(0,dp(12),0,0);card.addView(encouragement);
        dashboard.showBriefing();if(LauncherNotifications.allowed(activity)&&LauncherNotifications.briefingEnabled(prefs))LauncherNotifications.refreshIfConnected();
        refresh();return card;
    }
    private int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout vertical(){LinearLayout l=new LinearLayout(activity);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private TextView text(String value,int size,int color,boolean bold){TextView v=new TextView(activity);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;}
    private TextView row(LinearLayout card,int glyph,String name,Runnable click){
        LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(48));row.setPadding(dp(3),dp(7),dp(3),dp(7));row.setBackground(MikanTheme.ripple(activity,12));row.setFocusable(true);row.setOnClickListener(v->click.run());
        ImageView icon=new ImageView(activity);icon.setImageDrawable(new MikanMark(glyph,PEACH));icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);row.addView(icon,new LinearLayout.LayoutParams(dp(21),dp(21)));
        LinearLayout copy=vertical();copy.setPadding(dp(9),0,0,0);copy.addView(text(name,11,PEACH,true));TextView value=text("",13,CREAM,false);value.setPadding(0,dp(3),0,0);copy.addView(value);row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));card.addView(row);return value;
    }
    private void set(TextView view,String value){if(!value.contentEquals(view.getText()))view.setText(value);}
    void refresh(){
        if(date==null)return;
        LocalDate today=LocalDate.now();
        BriefingRules.TaskSummary summary=tasks.summary(today);
        set(date,today.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)));
        set(greeting,BriefingRules.greeting(LocalTime.now().getHour()));
        set(weather,dashboard.briefingWeather());set(calendar,dashboard.briefingCalendar());set(taskText,summary.label());set(encouragement,BriefingRules.encouragement(summary));
        refreshNotifications();
    }
    void refreshNotifications(){
        if(notifications==null)return;
        if(!prefs.getBoolean("briefingNotify",true)){set(notifications,"Overview disabled");return;}
        if(!LauncherNotifications.allowed(activity)){set(notifications,"Tap to enable notification access");return;}
        if(!LauncherNotifications.ready()){set(notifications,"Notification overview unavailable");return;}
        Set<String> packages=LauncherNotifications.snapshot();int count=packages.size();
        set(notifications,count==0?"No active app notifications ♡":count+(count==1?" app has":" apps have")+" notifications"+(packages.contains("com.openai.chatgpt")?" · including ChatGPT":""));
    }
}
