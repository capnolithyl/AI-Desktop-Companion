package dev.capnolithyl.mikan.launcher;

enum MikanExpression {
    DEFAULT, POUTY, SLEEPY, SURPRISED, EXCITED, CONCERNED, SMUG, FREEZING;
    String asset(){return "portraits/expressions/"+name().toLowerCase(java.util.Locale.ROOT)+".webp";}
    static MikanExpression weather(int code,double c){
        if(code>=95&&code<=99)return CONCERNED;
        if((code>=71&&code<=77)||code==85||code==86)return FREEZING;
        if((code>=51&&code<=67)||(code>=80&&code<=82))return POUTY;
        if(c<=5)return FREEZING;
        return DEFAULT;
    }
    static MikanExpression idle(int hour){return hour<7||hour>=22?SLEEPY:hour<12?SMUG:DEFAULT;}
}
