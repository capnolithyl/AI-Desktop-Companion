package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.SharedPreferences;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.InputFilter;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;

/** Optional local tasks card and manager. No alarm, notification, network or background service. */
final class TaskPanel {
    private static final int CREAM=0xffffe9d5,PEACH=0xffffbf88,MUTED=0xffe1bda9,URGENT=0xffff9c86;
    private final Activity activity;
    private final SharedPreferences prefs;
    private final LocalTasks model;
    private LinearLayout card,managerBody;
    private AlertDialog manager;
    private LocalDate renderedDate;
    TaskPanel(Activity activity,SharedPreferences prefs){
        this.activity=activity;this.prefs=prefs;model=LocalTasks.parse(prefs.getString("localTasksV1",""));
    }
    void detach(){card=null;renderedDate=null;}
    void refreshDate(){if(card!=null&&!LocalDate.now().equals(renderedDate))renderCard();}
    View view(){card=vertical();card.setPadding(dp(12),dp(10),dp(12),dp(10));card.setBackground(MikanTheme.panel(activity,20));renderCard();return card;}
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(activity);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout horizontal(){LinearLayout v=new LinearLayout(activity);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private TextView text(String label,int size,int color,boolean bold){
        TextView v=new TextView(activity);v.setText(label);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private TextView action(String label,String description,Runnable run){
        TextView v=text(label,14,PEACH,true);v.setGravity(Gravity.CENTER);v.setPadding(dp(8),dp(6),dp(8),dp(6));v.setMinHeight(dp(44));v.setBackground(MikanTheme.ripple(activity,12));v.setContentDescription(description);v.setFocusable(true);v.setOnClickListener(w->run.run());return v;
    }
    private String dateLabel(LocalDate date){return date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM));}
    private String dueLabel(LocalTasks.Task task,LocalDate today){
        if(task.due==null)return "";
        int urgency=LocalTasks.urgency(task,today);
        return urgency==2?"Overdue · "+dateLabel(task.due):urgency==1?"Due today":"Due "+dateLabel(task.due);
    }
    private void changed(){prefs.edit().putString("localTasksV1",model.encode()).apply();renderCard();renderManager();}
    private void renderCard(){
        if(card==null)return;
        renderedDate=LocalDate.now();card.removeAllViews();
        LinearLayout header=horizontal();
        TextView title=text("Tasks",15,CREAM,true);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        header.addView(action("+","Add task",()->edit(null)),new LinearLayout.LayoutParams(dp(44),dp(44)));card.addView(header);
        int pending=model.pending(),shown=0;
        TextView summary=text(pending==0?"All caught up ♡":pending+" open",12,MUTED,false);card.addView(summary);
        for(LocalTasks.Task task:model.ordered()){
            if(task.done||shown>=3)continue;card.addView(row(task,false));shown++;
        }
        card.addView(action(pending>shown?"View all · "+pending:"Manage tasks","Manage all tasks",this::manage));
    }
    private View row(LocalTasks.Task task,boolean full){
        LinearLayout row=horizontal();row.setPadding(0,dp(4),0,dp(4));
        CheckBox check=new CheckBox(activity);check.setChecked(task.done);
        check.setButtonTintList(android.content.res.ColorStateList.valueOf(PEACH));
        check.setContentDescription((task.done?"Reopen ":"Complete ")+task.title);
        row.addView(check,new LinearLayout.LayoutParams(dp(44),dp(44)));
        check.setOnCheckedChangeListener((button,value)->{LocalTasks.Task current=model.get(task.id);if(current!=null&&current.done!=value){model.toggle(task.id);changed();}});
        LinearLayout copy=vertical();copy.setPadding(dp(2),dp(4),dp(2),dp(4));
        TextView title=text(task.title,14,task.done?MUTED:CREAM,false);
        if(!full){title.setMaxLines(2);title.setEllipsize(TextUtils.TruncateAt.END);}
        if(task.done)title.setPaintFlags(title.getPaintFlags()|Paint.STRIKE_THRU_TEXT_FLAG);
        copy.addView(title);
        String due=dueLabel(task,LocalDate.now());
        if(!due.isEmpty()){TextView sub=text(due,11,LocalTasks.urgency(task,LocalDate.now())>0?URGENT:MUTED,false);sub.setPadding(0,dp(3),0,0);copy.addView(sub);}
        copy.setMinimumHeight(dp(44));copy.setGravity(Gravity.CENTER_VERTICAL);copy.setFocusable(true);copy.setContentDescription("Edit "+task.title);copy.setOnClickListener(v->edit(task.id));
        row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
        if(full)row.addView(action("×","Delete "+task.title,()->confirmDelete(task.id)),new LinearLayout.LayoutParams(dp(44),dp(44)));
        return row;
    }
    void manage(){
        if(manager!=null&&manager.isShowing())return;
        LinearLayout panel=vertical();panel.setPadding(dp(12),dp(6),dp(12),dp(6));
        TextView add=action("+ New task","Add task",()->edit(null));panel.addView(add);
        ScrollView scroll=new ScrollView(activity);managerBody=vertical();scroll.addView(managerBody);
        panel.addView(scroll,new LinearLayout.LayoutParams(-1,Math.min(dp(440),(int)(activity.getResources().getDisplayMetrics().heightPixels*.45f))));
        manager=new AlertDialog.Builder(activity).setTitle("Tasks & reminders").setView(panel).setPositiveButton("Done",null).create();
        manager.setOnDismissListener(d->{manager=null;managerBody=null;});
        renderManager();manager.show();
    }
    private void renderManager(){
        if(managerBody==null)return;
        managerBody.removeAllViews();
        managerBody.addView(text(model.pending()+" open · "+(model.size()-model.pending())+" completed",13,MUTED,false));
        if(model.size()==0)managerBody.addView(text("Nothing on your list yet.",14,CREAM,false));
        for(LocalTasks.Task task:model.ordered())managerBody.addView(row(task,true));
    }
    private void edit(String id){
        LocalTasks.Task existing=id==null?null:model.get(id);
        if(id!=null&&existing==null)return;
        if(existing==null&&model.size()>=LocalTasks.LIMIT){Toast.makeText(activity,"Task list full. Delete an old task first.",Toast.LENGTH_LONG).show();return;}
        LinearLayout panel=vertical();panel.setPadding(dp(20),dp(8),dp(20),dp(4));
        EditText title=new EditText(activity);title.setHint("What needs doing?");title.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);title.setFilters(new InputFilter[]{new InputFilter.LengthFilter(LocalTasks.TITLE_LIMIT)});title.setText(existing==null?"":existing.title);title.setSelection(title.length());panel.addView(title);
        final LocalDate[] due={existing==null?null:existing.due};
        TextView pick=action(due[0]==null?"Set due date":dateLabel(due[0]),"Choose due date",()->{});
        pick.setOnClickListener(v->{LocalDate date=due[0]==null?LocalDate.now():due[0];new DatePickerDialog(activity,(picker,y,m,d)->{due[0]=LocalDate.of(y,m+1,d);pick.setText(dateLabel(due[0]));},date.getYear(),date.getMonthValue()-1,date.getDayOfMonth()).show();});
        panel.addView(pick);panel.addView(action("Clear due date","Remove due date",()->{due[0]=null;pick.setText("Set due date");}));
        TextView note=text("Due dates are shown on Home. No alarm notifications.",12,MUTED,false);panel.addView(note);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle(existing==null?"New task":"Edit task").setView(panel).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(!model.put(id,title.getText().toString(),due[0])){title.setError("Enter a task title (up to 200 characters).");return;}
            changed();dialog.dismiss();
        }));
        dialog.show();title.requestFocus();if(dialog.getWindow()!=null)dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE|WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }
    private void confirmDelete(String id){
        LocalTasks.Task task=model.get(id);if(task==null)return;
        new AlertDialog.Builder(activity).setTitle("Delete task?").setMessage(task.title).setNegativeButton("Cancel",null).setPositiveButton("Delete",(d,w)->{model.remove(id);changed();}).show();
    }
}
