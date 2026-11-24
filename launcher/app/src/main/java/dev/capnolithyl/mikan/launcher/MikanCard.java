package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

final class MikanCard {
    private static final int PEACH=0xffffbf88,CREAM=0xffffe9d5,MUTED=0xffe1bda9;
    private final Context context;
    private final FrameLayout root;
    private final TextView greeting,subtitle,status;
    MikanCard(Context context,Drawable artwork,boolean transparent,String initialStatus,Runnable open){
        this.context=context;
        root=new FrameLayout(context);root.setMinimumHeight(dp(172));root.setClipToOutline(true);
        GradientDrawable background=gradient(0xff593a30,0xff322326,25,0xff986448);
        root.setBackground(background);root.setElevation(dp(2));
        LinearLayout row=new LinearLayout(context);row.setOrientation(LinearLayout.HORIZONTAL);row.setGravity(Gravity.CENTER_VERTICAL);row.setBaselineAligned(false);
        root.addView(row,new FrameLayout.LayoutParams(-1,-2));
        FrameLayout art=new FrameLayout(context);
        row.addView(art,new LinearLayout.LayoutParams(0,-1,0.94f));
        ImageView picture=new ImageView(context);picture.setImageDrawable(artwork);picture.setScaleType(transparent?ImageView.ScaleType.FIT_END:ImageView.ScaleType.CENTER_CROP);
        art.addView(picture,new FrameLayout.LayoutParams(-1,-1));
        if(!transparent){
            View fade=new View(context);
            fade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{0x00000000,0x00000000,0x803d2928,0xff50342e}));
            art.addView(fade,new FrameLayout.LayoutParams(dp(55),-1,Gravity.RIGHT));
        }
        ImageView spark=new ImageView(context);spark.setImageDrawable(new MikanMark(MikanMark.SPARK,PEACH));
        FrameLayout.LayoutParams sparkParams=new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.TOP|Gravity.RIGHT);sparkParams.topMargin=dp(12);sparkParams.rightMargin=dp(3);art.addView(spark,sparkParams);
        LinearLayout copy=new LinearLayout(context);copy.setOrientation(LinearLayout.VERTICAL);copy.setGravity(Gravity.CENTER_VERTICAL);copy.setPadding(dp(2),dp(11),dp(12),dp(11));
        copy.setMinimumHeight(dp(172));row.addView(copy,new LinearLayout.LayoutParams(0,-2,1.06f));
        LinearLayout heading=new LinearLayout(context);heading.setGravity(Gravity.CENTER_VERTICAL);copy.addView(heading);
        TextView name=label("Mikan ♡",20,PEACH,true);name.setTypeface(Typeface.create("casual",Typeface.ITALIC));heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        ImageView paw=new ImageView(context);paw.setImageDrawable(new MikanMark(MikanMark.PAW,PEACH));heading.addView(paw,new LinearLayout.LayoutParams(dp(18),dp(18)));
        space(copy,6);
        LinearLayout bubble=new LinearLayout(context);bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setBackground(new Bubble(context));bubble.setPadding(dp(16),dp(9),dp(9),dp(9));copy.addView(bubble,new LinearLayout.LayoutParams(-1,-2));
        greeting=label("",16,CREAM,true);bubble.addView(greeting);
        space(bubble,3);subtitle=label("",12,MUTED,false);bubble.addView(subtitle);
        space(copy,7);
        status=label(initialStatus,11,PEACH,false);status.setGravity(Gravity.CENTER_VERTICAL);status.setPadding(dp(8),dp(5),dp(8),dp(5));status.setBackground(gradient(0x55402825,0x55402825,11,0x887d543e));copy.addView(status,new LinearLayout.LayoutParams(-1,-2));
        space(copy,4);
        TextView shortcut=label("Open Mikan Web ↗",11,CREAM,false);shortcut.setPadding(dp(4),0,0,0);copy.addView(shortcut);
        updateGreeting(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY));
        GradientDrawable mask=new GradientDrawable();mask.setColor(Color.WHITE);mask.setCornerRadius(dp(25));
        root.setForeground(new RippleDrawable(ColorStateList.valueOf(0x22ffbf88),null,mask));
        root.setFocusable(true);root.setOnClickListener(v->open.run());root.setContentDescription("Open Mikan Web");
    }
    View view(){return root;}
    void setStatus(String value){status.setText(value);}
    void updateGreeting(int hour){
        String hello=hour<5?"Still awake? ♡":hour<12?"Good morning ♡":hour<18?"Good afternoon ♡":"Good evening ♡";
        String note=hour<5?"A little rest sounds nice.":hour<12?"Ready for a fresh start?":hour<18?"Take a little coffee break.":"Time to get cozy.";
        if(!hello.contentEquals(greeting.getText()))greeting.setText(hello);
        if(!note.contentEquals(subtitle.getText()))subtitle.setText(note);
    }
    private int dp(float n){return Math.round(n*context.getResources().getDisplayMetrics().density);}
    private void space(LinearLayout parent,int n){parent.addView(new View(context),new LinearLayout.LayoutParams(1,dp(n)));}
    private TextView label(String value,int size,int color,boolean bold){TextView v=new TextView(context);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;}
    private GradientDrawable gradient(int top,int bottom,int radius,int border){GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{top,bottom});d.setCornerRadius(dp(radius));d.setStroke(dp(1),border);return d;}
    private static final class Bubble extends Drawable {
        private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float density;
        Bubble(Context c){density=c.getResources().getDisplayMetrics().density;}
        @Override public void draw(Canvas canvas){
            float w=getBounds().width()/density,h=getBounds().height()/density;
            if(w<20||h<22)return;
            canvas.save();canvas.translate(getBounds().left,getBounds().top);canvas.scale(density,density);
            float radius=Math.min(15,Math.min((w-9)/2,h/2)-1),tail=Math.min(h-8,Math.max(19,h*.68f));
            Path p=new Path();p.moveTo(9+radius,1);p.lineTo(w-radius-1,1);p.quadTo(w-1,1,w-1,1+radius);p.lineTo(w-1,h-radius-1);p.quadTo(w-1,h-1,w-radius-1,h-1);p.lineTo(9+radius,h-1);p.quadTo(9,h-1,9,h-radius-1);p.lineTo(9,tail+4);p.quadTo(4,tail+6,1,tail+2);p.quadTo(7,tail-2,9,tail-10);p.lineTo(9,1+radius);p.quadTo(9,1,9+radius,1);p.close();
            paint.setStyle(Paint.Style.FILL);paint.setColor(0xff79503d);canvas.drawPath(p,paint);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(0xffb68158);canvas.drawPath(p,paint);
            canvas.restore();
        }
        @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
        @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
}
