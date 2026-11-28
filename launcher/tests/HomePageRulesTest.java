package dev.capnolithyl.mikan.launcher;

public final class HomePageRulesTest {
    private static void check(boolean b){if(!b)throw new AssertionError();}
    public static void main(String[] args){
        check(HomePageRules.horizontal(50,8,10));
        check(!HomePageRules.horizontal(8,50,10));
        check(!HomePageRules.horizontal(11,1,10));
        check(!HomePageRules.horizontal(40,35,10));
        check(HomePageRules.targetDirection(-100,400,48)==1);
        check(HomePageRules.targetDirection(100,400,48)==-1);
        check(HomePageRules.targetDirection(40,400,48)==0);
        check(HomePageRules.targetDirection(45,100,48)==0);
        check(Math.abs(HomePageRules.dragOffset(-1000,400,true)+96f)<.01f);
        check(Math.abs(HomePageRules.dragOffset(1000,400,false)-36f)<.01f);
        check(HomePageRules.dragOffset(50,400,true)>HomePageRules.dragOffset(50,400,false));
        System.out.println("HomePageRules tests passed");
    }
}
