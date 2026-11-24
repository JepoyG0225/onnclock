import sanitizeHtml from 'sanitize-html'
export const escapeDocumentText = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function cleanDocumentHtml(value: string) {
 return sanitizeHtml(value, {allowedTags:['p','div','br','h1','h2','h3','strong','b','em','i','u','s','span','ul','ol','li','blockquote'],allowedAttributes:{'*':['style']},allowedStyles:{'*':{'text-align':[/^(left|center|right|justify)$/],'font-family':[/^["']?(Arial|Georgia|Verdana|Times New Roman|sans-serif|serif)["']?$/],'font-weight':[/^(bold|normal|[1-9]00)$/],'font-style':[/^(italic|normal)$/],'text-decoration':[/^(underline|line-through|none)$/],'font-size':[/^(12|14|16|18|20|24|28|32)px$/],'color':[/^#[0-9a-fA-F]{6}$/]}}})
}
export function documentBodyHtml(body: unknown, format: unknown) {
 return format === 'HTML' ? cleanDocumentHtml(String(body??'')) : escapeDocumentText(String(body??'')).replace(/\n/g,'<br>')
}
export const documentBodyCss = `.hr-document-body{font:16px/1.7 Georgia,serif;color:#172033;overflow-wrap:anywhere;white-space:normal}.hr-document-body p,.hr-document-body div{margin:0 0 12px}.hr-document-body h1{font-size:28px;font-weight:700;line-height:1.3;margin:20px 0}.hr-document-body h2{font-size:22px;font-weight:700;line-height:1.4;margin:16px 0}.hr-document-body h3{font-size:18px;font-weight:700;margin:12px 0}.hr-document-body ul{list-style:disc;padding-left:24px}.hr-document-body ol{list-style:decimal;padding-left:24px}.hr-document-body blockquote{border-left:3px solid #cbd5e1;padding-left:16px}.hr-document-body li{margin:4px 0}`
