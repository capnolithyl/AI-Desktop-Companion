package dev.capnolithyl.mikan.launcher;

import java.time.LocalDate;
import java.time.DayOfWeek;

/** Local calendar: selected US, German and Christian holidays. */
enum MikanHoliday {
    NEW_YEAR("Happy New Year! A fresh page and a fresh coffee ♡","mikan_s_cozy_new_year_celebration.png"),
    VALENTINE("Happy Valentine's Day! Sending little orange hearts ♡","mikan_s_heartfelt_valentine_gift.png"),
    ST_PATRICK("Happy St. Patrick's Day! A little luck for you ♡","mikan_s_cozy_st._patrick_s_day_mug.png"),
    GOOD_FRIDAY("Wishing you a peaceful and reflective Good Friday.",null,MikanExpression.DEFAULT),
    EASTER("Happy Easter! He is risen! ♡","mikan_s_cozy_easter_portrait.png"),
    MOTHERS_DAY("Happy Mother's Day! A little extra love for all the moms ♡",null),
    MEMORIAL_DAY("Remembering those who gave their lives in service today.",null,MikanExpression.DEFAULT),
    FATHERS_DAY("Happy Father's Day! Hope the dads get a cozy break today ♡",null),
    INDEPENDENCE_DAY("Happy Fourth of July! Enjoy the festivities!","mikan_s_cozy_fourth_of_july_celebration.png"),
    LABOR_DAY("Happy Labor Day! You deserve a little rest.",null),
    GERMAN_UNITY("Alles Gute zum Tag der Deutschen Einheit! ♡",null),
    HALLOWEEN("Happy Halloween! Officially spooky cat season.","cozy_halloween_witch_catgirl_cocoa.png"),
    VETERANS_DAY("Honoring those who served. Thank you, veterans.",null,MikanExpression.DEFAULT),
    THANKSGIVING("Happy Thanksgiving! May your plate be very full ♡","mikan_s_cozy_thanksgiving_gathering.png"),
    NIKOLAUS("Frohen Nikolaustag! Did you remember to put your boots out?","cozy_christmas_cocoa_with_mikan.png"),
    CHRISTMAS_EVE("Merry Christmas Eve! Time for cozy lights and cocoa.","cozy_christmas_cocoa_with_mikan.png"),
    CHRISTMAS("Merry Christmas! Wishing you a lovely day ♡","cozy_christmas_cocoa_with_mikan.png"),
    NEW_YEARS_EVE("New Year's Eve! One more cozy night before a fresh year.","mikan_s_cozy_new_year_celebration.png");

    final String text,asset;
    final MikanExpression expression;
    MikanHoliday(String text,String filename){this(text,filename,MikanExpression.EXCITED);}
    MikanHoliday(String text,String filename,MikanExpression expression){
        this.text=text;this.asset=filename==null?null:"portraits/expressions/"+filename;this.expression=expression;
    }

    static LocalDate easter(int year){
        // Gregorian computus (Meeus/Jones/Butcher).
        int a=year%19,b=year/100,c=year%100,d=b/4,e=b%4;
        int f=(b+8)/25,g=(b-f+1)/3,h=(19*a+b-d-g+15)%30;
        int i=c/4,k=c%4,l=(32+2*e+2*i-h-k)%7,m=(a+11*h+22*l)/451;
        int n=h+l-7*m+114;
        return LocalDate.of(year,n/31,n%31+1);
    }
    private static boolean nth(LocalDate date,DayOfWeek day,int n){
        return date.getDayOfWeek()==day&&(date.getDayOfMonth()-1)/7+1==n;
    }
    static MikanHoliday on(LocalDate date){
        int m=date.getMonthValue(),d=date.getDayOfMonth();
        if(m==1&&d==1)return NEW_YEAR;
        if(m==2&&d==14)return VALENTINE;
        if(m==3&&d==17)return ST_PATRICK;
        if(m==3||m==4){
            LocalDate easter=easter(date.getYear());
            if(date.equals(easter.minusDays(2)))return GOOD_FRIDAY;
            if(date.equals(easter))return EASTER;
        }
        if(m==5&&nth(date,DayOfWeek.SUNDAY,2))return MOTHERS_DAY;
        if(m==5&&date.getDayOfWeek()==DayOfWeek.MONDAY&&date.plusWeeks(1).getMonthValue()!=5)return MEMORIAL_DAY;
        if(m==6&&nth(date,DayOfWeek.SUNDAY,3))return FATHERS_DAY;
        if(m==7&&d==4)return INDEPENDENCE_DAY;
        if(m==9&&nth(date,DayOfWeek.MONDAY,1))return LABOR_DAY;
        if(m==10&&d==3)return GERMAN_UNITY;
        if(m==10&&d==31)return HALLOWEEN;
        if(m==11&&d==11)return VETERANS_DAY;
        if(m==11&&nth(date,DayOfWeek.THURSDAY,4))return THANKSGIVING;
        if(m==12&&d==6)return NIKOLAUS;
        if(m==12&&d==24)return CHRISTMAS_EVE;
        if(m==12&&d==25)return CHRISTMAS;
        if(m==12&&d==31)return NEW_YEARS_EVE;
        return null;
    }
}
