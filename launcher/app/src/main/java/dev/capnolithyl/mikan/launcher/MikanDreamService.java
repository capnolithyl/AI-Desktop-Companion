package dev.capnolithyl.mikan.launcher;

import android.os.Handler;
import android.os.Looper;
import android.service.dreams.DreamService;
import android.view.Window;
import android.view.WindowManager;

/** Only Android binds this service. Tap exits normally; no keyguard manipulation. */
public final class MikanDreamService extends DreamService {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private DreamView view;
    private boolean dreaming;
    private final Runnable tick=new Runnable(){
        @Override public void run(){
            if(!dreaming||view==null)return;
            view.refresh();applyBrightness();
            handler.postDelayed(this,1000L*60-System.currentTimeMillis()%60000L);
        }
    };
    @Override public void onAttachedToWindow(){
        super.onAttachedToWindow();
        setInteractive(false);setFullscreen(true);setScreenBright(false);
        view=new DreamView(this,getSharedPreferences("launcher",MODE_PRIVATE));
        view.refresh();setContentView(view);applyBrightness();
    }
    private void applyBrightness(){
        Window window=getWindow();if(window==null||view==null)return;
        WindowManager.LayoutParams params=window.getAttributes();
        float brightness=view.dim()?.12f:WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        if(params.screenBrightness!=brightness){params.screenBrightness=brightness;window.setAttributes(params);}
    }
    @Override public void onDreamingStarted(){
        super.onDreamingStarted();dreaming=true;handler.removeCallbacks(tick);tick.run();
    }
    private void stop(){dreaming=false;handler.removeCallbacks(tick);}
    @Override public void onDreamingStopped(){stop();super.onDreamingStopped();}
    @Override public void onDetachedFromWindow(){stop();if(view!=null){view.release();view=null;}super.onDetachedFromWindow();}
    @Override public void onDestroy(){stop();if(view!=null){view.release();view=null;}super.onDestroy();}
}
