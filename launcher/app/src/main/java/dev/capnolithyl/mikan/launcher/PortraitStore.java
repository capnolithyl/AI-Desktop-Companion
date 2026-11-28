package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.AtomicFile;
import java.io.*;

final class PortraitStore {
    private final Context context;
    private final AtomicFile file;
    private final String[] assets;
    private final int maxEdge;
    private static final android.util.LruCache<String,Bitmap> CACHE=new android.util.LruCache<String,Bitmap>(24*1024*1024){
        @Override protected int sizeOf(String key,Bitmap bitmap){return bitmap.getAllocationByteCount();}
    };
    static void clearCache(){CACHE.evictAll();}
    private String cacheKey(){return file.getBaseFile().getAbsolutePath();}
    private Drawable wrap(Bitmap bitmap){return new BitmapDrawable(context.getResources(),bitmap);}
    private Drawable remember(Bitmap bitmap){CACHE.put(cacheKey(),bitmap);return wrap(bitmap);}
    PortraitStore(Context context){
        this(context,"mikan-launcher-portrait.webp",new String[]{"portraits/coffee.webp","mikan-chat-avatar.webp"});
    }
    PortraitStore(Context context,String filename,String[] assets){
        this(context,filename,assets,768);
    }
    PortraitStore(Context context,String filename,String[] assets,int maxEdge){
        this.context=context.getApplicationContext();this.assets=assets.clone();this.maxEdge=maxEdge;
        file=new AtomicFile(new File(context.getFilesDir(),filename));
    }
    synchronized Drawable get(){
        Bitmap cached=CACHE.get(cacheKey());if(cached!=null)return wrap(cached);
        try(InputStream in=file.openRead()){
            Bitmap b=BitmapFactory.decodeStream(in);
            if(b!=null)return remember(b);
        }catch(Exception ignored){}
        for(String name:assets){
            try(InputStream in=context.getAssets().open(name)){
                Bitmap b=BitmapFactory.decodeStream(in);
                if(b!=null)return remember(b);
            }catch(Exception ignored){}
        }
        return null;
    }
    synchronized boolean importImage(Uri uri){
        FileOutputStream out=null;Bitmap bitmap=null;
        try{
            BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;
            try(InputStream in=context.getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,opts);}
            if(opts.outWidth<=0||opts.outHeight<=0)return false;
            int sample=1;while(Math.max(opts.outWidth,opts.outHeight)/sample>maxEdge*2)sample*=2;
            opts.inJustDecodeBounds=false;opts.inSampleSize=sample;
            try(InputStream in=context.getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in,null,opts);}
            if(bitmap==null)return false;
            int max=Math.max(bitmap.getWidth(),bitmap.getHeight());
            if(max>maxEdge){float scale=(float)maxEdge/max;Bitmap resized=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);if(resized!=bitmap){bitmap.recycle();bitmap=resized;}}
            out=file.startWrite();
            if(!bitmap.compress((assets.length==1||maxEdge==256)?Bitmap.CompressFormat.PNG:Bitmap.CompressFormat.WEBP,92,out))throw new IOException("Encode failed");
            file.finishWrite(out);out=null;CACHE.remove(cacheKey());return true;
        }catch(Exception e){if(out!=null)file.failWrite(out);return false;}
        finally{if(bitmap!=null)bitmap.recycle();}
    }
    synchronized void reset(){file.delete();CACHE.remove(cacheKey());}
}
