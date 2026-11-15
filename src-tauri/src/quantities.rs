//! Numeric comparison with units, reusable across movies, games, books,
//! albums, episodes and other sourced facts. This is numeric grammar, not an
//! entity/category classifier. The source quote remains the authority.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dimension {
    Duration, Episodes, Tracks, Pages, Chapters, Words, Seasons
}

#[derive(Clone, Copy, Debug)]
pub struct Quantity {
    pub dim: Dimension,
    pub amount: f64
}

fn normalize_unit(unit: &str) -> Option<(Dimension, f64)> {
    let unit = unit.trim().to_ascii_lowercase();
    match unit.as_str() {
        "s"|"sec"|"secs"|"second"|"seconds" => Some((Dimension::Duration,1.0)),
        "m"|"min"|"mins"|"minute"|"minutes" => Some((Dimension::Duration,60.0)),
        "h"|"hr"|"hrs"|"hour"|"hours" => Some((Dimension::Duration,3600.0)),
        "episode"|"episodes"|"ep"|"eps" => Some((Dimension::Episodes,1.0)),
        "song"|"songs"|"track"|"tracks" => Some((Dimension::Tracks,1.0)),
        "page"|"pages"|"pg"|"pgs" => Some((Dimension::Pages,1.0)),
        "chapter"|"chapters" => Some((Dimension::Chapters,1.0)),
        "word"|"words" => Some((Dimension::Words,1.0)),
        "season"|"seasons" => Some((Dimension::Seasons,1.0)),
        _ => None
    }
}

/// Split "1h 35m" into [1,h,35,m] and preserve decimal values "1.5".
/// No interpretive guess from bare dates or random integers.
fn tokens(raw: &str) -> Vec<String> {
    let chars: Vec<char> = raw.chars().collect();
    let mut out=Vec::new();
    let mut buf=String::new();
    let mut last_kind=0u8;
    for (i,c) in chars.iter().enumerate() {
        let kind=if c.is_ascii_digit() {1} else if c.is_alphabetic(){2}
            else if *c=='.' && last_kind==1 && chars.get(i+1)
                .is_some_and(|next| next.is_ascii_digit()) {1}
            else {0};
        if kind==0 {
            if !buf.is_empty(){out.push(std::mem::take(&mut buf));}
            last_kind=0;continue;
        }
        if last_kind!=0 && last_kind!=kind {
            out.push(std::mem::take(&mut buf));
        }
        buf.push(c.to_ascii_lowercase());
        last_kind=kind;
    }
    if !buf.is_empty(){out.push(buf);}
    out
}

fn number_word(word:&str)->Option<f64>{
    const SMALL: [&str; 21]=["zero","one","two","three","four","five",
        "six","seven","eight","nine","ten","eleven","twelve",
        "thirteen","fourteen","fifteen","sixteen","seventeen",
        "eighteen","nineteen","twenty"];
    if let Some(n)=SMALL.iter().position(|w| *w==word){return Some(n as f64)}
    word.parse::<f64>().ok().filter(|v|v.is_finite()&&*v>=0.0&&*v<=1_000_000_000.0)
}

pub fn canonical(value:f64,unit:&str)->Option<Quantity>{
    let (dim,factor)=normalize_unit(unit)?;
    if !value.is_finite()||value<0.0||value>1_000_000_000.0{return None}
    Some(Quantity{dim,amount:value*factor})
}

pub fn approx_equal(a:Quantity,b:Quantity)->bool{
    a.dim==b.dim&&(a.amount-b.amount).abs()<0.000001
}

pub fn measured_in(raw:&str)->Vec<Quantity>{
    let t=tokens(raw);
    let mut out=Vec::new();
    let mut parts=Vec::<(usize,Quantity)>::new();
    for (i,pair) in t.windows(2).enumerate(){
        if let Some(amount)=number_word(&pair[0]){
            if let Some(q)=canonical(amount,&pair[1]){
                parts.push((i,q));
                out.push(q);
            }
        }
    }
    // Combine immediately adjacent time segments: 1h 35m == 95 minutes.
    // Requiring adjacency limits accidental merging of unrelated quantities.
    for w in parts.windows(2){
        let (i,a)=w[0];let (j,b)=w[1];
        if a.dim==Dimension::Duration && b.dim==Dimension::Duration &&
            (j==i+2 || (j==i+3 && t.get(i+2).is_some_and(|word|word=="and"))) {
            out.push(Quantity{dim:Dimension::Duration,amount:a.amount+b.amount});
        }
    }
    out
}

