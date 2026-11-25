package dev.capnolithyl.mikan.launcher;

import java.net.URI;

/** The existing NAS liveness contract. No credentials, provider probes or redirects. */
enum MikanHealth {
    IDLE("NAS online · idle","Mikan on Beholder is awake and ready ♡",MikanExpression.DEFAULT),
    BUSY("NAS online · busy","My big sister on Beholder is busy right now.",MikanExpression.DEFAULT),
    MAINTENANCE("NAS online · maintenance","Beholder is in maintenance mode. A little patience ♡",MikanExpression.SLEEPY),
    PROTECTED("Health endpoint requires access","The server responded, but its health check is protected.",MikanExpression.DEFAULT),
    UNSUPPORTED("Health endpoint not found","The server is reachable, but I couldn't find its health check.",MikanExpression.DEFAULT),
    UNVERIFIED("Health response unverified","The server responded, but I couldn't verify Mikan's status.",MikanExpression.DEFAULT),
    ERROR("Health endpoint returned an error","Mikan's health check reported an error.",MikanExpression.CONCERNED),
    UNREACHABLE("NAS health endpoint unreachable","I'm having trouble reaching Beholder right now.",MikanExpression.CONCERNED);
    final String label,remark;
    final MikanExpression expression;
    MikanHealth(String label,String remark,MikanExpression expression){this.label=label;this.remark=remark;this.expression=expression;}

    static URI endpoint(String configured)throws Exception{
        URI base=new URI(configured);
        if(!"https".equalsIgnoreCase(base.getScheme())||base.getHost()==null||base.getUserInfo()!=null)throw new IllegalArgumentException("HTTPS origin required");
        return new URI("https",null,base.getHost(),base.getPort(),"/api/health",null,null);
    }
    static MikanHealth http(int code){
        if(code==401||code==403)return PROTECTED;
        if(code==404)return UNSUPPORTED;
        if(code==200||code>=300&&code<400)return UNVERIFIED;
        return ERROR;
    }
    static MikanHealth payload(Object ok,Object service,Object maintenance,Object idle){
        if(!Boolean.TRUE.equals(ok)||!"mikan-nas".equals(service)||!(maintenance instanceof Boolean)||!(idle instanceof Boolean))return UNVERIFIED;
        if(Boolean.TRUE.equals(maintenance))return MAINTENANCE;
        return Boolean.TRUE.equals(idle)?IDLE:BUSY;
    }
}
