import fs from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { pdfTextSafe } from '@/lib/pdf-text-safe'
import { elementText, PAGE_WIDTH, REGION_HEIGHT, type PayslipDesign, type DesignCompany } from './schema'
export const pdfColor=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)
export async function drawDesignRegion(pdf:PDFDocument,page:PDFPage,design:PayslipDesign,region:'header'|'footer',company:DesignCompany,regular:PDFFont,bold:PDFFont,strict=false) {
 const height=REGION_HEIGHT[region],bottom=region==='header'?page.getHeight()-height:24
 page.drawRectangle({x:0,y:bottom,width:PAGE_WIDTH,height,color:pdfColor(region==='header'?design.headerBackground:design.footerBackground)})
 for(const e of design[region]) {
  const top=bottom+height-e.y
  if(e.kind==='logo'&&e.image) {
   const bytes=Buffer.from(e.image.split(',')[1],'base64')
   const image=e.image.startsWith('data:image/png')?await pdf.embedPng(bytes):await pdf.embedJpg(bytes)
   const scale=Math.min(e.width/image.width,e.height/image.height),w=image.width*scale,h=image.height*scale
   const dx=e.align==='center'?(e.width-w)/2:e.align==='right'?e.width-w:0
   page.drawImage(image,{x:e.x+dx,y:top-(e.height+h)/2,width:w,height:h})
   continue
  }
  let font:PDFFont= e.bold?bold:regular
  if(e.font==='serif') font=await pdf.embedFont(e.bold?(e.italic?StandardFonts.TimesRomanBoldItalic:StandardFonts.TimesRomanBold):(e.italic?StandardFonts.TimesRomanItalic:StandardFonts.TimesRoman))
  else if(e.font==='mono') font=await pdf.embedFont(e.bold?(e.italic?StandardFonts.CourierBoldOblique:StandardFonts.CourierBold):(e.italic?StandardFonts.CourierOblique:StandardFonts.Courier))
  else if(e.italic) font=await pdf.embedFont(e.bold?StandardFonts.HelveticaBoldOblique:StandardFonts.HelveticaOblique)
  const text=pdfTextSafe(elementText(e,company))
  const wrap=(size:number)=>{
   const lines:string[]=[]
   for(const paragraph of text.split('\n')) {
    let line=''
    for(const word of paragraph.split(/\s+/)) {
     const next=line?`${line} ${word}`:word
     if(font.widthOfTextAtSize(next,size)<=e.width) {line=next;continue}
     if(line)lines.push(line)
     line=''
     for(const char of word) {if(line&&font.widthOfTextAtSize(line+char,size)>e.width){lines.push(line);line=''} line+=char}
    }
    lines.push(line)
   }
   return lines
  }
  let size=e.fontSize,lines=wrap(size)
  while(size>7&&lines.length*size*1.3>e.height){size=Math.max(7,size-0.5);lines=wrap(size)}
  if(strict&&lines.length*size*1.3>e.height) throw new Error(`The ${region} ${e.kind} element needs a taller box or shorter text.`)
  // Dynamic company details can change after saving; retain the bounded payroll layout.
  for(const [i,line] of lines.slice(0,Math.floor(e.height/(size*1.3))).entries()) {
   const width=font.widthOfTextAtSize(line,size),x=e.x+(e.align==='center'?(e.width-width)/2:e.align==='right'?e.width-width:0),y=top-size-i*size*1.3
   page.drawText(line,{x,y,size,font,color:pdfColor(e.color)})
   if(e.underline&&line)page.drawLine({start:{x,y:y-1.5},end:{x:x+width,y:y-1.5},thickness:0.6,color:pdfColor(e.color)})
  }
 }
}

export async function designFonts(pdf:PDFDocument) {
 pdf.registerFontkit(fontkit)
 try {
  const dir=path.join(process.cwd(),'public/fonts/montserrat/static')
  const regular=await pdf.embedFont(await fs.readFile(path.join(dir,'Montserrat-Regular.ttf')),{subset:true})
  const bold=await pdf.embedFont(await fs.readFile(path.join(dir,'Montserrat-Bold.ttf')),{subset:true})
  return {regular,bold}
 }catch{return {regular:await pdf.embedFont(StandardFonts.Helvetica),bold:await pdf.embedFont(StandardFonts.HelveticaBold)}}
}
export async function validateDesignLayout(design:PayslipDesign,company:DesignCompany) {
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),{regular,bold}=await designFonts(pdf)
 await drawDesignRegion(pdf,page,design,'header',company,regular,bold,true)
 await drawDesignRegion(pdf,page,design,'footer',company,regular,bold,true)
}
