package dev.capnolithyl.mikan.launcher;

import java.time.LocalDate;
import java.util.*;

/** Pure local personality rules. No personal data, Android dependencies or network. */
final class MikanPersonality {
    static final class Line {
        final String key,text,portraitAsset;
        final MikanExpression expression;
        Line(String key,String text,MikanExpression expression){this(key,text,expression,null);}
        Line(String key,String text,MikanExpression expression,String portraitAsset){this.key=key;this.text=text;this.expression=expression;this.portraitAsset=portraitAsset;}
    }
    private static Line line(String key,String text,MikanExpression expression){return new Line(key,text,expression);}
    static Line battery(int percent,boolean charging,boolean full,boolean plugged){
        if(percent<0||percent>100)return null;
        if(full)return line("battery:full","All charged up! Ready for another adventure ♡",MikanExpression.EXCITED);
        if(charging)return line("battery:charging","Recharge time! Even phones need a snack.",MikanExpression.EXCITED);
        if(plugged)return null; // plugged is not necessarily charging
        if(percent<=5)return line("battery:critical","Five percent or less! Charger, please!",MikanExpression.CONCERNED);
        if(percent<=15)return line("battery:low","Battery's getting low. Shall we find a charger?",MikanExpression.CONCERNED);
        if(percent<=25)return line("battery:warn","Our little energy tank is running low.",MikanExpression.POUTY);
        return null;
    }
    static Line holiday(LocalDate date){
        MikanHoliday holiday=MikanHoliday.on(date);
        return holiday==null?null:new Line("holiday:"+date,holiday.text,holiday.expression,holiday.asset);
    }
    static List<Line> idle(int hour){
        List<Line> out=new ArrayList<>();
        if(hour<7||hour>=22){
            out.add(line("idle:sleep1","Even cats need their beauty sleep!",MikanExpression.SLEEPY));
            out.add(line("idle:sleep2","My eyelids are developing gravity.",MikanExpression.SLEEPY));
            out.add(line("idle:sleep3","Blanket mode sounds rather tempting.",MikanExpression.SLEEPY));
        }else if(hour<12){
            out.add(line("idle:morning1","Coffee first, world domination later.",MikanExpression.SMUG));
            out.add(line("idle:morning2","A fresh morning! Let's make it a good one ♡",MikanExpression.DEFAULT));
            out.add(line("idle:morning3","Today's forecast: a high chance of caffeine.",MikanExpression.SMUG));
        }else if(hour<18){
            out.add(line("idle:afternoon1","Don't forget a little stretch and water ♡",MikanExpression.DEFAULT));
            out.add(line("idle:afternoon2","One thing at a time. You've got this!",MikanExpression.DEFAULT));
            out.add(line("idle:afternoon3","I vote for a tiny coffee break.",MikanExpression.SMUG));
        }else{
            out.add(line("idle:evening1","A cozy evening sounds purrfect.",MikanExpression.DEFAULT));
            out.add(line("idle:evening2","The day is winding down. Cozy mode activated.",MikanExpression.SLEEPY));
            out.add(line("idle:evening3","A good song and a warm drink? Excellent plan.",MikanExpression.SMUG));
        }
        out.add(line("idle:duty","Your little pocket companion is on duty ♡",MikanExpression.DEFAULT));
        out.add(line("idle:celebrate","Tiny victories deserve a celebration! ♡",MikanExpression.EXCITED));
        out.add(line("idle:coffee","I have concluded that coffee is a food group.",MikanExpression.SMUG));
        out.add(line("idle:stretch","Time for a tiny cat stretch. Human stretches count too!",MikanExpression.DEFAULT));
        out.add(line("idle:music","A little music can make the day brighter ♡",MikanExpression.DEFAULT));
        out.add(line("idle:blanket","I would like to submit a formal request for a blanket.",MikanExpression.POUTY));
        out.add(line("idle:conquer","My tiny plan for world domination is going splendidly.",MikanExpression.SMUG));
        out.add(line("idle:company","Just keeping you company over here ♡",MikanExpression.DEFAULT));
        out.add(line("idle:snack","Snack break? I support this proposal enthusiastically.",MikanExpression.EXCITED));
        out.add(line("idle:quiet","A little quiet is nice sometimes.",MikanExpression.DEFAULT));
        out.add(line("idle:paws","Paws at the ready. Absolutely no productivity guarantees.",MikanExpression.SMUG));
        out.add(line("idle:water","A sip of water for the human, please ♡",MikanExpression.DEFAULT));
        return out;
    }
    /** Stay on the current remark when unrelated context disappears. Newly available
     *  contextual signals can interrupt; routine countdown/text updates cannot. */
    static final class Rotation {
        private List<String> previous=Collections.emptyList();
        private String current;
        private long changedAt;
        private boolean advance;
        void reset(){previous=Collections.emptyList();current=null;advance=false;}
        void advance(){advance=true;}
        int select(List<String> keys,long now,long interval){
            if(keys.isEmpty()){reset();return -1;}
            int old=keys.indexOf(current),next=old;
            if(current==null)next=0;
            else if(advance)next=old<0?0:(old+1)%keys.size();
            else{
                // Only a genuinely new contextual signal interrupts a visible remark.
                for(int i=0;i<keys.size();i++){
                    String key=keys.get(i);
                    if(!key.startsWith("idle:")&&!previous.contains(key)){next=i;break;}
                }
                if(next<0)next=0;
                else if(next==old&&now-changedAt>=interval)next=(old+1)%keys.size();
            }
            String selected=keys.get(next);
            if(!selected.equals(current)||advance){changedAt=now;current=selected;}
            previous=new ArrayList<>(keys);advance=false;return next;
        }
    }
}
