package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.LruCache;
import java.io.InputStream;
import java.util.EnumSet;

/** Bounded local portrait cache; no background service or network. */
final class ExpressionArt {
    private final Context context;
    private final EnumSet<MikanExpression> unavailable=EnumSet.noneOf(MikanExpression.class);
    private final LruCache<MikanExpression,Bitmap> cache=new LruCache<MikanExpression,Bitmap>(8*1024*1024){
        @Override protected int sizeOf(MikanExpression key,Bitmap bitmap){return bitmap.getAllocationByteCount();}
    };
    ExpressionArt(Context context){this.context=context.getApplicationContext();}
    Drawable get(MikanExpression expression){
        Bitmap bitmap=cache.get(expression);
        if(bitmap==null&&!unavailable.contains(expression)){
            try(InputStream stream=context.getAssets().open(expression.asset())){
                bitmap=BitmapFactory.decodeStream(stream);
                if(bitmap!=null)cache.put(expression,bitmap);else unavailable.add(expression);
            }catch(Exception ex){unavailable.add(expression);}
        }
        if(bitmap!=null)return new BitmapDrawable(context.getResources(),bitmap);
        return expression==MikanExpression.DEFAULT?null:get(MikanExpression.DEFAULT);
    }
    void clear(){cache.evictAll();}
}
