package dev.capnolithyl.mikan.launcher;

final class HomePageRules {
    static boolean horizontal(float dx,float dy,int slop){
        return Math.abs(dx)>slop*1.5f&&Math.abs(dx)>Math.abs(dy)*1.35f;
    }
    static float dragOffset(float dx,int width,boolean available){
        float limit=Math.max(0,width)*(available?.24f:.09f);
        return Math.copySign(Math.min(limit,Math.abs(dx)*(available?.48f:.22f)),dx);
    }
    static int targetDirection(float dx,int width,int min){
        float threshold=Math.max(min,width*.18f);
        return Math.abs(dx)>=threshold?(dx<0?1:-1):0;
    }
}
