package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.Dialog;
import android.appwidget.AppWidgetProviderInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.LruCache;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.util.*;
import java.util.function.Consumer;

/** Browse providers by app; static previews only, never allocate or bind while browsing. */
final class WidgetPickerDialog extends Dialog {
    private static final int CREAM=0xffffe9d5,PEACH=0xffffbf88,MUTED=0xffe1bda9;
    private static final class Group {
        final String pkg,name;
        final List<Item> widgets=new ArrayList<>();
        Group(String pkg,String name){this.pkg=pkg;this.name=name;}
    }
    private static final class Item {
        final Group group;final AppWidgetProviderInfo info;final String name,size;
        String variant="";
        Item(Group group,AppWidgetProviderInfo info,String name,String size){this.group=group;this.info=info;this.name=name;this.size=size;}
    }
    private static final class Row {
        final Group group;final Item item;final int count;final boolean expanded;
        Row(Group group,Item item,int count,boolean expanded){this.group=group;this.item=item;this.count=count;this.expanded=expanded;}
    }
    private final Activity activity;
    private final Consumer<AppWidgetProviderInfo> selected;
    private final ArrayList<Group> groups=new ArrayList<>();
    private final ArrayList<Row> rows=new ArrayList<>();
    private final Set<String> expanded=new HashSet<>();
    private final LruCache<String,Bitmap> artwork=new LruCache<String,Bitmap>(4*1024*1024){
        @Override protected int sizeOf(String key,Bitmap value){return value.getAllocationByteCount();}
    };
    private final Set<String> unavailable=new HashSet<>();
    private final EditText search;
    private final TextView count;
    private final ListView list;
    private final PickerAdapter adapter;
    private String query="";
    private boolean done;

