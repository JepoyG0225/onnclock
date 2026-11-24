import { prisma } from '@/lib/prisma'
import { decryptAccountingToken, encryptAccountingToken } from './crypto'
import { accountingOAuthConfig, quickbooksBase, type AccountingProvider } from './oauth'
export type { AccountMapping } from './policy'
export class AccountingApiError extends Error { constructor(message:string,public status:number){super(message)} }
export async function connectionAccessToken(connectionId:string){
 let connection=await prisma.accountingConnection.findUniqueOrThrow({where:{id:connectionId}})
 if(!['CONNECTED','SELECT_TENANT'].includes(connection.status))throw new Error('Reconnect this accounting provider.')
 if(connection.tokenExpiresAt.getTime()>Date.now()+60_000)return {connection,accessToken:decryptAccountingToken(connection.accessTokenEncrypted)}
 const now=new Date()
 const lease=await prisma.accountingConnection.updateMany({where:{id:connectionId,status:{in:['CONNECTED','SELECT_TENANT']},OR:[{refreshLeaseUntil:null},{refreshLeaseUntil:{lt:now}}]},data:{refreshLeaseUntil:new Date(Date.now()+45_000)}})
 if(!lease.count)throw new Error('The connection is refreshing. Try again shortly.')
 try{
  connection=await prisma.accountingConnection.findUniqueOrThrow({where:{id:connectionId}})
  const config=accountingOAuthConfig(connection.provider as AccountingProvider)
  const response=await fetch(config.tokenUrl,{method:'POST',signal:AbortSignal.timeout(20_000),headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:decryptAccountingToken(connection.refreshTokenEncrypted)})})
  const tokens=await response.json()
  if(!response.ok||!tokens.access_token){if(response.status===400||response.status===401)await prisma.accountingConnection.update({where:{id:connectionId},data:{status:'REAUTH_REQUIRED',lastError:'Please reconnect the accounting provider.'}});throw new Error('Unable to refresh the accounting connection. Try again or reconnect.')}
  const updated=await prisma.accountingConnection.update({where:{id:connectionId},data:{accessTokenEncrypted:encryptAccountingToken(tokens.access_token),refreshTokenEncrypted:tokens.refresh_token?encryptAccountingToken(tokens.refresh_token):connection.refreshTokenEncrypted,tokenExpiresAt:new Date(Date.now()+Number(tokens.expires_in||1800)*1000),lastError:null}})
  return {connection:updated,accessToken:tokens.access_token as string}
 }finally{await prisma.accountingConnection.updateMany({where:{id:connectionId},data:{refreshLeaseUntil:null}})}
}
export async function accountingRequest(connectionId:string,path:string,init:RequestInit={}){
 const {connection,accessToken}=await connectionAccessToken(connectionId)
 const base=connection.provider==='QUICKBOOKS'?`${quickbooksBase(connection.environment)}/v3/company/${encodeURIComponent(connection.tenantId)}`:'https://api.xero.com/api.xro/2.0'
 const response=await fetch(base+path,{...init,signal:AbortSignal.timeout(25_000),headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','Content-Type':'application/json',...(connection.provider==='XERO'?{'Xero-tenant-id':connection.tenantId}:{}),...init.headers}})
 const text=await response.text();let data;try{data=text?JSON.parse(text):{}}catch{throw new AccountingApiError('Provider returned an unreadable response.',response.status)}
 if(!response.ok)throw new AccountingApiError(data.Fault?.Error?.[0]?.Detail||data.Elements?.[0]?.ValidationErrors?.[0]?.Message||data.Message||`Accounting API returned ${response.status}`,response.status)
 return {connection,data}
}
export type RemoteAccount={id:string;code:string;name:string;type:string;currency?:string;system?:boolean}
export async function listAccounts(connectionId:string):Promise<RemoteAccount[]>{
 const connection=await prisma.accountingConnection.findUniqueOrThrow({where:{id:connectionId}})
 if(connection.status!=='CONNECTED')throw new Error('Connect and select an accounting company first.')
 if(connection.provider==='QUICKBOOKS'){
  const result:RemoteAccount[]=[]
  for(let start=1;start<=10001;start+=1000){const query=encodeURIComponent(`select * from Account where Active = true startposition ${start} maxresults 1000`);const {data}=await accountingRequest(connectionId,`/query?query=${query}`);const accounts=data.QueryResponse?.Account||[];for(const a of accounts)result.push({id:String(a.Id),code:String(a.AcctNum||''),name:String(a.FullyQualifiedName||a.Name),type:String(a.AccountType),currency:a.CurrencyRef?.value});if(accounts.length<1000)return result}
  throw new Error('Too many accounts to load. Contact support.')
 }
 const {data}=await accountingRequest(connectionId,'/Accounts')
 return (data.Accounts||[]).filter((a:{Status:string})=>a.Status==='ACTIVE').map((a:{AccountID:string;Code?:string;Name:string;Type:string;CurrencyCode?:string;SystemAccount?:string})=>({id:a.Type==='BANK'?a.AccountID:a.Code||a.AccountID,code:a.Code||'',name:a.Name,type:a.Type,currency:a.CurrencyCode,system:Boolean(a.SystemAccount)}))
}
export function validateMappings(provider:string,mappings:Record<string,string|undefined>,accounts:RemoteAccount[],currency:string){
 for(const [key,id]of Object.entries(mappings)){
  if(!id)continue;const a=accounts.find(a=>a.id===id);if(!a)throw new Error('A mapped account is no longer active. Reload your accounts.')
  const payment=['bankAccountId','cashAccountId'].includes(key)
  if(payment&&!['Bank','BANK'].includes(a.type))throw new Error('Select a bank/cash account for payment mappings. In Xero, cash must be a bank-type cash account.')
  if(!payment&&(a.system||['BANK','Bank','Accounts Receivable','Accounts Payable'].includes(a.type)))throw new Error('Use ordinary ledger accounts for non-payment mappings, not bank or system control accounts.')
  if(a.currency&&a.currency!==currency)throw new Error('The mapped account currency must match the connected company currency.')
  if(provider==='XERO'&&!payment&&!a.code)throw new Error('Xero ledger accounts must have an account code.')
 }
}
