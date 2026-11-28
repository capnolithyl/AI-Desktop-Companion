package dev.capnolithyl.mikan.launcher;

/** Smooth local magnification envelope; distance is measured in letter steps. */
final class IndexWave {
    private IndexWave(){}
    static float weight(float distance){
        float d=Math.abs(distance);
        if(d>=3.5f)return 0f;
        float cosine=(float)Math.cos(d*Math.PI/7.0);
        return cosine*cosine;
    }
}
