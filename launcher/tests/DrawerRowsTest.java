package dev.capnolithyl.mikan.launcher;

public final class DrawerRowsTest {
    private static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args){
        DrawerRows a=DrawerRows.build(new int[]{0,1,1,1,1,1,3,26},4,true);
        check(a.rows.size()==9&&a.sections[0]==0&&a.sections[1]==2&&a.sections[3]==5&&a.sections[26]==7);
        check(a.rows.get(3).count==4&&a.rows.get(4).count==1&&a.rows.get(4).start==5);
        check(a.sections[2]==-1);
        DrawerRows z=DrawerRows.build(new int[]{26,3,3,1,0},3,true);
        check(z.sections[26]==0&&z.sections[3]==2&&z.sections[0]==6);
        DrawerRows flat=DrawerRows.build(new int[]{1,3,0,2,4},3,false);
        check(flat.rows.size()==2&&flat.rows.get(0).count==3&&flat.rows.get(1).count==2&&flat.sections[1]==-1);
        check(DrawerRows.build(new int[0],5,true).rows.isEmpty());
        check(IndexWave.weight(0)==1&&IndexWave.weight(3.5f)==0&&IndexWave.weight(4)==0);
        check(IndexWave.weight(1)>IndexWave.weight(2)&&IndexWave.weight(2)>IndexWave.weight(3));
        check(IndexWave.weight(-1)==IndexWave.weight(1));
        System.out.println("Drawer row and wave tests passed");
    }
}
