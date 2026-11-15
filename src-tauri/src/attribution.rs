//! Typed work-to-contributor relationships, not mere name co-occurrence.
//! Only exact quotations that explicitly attach a ROLE to a VALUE beside
//! a named work are admitted. These checks don't prove the source is true.
use crate::web_search::SearchResult;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct ProposedRelation {
    pub role: String,
    pub name: String,
    pub source: usize,
    pub quote: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedRelation {
    pub role: String,
    pub name: String,
    pub source: usize,
    pub quote: String,
}

fn normalize(s:&str)->String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn markers(role:&str)->Option<&'static [&'static str]> {
    // These are typed attribution predicates, NOT media/entity routing rules.
    match role {
        "author"=>Some(&["written by ","authored by ","author: ","author is ","book by ","novel by "," by "]),
        "director"=>Some(&["directed by ","director: ","director is "]),
        "studio"=>Some(&["produced by ","production studio: ","production studio is ",
                         "production company: ","studio: ","studio is "]),
        "distributor"=>Some(&["distributed by ","distributor: ","distributor is "]),
        "publisher"=>Some(&["published by ","publisher: ","publisher is "]),
        "developer"=>Some(&["developed by ","developer: ","developer is "]),
        "artist"=>Some(&["performed by ","recorded by ","artist: ","artist is ","album by ","track by "," by "]),
        "composer"=>Some(&["composed by ","composer: ","composer is "]),
        "creator"=>Some(&["created by ","creator: ","creator is "]),
        _=>None
    }
}

pub fn verify(
    work:&str, proposal: ProposedRelation, sources:&[SearchResult]
)->Option<GroundedRelation>{
    let role=proposal.role.trim().to_lowercase();
    let markers=markers(&role)?;
    let name=proposal.name.trim();
    if work.trim().len()<3 || name.len()<2 || name.len()>110
        || proposal.quote.chars().count()<14
        || proposal.quote.chars().count()>550 { return None; }
    let source=sources.get(proposal.source.checked_sub(1)?)?;
    let quote=normalize(&proposal.quote);
    if !normalize(&source.content).contains(quote.as_str()) {return None}
    let subject=normalize(work);
    let value=normalize(name);
    let matched=proposal.quote.split(['.','!','?',';','\n']).any(|clause|{
        let c=normalize(clause);
        if !c.contains(subject.as_str()) || !c.contains(value.as_str()) {return false}
        // A director merely mentioned in the same sentence as the movie
        // is not its director. Require an explicit role-phrase leading
        // directly to the claimed value, with optional "the" / "its".
        markers.iter().any(|marker|{
            let direct=format!("{marker}{value}");
            let qualified=format!("{marker}the {value}");
            let possessive=format!("{marker}its {value}");
            c.contains(direct.as_str()) || c.contains(qualified.as_str())
                || c.contains(possessive.as_str())
        })
    });
    if !matched {return None}
    Some(GroundedRelation{
        role,name:name.to_owned(),source:proposal.source,quote:proposal.quote
    })
}

#[cfg(test)]
mod tests{
    use super::*;
    fn src(content:&str)->Vec<SearchResult>{
        vec![SearchResult{title:"Catalog".into(),url:"https://example.org".into(),
            content:content.into(),engine:"test".into(),published_date:None}]
    }
    fn relation(role:&str,name:&str,quote:&str)->ProposedRelation{
        ProposedRelation{role:role.into(),name:name.into(),
            source:1,quote:quote.into()}
    }
    #[test]
    fn verifies_book_author_but_rejects_unrelated_person(){
        let quote="The book The Hollow Places was written by T. Kingfisher.";
        let s=src(quote);
        assert!(verify("The Hollow Places",relation("author","T. Kingfisher",quote),&s).is_some());
        assert!(verify("The Hollow Places",relation("author","Catriona Ward",quote),&s).is_none());
    }
    #[test]
    fn verifies_director_and_differentiates_studio_from_distributor(){
        let director="The film Dune Part Two was directed by Denis Villeneuve.";
        let studio="Dune Part Two was produced by Legendary Pictures and distributed by Warner Bros.";
        let s=vec![src(director)[0].clone(),src(studio)[0].clone()];
        assert!(verify("Dune Part Two",relation("director","Denis Villeneuve",director),&s).is_some());
        assert!(verify("Dune Part Two",relation("director","Legendary Pictures",director),&s).is_none());
        let mk=|role:&str,name:&str|ProposedRelation{role:role.into(),name:name.into(),
            source:2,quote:studio.into()};
        assert!(verify("Dune Part Two",mk("studio","Legendary Pictures"),&s).is_some());
        assert!(verify("Dune Part Two",mk("distributor","Warner Bros"),&s).is_some());
        assert!(verify("Dune Part Two",mk("studio","Warner Bros"),&s).is_none());
        assert!(verify("Dune Part Two",mk("distributor","Legendary Pictures"),&s).is_none());
    }
    #[test]
    fn does_not_promote_a_person_who_only_praised_a_movie(){
        let quote="The film Arrival, directed by Denis Villeneuve, was praised by Christopher Nolan.";
        let s=src(quote);
        assert!(verify("Arrival",relation("director","Denis Villeneuve",quote),&s).is_some());
        assert!(verify("Arrival",relation("director","Christopher Nolan",quote),&s).is_none());
    }
    #[test]
    fn rejects_wrong_album_artist_and_publisher_developer_swap(){
        let album="The album Hegemony was recorded by Samael. Emperor played a different album.";
        assert!(verify("Hegemony",relation("artist","Emperor",album),&src(album)).is_none());
        assert!(verify("Hegemony",relation("artist","Samael",album),&src(album)).is_some());
        let game="The video game Lantern Siege was developed by Studio A and published by Company B.";
        assert!(verify("Lantern Siege",relation("developer","Studio A",game),&src(game)).is_some());
        assert!(verify("Lantern Siege",relation("publisher","Company B",game),&src(game)).is_some());
        assert!(verify("Lantern Siege",relation("developer","Company B",game),&src(game)).is_none());
    }
}
