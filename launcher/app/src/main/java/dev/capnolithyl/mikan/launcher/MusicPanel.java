package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadata;
import android.media.session.*;
import android.view.Gravity;
import android.widget.*;
import android.view.View;
import java.util.*;

final class MusicPanel {
    private final Context context;
    private final LinearLayout root,buttons;
    private final TextView title,artist,prev,play,next;
    private final ImageView artwork;
    private MediaController controller;
    private static final int PEACH=0xffffbf88,CREAM=0xffffe9d5,MUTED=0xffe1bda9;
    MusicPanel(Context context){
        this.context=context;
        root=new LinearLayout(context);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(14),dp(12),dp(14),dp(12));
        GradientDrawable bg=new GradientDrawable();bg.setColor(0xe6312325);bg.setCornerRadius(dp(24));bg.setStroke(dp(1),0xff805439);root.setBackground(bg);
        LinearLayout row=new LinearLayout(context);row.setGravity(Gravity.CENTER_VERTICAL);root.addView(row);
        artwork=new ImageView(context);artwork.setScaleType(ImageView.ScaleType.CENTER_CROP);row.addView(artwork,new LinearLayout.LayoutParams(dp(54),dp(54)));
        LinearLayout copy=new LinearLayout(context);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(dp(12),0,0,0);row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        title=label("Now playing",16,CREAM);title.setTypeface(Typeface.DEFAULT,Typeface.BOLD);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);copy.addView(title);
        artist=label("",12,MUTED);artist.setMaxLines(2);copy.addView(artist);
        buttons=new LinearLayout(context);buttons.setGravity(Gravity.CENTER);root.addView(buttons);
        prev=control("⏮","Previous track",()->command(0));play=control("▶","Play or pause",()->command(1));next=control("⏭","Next track",()->command(2));
        refresh();
    }
    View view(){return root;}
    private int dp(float n){return Math.round(n*context.getResources().getDisplayMetrics().density);}
    private TextView label(String s,int size,int color){TextView t=new TextView(context);t.setText(s);t.setTextSize(size);t.setTextColor(color);return t;}
    private TextView control(String s,String desc,Runnable r){TextView t=label(s,24,PEACH);t.setGravity(Gravity.CENTER);t.setContentDescription(desc);t.setOnClickListener(v->r.run());buttons.addView(t,new LinearLayout.LayoutParams(0,dp(46),1));return t;}
    private void command(int action){
        MediaController c=controller;if(c==null||!LauncherNotifications.allowed(context))return;
        try{MediaController.TransportControls controls=c.getTransportControls();PlaybackState state=c.getPlaybackState();
            if(action==0)controls.skipToPrevious();else if(action==2)controls.skipToNext();else if(state!=null&&state.getState()==PlaybackState.STATE_PLAYING)controls.pause();else controls.play();
        }catch(RuntimeException ignored){}
    }
    private void empty(String message){
        controller=null;title.setText("Now playing");artist.setText(message);artwork.setImageResource(android.R.drawable.ic_media_play);buttons.setVisibility(View.GONE);
    }
    void refresh(){
        if(!LauncherNotifications.allowed(context)){empty("Enable notification / music access in launcher settings.");return;}
        try{
            MediaSessionManager manager=context.getSystemService(MediaSessionManager.class);
            List<MediaController> sessions=manager.getActiveSessions(LauncherNotifications.component(context));MediaController best=null;
            for(MediaController c:sessions){if(c.getMetadata()==null)continue;if(best==null)best=c;PlaybackState s=c.getPlaybackState();if(s!=null&&s.getState()==PlaybackState.STATE_PLAYING){best=c;break;}}
            if(best==null){empty("Start playing music in your favorite player.");return;}
            controller=best;MediaMetadata m=best.getMetadata();PlaybackState state=best.getPlaybackState();
            String song=m.getString(MediaMetadata.METADATA_KEY_TITLE);String who=m.getString(MediaMetadata.METADATA_KEY_ARTIST);
            if(song==null)song=m.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            title.setText(song==null?"Now playing":song);artist.setText(who==null?best.getPackageName():who);
            Bitmap bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);if(bitmap==null)bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_ART);if(bitmap==null)bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
            if(bitmap==null)artwork.setImageResource(android.R.drawable.ic_media_play);else artwork.setImageBitmap(bitmap);
            buttons.setVisibility(View.VISIBLE);boolean playing=state!=null&&state.getState()==PlaybackState.STATE_PLAYING;play.setText(playing?"⏸":"▶");
            long actions=state==null?0:state.getActions();enable(prev,(actions&PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0);enable(next,(actions&PlaybackState.ACTION_SKIP_TO_NEXT)!=0);enable(play,(actions&(PlaybackState.ACTION_PLAY_PAUSE|(playing?PlaybackState.ACTION_PAUSE:PlaybackState.ACTION_PLAY)))!=0);
        }catch(RuntimeException e){empty("Music unavailable. Check notification access.");}
    }
    private void enable(TextView v,boolean enabled){v.setEnabled(enabled);v.setAlpha(enabled?1f:.35f);}
}
