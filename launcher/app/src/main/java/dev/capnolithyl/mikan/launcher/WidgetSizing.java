package dev.capnolithyl.mikan.launcher;

/** Allocate enough space for intrinsic content without undoing user-selected row spans. */
final class WidgetSizing {
    static void ensureHeight(int[] heights,int start,int span,int required){
        int available=0;for(int i=start;i<start+span;i++)available+=heights[i];
        int extra=Math.max(0,required-available);
        for(int i=0;i<span;i++)heights[start+i]+=extra/span+(i<extra%span?1:0);
    }
}
