//! Read-only local text extraction for deliberately selected documents.
 //! Never opens arbitrary paths or writes anything to disk. File bytes arrive
 //! from the owner's browser File picker; only extracted text reaches Ollama.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use calamine::{open_workbook_auto_from_rs, Reader};
use quick_xml::{events::Event, Reader as XmlReader, XmlVersion};
use serde::Serialize;
use std::{io::{Cursor, Read}, str};
use zip::ZipArchive;

const MAX_FILE_BYTES: usize = 12 * 1024 * 1024;
const MAX_XML_BYTES: u64 = 6 * 1024 * 1024;
const MAX_ARCHIVE_MEMBERS: usize = 2500;
const MAX_TEXT_CHARS: usize = 100_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedDocument {
    text: String,
    truncated: bool,
    kind: String,
}

fn extension(file_name: &str) -> Result<&str, String> {
    if file_name.len() > 180 || file_name.contains(['/', '\\', '\0']) {
        return Err("Invalid document name".into());
    }
    file_name.rsplit('.').next().filter(|e| file_name.contains('.') && !e.is_empty())
        .ok_or_else(|| "Document has no supported file extension".to_owned())
}

fn allowed_document(ext: &str) -> bool {
    matches!(ext,"pdf" | "docx" | "pptx" | "odt" | "xlsx" | "xls" | "xlsm" | "xlsb" | "ods")
}
fn capped(text: String, kind: &str, was_truncated: bool) -> Result<ExtractedDocument, String> {
    let length=text.chars().count();
    let truncated=was_truncated||length>MAX_TEXT_CHARS;
    let text:String=text.chars().take(MAX_TEXT_CHARS).collect();
    if text.trim().is_empty() {
        return Err("This file contained no extractable text. Scanned PDFs or image-only documents need OCR, which is not implemented yet.".into());
    }
    Ok(ExtractedDocument {text,truncated,kind:kind.to_owned()})
}
fn local_tag(name: &[u8]) -> &[u8] {
    name.rsplit(|c|*c==b':').next().unwrap_or(name)
}
fn xml_to_plain(xml: &str) -> Result<String, String> {
    let mut reader=XmlReader::from_str(xml);
    let mut out=String::new();
    let mut inside_text=false;
    loop {
        match reader.read_event().map_err(|e| format!("Cannot parse document XML: {e}"))? {
            Event::Start(e)=>{
                let tag=local_tag(e.name().as_ref()).to_vec();
                if matches!(tag.as_slice(),b"p"|b"h"|b"row"|b"tr") && !out.ends_with('\n') {
                    out.push('\n');
                }
                if tag==b"t" {inside_text=true;}
                if tag==b"tab" {out.push('\t');}
                if tag==b"br" {out.push('\n');}
            },
            Event::Empty(e)=>{
                let tag=local_tag(e.name().as_ref()).to_vec();
                if tag==b"tab" {out.push('\t');}
                if tag==b"br" {out.push('\n');}
            },
            Event::End(e)=>{
                let tag=local_tag(e.name().as_ref()).to_vec();
                if tag==b"t" {inside_text=false;}
                if matches!(tag.as_slice(),b"p"|b"h"|b"row"|b"tr") && !out.ends_with('\n') {
                    out.push('\n');
                }
            },
            Event::Text(e)=>{
                // ODT uses plain XML text in paragraphs/spans; DOCX and PPTX use t nodes.
                let content=e.xml_content(XmlVersion::Implicit1_0)
                    .map_err(|err|format!("Invalid document text: {err}"))?;
                if inside_text || !content.trim().is_empty() {
                    out.push_str(&content);
                }
            },
            Event::CData(e)=>{
                out.push_str(&e.xml_content(XmlVersion::Implicit1_0).map_err(|err|err.to_string())?);
            },
            Event::Eof=>break,
            _=>{}
        }
        if out.len()>MAX_TEXT_CHARS*4 {break;}
    }
    Ok(out)
}
fn extract_office(bytes: Vec<u8>, ext: &str) -> Result<ExtractedDocument, String> {
    let mut archive=ZipArchive::new(Cursor::new(bytes))
        .map_err(|_|"This Office document is not a readable ZIP container".to_owned())?;
    if archive.len()>MAX_ARCHIVE_MEMBERS {
        return Err("This document has too many internal parts".into());
    }
    let mut paths:Vec<String>=match ext {
        "docx"=>vec!["word/document.xml".into()],
        "odt"=>vec!["content.xml".into()],
        "pptx"=>{
            let mut slides=Vec::new();
            for index in 0..archive.len() {
                let path=archive.by_index(index).map_err(|e|e.to_string())?.name().to_owned();
                if let Some(n)=path.strip_prefix("ppt/slides/slide").and_then(|p|p.strip_suffix(".xml"))
                    .and_then(|n|n.parse::<usize>().ok())
                { slides.push((n,path)); }
            }
            slides.sort_by_key(|(n,_)|*n);
            slides.into_iter().map(|(_,name)|name).collect()
        },
        _=>return Err("Unexpected document type".into())
    };
    if paths.is_empty(){return Err("No text parts were found in the document".into());}
    let mut truncated=false;
    if paths.len()>80 {paths.truncate(80);truncated=true;}
    let mut combined=String::new();
    for (number,path) in paths.iter().enumerate() {
        let mut entry=archive.by_name(path).map_err(|e|format!("Cannot open {path}: {e}"))?;
        if entry.size()>MAX_XML_BYTES {return Err("A document XML part is too large to extract safely".into());}
        let mut xml=String::new();
        entry.take(MAX_XML_BYTES+1).read_to_string(&mut xml)
            .map_err(|_|"Document XML could not be decoded as UTF-8".to_owned())?;
        if xml.len() as u64>MAX_XML_BYTES {return Err("Document XML exceeds the safe extraction limit".into());}
        let text=xml_to_plain(&xml)?;
        if ext=="pptx" {combined.push_str(&format!("\n[Slide {}]\n",number+1));}
        combined.push_str(&text);
        combined.push('\n');
        if combined.len()>MAX_TEXT_CHARS*4 {truncated=true;break;}
    }
    capped(combined,ext,truncated)
}
fn extract_spreadsheet(bytes: Vec<u8>, ext: &str) -> Result<ExtractedDocument, String> {
    let mut workbook=open_workbook_auto_from_rs(Cursor::new(bytes))
        .map_err(|e|format!("Cannot read spreadsheet: {e}"))?;
    let names=workbook.sheet_names().to_owned();
    let mut text=String::new();
    let mut truncated=names.len()>15;
    for name in names.iter().take(15) {
        text.push_str(&format!("\n[Sheet: {}]\n",name));
        let range=workbook.worksheet_range(name).map_err(|e|format!("Cannot read sheet {name}: {e}"))?;
        if range.height()>500 {truncated=true;}
        for row in range.rows().take(500) {
            let line=row.iter().take(50).map(|value|value.to_string().replace(['\n','\t']," "))
                .collect::<Vec<_>>().join("\t");
            text.push_str(&line);
            text.push('\n');
            if text.len()>MAX_TEXT_CHARS*4 {truncated=true;break;}
        }
        if text.len()>MAX_TEXT_CHARS*4 {break;}
    }
    capped(text,ext,truncated)
}
fn extract_bytes(file_name:String, bytes:Vec<u8>) -> Result<ExtractedDocument, String> {
    let ext=extension(&file_name)?.to_ascii_lowercase();
    if !allowed_document(&ext) {return Err("Unsupported document type".into());}
    if bytes.is_empty() || bytes.len()>MAX_FILE_BYTES {return Err("Choose a nonempty file under 12 MB".into());}
    match ext.as_str() {
        "pdf"=>{
            if !bytes.starts_with(b"%PDF-") {return Err("This file is not a PDF document".into());}
            let text=pdf_extract::extract_text_from_mem(&bytes)
                .map_err(|e|format!("Cannot extract PDF text: {e}"))?;
            capped(text,&ext,false)
        },
        "docx" | "pptx" | "odt"=>extract_office(bytes,&ext),
        "xlsx" | "xls" | "xlsm" | "xlsb" | "ods"=>extract_spreadsheet(bytes,&ext),
        _=>Err("Unsupported document type".into())
    }
}

