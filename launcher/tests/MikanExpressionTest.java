package dev.capnolithyl.mikan.launcher;
public final class MikanExpressionTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        check(MikanExpression.values().length==8);
        check(MikanExpression.DEFAULT.asset().equals("portraits/expressions/default.webp"));
        check(MikanExpression.weather(95,-3)==MikanExpression.CONCERNED);
        check(MikanExpression.weather(63,12)==MikanExpression.POUTY);
        check(MikanExpression.weather(73,-2)==MikanExpression.FREEZING);
        check(MikanExpression.weather(3,0)==MikanExpression.FREEZING);
        check(MikanExpression.weather(0,20)==MikanExpression.DEFAULT);
        check(MikanExpression.idle(6)==MikanExpression.SLEEPY);
        check(MikanExpression.idle(22)==MikanExpression.SLEEPY);
        check(MikanExpression.idle(9)==MikanExpression.SMUG);
        check(MikanExpression.idle(14)==MikanExpression.DEFAULT);
        System.out.println("MikanExpression tests passed");
    }
}
