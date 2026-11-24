package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ClipData;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import java.io.*;
import java.net.*;
import java.util.Arrays;
import org.json.*;

final class LauncherUpdater {
    private static final String REPO="https://github.com/capnolithyl/AI-Desktop-Companion";
    private static final String API="https://api.github.com/repos/capnolithyl/AI-Desktop-Companion/releases?per_page=100";
    private final Activity activity;
    private boolean busy;
    LauncherUpdater(Activity activity){this.activity=activity;}
    private boolean active(){return !activity.isFinishing()&&!activity.isDestroyed()&&activity.hasWindowFocus();}
    private void message(String text){if(!activity.isFinishing()&&!activity.isDestroyed())Toast.makeText(activity,text,Toast.LENGTH_LONG).show();}
    private long code(PackageInfo p){return Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode;}
    private int flags(){return Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;}
    private Signature[] signers(PackageInfo p){return Build.VERSION.SDK_INT>=28?(p.signingInfo==null?null:p.signingInfo.getApkContentsSigners()):p.signatures;}
    private HttpURLConnection connect(String url) throws IOException {
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestProperty("User-Agent","Mikan-Launcher");return c;
    }
    private void transfer(String url,OutputStream out,long limit) throws IOException {
        HttpURLConnection c=connect(url);
        try{
            if(c.getResponseCode()!=200)throw new IOException("HTTP "+c.getResponseCode());
            try(InputStream in=c.getInputStream()){byte[] bytes=new byte[16384];int n;long total=0;while((n=in.read(bytes))!=-1){total+=n;if(total>limit)throw new IOException("Download too large");out.write(bytes,0,n);}}
        }finally{c.disconnect();}
    }
    void check(){
        if(busy){message("Update check already running");return;}
        busy=true;message("Checking GitHub for updates…");
        new Thread(()->{
            try{
                PackageInfo current=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
                ByteArrayOutputStream out=new ByteArrayOutputStream();transfer(API,out,5_000_000);
                JSONArray releases=new JSONArray(out.toString("UTF-8"));
                long best=code(current);String name=null;String url=null;
                for(int i=0;i<releases.length();i++){
                    JSONObject r=releases.getJSONObject(i);String tag=r.optString("tag_name");
                    if(r.optBoolean("draft")||!tag.matches("launcher-build-[0-9]{1,9}"))continue;
                    long version=Long.parseLong(tag.substring("launcher-build-".length()));if(version<=best)continue;
                    JSONArray assets=r.optJSONArray("assets");if(assets==null)continue;
                    String expected=REPO+"/releases/download/"+tag+"/Mikan-Launcher.apk";
                    for(int j=0;j<assets.length();j++){
                        JSONObject a=assets.getJSONObject(j);
                        if("Mikan-Launcher.apk".equals(a.optString("name"))&&expected.equals(a.optString("browser_download_url"))){
                            best=version;url=expected;name=r.optString("name",tag);break;
                        }
                    }
                }
                final String download=url,title=name;final long version=best;
                activity.runOnUiThread(()->{busy=false;if(!active())return;if(download==null){message("You're up to date!");return;}
                    new AlertDialog.Builder(activity).setTitle(title).setMessage("A newer signed launcher is available. Your local settings will be kept.").setNegativeButton("Later",null).setPositiveButton("Update",(d,w)->download(download,version)).show();});
            }catch(Exception e){activity.runOnUiThread(()->{busy=false;message("Unable to check updates. Home still works offline.");});}
        },"launcher-update-check").start();
    }
    private void download(String url,long version){
        if(busy)return;
        if(!activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity).setTitle("Allow launcher updates").setMessage("Android needs permission to install updates from Mikan Launcher. Enable it, return here, then check for updates again.").setNegativeButton("Cancel",null).setPositiveButton("Open settings",(d,w)->{
                try{activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}catch(Exception e){message("Open Android's Install unknown apps settings.");}
            }).show();return;
        }
        busy=true;message("Downloading update…");
        new Thread(()->{
            File file=new File(activity.getCacheDir(),"launcher-update.apk");
            try{
                try(FileOutputStream out=new FileOutputStream(file)){transfer(url,out,50_000_000);}
                PackageManager pm=activity.getPackageManager();
                PackageInfo current=pm.getPackageInfo(activity.getPackageName(),flags());
                PackageInfo next=pm.getPackageArchiveInfo(file.getAbsolutePath(),flags());
                if(next==null||!activity.getPackageName().equals(next.packageName)||code(next)!=version||code(next)<=code(current)||signers(current)==null||signers(next)==null||!Arrays.equals(signers(current),signers(next)))throw new IOException("APK identity or signature mismatch");
                activity.runOnUiThread(()->{busy=false;if(!active()){message("Return to launcher settings to check again.");return;}
                    try{Uri uri=Uri.parse("content://"+activity.getPackageName()+".updates/launcher-update.apk");Intent install=new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);install.setClipData(ClipData.newRawUri("Launcher APK",uri));activity.startActivity(install);}
                    catch(Exception e){message("Android could not open the installer.");}
                });
            }catch(Exception e){file.delete();activity.runOnUiThread(()->{busy=false;message("Update download or verification failed. Nothing was installed.");});}
        },"launcher-update-download").start();
    }
}
