package dev.capnolithyl.mikan.launcher;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;

final class MikanTheme {
    private MikanTheme(){}
    private static int dp(Context c,float n){return Math.round(n*c.getResources().getDisplayMetrics().density);}
    static GradientDrawable panel(Context c,int radius){
        GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xf25c3e31,0xf13c2a27,0xed2a2022});d.setCornerRadius(dp(c,radius));d.setStroke(dp(c,1),0xaaa87954);return d;
    }
    static GradientDrawable tile(Context c){
        GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xf3674937,0xe83e2c29});d.setCornerRadius(dp(c,17));d.setStroke(dp(c,1),0x557e563d);return d;
    }
    static RippleDrawable ripple(Context c,int radius){
        GradientDrawable mask=new GradientDrawable();mask.setColor(0xffffffff);mask.setCornerRadius(dp(c,radius));return new RippleDrawable(ColorStateList.valueOf(0x33ffbf88),null,mask);
    }
}
