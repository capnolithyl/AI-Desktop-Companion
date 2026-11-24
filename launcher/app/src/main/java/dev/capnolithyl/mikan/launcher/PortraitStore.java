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
    PortraitStore(Context context){
        this.context=context.getApplicationContext();
        file=new AtomicFile(new File(context.getFilesDir(),"mikan-launcher-portrait.webp"));
    }
    synchronized Drawable get(){
        try(InputStream in=file.openRead()){
            Bitmap b=BitmapFactory.decodeStream(in);
            if(b!=null)return new BitmapDrawable(context.getResources(),b);
        }catch(Exception ignored){}
        for(String name:new String[]{"portraits/coffee.webp","mikan-chat-avatar.webp"}){
            try(InputStream in=context.getAssets().open(name)){
                Bitmap b=BitmapFactory.decodeStream(in);
                if(b!=null)return new BitmapDrawable(context.getResources(),b);
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
            int sample=1;while(Math.max(opts.outWidth,opts.outHeight)/sample>1536)sample*=2;
            opts.inJustDecodeBounds=false;opts.inSampleSize=sample;
            try(InputStream in=context.getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in,null,opts);}
            if(bitmap==null)return false;
            int max=Math.max(bitmap.getWidth(),bitmap.getHeight());
            if(max>768){float scale=768f/max;Bitmap resized=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);if(resized!=bitmap){bitmap.recycle();bitmap=resized;}}
            out=file.startWrite();
            if(!bitmap.compress(Bitmap.CompressFormat.WEBP,92,out))throw new IOException("Encode failed");
            file.finishWrite(out);out=null;return true;
        }catch(Exception e){if(out!=null)file.failWrite(out);return false;}
        finally{if(bitmap!=null)bitmap.recycle();}
    }
    synchronized void reset(){file.delete();}
}
