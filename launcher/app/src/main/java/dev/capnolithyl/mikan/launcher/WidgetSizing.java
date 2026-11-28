package dev.capnolithyl.mikan.launcher;

/** Allocate enough space for intrinsic content without undoing user-selected row spans. */
final class WidgetSizing {
    static int requiredHeight(int intrinsic,int span,int defaultSpan,int rowHeight){
        // Keep content readable at small spans; each extra row above the default
        // adds real space even when intrinsic height already exceeds grid minimum.
        return Math.max(span*rowHeight,intrinsic+Math.max(0,span-defaultSpan)*rowHeight);
    }
    static void ensureHeight(int[] heights,int start,int span,int required){
        int available=0;for(int i=start;i<start+span;i++)available+=heights[i];
        int extra=Math.max(0,required-available);
        for(int i=0;i<span;i++)heights[start+i]+=extra/span+(i<extra%span?1:0);
    }
}
