package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.zip.*;

/** Validated four-image pack in one private file. No archive extraction, network or broad storage access. */
final class DreamArtPack {
    private static final int MAX_IMAGE=2*1024*1024,MAX_ZIP=9*1024*1024;
    private static final Set<String> NAMES=new HashSet<>(Arrays.asList("morning.webp","day.webp","evening.webp","night.webp"));
    private final Context context;
    private final File file;
    DreamArtPack(Context context){this.context=context.getApplicationContext();file=new File(this.context.getFilesDir(),"dream-art-v1.zip");}
    boolean installed(){return file.isFile();}
    String revision(){return file.lastModified()+":"+file.length();}
    boolean remove(){return !file.exists()||file.delete();}
    void install(Uri uri)throws IOException{
        File incoming=File.createTempFile("dream-upload-",".zip",context.getCacheDir());
        File validated=File.createTempFile("dream-pack-",".zip",context.getFilesDir());
        try{
            try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(incoming)){
                if(in==null)throw new IOException("Missing file");
                byte[] buf=new byte[8192];int n,total=0;
                while((n=in.read(buf))!=-1){total+=n;if(total>MAX_ZIP)throw new IOException("Archive too large");out.write(buf,0,n);}
            }
            Set<String> seen=new HashSet<>();
            try(ZipFile zip=new ZipFile(incoming);ZipOutputStream out=new ZipOutputStream(new FileOutputStream(validated))){
                Enumeration<? extends ZipEntry> items=zip.entries();
                while(items.hasMoreElements()){
                    ZipEntry entry=items.nextElement();String name=entry.getName();
                    if(entry.isDirectory()||!NAMES.contains(name)||!seen.add(name))throw new IOException("Unexpected entry");
                    byte[] bytes;try(InputStream in=zip.getInputStream(entry)){bytes=read(in);}
                    validate(bytes);out.putNextEntry(new ZipEntry(name));out.write(bytes);out.closeEntry();
                }
                if(!seen.equals(NAMES))throw new IOException("Missing art");
            }
            Files.move(validated.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        }finally{incoming.delete();validated.delete();}
    }
    private static byte[] read(InputStream in)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;
        while((n=in.read(buf))!=-1){if(out.size()+n>MAX_IMAGE)throw new IOException("Image too large");out.write(buf,0,n);}
        return out.toByteArray();
    }
    private static void validate(byte[] bytes)throws IOException{
        if(bytes.length<16||bytes[0]!='R'||bytes[1]!='I'||bytes[2]!='F'||bytes[3]!='F'||bytes[8]!='W'||bytes[9]!='E'||bytes[10]!='B'||bytes[11]!='P')throw new IOException("Not WebP");
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
        if(bounds.outWidth<1||bounds.outHeight<1||bounds.outWidth>2048||bounds.outHeight>2048)throw new IOException("Invalid dimensions");
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=2;
        Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(decoded==null)throw new IOException("Invalid image");decoded.recycle();
    }
    Drawable load(DreamRules.Period period){
        if(!installed())return null;
        String name=period.name().toLowerCase(Locale.ROOT)+".webp";
        try(ZipFile zip=new ZipFile(file)){
            ZipEntry entry=zip.getEntry(name);if(entry==null)return null;byte[] bytes;
            try(InputStream in=zip.getInputStream(entry)){bytes=read(in);}
            Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);return bitmap==null?null:new BitmapDrawable(context.getResources(),bitmap);
        }catch(IOException|RuntimeException ex){return null;}
    }
}
