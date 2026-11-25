package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import java.util.Arrays;
import java.util.function.IntUnaryOperator;

/** Continuous right-edge alphabetical scrubber; the grid itself remains virtualized. */
final class DrawerIndexView extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final IntUnaryOperator jump;
    private final Runnable finish;
    private int[] sections=new int[27];
    private int requested=-1,active=-1;
    DrawerIndexView(Context c,IntUnaryOperator jump,Runnable finish,Runnable picker){
        super(c);this.jump=jump;this.finish=finish;Arrays.fill(sections,-1);
        setFocusable(true);setContentDescription("Alphabetical index. Drag to jump, or activate to choose a letter.");
        setOnClickListener(v->picker.run());
    }
    void sections(int[] sections){this.sections=sections.clone();requested=-1;active=-1;invalidate();}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);float step=getHeight()/27f;if(step<=0)return;
        float size=Math.min(13*getResources().getDisplayMetrics().scaledDensity,step*.80f);
        paint.setTextSize(size);paint.setTextAlign(Paint.Align.CENTER);
        Paint.FontMetrics fm=paint.getFontMetrics();
        for(int i=0;i<27;i++){
            paint.setColor(i==active?0xffffbf88:sections[i]>=0?0xffe1bda9:0x668f776d);
            canvas.drawText(DrawerData.letter(i),getWidth()/2f,step*(i+.5f)-(fm.ascent+fm.descent)/2,paint);
        }
    }
    @Override public boolean onTouchEvent(MotionEvent e){
        switch(e.getActionMasked()){
            case MotionEvent.ACTION_DOWN:
                getParent().requestDisallowInterceptTouchEvent(true);requested=-1;
                // fall through
            case MotionEvent.ACTION_MOVE:
                if(getHeight()<=0)return true;
                int letter=Math.max(0,Math.min(26,(int)(e.getY()*27/getHeight())));
                if(letter!=requested){
                    requested=letter;int selected=jump.applyAsInt(letter);
                    if(selected!=active&&selected>=0)performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                    active=selected;invalidate();
                }return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                requested=-1;active=-1;finish.run();getParent().requestDisallowInterceptTouchEvent(false);invalidate();return true;
            default:return true;
        }
    }
}
