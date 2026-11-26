package dev.capnolithyl.mikan.launcher;
public final class ContactFavoritesTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError();}
    public static void main(String[] args){
        ContactFavorites m=new ContactFavorites();
        check(ContactFavorites.phone("+1 (555) 123-4567").equals("+15551234567"));
        check(ContactFavorites.phone("123;456")==null);
        check(ContactFavorites.whatsapp("+15551234567").equals("15551234567"));
        check(ContactFavorites.whatsapp("5551234567")==null);
        check(m.put(null,"Example Person","+15551234567",""));
        check(!m.put(null,"Duplicate","+1 (555) 123-4567",""));
        check(m.put(null,"Änne 🐾","5551234568",""));
        String id=m.entries().get(0).id;m.move(id,1);check(m.entries().get(1).id.equals(id));
        m=ContactFavorites.parse(m.encode());check(m.entries().size()==2&&m.get(id).name.equals("Example Person"));
        check(ContactFavorites.initials("Example Person").equals("EP"));
        check(m.put(id,"Edited","5551234569",""));m.remove(id);check(m.entries().size()==1);
        for(int i=1;i<ContactFavorites.LIMIT;i++)check(m.put(null,"Person "+i,"555000000"+i,""));
        check(!m.put(null,"Extra","5550000010",""));
        check(ContactFavorites.parse("bad\n"+m.encode()).entries().size()==ContactFavorites.LIMIT);
        System.out.println("ContactFavorites tests passed");
    }
}
