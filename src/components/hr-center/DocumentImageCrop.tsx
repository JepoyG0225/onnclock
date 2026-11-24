"use client"
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Crop = { x: number; y: number; w: number; h: number }
const full: Crop = { x: 0, y: 0, w: 100, h: 100 }
export function DocumentImageCrop({ file, onApply, onCancel }: { file: File; onApply: (image: string) => void; onCancel: () => void }) {
 const [src,setSrc]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[crop,setCrop]=useState<Crop>(full)
 const image=useRef<HTMLImageElement>(null),start=useRef<{x:number;y:number}|null>(null)
 useEffect(()=>{const url=URL.createObjectURL(file);setSrc(url);return()=>URL.revokeObjectURL(url)},[file])
 function point(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))}}
 function apply(){if(!image.current||!ready)return;setBusy(true);try{const img=image.current,sx=img.naturalWidth*crop.x/100,sy=img.naturalHeight*crop.y/100,sw=img.naturalWidth*crop.w/100,sh=img.naturalHeight*crop.h/100;const ratio=Math.min(1,1600/sw,600/sh),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*ratio));canvas.height=Math.max(1,Math.round(sh*ratio));const context=canvas.getContext('2d');if(!context)throw Error('Image processing unavailable.');context.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');if(data.length>1_000_000)throw Error('Choose a smaller or simpler image.');onApply(data)}catch(error){toast.error(error instanceof Error?error.message:'Unable to crop image.');setBusy(false)}}
 return <div className="space-y-4 rounded-xl border border-orange-200 bg-white p-4" aria-label="Crop company image">
  <div><h3 className="text-sm font-semibold text-primary">Crop your image</h3><p className="mt-1 text-xs text-slate-500">Drag across the image to select an area, or adjust the sliders. Keep the full image by applying without cropping.</p></div>
  <div className="flex justify-center overflow-hidden rounded-lg bg-slate-100 p-2">
   <div className="relative max-w-full touch-none select-none overflow-hidden" onPointerDown={e=>{if(!ready||busy)return;e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e)}} onPointerMove={e=>{if(!start.current)return;const p=point(e),a=start.current;setCrop({x:Math.min(a.x,p.x,99),y:Math.min(a.y,p.y,99),w:Math.max(1,Math.abs(p.x-a.x)),h:Math.max(1,Math.abs(p.y-a.y))})}} onPointerUp={()=>{start.current=null}} onPointerCancel={()=>{start.current=null}}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src&&<img ref={image} src={src} alt="Image to crop" draggable={false} onLoad={()=>setReady(true)} onError={()=>toast.error('Unable to read image. Choose another PNG or JPEG.')} className="block max-h-72 max-w-full object-contain"/>}
    {ready&&<div className="pointer-events-none absolute border-2 border-orange-500" style={{left:`${crop.x}%`,top:`${crop.y}%`,width:`${crop.w}%`,height:`${crop.h}%`,boxShadow:'0 0 0 9999px rgba(22,45,84,.5)'}}/>}
   </div>
  </div>
  <div className="grid grid-cols-2 gap-4">{(['x','y','w','h'] as const).map((key,i)=><label key={key} className="text-xs text-primary">{['Left','Top','Width','Height'][i]} <span className="text-slate-500">{Math.round(crop[key])}%</span><input type="range" aria-label={`Crop ${['left','top','width','height'][i]}`} className="mt-2 block w-full accent-accent" disabled={!ready||busy} min={key==='x'||key==='y'?0:1} max={key==='x'?100-crop.w:key==='y'?100-crop.h:key==='w'?100-crop.x:100-crop.y} step="0.1" value={crop[key]} onChange={e=>setCrop(prev=>({...prev,[key]:Number(e.target.value)}))}/></label>)}</div>
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setCrop(full)}>Reset crop</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button><Button type="button" disabled={!ready||busy} onClick={apply}>Apply image</Button></div>
 </div>
}
