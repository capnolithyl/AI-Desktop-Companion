package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import androidx.car.app.connection.CarConnection;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.Observer;
import java.util.function.Consumer;

/** Official Android Auto projection state. Observe only while Home is resumed. */
final class DriveConnection {
    private final Context context;
    private final Consumer<Boolean> changed;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LiveData<Integer> source;
    private boolean active;
    private final Runnable timeout;
    private final Observer<Integer> observer;
    DriveConnection(Context context,Consumer<Boolean> changed){
        this.context=context.getApplicationContext();this.changed=changed;
        timeout=()->{if(active)this.changed.accept(null);};
        observer=type->{
        if(!active)return;
        handler.removeCallbacks(timeout);
        if(type==null)changed.accept(null);
        else if(type==CarConnection.CONNECTION_TYPE_PROJECTION)changed.accept(true);
        else if(type==CarConnection.CONNECTION_TYPE_NOT_CONNECTED||type==CarConnection.CONNECTION_TYPE_NATIVE)changed.accept(false);
        else changed.accept(null);
        };
    }
    void start(){
        if(active)return;active=true;handler.postDelayed(timeout,3000);
        try{source=new CarConnection(context).getType();source.observeForever(observer);}
        catch(RuntimeException ex){stop();changed.accept(null);}
    }
    void stop(){
        active=false;handler.removeCallbacks(timeout);
        if(source!=null){try{source.removeObserver(observer);}catch(RuntimeException ignored){}source=null;}
    }
}
