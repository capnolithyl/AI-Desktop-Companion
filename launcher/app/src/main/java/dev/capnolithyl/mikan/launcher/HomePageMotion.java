package dev.capnolithyl.mikan.launcher;

import android.animation.ValueAnimator;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Animate the visible content viewport only. Never keep old widget hosts alive.
 * Snapshot is local, transient, bounded and never persisted. */
final class HomePageMotion {
    private View incoming;
    private ImageView outgoing;
    private Snapshot snapshot;
    private ViewTreeObserver.OnPreDrawListener pending;
    private int generation;
    static final class Snapshot {
        final Bitmap image;
        final float offset;
        Snapshot(Bitmap image,float offset){this.image=image;this.offset=offset;}
        void release(){if(image!=null&&!image.isRecycled())image.recycle();}
    }
    Snapshot capture(View content){
        if(content==null||content.getWidth()<=0||content.getHeight()<=0)return null;
        float offset=content.getTranslationX();
        int w=content.getWidth(),h=content.getHeight();
        float scale=Math.min(1f,(float)Math.sqrt(1500000d/((double)w*h)));
        Bitmap bitmap=null;
        try{
            bitmap=Bitmap.createBitmap(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(bitmap);canvas.scale((float)bitmap.getWidth()/w,(float)bitmap.getHeight()/h);
            content.draw(canvas);
            return new Snapshot(bitmap,offset);
        }catch(RuntimeException|OutOfMemoryError ex){
            if(bitmap!=null)bitmap.recycle();
            return new Snapshot(null,offset);
        }
    }
    void slide(FrameLayout viewport,View content,Snapshot old,int direction){
        finish();snapshot=old;incoming=content;
        final int token=++generation;
        // Position before the next drawn frame, using the new viewport's measured width.
        pending=new ViewTreeObserver.OnPreDrawListener(){
            @Override public boolean onPreDraw(){
                ViewTreeObserver observer=content.getViewTreeObserver();
                if(observer.isAlive())observer.removeOnPreDrawListener(this);
                if(token!=generation)return true;
                pending=null;
                int width=viewport.getWidth(),height=viewport.getHeight();
                if(width<=0||height<=0||!ValueAnimator.areAnimatorsEnabled()){finish();return true;}
                float offset=old==null?0:old.offset;
                float start=direction*width+offset;
                content.setTranslationX(start);
                if(old!=null&&old.image!=null){
                    ImageView ghost=new ImageView(content.getContext());
                    ghost.setImageBitmap(old.image);ghost.setScaleType(ImageView.ScaleType.FIT_XY);
                    ghost.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
                    viewport.addView(ghost,new FrameLayout.LayoutParams(width,height));
                    // Layout immediately: the overlay was added during pre-draw.
                    ghost.layout(0,0,width,height);ghost.setTranslationX(offset);outgoing=ghost;
                    ghost.animate().translationX(-direction*width).setDuration(240).setInterpolator(new DecelerateInterpolator(1.5f)).start();
                }else{content.setTranslationX(direction*width*.28f);content.setAlpha(.65f);}
                content.animate().translationX(0).alpha(1).setDuration(240).setInterpolator(new DecelerateInterpolator(1.5f)).withEndAction(()->{if(token==generation)finish();}).start();
                return true;
            }
        };
        content.getViewTreeObserver().addOnPreDrawListener(pending);
        content.invalidate();
    }
    void snapBack(View content){
        finish();
        if(content==null)return;
        incoming=content;
        if(!ValueAnimator.areAnimatorsEnabled()){finish();return;}
        final int token=++generation;
        content.animate().translationX(0).setDuration(150).setInterpolator(new DecelerateInterpolator()).withEndAction(()->{if(token==generation)finish();}).start();
    }
    void finish(){
        generation++;
        if(incoming!=null){
            if(pending!=null){ViewTreeObserver observer=incoming.getViewTreeObserver();if(observer.isAlive())observer.removeOnPreDrawListener(pending);}
            incoming.animate().cancel();incoming.setTranslationX(0);incoming.setAlpha(1);incoming=null;
        }
        pending=null;
        if(outgoing!=null){
            outgoing.animate().cancel();outgoing.setImageDrawable(null);
            if(outgoing.getParent() instanceof FrameLayout)((FrameLayout)outgoing.getParent()).removeView(outgoing);
            outgoing=null;
        }
        // Drop the reference after removing the drawable; let Android reclaim pixels
        // safely rather than recycle a bitmap still referenced by a display list.
        snapshot=null;
    }
}
