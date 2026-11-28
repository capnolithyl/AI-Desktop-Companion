package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

/** Settings navigation and reusable themed presentation; preferences stay in HomeActivity. */
final class SettingsHub {
    private static final int PEACH=0xffffbf88,CREAM=0xffffe9d5,MUTED=0xffe1bda9;
    enum Section {
        HUB("Settings","Make Mikan OS your own",MikanMark.GEAR),
        APPEARANCE("Appearance","Wallpapers and app icons",MikanMark.PALETTE),
        LOCK("Lockscreen","Separate Android lockscreen wallpaper",MikanMark.SHIELD),
        DREAM("Dream Mode","Charging screensaver and time-aware artwork",MikanMark.SPARK),
        HOME("Home screen","Grid, dock, pages and folders",MikanMark.GRID),
        WIDGETS("Widgets","Placement and dashboard layout",MikanMark.WIDGET),
        WEATHER("Weather & calendar","Forecasts and upcoming events",MikanMark.WEATHER),
        MIKAN("Mikan","Character artwork and web connection",MikanMark.CAT),
        ACCESS("Permissions & privacy","Notifications, media and calendar",MikanMark.SHIELD),
        SYSTEM("System & updates","Default launcher and software updates",MikanMark.DOWNLOAD);
        final String title,description;final int icon;
        Section(String title,String description,int icon){this.title=title;this.description=description;this.icon=icon;}
    }
    private final Activity activity;
    SettingsHub(Activity activity){this.activity=activity;}
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout column(){LinearLayout l=new LinearLayout(activity);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout line(){LinearLayout l=new LinearLayout(activity);l.setOrientation(LinearLayout.HORIZONTAL);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private TextView text(String s,int size,int color,boolean medium){TextView t=new TextView(activity);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);t.setTypeface(Typeface.create(medium?"sans-serif-medium":"sans-serif",Typeface.NORMAL));return t;}
    private void gap(LinearLayout l,int n){l.addView(new View(activity),new LinearLayout.LayoutParams(1,dp(n)));}
    private GradientDrawable shape(int color,int radius,int stroke){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(stroke!=0)d.setStroke(dp(1),stroke);return d;}
    private ImageView icon(int kind){ImageView i=new ImageView(activity);i.setImageDrawable(new MikanMark(kind,PEACH));i.setScaleType(ImageView.ScaleType.FIT_CENTER);i.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return i;}
    private void clickable(View view,Runnable action){view.setForeground(MikanTheme.ripple(activity,18));view.setFocusable(true);view.setOnClickListener(v->action.run());}
    private void addCard(LinearLayout body,View card){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(8);body.addView(card,lp);}
    private LinearLayout card(){LinearLayout l=line();l.setMinimumHeight(dp(58));l.setPadding(dp(14),dp(12),dp(14),dp(12));l.setBackground(MikanTheme.panel(activity,18));return l;}
    private LinearLayout copy(String title,String subtitle){LinearLayout l=column();l.addView(text(title,16,CREAM,true));if(!subtitle.isEmpty()){gap(l,4);l.addView(text(subtitle,12,MUTED,false));}return l;}
    LinearLayout render(LinearLayout page,Section section,Runnable back,Consumer<Section> navigate){
        LinearLayout header=line();header.setPadding(0,dp(3),0,dp(8));
        TextView b=text("‹",32,PEACH,false);b.setGravity(Gravity.CENTER);b.setContentDescription(section==Section.HUB?"Back to home":"Back to settings");b.setBackground(shape(0x554b342c,17,0x557e563d));clickable(b,back);header.addView(b,new LinearLayout.LayoutParams(dp(46),dp(46)));
        LinearLayout title=copy(section.title,section==Section.HUB?"MIKAN OS  ♡":"Settings");LinearLayout.LayoutParams tp=new LinearLayout.LayoutParams(0,-2,1);tp.leftMargin=dp(12);header.addView(title,tp);
        header.addView(icon(section.icon),new LinearLayout.LayoutParams(dp(26),dp(26)));page.addView(header);gap(page,8);
        ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(false);scroll.setClipToPadding(false);
        LinearLayout body=column();body.setPadding(0,dp(4),0,dp(16));scroll.addView(body,new ScrollView.LayoutParams(-1,-2));page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        if(section==Section.HUB){
            LinearLayout hero=card();hero.setPadding(dp(16),dp(16),dp(16),dp(16));ImageView paw=icon(MikanMark.PAW);hero.addView(paw,new LinearLayout.LayoutParams(dp(35),dp(35)));
            LinearLayout c=copy("Your cozy little corner","Make Mikan OS your own.");LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(0,-2,1);cp.leftMargin=dp(14);hero.addView(c,cp);addCard(body,hero);
            heading(body,"CUSTOMIZE");
            for(Section dest:Section.values()){if(dest==Section.HUB)continue;if(dest==Section.ACCESS)heading(body,"SYSTEM");menu(body,dest,()->navigate.accept(dest));}
            gap(body,8);TextView version=text("Mikan Launcher  ·  v"+version(),12,MUTED,false);version.setGravity(Gravity.CENTER);body.addView(version);
        }else note(body,section.description);
        return body;
    }
    private String version(){try{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;}catch(Exception e){return "unknown";}}
    private void menu(LinearLayout body,Section section,Runnable action){
        LinearLayout r=card();ImageView mark=icon(section.icon);mark.setPadding(dp(10),dp(10),dp(10),dp(10));mark.setBackground(shape(0xff5e4032,14,0));r.addView(mark,new LinearLayout.LayoutParams(dp(46),dp(46)));
        LinearLayout c=copy(section.title,section.description);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.leftMargin=dp(12);r.addView(c,p);
        TextView arrow=text("›",26,PEACH,false);r.addView(arrow);clickable(r,action);addCard(body,r);
    }
    void heading(LinearLayout body,String title){gap(body,10);TextView t=text(title,11,PEACH,true);t.setLetterSpacing(.09f);t.setPadding(dp(4),0,0,0);body.addView(t);gap(body,8);}
    void note(LinearLayout body,String value){TextView t=text(value,12,MUTED,false);t.setPadding(dp(4),dp(4),dp(4),dp(10));body.addView(t);}
    void row(LinearLayout body,String title,String subtitle,Runnable action){
        LinearLayout r=card();r.addView(copy(title,subtitle),new LinearLayout.LayoutParams(0,-2,1));TextView arrow=text("›",24,PEACH,false);r.addView(arrow);clickable(r,action);addCard(body,r);
    }
    void toggle(LinearLayout body,String title,String subtitle,boolean checked,Consumer<Boolean> changed){
        LinearLayout r=card();r.addView(copy(title,subtitle),new LinearLayout.LayoutParams(0,-2,1));Switch sw=new Switch(activity);sw.setChecked(checked);sw.setContentDescription(title);
        int[][] states={{android.R.attr.state_checked},{}};
        sw.setThumbTintList(new ColorStateList(states,new int[]{PEACH,0xffb29b8b}));
        sw.setTrackTintList(new ColorStateList(states,new int[]{0xffa66c42,0xff67504a}));
        r.addView(sw);sw.setOnCheckedChangeListener((button,on)->changed.accept(on));clickable(r,()->sw.setChecked(!sw.isChecked()));addCard(body,r);
    }
    void choice(LinearLayout body,String title,String[] options,int selected,IntConsumer changed){
        LinearLayout panel=column();panel.setPadding(dp(12),dp(12),dp(12),dp(12));panel.setBackground(MikanTheme.panel(activity,18));panel.addView(text(title,15,CREAM,true));gap(panel,9);
        LinearLayout choices=line();choices.setBackground(shape(0xff2f2221,13,0));choices.setPadding(dp(3),dp(3),dp(3),dp(3));panel.addView(choices);
        for(int i=0;i<options.length;i++){final int n=i;TextView t=text(options[i],13,i==selected?0xff3a271e:CREAM,true);t.setGravity(Gravity.CENTER);t.setPadding(dp(4),dp(12),dp(4),dp(12));if(i==selected)t.setBackground(shape(PEACH,10,0));t.setSelected(i==selected);clickable(t,()->changed.accept(n));choices.addView(t,new LinearLayout.LayoutParams(0,-2,1));}
        addCard(body,panel);
    }
    void wallpapers(LinearLayout body,String selected,Drawable reading,Drawable study,Consumer<String> changed){
        heading(body,"WALLPAPER");LinearLayout row=line();row.setGravity(Gravity.TOP);
        wallpaper(row,"Reading nook","reading-nook.webp",reading,selected,changed);
        View spacer=new View(activity);row.addView(spacer,new LinearLayout.LayoutParams(dp(10),1));
        wallpaper(row,"Study nook","study-nook.webp",study,selected,changed);
        addCard(body,row);
    }
    private void wallpaper(LinearLayout row,String label,String name,Drawable image,String selected,Consumer<String> changed){
        boolean active=name.equals(selected);LinearLayout panel=column();panel.setBackground(shape(0xff45312b,18,active?PEACH:0x777e563d));panel.setPadding(dp(5),dp(5),dp(5),dp(9));
        ImageView pic=new ImageView(activity);pic.setImageDrawable(image);pic.setScaleType(ImageView.ScaleType.CENTER_CROP);pic.setBackground(shape(0xff2a2022,13,0));pic.setClipToOutline(true);panel.addView(pic,new LinearLayout.LayoutParams(-1,dp(156)));gap(panel,8);
        TextView t=text(label,13,CREAM,true);t.setGravity(Gravity.CENTER);panel.addView(t);gap(panel,4);TextView status=text(active?"Selected":"Tap to apply",11,active?PEACH:MUTED,false);status.setGravity(Gravity.CENTER);panel.addView(status);
        panel.setContentDescription(label+(active?", selected":""));panel.setSelected(active);clickable(panel,()->changed.accept(name));row.addView(panel,new LinearLayout.LayoutParams(0,-2,1));
    }
    void artPreview(LinearLayout body,Drawable artwork,String description){
        LinearLayout r=card();ImageView i=new ImageView(activity);i.setImageDrawable(artwork);i.setScaleType(ImageView.ScaleType.FIT_CENTER);i.setBackground(shape(0xff50332b,14,0));i.setClipToOutline(true);r.addView(i,new LinearLayout.LayoutParams(dp(86),dp(86)));
        LinearLayout c=copy(description,"Stored locally · works offline");LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.leftMargin=dp(14);r.addView(c,p);addCard(body,r);
    }
}
