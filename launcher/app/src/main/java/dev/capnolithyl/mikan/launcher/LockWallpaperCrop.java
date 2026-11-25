package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.function.Consumer;

/** Preview and render the same portrait-display crop before handing it to Android. */
final class LockWallpaperCrop extends View {
    private final Drawable artwork;
    private final int imageWidth,imageHeight;
    private float x=.5f,y=.5f,zoom=1f;
    private LockWallpaperCrop(Activity activity,Drawable artwork){
        super(activity);
        this.artwork=artwork;
        imageWidth=Math.max(1,artwork.getIntrinsicWidth());
        imageHeight=Math.max(1,artwork.getIntrinsicHeight());
        setContentDescription("Lockscreen wallpaper crop preview");
    }
    private void paint(Canvas canvas,int width,int height){
        canvas.drawColor(0xff191417);
        float scale=Math.max(width/(float)imageWidth,height/(float)imageHeight)*zoom;
        float w=imageWidth*scale,h=imageHeight*scale;
        int saved=canvas.save();
        canvas.clipRect(0,0,width,height);
        canvas.translate((width-w)*x,(height-h)*y);
        canvas.scale(scale,scale);
        Rect previous=new Rect(artwork.getBounds());
        try{artwork.setBounds(0,0,imageWidth,imageHeight);artwork.draw(canvas);}
        finally{artwork.setBounds(previous);canvas.restoreToCount(saved);}
    }
    @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);paint(canvas,getWidth(),getHeight());}
    private Bitmap render(int width,int height){
        Bitmap result=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
        paint(new Canvas(result),width,height);
        return result;
    }
    private static int dp(Activity a,float n){return Math.round(n*a.getResources().getDisplayMetrics().density);}
    static void show(Activity activity,Drawable artwork,Consumer<Bitmap> apply){
        int width,height;
        if(Build.VERSION.SDK_INT>=30){
            Rect bounds=activity.getWindowManager().getMaximumWindowMetrics().getBounds();
            width=bounds.width();height=bounds.height();
        }else{
            DisplayMetrics metrics=new DisplayMetrics();activity.getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
            width=metrics.widthPixels;height=metrics.heightPixels;
        }
        // The lockscreen is normally portrait, even if opened in landscape.
        int shortEdge=Math.max(1,Math.min(width,height)),longEdge=Math.max(1,Math.max(width,height));
        float resolution=Math.min(1f,2560f/longEdge);
        final int outputW=Math.max(1,Math.round(shortEdge*resolution)),outputH=Math.max(1,Math.round(longEdge*resolution));
        LockWallpaperCrop preview=new LockWallpaperCrop(activity,artwork);
        ScrollView scroll=new ScrollView(activity);
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(activity,18),dp(activity,8),dp(activity,18),dp(activity,8));scroll.addView(body);
        TextView info=new TextView(activity);info.setText("Frame the image for your screen. Android may still apply a small system zoom. Your secure unlock stays unchanged.");info.setTextColor(0xffe1bda9);body.addView(info);
        int ph=dp(activity,270),pw=Math.max(1,Math.round(ph*outputW/(float)outputH));
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(pw,ph);pp.gravity=Gravity.CENTER_HORIZONTAL;pp.topMargin=dp(activity,12);pp.bottomMargin=dp(activity,8);body.addView(preview,pp);
        SeekBar horizontal=slider(activity,body,"Horizontal position",100,50,value->{preview.x=value/100f;preview.invalidate();});
        SeekBar vertical=slider(activity,body,"Vertical position",100,50,value->{preview.y=value/100f;preview.invalidate();});
        SeekBar zoom=slider(activity,body,"Zoom",100,0,value->{preview.zoom=1+value/100f;preview.invalidate();});
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Frame lockscreen wallpaper").setView(scroll).setNegativeButton("Cancel",null).setNeutralButton("Reset",null).setPositiveButton("Apply",(d,w)->{
            try{apply.accept(preview.render(outputW,outputH));}catch(RuntimeException error){Toast.makeText(activity,"Could not prepare wallpaper.",Toast.LENGTH_SHORT).show();}
        }).create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{horizontal.setProgress(50);vertical.setProgress(50);zoom.setProgress(0);});
    }
    private static SeekBar slider(Activity a,LinearLayout parent,String label,int max,int initial,Consumer<Integer> changed){
        TextView title=new TextView(a);title.setText(label);title.setTextColor(Color.WHITE);parent.addView(title);
        SeekBar bar=new SeekBar(a);bar.setMax(max);bar.setProgress(initial);bar.setContentDescription(label);parent.addView(bar);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            @Override public void onProgressChanged(SeekBar b,int value,boolean fromUser){changed.accept(value);}
            @Override public void onStartTrackingTouch(SeekBar b){}
            @Override public void onStopTrackingTouch(SeekBar b){}
        });return bar;
    }
}
