export async function responseJson(response:Response){const d=await response.json().catch(()=>({error:'Server response unavailable. Please retry.'}));if(!response.ok)throw new Error(d.error??'Request failed.');return d}
export const label=(s:string)=>s.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase())
export const php=(n:number)=>n.toLocaleString('en-PH',{style:'currency',currency:'PHP'})
export const stamp=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
export function downloadCsv(name:string,rows:unknown[][]){const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