#[tauri::command]
pub async fn extract_document(file_name: String, file_base64: String) -> Result<ExtractedDocument, String> {
    let ext=extension(&file_name)?.to_ascii_lowercase();
    if !allowed_document(&ext) {return Err("Unsupported document type".into());}
    if file_base64.len()>MAX_FILE_BYTES.div_ceil(3)*4+8 {
        return Err("Choose a file under 12 MB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes=STANDARD.decode(&file_base64).map_err(|_|"Invalid document encoding".to_owned())?;
        extract_bytes(file_name,bytes)
    }).await.map_err(|e|format!("Could not extract document: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_traversal_and_unsupported_files() {
        assert!(extension("../secrets.pdf").is_err());
        assert!(extension("folder\\hello.pdf").is_err());
        assert!(!allowed_document("exe"));
        assert!(extract_bytes("example.pdf".into(),vec![1,2,3]).is_err());
        assert!(extract_bytes("unknown.doc".into(),vec![1,2,3]).is_err());
    }
    #[test]
    fn parses_office_style_xml_without_running_it() {
        let xml=r#"<w:document><w:p><w:r><w:t>Hello &amp; goodbye</w:t></w:r>
          <w:tab/><w:r><w:t>World</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:document>"#;
        let text=xml_to_plain(xml).unwrap();
        assert!(text.contains("Hello & goodbye"));
        assert!(text.contains("World"));
        assert!(text.contains("Second paragraph"));
    }
    #[test]
    fn caps_long_extracted_documents() {
        let doc=capped("x".repeat(MAX_TEXT_CHARS+200),"pdf",false).unwrap();
        assert!(doc.truncated);
        assert_eq!(doc.text.len(),MAX_TEXT_CHARS);
    }
}
