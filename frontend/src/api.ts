export interface Account { id:number; username:string; name:string; department:string; role:string }
export interface Product { id:number; sku:string; name:string; category:string; unit:string; price:number; min_stock:number; stock:number; supplier_id:number; supplier_name:string; version:number; stock_version:number }
export interface RequestLine { id:string; product_id:number; supplier_id:number; product_name:string; sku:string; unit:string; quantity:number; unit_price:number; amount:number; supplier_name:string }
export interface OrderLine extends Omit<RequestLine,'supplier_id'|'supplier_name'> { order_id:string; request_line_id:string; received_quantity:number; returned_quantity:number; net_received:number; remaining:number }
export interface PurchaseRequest { id:string; number:string; applicant_id:number; product_id:number; quantity:number; unit_price:number; reason:string; status:string; review_note:string|null; created_at:string; updated_at:string; product_name:string; sku:string; unit:string; applicant_name:string; department:string; amount:number; version:number; lines:RequestLine[] }
export interface Order { id:string; number:string; request_id:string; status:string; fulfillment_status:string; product_name:string; quantity:number; unit:string; supplier_name:string; buyer_name:string; created_at:string; amount:number; version:number; lines:OrderLine[] }
export interface Supplier { id:number; name:string; contact:string; phone:string; version:number }
export interface Movement { id:string; product_name:string; sku:string; unit:string; type:string; quantity:number; balance:number; reference:string; operator_name:string; created_at:string; business_type:string; returned_quantity:number; remaining:number }
export interface Audit { id:number; actor_name:string; action:string; target:string; detail:string; created_at:string }
export interface User { id:number; username:string; display_name:string; department:string; role:string; enabled:boolean; version:number }
export interface Overview { pending:number; amount:number; requests:number; lowStock:number; openOrders:number|null; stockValue:number|null }
export interface RequestItemInput {productId:number;quantity:number}
export interface FulfillmentForm {lines:{orderLineId:string;quantity:number}[];reason:string}
export interface Notice {id:string;title:string;body:string;path:string;read_at:string|null;created_at:string}
export interface Inbox {items:Notice[];total:number;unread:number;page:number;size:number}
export interface Profile {id:number;username:string;display_name:string;department:string;role:string;email:string;phone:string;version:number}
let csrfToken=''
export async function csrf() {
  const res=await fetch('/api/auth/csrf',{credentials:'same-origin',signal:AbortSignal.timeout(15000)})
  if(!res.ok) throw new Error('暂时无法连接服务，请确认后端已启动')
  csrfToken=(await res.json()).token
}
export async function api<T>(path:string, options:RequestInit={}):Promise<T> {
  const headers=new Headers(options.headers)
  if(options.body && !(options.body instanceof URLSearchParams)) headers.set('Content-Type','application/json')
  if(options.method && options.method!=='GET') {
    if(!csrfToken) await csrf()
    headers.set('X-CSRF-TOKEN',csrfToken)
  }
  let res:Response
  try {res=await fetch('/api'+path,{...options,headers,credentials:'same-origin',signal:AbortSignal.timeout(20000)})}
  catch {throw new Error('连接超时或网络中断，请检查服务状态；重试原操作不会重复提交')}
  if(!res.ok) {
    const data=await res.json().catch(()=>({message:'服务暂时不可用，请稍后重试'}))
    if(res.status===401 && path!=='/auth/login') window.dispatchEvent(new CustomEvent('session-expired',{detail:data.message}))
    throw new Error(data.message || `操作失败（${res.status}）`)
  }
  return res.status===204 ? undefined as T : await res.json()
}
export async function post<T>(path:string, body?:unknown, key?:string):Promise<T> {
  return api<T>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body),headers:key?{'Idempotency-Key':key}:undefined})
}
export async function put<T>(path:string, body:unknown):Promise<T> {
  return api<T>(path,{method:'PUT',body:JSON.stringify(body)})
}
