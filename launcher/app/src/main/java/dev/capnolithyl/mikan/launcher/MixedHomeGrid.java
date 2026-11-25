package dev.capnolithyl.mikan.launcher;

import android.content.ClipData;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.view.DragEvent;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.util.*;

/** Scrollable grid with content-aware row heights. Editing handles do not intercept normal widget actions. */
final class MixedHomeGrid extends ViewGroup {
    interface Callbacks {void changed(Map<String,MixedLayout.Rect> layout);void rejected();void editItem(String key);void removeItem(String key);}
    private final Map<String,MixedLayout.Rect> positions;
    private final Map<String,MixedLayout.Spec> specs=new HashMap<>();
    private final Map<View,String> keys=new LinkedHashMap<>();
    private final int columns;private final boolean editing;private final Callbacks callbacks;
    private int[] edges;private int rows;private MixedLayout.Rect preview;private boolean valid;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final class Drag {final String key;final boolean resize;Drag(String key,boolean resize){this.key=key;this.resize=resize;}}
    MixedHomeGrid(Context c,int columns,boolean editing,Map<String,MixedLayout.Rect> positions,List<MixedLayout.Spec> specs,Callbacks callbacks){
        super(c);this.columns=columns;this.editing=editing;this.positions=new LinkedHashMap<>(positions);this.callbacks=callbacks;
        for(MixedLayout.Spec spec:specs)this.specs.put(spec.key,spec);
        rows=1;for(MixedLayout.Rect rect:positions.values())rows=Math.max(rows,rect.y+rect.h);if(editing)rows=Math.min(MixedLayout.ROW_LIMIT,rows+2);
        setWillNotDraw(false);setClipChildren(false);
    }
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable outline(int color){GradientDrawable d=new GradientDrawable();d.setColor(0x00000000);d.setCornerRadius(dp(12));d.setStroke(dp(1),color);return d;}
    void item(String key,View content){
        if(!positions.containsKey(key))return;
        FrameLayout frame=new FrameLayout(getContext());
        content.setOnDragListener(null);
        frame.addView(content,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
        if(editing){
            View move=new View(getContext());move.setBackground(outline(0xbaffbf88));move.setContentDescription("Move "+key);move.setFocusable(true);
            move.setOnClickListener(v->callbacks.editItem(key));move.setOnLongClickListener(v->start(frame,key,false));frame.addView(move,new FrameLayout.LayoutParams(-1,-1));
            if(key.startsWith("widget:")){
                TextView handle=new TextView(getContext());handle.setText("↘");handle.setTextColor(0xffffe9d5);handle.setTextSize(17);handle.setGravity(Gravity.CENTER);handle.setContentDescription("Resize "+key);handle.setBackground(MikanTheme.tile(getContext()));handle.setOnClickListener(v->callbacks.editItem(key));handle.setOnLongClickListener(v->start(frame,key,true));
                FrameLayout.LayoutParams hp=new FrameLayout.LayoutParams(dp(36),dp(36),Gravity.BOTTOM|Gravity.RIGHT);frame.addView(handle,hp);
            }else{
                TextView remove=new TextView(getContext());remove.setText("−");remove.setTextSize(22);remove.setTextColor(0xffffe9d5);remove.setGravity(Gravity.CENTER);
                GradientDrawable background=new GradientDrawable();background.setColor(0xff704339);background.setCornerRadius(dp(18));background.setStroke(dp(1),0xffb68158);remove.setBackground(background);
                CharSequence label=content.getContentDescription();remove.setContentDescription("Remove "+(label==null?"shortcut":label)+" from Home");remove.setFocusable(true);
                remove.setOnClickListener(v->callbacks.removeItem(key));
                frame.addView(remove,new FrameLayout.LayoutParams(dp(36),dp(36),Gravity.TOP|Gravity.RIGHT));
            }
        }
        keys.put(frame,key);addView(frame,new ViewGroup.LayoutParams(-1,-2));
    }
    private boolean start(View frame,String key,boolean resize){
        return frame.startDragAndDrop(ClipData.newPlainText("mikan-grid",key),new View.DragShadowBuilder(frame),new Drag(key,resize),0);
    }
    @Override protected void onMeasure(int widthSpec,int heightSpec){
        int width=MeasureSpec.getSize(widthSpec);int[] heights=new int[rows];Arrays.fill(heights,dp(80));
        for(Map.Entry<View,String> entry:keys.entrySet()){
            MixedLayout.Rect r=positions.get(entry.getValue());View v=entry.getKey();
            int childWidth=Math.max(1,(r.x+r.w)*width/columns-r.x*width/columns-dp(6));
            v.measure(MeasureSpec.makeMeasureSpec(childWidth,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(0,MeasureSpec.UNSPECIFIED));
            int need=v.getMeasuredHeight()+dp(6),current=0;for(int y=r.y;y<r.y+r.h;y++)current+=heights[y];
            if(need>current)heights[r.y+r.h-1]+=need-current;
        }
        edges=new int[rows+1];for(int y=0;y<rows;y++)edges[y+1]=edges[y]+heights[y];
        for(Map.Entry<View,String> entry:keys.entrySet()){
            MixedLayout.Rect r=positions.get(entry.getValue());entry.getKey().measure(MeasureSpec.makeMeasureSpec(Math.max(1,(r.x+r.w)*width/columns-r.x*width/columns-dp(6)),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(Math.max(1,edges[r.y+r.h]-edges[r.y]-dp(6)),MeasureSpec.EXACTLY));
        }
        setMeasuredDimension(width,resolveSize(edges[rows],heightSpec));
    }
    @Override protected void onLayout(boolean changed,int l,int t,int r,int b){
        int width=getWidth();
        for(Map.Entry<View,String> entry:keys.entrySet()){
            MixedLayout.Rect pos=positions.get(entry.getValue());int x=pos.x*width/columns+dp(3),y=edges[pos.y]+dp(3);
            View v=entry.getKey();v.layout(x,y,x+v.getMeasuredWidth(),y+v.getMeasuredHeight());
        }
    }
    @Override protected void onDraw(Canvas c){
        super.onDraw(c);if(!editing||edges==null)return;
        paint.setColor(0x557f5946);paint.setStrokeWidth(dp(1));
        for(int x=0;x<=columns;x++)c.drawLine(x*getWidth()/columns,0,x*getWidth()/columns,edges[rows],paint);
        for(int y:edges)c.drawLine(0,y,getWidth(),y,paint);
    }
    @Override protected void dispatchDraw(Canvas c){
        super.dispatchDraw(c);if(preview==null||edges==null||!preview.fits(columns)||preview.y+preview.h>rows)return;
        paint.setColor(valid?0x6659c287:0x77d16e5b);c.drawRect(preview.x*getWidth()/columns,edges[preview.y],(preview.x+preview.w)*getWidth()/columns,edges[preview.y+preview.h],paint);
    }
    private MixedLayout.Rect candidate(Drag drag,float x,float y){
        MixedLayout.Rect old=positions.get(drag.key);if(old==null||edges==null)return null;
        int col=Math.max(0,Math.min(columns-1,(int)(x*columns/Math.max(1,getWidth())))),row=0;
        while(row+1<rows&&y>=edges[row+1])row++;
        return drag.resize?new MixedLayout.Rect(old.x,old.y,col-old.x+1,row-old.y+1):new MixedLayout.Rect(col,row,old.w,old.h);
    }
    @Override public boolean onDragEvent(DragEvent event){
        if(!editing||!(event.getLocalState() instanceof Drag))return false;
        Drag drag=(Drag)event.getLocalState();
        switch(event.getAction()){
            case DragEvent.ACTION_DRAG_STARTED:return true;
            case DragEvent.ACTION_DRAG_LOCATION:
            case DragEvent.ACTION_DROP:
                preview=candidate(drag,event.getX(),event.getY());
                MixedLayout.Spec spec=specs.get(drag.key);
                valid=preview!=null&&spec!=null&&spec.accepts(preview,columns)&&MixedLayout.vacant(positions,drag.key,preview,columns);
                if(event.getAction()==DragEvent.ACTION_DROP){
                    if(valid){positions.put(drag.key,preview);Map<String,MixedLayout.Rect> next=new LinkedHashMap<>(positions);post(()->callbacks.changed(next));}
                    else post(callbacks::rejected);
                    preview=null;
                }invalidate();return true;
            case DragEvent.ACTION_DRAG_EXITED:
            case DragEvent.ACTION_DRAG_ENDED:preview=null;invalidate();return true;
            default:return true;
        }
    }
}
