package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.LruCache;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;

/** Bounded local portrait cache; decode large holiday PNGs at widget scale. */
final class ExpressionArt {
    private final Context context;
    private final Set<String> unavailable=new HashSet<>();
    private final LruCache<String,Bitmap> cache=new LruCache<String,Bitmap>(8*1024*1024){
        @Override protected int sizeOf(String key,Bitmap bitmap){return bitmap.getAllocationByteCount();}
    };
    ExpressionArt(Context context){this.context=context.getApplicationContext();}
    private Bitmap load(String asset){
        Bitmap bitmap=cache.get(asset);
        if(bitmap!=null||unavailable.contains(asset))return bitmap;
        try{
            BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;
            try(InputStream in=context.getAssets().open(asset)){BitmapFactory.decodeStream(in,null,opts);}
            if(opts.outWidth<=0||opts.outHeight<=0){unavailable.add(asset);return null;}
            opts.inJustDecodeBounds=false;opts.inSampleSize=1;
            while(Math.max(opts.outWidth,opts.outHeight)/opts.inSampleSize>1024)opts.inSampleSize*=2;
            try(InputStream in=context.getAssets().open(asset)){bitmap=BitmapFactory.decodeStream(in,null,opts);}
            if(bitmap!=null)cache.put(asset,bitmap);else unavailable.add(asset);
        }catch(Exception ex){unavailable.add(asset);}
        return bitmap;
    }
    Drawable get(MikanExpression expression){return get(expression,null);}
    Drawable get(MikanExpression expression,String holidayAsset){
        Bitmap bitmap=holidayAsset==null?null:load(holidayAsset);
        if(bitmap==null)bitmap=load(expression.asset());
        if(bitmap==null&&expression!=MikanExpression.DEFAULT)bitmap=load(MikanExpression.DEFAULT.asset());
        return bitmap==null?null:new BitmapDrawable(context.getResources(),bitmap);
    }
    void clear(){cache.evictAll();}
}
