package dev.capnolithyl.mikan.launcher;

import java.util.*;

/** Row descriptors, not Android views. Full-width headers precede populated letter groups. */
final class DrawerRows {
    static final class Row {
        final int bucket,start,count;
        Row(int bucket,int start,int count){this.bucket=bucket;this.start=start;this.count=count;}
        boolean header(){return count==0;}
    }
    final ArrayList<Row> rows=new ArrayList<>();
    final int[] sections=new int[27];
    static DrawerRows build(int[] buckets,int columns,boolean grouped){
        if(columns<1)throw new IllegalArgumentException("Invalid columns");
        DrawerRows result=new DrawerRows();Arrays.fill(result.sections,-1);
        int start=0;
        while(start<buckets.length){
            int end=buckets.length,bucket=buckets[start];
            if(grouped){
                if(bucket<0||bucket>=27)throw new IllegalArgumentException("Invalid bucket");
                end=start+1;while(end<buckets.length&&buckets[end]==bucket)end++;
                result.sections[bucket]=result.rows.size();
                result.rows.add(new Row(bucket,start,0));
            }
            for(int i=start;i<end;i+=columns)result.rows.add(new Row(-1,i,Math.min(columns,end-i)));
            start=end;
        }return result;
    }
}
