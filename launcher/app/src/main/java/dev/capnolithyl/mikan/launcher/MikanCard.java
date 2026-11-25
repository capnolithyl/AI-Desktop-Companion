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
import android.graphics.drawable.TransitionDrawable;
import android.animation.ValueAnimator;
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
    private final TextView greeting,subtitle,actionHint;
    private final LinearLayout bubble;
    private final ImageView picture;
    private final Drawable fallbackArtwork;
    private final java.util.function.Function<MikanExpression,Drawable> expressionArt;
    private MikanExpression shownExpression;
    private Drawable shownArtwork;
    private int artRevision;
    private MikanRemarks.Remark currentRemark;
    private boolean bubbleTouch;
    private String fallback="";
    MikanCard(Context context,Drawable artwork,boolean transparent,String shortcutLabel,Runnable open,java.util.function.Consumer<MikanRemarks.Remark> onRemark,java.util.function.Function<MikanExpression,Drawable> expressionArt){
        this.context=context;this.fallbackArtwork=artwork;this.expressionArt=expressionArt;
        root=new FrameLayout(context);root.setMinimumHeight(dp(172));root.setClipToOutline(true);
        GradientDrawable background=MikanTheme.panel(context,25);
        root.setBackground(background);root.setElevation(dp(2));
        LinearLayout row=new LinearLayout(context);row.setOrientation(LinearLayout.HORIZONTAL);row.setGravity(Gravity.CENTER_VERTICAL);row.setBaselineAligned(false);
        root.addView(row,new FrameLayout.LayoutParams(-1,-2));
        FrameLayout art=new FrameLayout(context);
        row.addView(art,new LinearLayout.LayoutParams(0,-1,0.94f));
        picture=new ImageView(context);picture.setImageDrawable(artwork);picture.setScaleType(transparent?ImageView.ScaleType.FIT_END:ImageView.ScaleType.CENTER_CROP);
        art.addView(picture,new FrameLayout.LayoutParams(-1,-1));
        if(!transparent){
            View fade=new View(context);
            fade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{0x00000000,0x003d2928,0x903d2928,0xff44302b}));
            art.addView(fade,new FrameLayout.LayoutParams(dp(65),-1,Gravity.RIGHT));
        }
        ImageView spark=new ImageView(context);spark.setImageDrawable(new MikanMark(MikanMark.SPARK,PEACH));
        FrameLayout.LayoutParams sparkParams=new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.TOP|Gravity.RIGHT);sparkParams.topMargin=dp(12);sparkParams.rightMargin=dp(3);art.addView(spark,sparkParams);
        LinearLayout copy=new LinearLayout(context);copy.setOrientation(LinearLayout.VERTICAL);copy.setGravity(Gravity.CENTER_VERTICAL);copy.setPadding(dp(2),dp(11),dp(12),dp(11));
        copy.setMinimumHeight(dp(172));row.addView(copy,new LinearLayout.LayoutParams(0,-2,1.06f));
        LinearLayout heading=new LinearLayout(context);heading.setGravity(Gravity.CENTER_VERTICAL);copy.addView(heading);
        TextView name=label("Mikan ♡",20,PEACH,true);name.setTypeface(Typeface.create("casual",Typeface.ITALIC));heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        ImageView paw=new ImageView(context);paw.setImageDrawable(new MikanMark(MikanMark.PAW,PEACH));heading.addView(paw,new LinearLayout.LayoutParams(dp(18),dp(18)));
        space(copy,6);
        bubble=new LinearLayout(context);bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setBackground(new Bubble(context));bubble.setPadding(dp(16),dp(9),dp(9),dp(9));copy.addView(bubble,new LinearLayout.LayoutParams(-1,-2));
        greeting=label("",16,CREAM,true);bubble.addView(greeting);
        space(bubble,3);subtitle=label("",13,MUTED,false);subtitle.setMinLines(3);bubble.addView(subtitle);
        actionHint=label("",10,PEACH,true);actionHint.setGravity(Gravity.END);actionHint.setSingleLine(true);actionHint.setEllipsize(android.text.TextUtils.TruncateAt.END);actionHint.setVisibility(View.INVISIBLE);bubble.addView(actionHint,new LinearLayout.LayoutParams(-1,-2));
        art.setFocusable(true);art.setContentDescription(shortcutLabel);art.setOnClickListener(v->open.run());
        art.setForeground(ripple(12));
        // Separate targets. Freeze the visible remark during a touch so its action
        // cannot change between finger down and finger up.
        bubble.setForeground(ripple(15));
        bubble.setOnTouchListener((v,event)->{
            int action=event.getActionMasked();
            if(action==android.view.MotionEvent.ACTION_DOWN)bubbleTouch=true;
            if(action==android.view.MotionEvent.ACTION_UP||action==android.view.MotionEvent.ACTION_CANCEL)bubbleTouch=false;
            return false;
        });
        bubble.setOnClickListener(v->{if(currentRemark!=null)onRemark.accept(currentRemark);});
        updateGreeting(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY));
        setRemark(null);
    }
    View view(){return root;}
    private RippleDrawable ripple(int radius){
        GradientDrawable mask=new GradientDrawable();mask.setColor(Color.WHITE);mask.setCornerRadius(dp(radius));
        return new RippleDrawable(ColorStateList.valueOf(0x22ffbf88),null,mask);
    }
    void setRemark(MikanRemarks.Remark value){
        if(bubbleTouch)return;
        currentRemark=value;updateExpression(value==null?MikanExpression.DEFAULT:value.expression);String note=value==null?fallback:value.text;
        if(!note.contentEquals(subtitle.getText()))subtitle.setText(note);
        boolean actionable=value!=null&&value.actionable();
        String hint=actionable?value.label+" ↗":"";
        if(!hint.contentEquals(actionHint.getText()))actionHint.setText(hint);
        int visibility=actionable?View.VISIBLE:View.INVISIBLE;if(actionHint.getVisibility()!=visibility)actionHint.setVisibility(visibility);
        bubble.setClickable(value!=null);bubble.setFocusable(value!=null);
        String description=greeting.getText()+". "+note+(actionable?". Open "+value.label:value!=null?". Tap for another remark.":"");
        if(!description.contentEquals(bubble.getContentDescription()==null?"":bubble.getContentDescription()))bubble.setContentDescription(description);
    }
    private void updateExpression(MikanExpression expression){
        if(expressionArt==null||shownExpression==expression)return;
        shownExpression=expression;
        Drawable next=expressionArt.apply(expression);if(next==null)next=fallbackArtwork;
        Drawable previous=shownArtwork;shownArtwork=next;
        int revision=++artRevision;
        if(previous==null||next==null||previous==next||!picture.isAttachedToWindow()||!ValueAnimator.areAnimatorsEnabled()){
            picture.setImageDrawable(next);return;
        }
        TransitionDrawable transition=new TransitionDrawable(new Drawable[]{previous,next});
        transition.setCrossFadeEnabled(true);picture.setImageDrawable(transition);transition.startTransition(220);
        final Drawable target=next;
        picture.postDelayed(()->{if(artRevision==revision)picture.setImageDrawable(target);},240);
    }
    void updateGreeting(int hour){
        String hello=hour<5?"Still awake? ♡":hour<12?"Good morning ♡":hour<18?"Good afternoon ♡":"Good evening ♡";
        String note=hour<5?"A little rest sounds nice.":hour<12?"Ready for a fresh start?":hour<18?"Take a little coffee break.":"Time to get cozy.";
        if(!hello.contentEquals(greeting.getText()))greeting.setText(hello);
        fallback=note;setRemark(currentRemark);
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
            paint.setStyle(Paint.Style.FILL);paint.setColor(0xff6b4838);canvas.drawPath(p,paint);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(0xffb68158);canvas.drawPath(p,paint);
            canvas.restore();
        }
        @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
        @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
        @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
}