/// Bind the first quantified property *after* a named subject to that
/// subject. Prevent borrowing a later title's count from the same sentence.
/// A compound time (1h 35m) may match either its stated components or the
/// normalized sum, but not a second, unrelated property.
pub fn first_measure_matches(raw:&str,expected:Quantity)->bool {
    let t=tokens(raw);
    let mut pairs=Vec::<(usize,Quantity)>::new();
    for (i,pair) in t.windows(2).enumerate(){
        if let Some(amount)=number_word(&pair[0]){
            if let Some(q)=canonical(amount,&pair[1]){pairs.push((i,q))}
        }
    }
    let compatible:Vec<_>=pairs.into_iter().filter(|(_,q)|q.dim==expected.dim).collect();
    let Some((i,first))=compatible.first().copied() else{return false};
    if approx_equal(first,expected){return true}
    if first.dim==Dimension::Duration {
        if let Some((j,next))=compatible.get(1).copied(){
            if next.dim==Dimension::Duration
                && (j==i+2 || (j==i+3 && t.get(i+2).is_some_and(|word|word=="and"))) {
                let sum=Quantity{dim:Dimension::Duration,
                    amount:first.amount+next.amount};
                return approx_equal(sum,expected)
            }
        }
    }
    false
}

pub fn mention_supports(raw:&str,expected:Quantity)->bool{
    measured_in(raw).into_iter().any(|found|approx_equal(found,expected))
}

pub fn compare(value:Quantity,relation:&str,threshold:Quantity)->bool{
    if value.dim!=threshold.dim{return false}
    match relation {
        "lt"=>value.amount<threshold.amount-0.000001,
        "lte"=>value.amount<=threshold.amount+0.000001,
        "gt"=>value.amount>threshold.amount+0.000001,
        "gte"=>value.amount>=threshold.amount-0.000001,
        "eq"=>approx_equal(value,threshold),
        _=>false
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    fn q(v:f64,u:&str)->Quantity{canonical(v,u).unwrap()}
    #[test]
    fn normalized_durations_are_interchangeable(){
        assert!(approx_equal(q(90.0,"minutes"),q(1.5,"hours")));
        assert!(approx_equal(q(5400.0,"seconds"),q(1.5,"hours")));
        assert!(mention_supports("Movie runtime: 1h 35m.",q(95.0,"minutes")));
        assert!(mention_supports("The film is 1 hour 35 minutes long.",q(95.0,"minutes")));
        assert!(mention_supports("The film runs for 1 hour and 35 minutes.",q(95.0,"minutes")));
        assert!(mention_supports("The movie runs for 1.5 hours.",q(90.0,"minutes")));
        assert!(!mention_supports("The movie debuted in 1995.",q(95.0,"minutes")));
        assert!(compare(q(95.0,"minutes"),"lt",q(2.0,"hours")));
        assert!(!compare(q(120.0,"minutes"),"lt",q(2.0,"hours")));
        assert!(!compare(q(130.0,"minutes"),"lt",q(2.0,"hours")));
    }
    #[test]
    fn songs_tracks_episodes_pages_and_chapters_have_distinct_meanings(){
        assert!(approx_equal(q(9.0,"songs"),q(9.0,"tracks")));
        assert!(!approx_equal(q(9.0,"episodes"),q(9.0,"tracks")));
        assert!(!compare(q(180.0,"pages"),"lt",q(10.0,"chapters")));
        assert!(compare(q(9.0,"tracks"),"lt",q(10.0,"songs")));
        assert!(!compare(q(10.0,"tracks"),"lt",q(10.0,"songs")));
    }
    #[test]
    fn first_quantity_stays_with_its_named_subject(){
        assert!(first_measure_matches(" has 4 episodes and another series has 12 episodes",
            q(4.0,"episodes")));
        assert!(!first_measure_matches(" has 4 episodes and another series has 12 episodes",
            q(12.0,"episodes")));
        assert!(first_measure_matches(" runs for 1 hour and 35 minutes",
            q(95.0,"minutes")));
        assert!(first_measure_matches(" season 1 contains 4 episodes",
            q(4.0,"episodes")));
    }
    #[test]
    fn refuses_unitless_numbers_and_incompatible_dimensions(){
        assert!(canonical(90.0,"year").is_none());
        assert!(!mention_supports("A list of 9 films. Each film has 12 chapters.",q(9.0,"tracks")));
    }
}
