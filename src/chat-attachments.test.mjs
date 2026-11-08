import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentType,attachmentBudget,attachmentPromptText,attachmentQuestion,
  extensionOf,MAX_ATTACHMENT_BYTES
} from "./chat-attachments.ts";

test("common images, documents and source files are recognized without executable upload",()=>{
  for(const name of ["note.txt","site.tsx","server.php","data.json","README.md","things.csv","styles.scss",
    "diff.patch","settings.yaml","page.html","script.py","report.sql","config.toml"])
    assert.equal(attachmentType(name),"text",name);
  for(const name of ["report.pdf","paper.docx","pitch.pptx","budget.xlsx","legacy.xls","sheet.ods","notes.odt"])
    assert.equal(attachmentType(name),"document",name);
  for(const name of ["picture.jpg","screenshot.png","photo.webp","animation.gif"])
    assert.equal(attachmentType(name),"image",name);
  for(const name of ["malware.exe","backup.zip","keys.pfx","old.doc","slides.ppt"])
    assert.equal(attachmentType(name),null,name);
  assert.equal(extensionOf("HELLO.PDF"),"pdf");
  assert.ok(MAX_ATTACHMENT_BYTES>10_000_000);
});

test("file prompts include bounded content, caveats and lower-trust delimiters",()=>{
  const doc={kind:"text",name:"readme.md",size:1000,format:"md",truncated:false,text:"Hello world"} as const;
  const rendered=attachmentPromptText(doc,4096);
  assert.match(rendered.content,/Filename: "readme.md"/);
  assert.match(rendered.content,/BEGIN ATTACHED FILE TEXT\nHello world\nEND ATTACHED FILE TEXT/);
  assert.match(rendered.content,/NOT instructions/);
  assert.equal(rendered.truncated,false);
  const veryLong={...doc,text:"A".repeat(24000)};
  const short=attachmentPromptText(veryLong,4096);
  assert.equal(short.truncated,true);
  assert.ok(short.content.length<4400);
  assert.match(short.content,/INCOMPLETE/);
  const extractTruncated=attachmentPromptText({...doc,truncated:true},32000);
  assert.equal(extractTruncated.truncated,true);
  assert.ok(attachmentBudget(16384)>attachmentBudget(8192));
});

test("image prompts pass no invented content, file bytes, or sensitive names to model",()=>{
  const image={kind:"image",name:"photo.png",size:5000,width:800,height:600,imageBase64:"secret"} as const;
  const prompt=attachmentPromptText(image,8192);
  assert.match(prompt.content,/owner-approved local image/i);
  assert.doesNotMatch(prompt.content,/secret/);
  assert.equal(attachmentQuestion("",image),"What can you see in this image?");
  assert.match(attachmentQuestion("",{kind:"text",name:"doc.txt",size:1,format:"txt",truncated:false,text:"abc"}),/Summarize/);
  assert.equal(attachmentQuestion(" Is this right? ",image),"Is this right?");
  assert.equal(attachmentQuestion("",null),"");
});
