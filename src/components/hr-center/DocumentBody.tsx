import { documentBodyCss, documentBodyHtml } from '@/lib/hr-center/document-body'
export function DocumentBody({body,format}:{body:unknown;format:unknown}) {
 return <><style>{documentBodyCss}</style><div className="hr-document-body" dangerouslySetInnerHTML={{__html:documentBodyHtml(body,format)}}/></>
}
