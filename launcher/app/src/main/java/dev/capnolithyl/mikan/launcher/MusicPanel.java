package dev.capnolithyl.mikan.launcher;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

final class MusicPanel {
    private static final int PEACH=0xffffbf88,CREAM=0xffffe9d5,MUTED=0xffe1bda9;
    private static final int STEPS=1000;
    private final Context context;
    private final LinearLayout root,buttons,timeline;
    private final TextView title,artist,elapsed,total;
    private final MediaButton prev,play,next;
    private final ImageView artwork;
    private final SeekBar seek;
    private MediaController controller;
    private PlaybackState playback;
    private long duration;
    private boolean scrubbing;
    private MediaSession.Token scrubToken;
    private String scrubTrack;
    private long scrubDuration;
    private long optimisticUntil,optimisticPosition;
    private String track;
    private Bitmap displayedArtwork;
    MusicPanel(Context context){
        this.context=context;
        root=new LinearLayout(context);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(12),dp(9),dp(12),dp(7));
        GradientDrawable bg=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xf13d2a28,0xed2a2022});
        bg.setCornerRadius(dp(23));bg.setStroke(dp(1),0xff906044);root.setBackground(bg);root.setElevation(dp(2));
        LinearLayout row=new LinearLayout(context);row.setGravity(Gravity.CENTER_VERTICAL);root.addView(row);
        artwork=new ImageView(context);artwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable artBg=new GradientDrawable();artBg.setColor(0xff50332b);artBg.setCornerRadius(dp(8));artwork.setBackground(artBg);artwork.setClipToOutline(true);
        row.addView(artwork,new LinearLayout.LayoutParams(dp(48),dp(48)));
        LinearLayout copy=new LinearLayout(context);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(dp(10),0,0,0);row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        title=label("Now playing",15,CREAM);title.setTypeface(Typeface.DEFAULT,Typeface.BOLD);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);copy.addView(title);
        artist=label("",12,MUTED);artist.setMaxLines(2);copy.addView(artist);

        timeline=new LinearLayout(context);timeline.setGravity(Gravity.CENTER_VERTICAL);
        root.addView(timeline,new LinearLayout.LayoutParams(-1,dp(30)));
        elapsed=label("0:00",10,MUTED);elapsed.setGravity(Gravity.CENTER);timeline.addView(elapsed,new LinearLayout.LayoutParams(dp(42),-1));
        seek=new SeekBar(context);seek.setMax(STEPS);seek.setContentDescription("Playback position");seek.setPadding(dp(5),0,dp(5),0);
        seek.setProgressTintList(ColorStateList.valueOf(PEACH));seek.setProgressBackgroundTintList(ColorStateList.valueOf(0xff72503f));seek.setThumbTintList(ColorStateList.valueOf(PEACH));
        timeline.addView(seek,new LinearLayout.LayoutParams(0,-1,1));
        total=label("0:00",10,MUTED);total.setGravity(Gravity.CENTER);timeline.addView(total,new LinearLayout.LayoutParams(dp(42),-1));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            @Override public void onProgressChanged(SeekBar bar,int progress,boolean fromUser){if(fromUser){elapsed.setText(format(positionFor(progress,scrubbing?scrubDuration:duration)));if(!scrubbing)seekTo(progress,controller==null?null:controller.getSessionToken(),track,duration);}}
            @Override public void onStartTrackingTouch(SeekBar bar){scrubbing=true;scrubToken=controller==null?null:controller.getSessionToken();scrubTrack=track;scrubDuration=duration;bar.getParent().requestDisallowInterceptTouchEvent(true);}
            @Override public void onStopTrackingTouch(SeekBar bar){if(scrubbing)seekTo(bar.getProgress(),scrubToken,scrubTrack,scrubDuration);scrubbing=false;bar.getParent().requestDisallowInterceptTouchEvent(false);updatePosition();}
        });
        buttons=new LinearLayout(context);buttons.setGravity(Gravity.CENTER);root.addView(buttons);
        prev=control(0,"Previous track",()->command(0));play=control(1,"Play or pause",()->command(1));next=control(2,"Next track",()->command(2));
        refresh();
    }
    View view(){return root;}
    private int dp(float n){return Math.round(n*context.getResources().getDisplayMetrics().density);}
    private TextView label(String s,int size,int color){TextView t=new TextView(context);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);return t;}
    private MediaButton control(int kind,String desc,Runnable r){MediaButton button=new MediaButton(context,kind);button.setContentDescription(desc);button.setOnClickListener(v->r.run());buttons.addView(button,new LinearLayout.LayoutParams(0,dp(44),1));return button;}
    boolean isSeekTouch(float rawX,float rawY){
        if(timeline.getVisibility()!=View.VISIBLE||!seek.isShown()||!seek.isEnabled())return false;
        int[] xy=new int[2];seek.getLocationOnScreen(xy);
        return rawX>=xy[0]&&rawX<xy[0]+seek.getWidth()&&rawY>=xy[1]&&rawY<xy[1]+seek.getHeight();
    }
    private void command(int action){
        MediaController c=controller;if(c==null||!LauncherNotifications.allowed(context))return;
        try{
            PlaybackState state=c.getPlaybackState();if(state==null)return;long actions=state.getActions();
            MediaController.TransportControls controls=c.getTransportControls();
            if(action==0&&(actions&PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0)controls.skipToPrevious();
            else if(action==2&&(actions&PlaybackState.ACTION_SKIP_TO_NEXT)!=0)controls.skipToNext();
            else if(action==1){
                boolean playing=state.getState()==PlaybackState.STATE_PLAYING;
                if((actions&(PlaybackState.ACTION_PLAY_PAUSE|(playing?PlaybackState.ACTION_PAUSE:PlaybackState.ACTION_PLAY)))!=0){if(playing)controls.pause();else controls.play();}
            }
        }catch(RuntimeException ignored){}
    }
    private void empty(String message){
        controller=null;playback=null;duration=0;track=null;scrubbing=false;optimisticUntil=0;displayedArtwork=null;title.setText("Now playing");artist.setText(message);artwork.setImageResource(android.R.drawable.ic_media_play);buttons.setVisibility(View.GONE);timeline.setVisibility(View.GONE);
    }
    private static String trackKey(MediaMetadata m){
        if(m==null)return null;
        return m.getString(MediaMetadata.METADATA_KEY_MEDIA_ID)+"|"+m.getString(MediaMetadata.METADATA_KEY_TITLE)+"|"+m.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)+"|"+m.getString(MediaMetadata.METADATA_KEY_ARTIST)+"|"+m.getLong(MediaMetadata.METADATA_KEY_DURATION);
    }
    private static long positionFor(int progress,long length){return (long)(Math.max(0,length)*(Math.max(0,Math.min(STEPS,progress))/(double)STEPS));}
    private void seekTo(int progress,MediaSession.Token token,String key,long length){
        MediaController c=controller;if(c==null||token==null||length<=0||!LauncherNotifications.allowed(context))return;
        try{
            PlaybackState state=c.getPlaybackState();MediaMetadata metadata=c.getMetadata();
            if(!token.equals(c.getSessionToken())||!Objects.equals(key,trackKey(metadata))||state==null||(state.getActions()&PlaybackState.ACTION_SEEK_TO)==0)return;
            long position=positionFor(progress,length);c.getTransportControls().seekTo(position);optimisticPosition=position;optimisticUntil=SystemClock.elapsedRealtime()+1800;
        }catch(RuntimeException ignored){}
    }
    private static String format(long millis){
        long seconds=Math.max(0,millis/1000);return seconds>=3600?String.format(Locale.ROOT,"%d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60):String.format(Locale.ROOT,"%d:%02d",seconds/60,seconds%60);
    }
    void updatePosition(){
        if(scrubbing||duration<=0||timeline.getVisibility()!=View.VISIBLE)return;
        PlaybackState state=playback;
        if(state==null||state.getPosition()<0){elapsed.setText("--:--");seek.setProgress(0);return;}
        long now=SystemClock.elapsedRealtime();long position=state.getPosition();
        if(now<optimisticUntil)position=optimisticPosition;
        else if(state.getState()==PlaybackState.STATE_PLAYING&&state.getLastPositionUpdateTime()>0){position+=(long)(Math.max(0,now-state.getLastPositionUpdateTime())*state.getPlaybackSpeed());}
        position=Math.max(0,Math.min(duration,position));elapsed.setText(format(position));seek.setProgress((int)Math.round(position/(double)duration*STEPS));
    }
    void refresh(){
        if(!LauncherNotifications.allowed(context)){empty("Enable notification / music access in launcher settings.");return;}
        try{
            MediaSessionManager manager=context.getSystemService(MediaSessionManager.class);
            List<MediaController> sessions=manager.getActiveSessions(LauncherNotifications.component(context));MediaController best=null;
            for(MediaController c:sessions){if(c.getMetadata()==null)continue;if(best==null)best=c;PlaybackState s=c.getPlaybackState();if(s!=null&&s.getState()==PlaybackState.STATE_PLAYING){best=c;break;}}
            if(best==null){empty("Start playing music in your favorite player.");return;}
            MediaMetadata m=best.getMetadata();if(m==null){empty("No track information available.");return;}
            PlaybackState state=best.getPlaybackState();String newTrack=trackKey(m);
            if(controller==null||!controller.getSessionToken().equals(best.getSessionToken())||!Objects.equals(track,newTrack)){optimisticUntil=0;scrubbing=false;}
            controller=best;track=newTrack;playback=state;duration=Math.max(0,m.getLong(MediaMetadata.METADATA_KEY_DURATION));
            String song=m.getString(MediaMetadata.METADATA_KEY_TITLE);String who=m.getString(MediaMetadata.METADATA_KEY_ARTIST);
            if(song==null)song=m.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            title.setText(song==null?"Now playing":song);artist.setText(who==null?best.getPackageName():who);
            Bitmap bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);if(bitmap==null)bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_ART);if(bitmap==null)bitmap=m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
            if(bitmap==null){if(displayedArtwork!=null||artwork.getDrawable()==null)artwork.setImageResource(android.R.drawable.ic_media_play);}else if(bitmap!=displayedArtwork)artwork.setImageBitmap(bitmap);displayedArtwork=bitmap;
            buttons.setVisibility(View.VISIBLE);boolean playing=state!=null&&state.getState()==PlaybackState.STATE_PLAYING;play.setPlaying(playing);
            long actions=state==null?0:state.getActions();enable(prev,(actions&PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0);enable(next,(actions&PlaybackState.ACTION_SKIP_TO_NEXT)!=0);enable(play,(actions&(PlaybackState.ACTION_PLAY_PAUSE|(playing?PlaybackState.ACTION_PAUSE:PlaybackState.ACTION_PLAY)))!=0);
            timeline.setVisibility(duration>0?View.VISIBLE:View.GONE);boolean canSeek=duration>0&&(actions&PlaybackState.ACTION_SEEK_TO)!=0;
            seek.setEnabled(canSeek);seek.setThumbTintList(ColorStateList.valueOf(canSeek?PEACH:0xff99765f));total.setText(format(duration));updatePosition();
        }catch(RuntimeException e){empty("Music unavailable. Check notification access.");}
    }
    private void enable(View v,boolean enabled){v.setEnabled(enabled);v.setAlpha(enabled?1f:.35f);}
    private final class MediaButton extends View {
        private final int kind;
        private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        private boolean playing;
        MediaButton(Context context,int kind){
            super(context);this.kind=kind;setFocusable(true);
            GradientDrawable mask=new GradientDrawable();mask.setColor(0xffffffff);mask.setCornerRadius(dp(14));
            setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffbf88),null,mask));
        }
        void setPlaying(boolean value){if(playing!=value){playing=value;invalidate();}setContentDescription(value?"Pause":"Play");}
        @Override protected void onDraw(Canvas c){
            super.onDraw(c);float side=dp(22);c.save();c.translate((getWidth()-side)/2f,(getHeight()-side)/2f);c.scale(side/24f,side/24f);paint.setColor(PEACH);paint.setStyle(Paint.Style.FILL);
            if(kind==1){if(playing){c.drawRoundRect(5,3,10,21,1.3f,1.3f,paint);c.drawRoundRect(14,3,19,21,1.3f,1.3f,paint);}else triangle(c,6,3,21,12,6,21);}
            else if(kind==0){c.drawRoundRect(3,3,6,21,1,1,paint);triangle(c,20,3,7,12,20,21);}
            else{triangle(c,4,3,17,12,4,21);c.drawRoundRect(18,3,21,21,1,1,paint);}
            c.restore();
        }
        private void triangle(Canvas c,float ax,float ay,float bx,float by,float cx,float cy){Path path=new Path();path.moveTo(ax,ay);path.lineTo(bx,by);path.lineTo(cx,cy);path.close();c.drawPath(path,paint);}
    }
}
