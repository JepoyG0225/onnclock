"use client"
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
export function SelfieCamera({ onCapture, onClose }: { onCapture: (photo: string) => void; onClose: () => void }) {
 const video = useRef<HTMLVideoElement>(null)
 const [ready,setReady]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let active=true; let stream:MediaStream|undefined
  Promise.resolve().then(() => {
   if (!navigator.mediaDevices) throw new Error('Camera unavailable')
   return navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false})
  }).then(s=>{
   if(!active){s.getTracks().forEach(t=>t.stop());return}
   stream=s;if(video.current)video.current.srcObject=s
  }).catch(()=>setError('Camera access is required. Allow camera access in your browser and try again.'))
  return()=>{active=false;stream?.getTracks().forEach(t=>t.stop())}
 },[])
 const capture=()=>{
  const v=video.current;if(!v||!v.videoWidth)return
  const c=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(v.videoWidth,v.videoHeight))
  c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale)
  const context=c.getContext('2d');if(!context)return
  context.drawImage(v,0,0,c.width,c.height);onCapture(c.toDataURL('image/jpeg',0.8))
 }
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Capture attendance selfie">
  <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-4">
   <h2 className="font-semibold">Capture attendance selfie</h2>
   <p className="text-sm text-slate-500">Take a photo for your attendance record. No face matching is performed.</p>
   <video ref={video} autoPlay muted playsInline onLoadedData={()=>setReady(true)} className="aspect-[3/4] max-h-[55vh] w-full rounded-xl bg-black object-cover [transform:scaleX(-1)]" />
   {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
   <div className="flex justify-center gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!ready||!!error} onClick={capture}>Capture selfie</Button></div>
  </div>
 </div>
}