    WidgetPickerDialog(Activity activity,List<AppWidgetProviderInfo> providers,Consumer<AppWidgetProviderInfo> selected){
        super(activity);this.activity=activity;this.selected=selected;
        buildGroups(providers);
        requestWindowFeature(Window.FEATURE_NO_TITLE);setCancelable(true);setCanceledOnTouchOutside(true);
        LinearLayout panel=vertical();panel.setPadding(dp(14),dp(12),dp(14),dp(12));panel.setBackground(MikanTheme.panel(activity,24));
        LinearLayout header=horizontal();header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout heading=vertical();heading.addView(text("Android widgets",21,CREAM,true));heading.addView(text("Choose an app, then a widget",12,MUTED,false));
        header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        TextView close=text("×",26,PEACH,false);close.setGravity(Gravity.CENTER);close.setContentDescription("Close widget picker");close.setBackground(MikanTheme.ripple(activity,16));close.setOnClickListener(v->dismiss());header.addView(close,new LinearLayout.LayoutParams(dp(48),dp(48)));panel.addView(header);
        search=new EditText(activity);search.setSingleLine(true);search.setTextSize(16);search.setTextColor(CREAM);search.setHintTextColor(MUTED);search.setHint("Search apps or widgets…");search.setContentDescription("Search apps or widgets");
        search.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);search.setImeOptions(EditorInfo.IME_ACTION_SEARCH|EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        GradientDrawable input=new GradientDrawable();input.setColor(0xff241a1d);input.setCornerRadius(dp(18));input.setStroke(dp(1),0xff926244);search.setBackground(input);search.setPadding(dp(15),dp(10),dp(15),dp(10));panel.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        count=text("",12,MUTED,false);count.setPadding(dp(4),dp(10),0,dp(6));panel.addView(count);
        FrameLayout viewport=new FrameLayout(activity);
        list=new ListView(activity);list.setDivider(null);list.setDividerHeight(0);list.setSelector(new ColorDrawable(0x22ffbf88));viewport.addView(list,new FrameLayout.LayoutParams(-1,-1));
        TextView empty=text("No matching widgets.",14,MUTED,false);empty.setGravity(Gravity.CENTER);viewport.addView(empty,new FrameLayout.LayoutParams(-1,-1));list.setEmptyView(empty);
        panel.addView(viewport,new LinearLayout.LayoutParams(-1,0,1));
        adapter=new PickerAdapter();list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{
            if(position<0||position>=rows.size())return;
            Row row=rows.get(position);
            if(row.item!=null){choose(row.item);return;}
            if(!query.isEmpty())return;
            if(!expanded.add(row.group.pkg))expanded.remove(row.group.pkg);
            int first=list.getFirstVisiblePosition(),offset=list.getChildCount()>0?list.getChildAt(0).getTop():0;
            filter(false);list.setSelectionFromTop(Math.min(first,Math.max(0,rows.size()-1)),offset);
        });
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){query=QuickAppRank.normalize(s.toString());filter(true);}
            public void afterTextChanged(Editable s){}
        });
        search.setOnEditorActionListener((v,id,event)->{if(id==EditorInfo.IME_ACTION_SEARCH){hideKeyboard();list.requestFocus();return true;}return false;});
        setContentView(panel);filter(false);
    }
    void open(){
        Window window=getWindow();if(window!=null){window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window.setDimAmount(.55f);window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);}
        show();
        if(window!=null){android.util.DisplayMetrics dm=activity.getResources().getDisplayMetrics();window.setLayout(Math.min(dm.widthPixels-dp(24),dp(560)),Math.min((int)(dm.heightPixels*.83f),dp(720)));}
        list.setFocusableInTouchMode(true);list.requestFocus();
    }
    private void buildGroups(List<AppWidgetProviderInfo> providers){
        PackageManager pm=activity.getPackageManager();Map<String,Group> byPackage=new HashMap<>();
        for(AppWidgetProviderInfo info:providers){
            if(info.provider==null)continue;
            String pkg=info.provider.getPackageName();Group group=byPackage.get(pkg);
            if(group==null){
                String name=pkg;
                try{name=pm.getApplicationLabel(pm.getApplicationInfo(pkg,0)).toString();}catch(Exception ignored){}
                group=new Group(pkg,name);byPackage.put(pkg,group);groups.add(group);
            }
            String name=group.name;
            try{String label=info.loadLabel(pm);if(label!=null&&!label.trim().isEmpty())name=label;}catch(RuntimeException ignored){}
            String size;
            if(Build.VERSION.SDK_INT>=31&&info.targetCellWidth>0&&info.targetCellHeight>0)size=info.targetCellWidth+" × "+info.targetCellHeight+" cells";
            else{float density=activity.getResources().getDisplayMetrics().density;size=info.minWidth>0&&info.minHeight>0?Math.round(info.minWidth/density)+" × "+Math.round(info.minHeight/density)+" dp":"Size varies";}
            group.widgets.add(new Item(group,info,name,size));
        }
        groups.sort(Comparator.comparing((Group group)->group.name,String.CASE_INSENSITIVE_ORDER).thenComparing(group->group.pkg));
        for(Group group:groups){
            group.widgets.sort(Comparator.comparing((Item item)->item.name,String.CASE_INSENSITIVE_ORDER).thenComparingInt(item->item.info.minWidth).thenComparingInt(item->item.info.minHeight).thenComparing(item->item.info.provider.flattenToString()));
            Map<String,Integer> totals=new HashMap<>(),indices=new HashMap<>();
            for(Item item:group.widgets){String key=item.name+"\n"+item.size;totals.put(key,totals.getOrDefault(key,0)+1);}
            for(Item item:group.widgets){String key=item.name+"\n"+item.size;if(totals.get(key)>1){int index=indices.getOrDefault(key,0)+1;indices.put(key,index);item.variant=" · Option "+index;}}
        }
    }
    private void filter(boolean reset){
        rows.clear();int apps=0,widgets=0;
        for(Group group:groups){
            List<Item> matches=new ArrayList<>();
            for(Item item:group.widgets){
                String hay=QuickAppRank.normalize(group.name+" "+group.pkg+" "+item.name+" "+item.info.provider.getClassName());
                boolean match=true;for(String word:query.split("\\s+"))if(!hay.contains(word)){match=false;break;}
                if(match)matches.add(item);
            }
            if(matches.isEmpty())continue;
            boolean open=!query.isEmpty()||expanded.contains(group.pkg);apps++;widgets+=matches.size();
            rows.add(new Row(group,null,matches.size(),open));
            if(open)for(Item item:matches)rows.add(new Row(group,item,0,false));
        }
        count.setText(apps+(apps==1?" app":" apps")+" · "+widgets+(widgets==1?" widget":" widgets"));
        adapter.notifyDataSetChanged();if(reset)list.setSelection(0);
    }
    private void hideKeyboard(){InputMethodManager ime=activity.getSystemService(InputMethodManager.class);if(ime!=null&&search.getWindowToken()!=null)ime.hideSoftInputFromWindow(search.getWindowToken(),0);}
    private void choose(Item item){if(done||!isShowing())return;done=true;hideKeyboard();dismiss();selected.accept(item.info);}
    private int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(activity);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout horizontal(){LinearLayout v=new LinearLayout(activity);v.setOrientation(LinearLayout.HORIZONTAL);return v;}
    private TextView text(String value,int size,int color,boolean bold){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setIncludeFontPadding(false);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;}
    private Bitmap bitmap(String key,Drawable drawable,int maxWidth,int maxHeight){
        if(drawable==null)return null;
        int w=drawable.getIntrinsicWidth(),h=drawable.getIntrinsicHeight();
        if(w<=0||h<=0){w=maxWidth;h=maxHeight;}
        float scale=Math.min((float)maxWidth/w,(float)maxHeight/h);
        w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
        Bitmap image=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);drawable.setBounds(0,0,w,h);drawable.draw(new Canvas(image));artwork.put(key,image);return image;
    }
    private Bitmap appIcon(Group group){
        String key="app:"+group.pkg;Bitmap cached=artwork.get(key);if(cached!=null)return cached;
        try{return bitmap(key,activity.getPackageManager().getApplicationIcon(group.pkg),dp(48),dp(48));}
        catch(Exception ignored){return null;}
    }
    private Bitmap preview(Item item){
        String key="preview:"+item.info.provider.flattenToString();Bitmap cached=artwork.get(key);if(cached!=null)return cached;if(unavailable.contains(key))return null;
        try{
            if(item.info.previewImage!=0){Bitmap image=bitmap(key,item.info.loadPreviewImage(activity,android.util.DisplayMetrics.DENSITY_MEDIUM),dp(160),dp(100));if(image!=null)return image;}
        }catch(RuntimeException ignored){}
        unavailable.add(key);return null;
    }
    private final class GroupView extends LinearLayout {
        final ImageView icon;final TextView name,detail,arrow;
        GroupView(){
            super(activity);setGravity(Gravity.CENTER_VERTICAL);setPadding(dp(8),dp(9),dp(8),dp(9));setMinimumHeight(dp(68));setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
            icon=new ImageView(activity);icon.setScaleType(ImageView.ScaleType.FIT_CENTER);icon.setPadding(dp(5),dp(5),dp(5),dp(5));icon.setBackground(MikanTheme.tile(activity));addView(icon,new LinearLayout.LayoutParams(dp(46),dp(46)));
            LinearLayout copy=vertical();copy.setPadding(dp(12),0,dp(6),0);name=text("",16,CREAM,true);name.setMaxLines(2);copy.addView(name);detail=text("",12,MUTED,false);copy.addView(detail);addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            arrow=text("",20,PEACH,true);addView(arrow);
        }
        void bind(Row row){Bitmap image=appIcon(row.group);if(image!=null)icon.setImageBitmap(image);else icon.setImageDrawable(new MikanMark(MikanMark.WIDGET,PEACH));name.setText(row.group.name);detail.setText(row.count+(row.count==1?" widget":" widgets"));arrow.setText(query.isEmpty()?(row.expanded?"⌄":"›"):"");setContentDescription(row.group.name+", "+detail.getText()+(query.isEmpty()?(row.expanded?", collapse":", expand"):""));}
    }
    private final class ItemView extends LinearLayout {
        final ImageView image;final TextView name,detail,note;
        ItemView(){
            super(activity);setGravity(Gravity.CENTER_VERTICAL);setPadding(dp(12),dp(8),dp(8),dp(8));setMinimumHeight(dp(112));setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
            image=new ImageView(activity);image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setPadding(dp(6),dp(6),dp(6),dp(6));image.setBackground(MikanTheme.tile(activity));addView(image,new LinearLayout.LayoutParams(dp(112),dp(96)));
            LinearLayout copy=vertical();copy.setPadding(dp(12),0,dp(6),0);name=text("",15,CREAM,true);name.setMaxLines(3);name.setEllipsize(TextUtils.TruncateAt.END);copy.addView(name);detail=text("",12,MUTED,false);detail.setPadding(0,dp(4),0,0);copy.addView(detail);note=text("",11,MUTED,false);note.setPadding(0,dp(3),0,0);copy.addView(note);addView(copy,new LinearLayout.LayoutParams(0,-2,1));addView(text("+",23,PEACH,true));
        }
        void bind(Item item){
            Bitmap art=preview(item);name.setText(item.name);detail.setText(item.size+item.variant);
            note.setText(art==null?"No preview available":"");note.setVisibility(art==null?View.VISIBLE:View.GONE);
            if(art!=null)image.setImageBitmap(art);else{Bitmap icon=appIcon(item.group);if(icon!=null)image.setImageBitmap(icon);else image.setImageDrawable(new MikanMark(MikanMark.WIDGET,PEACH));}
            setContentDescription("Add "+item.group.name+", "+item.name+", "+detail.getText());
        }
    }
    private final class PickerAdapter extends BaseAdapter{
        @Override public int getCount(){return rows.size();}
        @Override public Row getItem(int position){return rows.get(position);}
        @Override public long getItemId(int position){return position;}
        @Override public int getViewTypeCount(){return 2;}
        @Override public int getItemViewType(int position){return getItem(position).item==null?0:1;}
        @Override public boolean areAllItemsEnabled(){return false;}
        @Override public boolean isEnabled(int position){return query.isEmpty()||getItem(position).item!=null;}
        @Override public View getView(int position,View convertView,ViewGroup parent){Row row=getItem(position);if(row.item==null){GroupView v=convertView instanceof GroupView?(GroupView)convertView:new GroupView();v.bind(row);return v;}ItemView v=convertView instanceof ItemView?(ItemView)convertView:new ItemView();v.bind(row.item);return v;}
    }
}
