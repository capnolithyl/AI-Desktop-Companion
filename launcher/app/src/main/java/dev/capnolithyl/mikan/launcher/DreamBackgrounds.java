package dev.capnolithyl.mikan.launcher;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

/** Bounded, cached artwork layers. Prepare on artwork/settings changes, never blur in onDraw. */
final class DreamBackgrounds {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private final RectF cover=new RectF();
    private Bitmap blurred,feathered;
    private String blurKey="",portraitKey="";
    private Shader baseGradient,scrim;
    private float gradientHeight=-1;
    private DreamRules.Period gradientPeriod;
    private int gradientMode=-1;

    void clear(){blurred=null;feathered=null;blurKey="";portraitKey="";baseGradient=null;scrim=null;gradientHeight=-1;gradientPeriod=null;gradientMode=-1;}
    void prepare(Drawable art,String key,int mode,int strength){
        if(art==null||mode==DreamRules.BLACK){clear();return;}
        if(mode==DreamRules.BLURRED||mode==DreamRules.TINTED){
            if(!key.equals(blurKey)){
                blurKey=key;blurred=makeBlur(art);
            }
        }else{blurred=null;blurKey="";}
        String next=key+":"+strength;
        if(!next.equals(portraitKey)){
            portraitKey=next;feathered=makeFeather(art,strength);
        }
    }
    private static Bitmap sample(Drawable art,int limit,boolean opaque){
        int aw=Math.max(1,art.getIntrinsicWidth()),ah=Math.max(1,art.getIntrinsicHeight());
        float scale=Math.min(1f,(float)limit/Math.max(aw,ah));
        int w=Math.max(1,Math.round(aw*scale)),h=Math.max(1,Math.round(ah*scale));
        Bitmap bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap);
        if(opaque)canvas.drawColor(0xff30221b);
        Rect previous=new Rect(art.getBounds());int alpha=art.getAlpha();
        try{art.setBounds(0,0,w,h);art.setAlpha(255);art.draw(canvas);}
        finally{art.setBounds(previous);art.setAlpha(alpha);}
        return bitmap;
    }
    private static Bitmap makeBlur(Drawable art){
        Bitmap small=sample(art,96,true);
        int w=small.getWidth(),h=small.getHeight();int[] pixels=new int[w*h];
        small.getPixels(pixels,0,w,0,0,w,h);
        int radius=Math.max(2,Math.round(Math.min(w,h)*.19f));
        // Two rounds give a soft Gaussian-like blur at thumbnail resolution.
        pixels=DreamRules.blurRgb(pixels,w,h,radius);
        pixels=DreamRules.blurRgb(pixels,w,h,radius);
        small.setPixels(pixels,0,w,0,0,w,h);return small;
    }
    private static Bitmap makeFeather(Drawable art,int strength){
        Bitmap bitmap=sample(art,1280,false);Canvas canvas=new Canvas(bitmap);
        int w=bitmap.getWidth(),h=bitmap.getHeight();float edge=DreamRules.feather(strength);
        Paint mask=new Paint(Paint.ANTI_ALIAS_FLAG);
        mask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        int[] colors={Color.TRANSPARENT,Color.WHITE,Color.WHITE,Color.TRANSPARENT};
        float[] stops={0,edge,1-edge,1};
        mask.setShader(new LinearGradient(0,0,w,0,colors,stops,Shader.TileMode.CLAMP));
        canvas.drawRect(0,0,w,h,mask);
        mask.setShader(new LinearGradient(0,0,0,h,colors,stops,Shader.TileMode.CLAMP));
        canvas.drawRect(0,0,w,h,mask);
        return bitmap;
    }
    private void gradients(float h,DreamRules.Period period,int mode){
        if(h==gradientHeight&&period==gradientPeriod&&mode==gradientMode)return;
        gradientHeight=h;gradientPeriod=period;gradientMode=mode;
        int[] palette=DreamRules.palette(period);
        baseGradient=new LinearGradient(0,0,0,h,palette,new float[]{0,.54f,1},Shader.TileMode.CLAMP);
        int[] shade=period==DreamRules.Period.NIGHT?
            new int[]{0xe610090d,0x660e090c,0x660e090c,0xeb10090d}:
            new int[]{0xc70e0908,0x20150d09,0x20150d09,0xd9110908};
        scrim=new LinearGradient(0,0,0,h,shade,new float[]{0,.28f,.70f,1},Shader.TileMode.CLAMP);
    }
    void draw(Canvas canvas,float w,float h,DreamRules.Period period,int mode,int strength,float dx,float dy){
        if(mode==DreamRules.BLACK)return;
        gradients(h,period,mode);
        paint.setAlpha(255);paint.setShader(baseGradient);canvas.drawRect(0,0,w,h,paint);paint.setShader(null);
        if(blurred!=null&&(mode==DreamRules.BLURRED||mode==DreamRules.TINTED)){
            float margin=Math.min(w,h)*.025f;
            float scale=Math.max((w+2*margin)/blurred.getWidth(),(h+2*margin)/blurred.getHeight());
            float bw=blurred.getWidth()*scale,bh=blurred.getHeight()*scale;
            cover.set((w-bw)/2+dx,(h-bh)/2+dy,(w+bw)/2+dx,(h+bh)/2+dy);
            int alpha=mode==DreamRules.BLURRED?205:new int[]{185,137,94}[strength];
            if(period==DreamRules.Period.NIGHT)alpha=Math.min(alpha,72);
            paint.setAlpha(alpha);canvas.drawBitmap(blurred,null,cover,paint);paint.setAlpha(255);
        }
        paint.setShader(scrim);canvas.drawRect(0,0,w,h,paint);paint.setShader(null);
    }
    boolean drawPortrait(Canvas canvas,Rect bounds,int alpha){
        if(feathered==null)return false;
        paint.setAlpha(alpha);canvas.drawBitmap(feathered,null,bounds,paint);paint.setAlpha(255);return true;
    }
}
