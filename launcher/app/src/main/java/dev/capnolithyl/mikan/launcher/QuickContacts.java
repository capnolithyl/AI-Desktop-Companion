package dev.capnolithyl.mikan.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.net.Uri;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.text.InputFilter;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Contact shortcuts use a selected phone row's temporary grant, or manual input.
 * No READ_CONTACTS, CALL_PHONE, SEND_SMS or background address book access. */
final class QuickContacts {
    private static final int PICK=153,CREAM=0xffffe9d5,PEACH=0xffffbf88,MUTED=0xffe1bda9;
    private final Activity activity;
    private final SharedPreferences prefs;
    private final ContactFavorites model;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private LinearLayout card,managerBody;
    private AlertDialog manager;
    private boolean compact,closed,busy;
    QuickContacts(Activity activity,SharedPreferences prefs){
        this.activity=activity;this.prefs=prefs;model=ContactFavorites.parse(prefs.getString("quickContactsV1",""));
    }
    void detach(){card=null;}
    void close(){closed=true;detach();worker.shutdownNow();}
    private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(activity);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private TextView text(String label,int size,int color,boolean bold){
        TextView v=new TextView(activity);v.setText(label);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private TextView action(String label,Runnable click){
        TextView v=text(label,14,PEACH,true);v.setGravity(Gravity.CENTER);v.setMinimumHeight(dp(44));v.setPadding(dp(8),dp(5),dp(8),dp(5));v.setBackground(MikanTheme.ripple(activity,12));v.setFocusable(true);v.setOnClickListener(w->click.run());return v;
    }
    private void toast(String message){if(!closed)Toast.makeText(activity,message,Toast.LENGTH_SHORT).show();}
    View view(boolean narrow){compact=narrow;card=vertical();card.setPadding(dp(12),dp(10),dp(12),dp(10));card.setBackground(MikanTheme.panel(activity,20));renderCard();return card;}
    private View avatar(ContactFavorites.Entry entry,int size){
        FrameLayout frame=new FrameLayout(activity);frame.setBackground(MikanTheme.tile(activity));frame.setClipToOutline(true);
        frame.setLayoutParams(new LinearLayout.LayoutParams(dp(size),dp(size)));
        Bitmap image=null;
        if(!entry.photo.isEmpty())try{
            byte[] bytes=Base64.getDecoder().decode(entry.photo);
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
            if(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth<=96&&bounds.outHeight<=96)image=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
        }catch(RuntimeException ignored){}
        if(image!=null){ImageView photo=new ImageView(activity);photo.setImageBitmap(image);photo.setScaleType(ImageView.ScaleType.CENTER_CROP);frame.addView(photo,new FrameLayout.LayoutParams(-1,-1));}
        else{TextView initials=text(ContactFavorites.initials(entry.name),18,PEACH,true);initials.setGravity(Gravity.CENTER);frame.addView(initials,new FrameLayout.LayoutParams(-1,-1));}
        frame.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return frame;
    }
    private View tile(ContactFavorites.Entry entry){
        LinearLayout tile=vertical();tile.setGravity(Gravity.CENTER);tile.setPadding(dp(4),dp(8),dp(4),dp(8));tile.setBackground(MikanTheme.ripple(activity,14));tile.addView(avatar(entry,48));
        TextView name=text(entry.name,13,CREAM,true);name.setGravity(Gravity.CENTER);name.setMaxLines(2);name.setEllipsize(TextUtils.TruncateAt.END);name.setPadding(0,dp(5),0,0);tile.addView(name,new LinearLayout.LayoutParams(-1,-2));
        TextView hint=text("Contact",10,MUTED,false);tile.addView(hint);tile.setFocusable(true);tile.setContentDescription("Contact "+entry.name);tile.setOnClickListener(v->options(entry.id));tile.setOnLongClickListener(v->{manage();return true;});return tile;
    }
    private void renderCard(){
        if(card==null)return;card.removeAllViews();
        LinearLayout head=new LinearLayout(activity);head.setGravity(Gravity.CENTER_VERTICAL);head.addView(text("Quick contacts",15,CREAM,true),new LinearLayout.LayoutParams(0,-2,1));
        TextView add=action("+",this::addOptions);add.setContentDescription("Add quick contact");head.addView(add,new LinearLayout.LayoutParams(dp(44),dp(44)));card.addView(head);
        List<ContactFavorites.Entry> entries=model.entries();
        if(entries.isEmpty())card.addView(text("Keep your favorite people a tap away ♡",13,MUTED,false));
        int columns=compact||activity.getResources().getConfiguration().fontScale>1.2f?2:4;
        for(int i=0;i<entries.size();i+=columns){
            LinearLayout row=new LinearLayout(activity);
            for(int j=0;j<columns;j++){
                int index=i+j;View item=index<entries.size()?tile(entries.get(index)):new View(activity);
                row.addView(item,new LinearLayout.LayoutParams(0,-2,1));
            }card.addView(row);
        }
        card.addView(action("Manage contacts",this::manage));
    }
    private void changed(){prefs.edit().putString("quickContactsV1",model.encode()).apply();renderCard();renderManager();}
    void manage(){
        if(manager!=null&&manager.isShowing())return;
        LinearLayout panel=vertical();panel.setPadding(dp(12),dp(6),dp(12),dp(6));panel.addView(action("+ Add favorite",this::addOptions));
        ScrollView scroll=new ScrollView(activity);managerBody=vertical();scroll.addView(managerBody);panel.addView(scroll,new LinearLayout.LayoutParams(-1,Math.min(dp(420),(int)(activity.getResources().getDisplayMetrics().heightPixels*.45f))));
        manager=new AlertDialog.Builder(activity).setTitle("Quick contacts").setView(panel).setPositiveButton("Done",null).create();manager.setOnDismissListener(d->{manager=null;managerBody=null;});renderManager();manager.show();
    }
    private void renderManager(){
        if(managerBody==null)return;managerBody.removeAllViews();
        List<ContactFavorites.Entry> entries=model.entries();
        managerBody.addView(text(entries.size()+" / "+ContactFavorites.LIMIT+" favorites · stored on this device",12,MUTED,false));
        for(ContactFavorites.Entry entry:entries){
            LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,dp(6),0,dp(6));row.addView(avatar(entry,40));
            LinearLayout copy=vertical();copy.setPadding(dp(10),0,0,0);copy.addView(text(entry.name,15,CREAM,true));copy.addView(text(entry.number,12,MUTED,false));row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            TextView edit=action("⋯",()->manageEntry(entry.id));edit.setContentDescription("Manage "+entry.name);row.addView(edit,new LinearLayout.LayoutParams(dp(44),dp(44)));managerBody.addView(row);
        }
    }
    private void manageEntry(String id){
        ContactFavorites.Entry entry=model.get(id);if(entry==null)return;
        new AlertDialog.Builder(activity).setTitle(entry.name).setItems(new String[]{"Edit saved name or number","Move earlier","Move later","Remove favorite"},(d,i)->{
            if(i==0)edit(id,entry.name,entry.number,entry.photo);
            else if(i==1||i==2){model.move(id,i==1?-1:1);changed();}
            else new AlertDialog.Builder(activity).setTitle("Remove favorite?").setMessage("Only removes the shortcut, not your actual Android contact.").setNegativeButton("Cancel",null).setPositiveButton("Remove",(dd,j)->{model.remove(id);changed();}).show();
        }).setNegativeButton("Cancel",null).show();
    }
    private void addOptions(){
        if(model.entries().size()>=ContactFavorites.LIMIT){toast("Favorite limit reached. Remove one first.");return;}
        if(busy){toast("Contact selection already in progress.");return;}
        new AlertDialog.Builder(activity).setTitle("Add favorite").setItems(new String[]{"Choose from Android contacts","Enter name and number manually"},(d,i)->{
            if(i==0){
                if(manager!=null)manager.dismiss();
                try{activity.startActivityForResult(new Intent(Intent.ACTION_PICK).setType(Phone.CONTENT_TYPE),PICK);}
                catch(RuntimeException ex){toast("Contact picker unavailable. Enter a number manually.");edit(null,"","","");}
            }else edit(null,"","","");
        }).setNegativeButton("Cancel",null).show();
    }
    boolean result(int request,int result,Intent data){
        if(request!=PICK)return false;
        if(result!=Activity.RESULT_OK||data==null||data.getData()==null)return true;
        Uri uri=data.getData();if(!"content".equals(uri.getScheme())||busy||closed)return true;
        busy=true;
        worker.execute(()->{
            String name="",number="",photo="";
            try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{Phone.DISPLAY_NAME,Phone.NUMBER},null,null,null)){
                if(cursor!=null&&cursor.moveToFirst()){
                    name=cursor.isNull(0)?"":cursor.getString(0);number=cursor.isNull(1)?"":cursor.getString(1);
                }
            }catch(RuntimeException ignored){}
            // The phone row grant may not cover a separate thumbnail URI. Fail
            // closed to initials, without requesting broad contacts permission.
            try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{Phone.PHOTO_THUMBNAIL_URI},null,null,null)){
                if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0)){
                    Uri image=Uri.parse(cursor.getString(0));
                    if("content".equals(image.getScheme()))photo=thumbnail(image);
                }
            }catch(RuntimeException ignored){}
            final String pickedName=name,pickedNumber=number,pickedPhoto=photo;
            activity.runOnUiThread(()->{busy=false;if(closed||activity.isFinishing()||activity.isDestroyed())return;
                if(pickedNumber.isEmpty())toast("Selected number unavailable. Enter it manually.");
                edit(null,pickedName,pickedNumber,pickedPhoto);
            });
        });
        return true;
    }
    private String thumbnail(Uri uri){
        try(InputStream stream=activity.getContentResolver().openInputStream(uri)){
            if(stream==null)return "";
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
            while((n=stream.read(buffer))!=-1){if(output.size()+n>256*1024)return "";output.write(buffer,0,n);}
            byte[] bytes=output.toByteArray();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if(options.outWidth<1||options.outHeight<1||options.outWidth>8192||options.outHeight>8192)return "";
            options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>192)options.inSampleSize*=2;
            options.inJustDecodeBounds=false;Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(decoded==null)return "";
            float ratio=Math.min(1f,96f/Math.max(decoded.getWidth(),decoded.getHeight()));
            Bitmap small=Bitmap.createScaledBitmap(decoded,Math.max(1,Math.round(decoded.getWidth()*ratio)),Math.max(1,Math.round(decoded.getHeight()*ratio)),true);
            ByteArrayOutputStream encoded=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.PNG,100,encoded);if(small!=decoded)small.recycle();decoded.recycle();
            String value=Base64.getEncoder().encodeToString(encoded.toByteArray());return value.length()<=65536?value:"";
        }catch(IOException|RuntimeException ignored){return "";}
    }
    private void edit(String id,String name,String number,String photo){
        LinearLayout panel=vertical();panel.setPadding(dp(20),dp(8),dp(20),dp(8));
        EditText nameField=new EditText(activity);nameField.setHint("Name");nameField.setSingleLine(true);nameField.setFilters(new InputFilter[]{new InputFilter.LengthFilter(100)});nameField.setText(name);panel.addView(nameField);
        EditText numberField=new EditText(activity);numberField.setHint("Phone number");numberField.setInputType(android.text.InputType.TYPE_CLASS_PHONE);numberField.setSingleLine(true);numberField.setFilters(new InputFilter[]{new InputFilter.LengthFilter(100)});numberField.setText(number);panel.addView(numberField);
        panel.addView(text("Use +country code for WhatsApp. Saved locally; not synced with your address book.",12,MUTED,false));
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle(id==null?"Add quick contact":"Edit favorite").setView(panel).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(nameField.getText().toString().trim().isEmpty()){nameField.setError("Enter a name");return;}
            if(ContactFavorites.phone(numberField.getText().toString())==null){numberField.setError("Enter a valid phone number");return;}
            if(!model.put(id,nameField.getText().toString(),numberField.getText().toString(),photo)){numberField.setError("Already saved, or favorite limit reached");return;}
            changed();dialog.dismiss();
        }));dialog.show();
    }
    private void options(String id){
        ContactFavorites.Entry entry=model.get(id);if(entry==null)return;
        new AlertDialog.Builder(activity).setTitle(entry.name).setItems(new String[]{"Call (open dialer)","Text message","WhatsApp","Manage favorite"},(d,i)->{
            ContactFavorites.Entry current=model.get(id);if(current==null)return;
            if(i==0)launch(new Intent(Intent.ACTION_DIAL,Uri.fromParts("tel",current.number,null)),"Phone app unavailable");
            else if(i==1)launch(new Intent(Intent.ACTION_SENDTO,Uri.fromParts("smsto",current.number,null)),"Messaging app unavailable");
            else if(i==2)whatsapp(current);
            else manageEntry(id);
        }).setNegativeButton("Cancel",null).show();
    }
    private void launch(Intent intent,String error){try{activity.startActivity(intent);}catch(RuntimeException ex){toast(error);}}
    private void whatsapp(ContactFavorites.Entry entry){
        String number=ContactFavorites.whatsapp(entry.number);
        if(number==null){toast("Use an international number beginning with + for WhatsApp.");return;}
        Uri uri=Uri.parse("https://wa.me/"+number);
        for(String pkg:new String[]{"com.whatsapp","com.whatsapp.w4b"}){
            try{activity.startActivity(new Intent(Intent.ACTION_VIEW,uri).setPackage(pkg));return;}catch(RuntimeException ignored){}
        }
        toast("WhatsApp is unavailable. No browser opened.");
    }
}
