package dev.capnolithyl.mikan.launcher;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import android.os.SystemClock;
import org.json.JSONObject;

/** Read only a tiny health snapshot on the existing background check thread. */
final class MikanHealthClient {
    private static final int MAX_BYTES=4096,TIMEOUT_MS=5000;
    static MikanHealth check(String configured){
        HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)MikanHealth.endpoint(configured).toURL().openConnection();
            connection.setRequestMethod("GET");connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT_MS);connection.setReadTimeout(TIMEOUT_MS);
            connection.setUseCaches(false);connection.setRequestProperty("Accept","application/json");
            int code=connection.getResponseCode();
            if(code!=200)return MikanHealth.http(code);
            String contentType=connection.getContentType();
            if(contentType==null||!contentType.toLowerCase(java.util.Locale.ROOT).split(";",2)[0].trim().equals("application/json"))return MikanHealth.UNVERIFIED;
            if(connection.getContentLengthLong()>MAX_BYTES)return MikanHealth.UNVERIFIED;
            long deadline=SystemClock.elapsedRealtime()+TIMEOUT_MS;
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buffer=new byte[1024];
                int count;
                while((count=input.read(buffer))!=-1){
                    if(SystemClock.elapsedRealtime()>deadline||bytes.size()+count>MAX_BYTES)return MikanHealth.UNVERIFIED;
                    bytes.write(buffer,0,count);
                }
                JSONObject value=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
                return MikanHealth.payload(value.opt("ok"),value.opt("service"),value.opt("maintenance"),value.opt("idle"));
            }catch(Exception invalid){return MikanHealth.UNVERIFIED;}
        }catch(Exception unavailable){return MikanHealth.UNREACHABLE;}
        finally{if(connection!=null)connection.disconnect();}
    }
}
