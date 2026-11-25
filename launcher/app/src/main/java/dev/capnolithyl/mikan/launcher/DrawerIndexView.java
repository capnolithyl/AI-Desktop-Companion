package dev.capnolithyl.mikan.launcher;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import java.util.Arrays;
import java.util.function.IntUnaryOperator;

/** Animated alphabet rail. Only the rightmost strip accepts new touches. */
final class DrawerIndexView extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final IntUnaryOperator jump;
    private final Runnable finish;
    private int[] sections=new int[27];
    private int requested=-1,active=-1;
    private float center=0,strength=0;
    private boolean tracking;
    private ValueAnimator animation;
    DrawerIndexView(Context c,IntUnaryOperator jump,Runnable finish,Runnable picker){
        super(c);this.jump=jump;this.finish=finish;Arrays.fill(sections,-1);
        setFocusable(true);setContentDescription("Alphabetical index. Drag to jump, or activate to choose a letter.");
        setOnClickListener(v->picker.run());
    }
    private float dp(float value){return value*getResources().getDisplayMetrics().density;}
    void sections(int[] sections){this.sections=sections.clone();if(!tracking){requested=-1;active=-1;}invalidate();}
    void reset(){
        if(animation!=null){animation.cancel();animation=null;}
        tracking=false;requested=-1;active=-1;strength=0;invalidate();
    }
    private void animateStrength(float target,int duration){
        if(animation!=null)animation.cancel();
        if(!ValueAnimator.areAnimatorsEnabled()){strength=target;invalidate();return;}
        animation=ValueAnimator.ofFloat(strength,target);animation.setDuration(duration);animation.setInterpolator(new DecelerateInterpolator());
        animation.addUpdateListener(a->{strength=(Float)a.getAnimatedValue();invalidate();});animation.start();
    }
    @Override protected void onDetachedFromWindow(){reset();super.onDetachedFromWindow();}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);float step=getHeight()/27f;if(step<=0)return;
        float base=Math.min(13*getResources().getDisplayMetrics().scaledDensity,step*.80f);
        float rest=getWidth()-dp(14);
        // Draw neighbors first so the enlarged active letter stays above the wave.
        for(int i=0;i<27;i++)if(i!=active)drawLetter(canvas,i,step,base,rest,false);
        if(active>=0)drawLetter(canvas,active,step,base,rest,true);
    }
    private void drawLetter(Canvas canvas,int i,float step,float base,float rest,boolean selected){
        float wave=IndexWave.weight(i-center)*strength;
        float x=rest-dp(60)*wave,y=step*(i+.5f);
        float size=base*(1+1.25f*wave);
        paint.setTextSize(size);paint.setTextAlign(Paint.Align.CENTER);paint.setFakeBoldText(selected||wave>.8f);
        Paint.FontMetrics fm=paint.getFontMetrics();
        if(wave>.06f){
            float radius=Math.max(size*.74f,dp(9));float halfHeight=Math.max(size*.66f,step*.48f);
            paint.setColor(selected?0xff8a583a:0xee392823);paint.setAlpha(Math.round(235*Math.min(1,wave*2)));
            canvas.drawRoundRect(x-radius,y-halfHeight,x+radius,y+halfHeight,dp(12),dp(12),paint);
        }
        paint.setColor(selected?0xffffe9d5:sections[i]>=0?0xffe1bda9:0x889d8476);
        canvas.drawText(DrawerData.letter(i),x,y-(fm.ascent+fm.descent)/2,paint);
        paint.setFakeBoldText(false);
    }
    private void track(float y){
        if(getHeight()<=0)return;
        center=Math.max(0,Math.min(26,y*27/getHeight()-.5f));
        int letter=Math.max(0,Math.min(26,Math.round(center)));
        if(letter!=requested){
            requested=letter;int selected=jump.applyAsInt(letter);
            if(selected!=active&&selected>=0)performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            active=selected;
        }
        invalidate();
    }
    @Override public boolean onTouchEvent(MotionEvent e){
        switch(e.getActionMasked()){
            case MotionEvent.ACTION_DOWN:
                if(e.getX()<getWidth()-dp(30))return false;
                if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);
                tracking=true;requested=-1;track(e.getY());animateStrength(1f,115);return true;
            case MotionEvent.ACTION_MOVE:
                if(!tracking)return false;track(e.getY());return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if(!tracking)return false;
                tracking=false;requested=-1;active=-1;finish.run();
                if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);
                animateStrength(0f,190);return true;
            default:return tracking;
        }
    }
}
