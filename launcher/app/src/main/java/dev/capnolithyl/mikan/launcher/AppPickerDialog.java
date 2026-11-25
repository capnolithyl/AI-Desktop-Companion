package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.util.*;
import java.util.function.Consumer;

/** Select a shortcut without launching it. Recycles rows and uses the cached app catalog. */
final class AppPickerDialog<T> extends Dialog {
    private static final int CREAM=0xffffe9d5,PEACH=0xffffbf88,MUTED=0xffe1bda9;
    interface Source<T>{
        String label(T item);
        String normalizedLabel(T item);
        String normalizedPackage(T item);
        Drawable icon(T item);
        String detail(T item);
    }
    private final Activity activity;
    private final ArrayList<T> candidates;
    private final Source<T> source;
    private final Consumer<T> selected;
    private final EditText field;
    private final ListView list;
    private final TextView count,empty;
    private final ArrayList<T> matches=new ArrayList<>();
    private final PickerAdapter adapter;
    private boolean done;

    AppPickerDialog(Activity activity,String title,List<T> candidates,Source<T> source,Consumer<T> selected,Runnable remove){
        super(activity);this.activity=activity;this.candidates=new ArrayList<>(candidates);this.source=source;this.selected=selected;
        requestWindowFeature(Window.FEATURE_NO_TITLE);setCancelable(true);setCanceledOnTouchOutside(true);
        LinearLayout panel=new LinearLayout(activity);panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(14),dp(12),dp(14),dp(12));panel.setBackground(MikanTheme.panel(activity,24));
        LinearLayout heading=new LinearLayout(activity);heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView name=text(title,19,CREAM,true);heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        TextView close=text("×",25,PEACH,false);close.setGravity(Gravity.CENTER);close.setContentDescription("Cancel app selection");close.setBackground(MikanTheme.ripple(activity,16));close.setOnClickListener(v->dismiss());
        heading.addView(close,new LinearLayout.LayoutParams(dp(48),dp(48)));panel.addView(heading);
        field=new EditText(activity);field.setSingleLine(true);field.setTextColor(CREAM);field.setHintTextColor(MUTED);field.setTextSize(16);field.setHint("Search apps…");field.setContentDescription("Search apps to add");
        field.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);field.setImeOptions(EditorInfo.IME_ACTION_GO|EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        GradientDrawable input=new GradientDrawable();input.setColor(0xff241a1d);input.setCornerRadius(dp(18));input.setStroke(dp(1),0xff926244);field.setBackground(input);field.setPadding(dp(15),dp(10),dp(15),dp(10));
        panel.addView(field,new LinearLayout.LayoutParams(-1,dp(52)));
        count=text("",12,MUTED,false);count.setPadding(dp(4),dp(9),0,dp(5));panel.addView(count);
        FrameLayout viewport=new FrameLayout(activity);
        list=new ListView(activity);list.setDivider(null);list.setDividerHeight(0);list.setSelector(new ColorDrawable(0x22ffbf88));
        viewport.addView(list,new FrameLayout.LayoutParams(-1,-1));
        empty=text("No matching apps.",14,MUTED,false);empty.setGravity(Gravity.CENTER);viewport.addView(empty,new FrameLayout.LayoutParams(-1,-1));list.setEmptyView(empty);
        panel.addView(viewport,new LinearLayout.LayoutParams(-1,0,1));
        if(remove!=null){
            TextView removeButton=text("Remove from dock",14,PEACH,true);removeButton.setGravity(Gravity.CENTER);removeButton.setMinHeight(dp(48));removeButton.setBackground(MikanTheme.ripple(activity,14));
            removeButton.setOnClickListener(v->{if(done)return;done=true;dismiss();remove.run();});panel.addView(removeButton,new LinearLayout.LayoutParams(-1,-2));
        }
        adapter=new PickerAdapter();list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{if(position>=0&&position<matches.size())choose(matches.get(position));});
        field.addTextChangedListener(new TextWatcher(){
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count){filter();}
            @Override public void afterTextChanged(Editable s){}
        });
        field.setOnEditorActionListener((v,id,event)->{
            boolean enter=event!=null&&(event.getKeyCode()==KeyEvent.KEYCODE_ENTER||event.getKeyCode()==KeyEvent.KEYCODE_NUMPAD_ENTER);
            if(enter){if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0&&!matches.isEmpty())choose(matches.get(0));return true;}
            if(id==EditorInfo.IME_ACTION_GO){if(!matches.isEmpty())choose(matches.get(0));return true;}
            return false;
        });
        setContentView(panel);filter();
    }
    void open(){
        Window window=getWindow();if(window!=null){
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window.setDimAmount(.55f);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        }
        show();
        if(window!=null){android.util.DisplayMetrics metrics=activity.getResources().getDisplayMetrics();window.setLayout(Math.min(metrics.widthPixels-dp(24),dp(540)),Math.min((int)(metrics.heightPixels*.76f),dp(620)));}
        // Allow browsing first; touching the search field opens the keyboard immediately.
        list.setFocusableInTouchMode(true);list.requestFocus();
    }
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color,boolean bold){
        TextView v=new TextView(activity);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private void filter(){
        String query=QuickAppRank.normalize(field.getText().toString());matches.clear();Map<T,Integer> scores=new HashMap<>();
        for(T item:candidates){int score=query.isEmpty()?0:QuickAppRank.scoreNormalized(query,source.normalizedLabel(item),source.normalizedPackage(item));if(score>=0){matches.add(item);scores.put(item,score);}}
        matches.sort(Comparator.comparingInt((T item)->scores.get(item)).thenComparing(source::normalizedLabel).thenComparing(source::normalizedPackage));
        count.setText(matches.size()+(matches.size()==1?" shortcut":" shortcuts"));adapter.notifyDataSetChanged();list.setSelection(0);
    }
    private void choose(T item){
        if(done||!isShowing())return;done=true;
        InputMethodManager ime=activity.getSystemService(InputMethodManager.class);if(ime!=null&&field.getWindowToken()!=null)ime.hideSoftInputFromWindow(field.getWindowToken(),0);
        dismiss();selected.accept(item);
    }
    private final class PickerRow extends LinearLayout{
        final ImageView icon;final TextView label,detail;
        PickerRow(){
            super(activity);setOrientation(HORIZONTAL);setGravity(Gravity.CENTER_VERTICAL);setPadding(dp(6),dp(5),dp(8),dp(5));setMinimumHeight(dp(56));setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
            icon=new ImageView(activity);icon.setScaleType(ImageView.ScaleType.FIT_CENTER);icon.setPadding(dp(5),dp(5),dp(5),dp(5));icon.setBackground(MikanTheme.tile(activity));icon.setClipToOutline(true);addView(icon,new LinearLayout.LayoutParams(dp(42),dp(42)));
            LinearLayout copy=new LinearLayout(activity);copy.setOrientation(VERTICAL);copy.setPadding(dp(12),0,dp(8),0);
            label=text("",15,CREAM,false);label.setMaxLines(2);label.setEllipsize(TextUtils.TruncateAt.END);copy.addView(label);
            detail=text("",11,MUTED,false);detail.setMaxLines(1);detail.setEllipsize(TextUtils.TruncateAt.END);copy.addView(detail);
            addView(copy,new LinearLayout.LayoutParams(0,-2,1));TextView plus=text("+",20,PEACH,true);addView(plus);
        }
        void bind(T item){
            icon.setImageDrawable(source.icon(item));label.setText(source.label(item));String subtitle=source.detail(item);
            detail.setText(subtitle);detail.setVisibility(subtitle.isEmpty()?View.GONE:View.VISIBLE);
            setContentDescription("Select "+source.label(item)+(subtitle.isEmpty()?"":", "+subtitle));
        }
    }
    private final class PickerAdapter extends BaseAdapter{
        @Override public int getCount(){return matches.size();}
        @Override public T getItem(int position){return matches.get(position);}
        @Override public long getItemId(int position){return position;}
        @Override public View getView(int position,View convertView,ViewGroup parent){
            // Inner generic view is not reifiable; this adapter owns every recycled row.
            PickerRow row=convertView==null?new PickerRow():(PickerRow)convertView;row.bind(getItem(position));return row;
        }
    }
}
