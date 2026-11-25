package dev.capnolithyl.mikan.launcher;
public final class MikanHealthTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    private static void rejects(String url)throws Exception{
        try{MikanHealth.endpoint(url);}catch(IllegalArgumentException expected){return;}
        throw new AssertionError("accepted unsafe origin");
    }
    public static void main(String[] args)throws Exception{
        check(MikanHealth.endpoint("https://example.invalid/workspace/?q=secret#fragment").toString().equals("https://example.invalid/api/health"));
        check(MikanHealth.endpoint("https://example.invalid:8443/").toString().equals("https://example.invalid:8443/api/health"));
        rejects("http://example.invalid");rejects("https://user:secret@example.invalid/");
        check(MikanHealth.http(401)==MikanHealth.PROTECTED);
        check(MikanHealth.http(403)==MikanHealth.PROTECTED);
        check(MikanHealth.http(404)==MikanHealth.UNSUPPORTED);
        check(MikanHealth.http(302)==MikanHealth.UNVERIFIED);
        check(MikanHealth.http(503)==MikanHealth.ERROR);
        check(MikanHealth.payload(true,"mikan-nas",false,true)==MikanHealth.IDLE);
        check(MikanHealth.payload(true,"mikan-nas",false,false)==MikanHealth.BUSY);
        check(MikanHealth.payload(true,"mikan-nas",true,true)==MikanHealth.MAINTENANCE);
        check(MikanHealth.payload(true,"mikan-nas",true,false)==MikanHealth.MAINTENANCE);
        check(MikanHealth.payload(true,"mikan-nas",null,true)==MikanHealth.UNVERIFIED);
        check(MikanHealth.payload(true,"mikan-nas",false,"true")==MikanHealth.UNVERIFIED);
        check(MikanHealth.payload(true,"other",false,true)==MikanHealth.UNVERIFIED);
        check(MikanHealth.payload(false,"mikan-nas",false,true)==MikanHealth.UNVERIFIED);
        check(MikanHealth.PROTECTED.expression!=MikanExpression.CONCERNED);
        System.out.println("MikanHealth tests passed");
    }
}
