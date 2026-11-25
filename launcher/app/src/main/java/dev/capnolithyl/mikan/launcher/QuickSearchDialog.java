package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.util.Collections;
import java.util.List;

/** Small local search surface independent of the app drawer and Home hierarchy. */
final class QuickSearchDialog<T> extends Dialog {
    static final int LIMIT=5;
    private static final int CREAM=0xffffe9d5, PEACH=0xffffbf88, MUTED=0xffe1bda9;
    interface Source<T> {
        List<T> matches(String query);
        String label(T item);
        Drawable icon(T item);
        void launch(T item);
        void timing(String name,long start);
    }
    private final Activity activity;
    private final Source<T> source;
    private final EditText field;
    private final LinearLayout panel,results;
    private final ScrollView scroll;
    private final TextView heading;
    private List<T> matches=Collections.emptyList();
    private boolean launching,closing;

    QuickSearchDialog(Activity activity,Source<T> source){
        super(activity);this.activity=activity;this.source=source;
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setCancelable(true);setCanceledOnTouchOutside(true);
        panel=new LinearLayout(activity);panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(12),dp(12),dp(12),dp(12));panel.setBackground(MikanTheme.panel(activity,25));
        LinearLayout title=new LinearLayout(activity);title.setGravity(Gravity.CENTER_VERTICAL);
        heading=text("Quick access",12,MUTED,true);
        title.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        TextView close=text("×",23,PEACH,false);close.setGravity(Gravity.CENTER);close.setContentDescription("Close app search");close.setBackground(MikanTheme.ripple(activity,16));close.setOnClickListener(v->close());
        title.addView(close,new LinearLayout.LayoutParams(dp(48),dp(40)));panel.addView(title);
        scroll=new ScrollView(activity);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(false);
        results=new LinearLayout(activity);results.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(results,new ScrollView.LayoutParams(-1,-2));
        // Wrap content, but allow the result area to shrink first if keyboard,
        // landscape or large font leaves limited height. The input stays visible.
        panel.addView(scroll,new LinearLayout.LayoutParams(-1,-2,1));
        field=new EditText(activity){
            @Override public boolean onKeyPreIme(int keyCode,KeyEvent event){
                if(keyCode==KeyEvent.KEYCODE_BACK){
                    if(event.getAction()==KeyEvent.ACTION_UP&&!event.isCanceled())close();
                    return true;
                }
                return super.onKeyPreIme(keyCode,event);
            }
        };
        field.setSingleLine(true);field.setTextSize(16);field.setTextColor(CREAM);field.setHintTextColor(MUTED);
        field.setHint("Find an app…");field.setContentDescription("Find an installed app");
        field.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        field.setImeOptions(EditorInfo.IME_ACTION_GO|EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        field.setPadding(dp(16),dp(10),dp(16),dp(10));field.setSelectAllOnFocus(false);
        GradientDrawable background=new GradientDrawable();background.setColor(0xff241a1d);background.setCornerRadius(dp(19));background.setStroke(dp(1),0xff926244);field.setBackground(background);
        LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(-1,-2);fp.topMargin=dp(8);field.setMinHeight(dp(52));panel.addView(field,fp);
        field.addTextChangedListener(new TextWatcher(){
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count){refresh();}
            @Override public void afterTextChanged(Editable s){}
        });
        field.setOnEditorActionListener((v,id,event)->{
            boolean enter=event!=null&&(event.getKeyCode()==KeyEvent.KEYCODE_ENTER||event.getKeyCode()==KeyEvent.KEYCODE_NUMPAD_ENTER);
            if(enter){if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0)launchFirst();return true;}
            if(id==EditorInfo.IME_ACTION_GO||id==EditorInfo.IME_ACTION_DONE||id==EditorInfo.IME_ACTION_SEARCH){launchFirst();return true;}
            return false;
        });
        setContentView(panel);
    }

    void open(long started){
        Window window=getWindow();
        if(window!=null){
            window.setBackgroundDrawable(new ColorDrawable(android.graphics.Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window.setDimAmount(.42f);
            window.clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
            window.setGravity(Gravity.BOTTOM);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
        refresh();field.requestFocus();show();
        if(window!=null)window.setLayout(-1,-2);
        panel.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener(){
            @Override public boolean onPreDraw(){
                ViewTreeObserver observer=panel.getViewTreeObserver();if(observer.isAlive())observer.removeOnPreDrawListener(this);
                if(isShowing()&&!closing)source.timing("quick search open to pre-draw",started);
                return true;
            }
        });
        field.post(()->{
            if(!isShowing()||closing)return;
            field.requestFocus();
            InputMethodManager ime=activity.getSystemService(InputMethodManager.class);
            if(ime!=null)ime.showSoftInput(field,InputMethodManager.SHOW_IMPLICIT);
        });
    }
    void refresh(){
        if(closing)return;
        long started=SystemClock.elapsedRealtime();String query=field.getText().toString();
        matches=source.matches(query);results.removeAllViews();
        heading.setText(query.trim().isEmpty()?"Recent & pinned":"Matching apps");
        if(matches.isEmpty()){
            TextView empty=text(query.trim().isEmpty()?"Type an app name to get started.":"No matching apps.",13,MUTED,false);
            empty.setPadding(dp(8),dp(12),dp(8),dp(12));results.addView(empty);
        }else{
            for(int i=0;i<matches.size();i++){
                final T item=matches.get(i);LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(8),dp(5),dp(8),dp(5));row.setMinimumHeight(dp(48));
                if(i==0){GradientDrawable selected=new GradientDrawable();selected.setColor(0x885d4034);selected.setCornerRadius(dp(14));row.setBackground(selected);}
                row.setForeground(MikanTheme.ripple(activity,14));row.setFocusable(true);
                ImageView icon=new ImageView(activity);icon.setImageDrawable(source.icon(item));icon.setScaleType(ImageView.ScaleType.FIT_CENTER);icon.setPadding(dp(4),dp(4),dp(4),dp(4));icon.setBackground(MikanTheme.tile(activity));icon.setClipToOutline(true);
                row.addView(icon,new LinearLayout.LayoutParams(dp(36),dp(36)));
                TextView name=text(source.label(item),15,CREAM,i==0);name.setMaxLines(2);name.setEllipsize(TextUtils.TruncateAt.END);name.setPadding(dp(10),0,dp(6),0);row.addView(name,new LinearLayout.LayoutParams(0,-2,1));
                TextView arrow=text(i==0?"↵":"↗",15,PEACH,false);row.addView(arrow);
                row.setContentDescription("Open "+source.label(item));row.setOnClickListener(v->launch(item));results.addView(row,new LinearLayout.LayoutParams(-1,-2));
            }
        }
        scroll.scrollTo(0,0);source.timing("quick search rank/render",started);
    }
    private void launchFirst(){if(!matches.isEmpty())launch(matches.get(0));}
    private void launch(T item){if(closing||launching||!isShowing())return;launching=true;source.launch(item);if(isShowing()&&!closing){launching=false;refresh();}}
    void close(){
        if(closing)return;closing=true;
        InputMethodManager ime=activity.getSystemService(InputMethodManager.class);
        if(ime!=null)ime.hideSoftInputFromWindow(field.getWindowToken(),0);
        dismiss();
    }
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color,boolean bold){
        TextView v=new TextView(activity);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
}
