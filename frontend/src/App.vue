<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { LayoutDashboard, ClipboardList, ShoppingCart, Package, ArrowLeftRight, Building2, ShieldCheck, Users, Search, Plus, ArrowUpRight, ArrowRight, ChevronRight, LogOut, X, Check, AlertCircle, CheckCircle2, Clock3, Download, RefreshCw, Box, Layers, Menu, LoaderCircle, Eye, EyeOff, Bell, CircleHelp } from 'lucide-vue-next'
import { api, post, put, csrf, type Account, type Product, type PurchaseRequest, type Order, type Supplier, type Movement, type Audit, type User, type Overview } from './api'
import type {RequestItemInput,FulfillmentForm,Inbox} from './api'
import PurchaseLines from './components/PurchaseLines.vue'
import FulfillmentEditor from './components/FulfillmentEditor.vue'
import PersonalCenter from './components/PersonalCenter.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import StockTools from './components/StockTools.vue'
import BackupCenter from './components/BackupCenter.vue'
import RequestLinesTable from './components/RequestLinesTable.vue'

const account=ref<Account|null>(null), ready=ref(false), busy=ref(false), loading=ref(false), mobileMenu=ref(false)
const layoutMedia=window.matchMedia('(max-width:900px)'), narrow=ref(layoutMedia.matches)
function layoutChanged(event:MediaQueryListEvent) {narrow.value=event.matches;mobileMenu.value=false}
const page=ref(location.hash.slice(1)||'overview'), search=ref(''), statusFilter=ref('ALL'), categoryFilter=ref('ALL'), stockFilter=ref(false), pageNumber=ref(1)
const username=ref(''), password=ref(''), showPassword=ref(false), loginError=ref(''), demoMode=ref(false)
const products=ref<Product[]>([]), requests=ref<PurchaseRequest[]>([]), orders=ref<Order[]>([]), suppliers=ref<Supplier[]>([]), movements=ref<Movement[]>([]), audits=ref<Audit[]>([]), users=ref<User[]>([])
const overview=ref<Overview>({pending:0,amount:0,requests:0,lowStock:0,openOrders:null,stockValue:null})
const toast=ref<{message:string;error:boolean}|null>(null)
let toastTimer:ReturnType<typeof setTimeout>|undefined
const modal=ref(''), selectedRequest=ref<PurchaseRequest|null>(null), selectedOrder=ref<Order|null>(null), decision=ref('APPROVED'), reviewNote=ref('')
const requestForm=ref<{lines:RequestItemInput[];reason:string}>({lines:[{productId:1,quantity:1}],reason:''})
const fulfillmentForm=ref<FulfillmentForm>({lines:[],reason:''})
const unreadNotifications=ref(0)
let notificationTimer:ReturnType<typeof setInterval>|undefined
const issueForm=ref({productId:1,quantity:1,reason:''})
const productForm=ref({sku:'',name:'',category:'办公设备',unit:'件',price:1,minStock:5,supplierId:1})
const supplierForm=ref({name:'',contact:'',phone:''})
const userForm=ref({username:'',name:'',department:'',role:'EMPLOYEE',password:'',enabled:true})
const editing=ref<{id:number|string;version:number;status?:string}|null>(null)
const memberStatus=ref('ALL')
const filteredUsers=computed(()=>users.value.filter(u=>matches(u.display_name,u.username,u.department)&&(memberStatus.value==='ALL'||u.enabled===(memberStatus.value==='ENABLED'))))
const modalTitles:Record<string,string>={request:'新建采购申请',review:'审批采购申请',detail:'采购申请详情',issue:'领用出库',receive:'登记本次收货',purchaseReturn:'采购退货',orderDetail:'订单收货明细',product:'新增商品档案',supplier:'新增供应商',user:'新增团队成员',help:'工作空间使用指南'}
const editTitles:Record<string,string>={request:'修改采购申请',product:'编辑商品档案',supplier:'编辑供应商',user:'编辑团队成员'}
const submitTitles:Record<string,string>={request:'提交采购申请',review:'确认审批',receive:'确认本次收货',purchaseReturn:'确认采购退货',issue:'确认领用出库',product:'创建商品',supplier:'创建供应商',user:'创建成员'}
const modalTitle=computed(()=>editing.value?editTitles[modal.value]:modalTitles[modal.value])
const submitTitle=computed(()=>editing.value?(modal.value==='request'?(editing.value.status==='REJECTED'?'修改并重新提交':'保存申请修改'):'保存修改'):submitTitles[modal.value])
const formError=ref(''), idempotencyKey=ref('')
let returnFocus:HTMLElement|null=null

const roleNames:Record<string,string>={ADMIN:'系统管理员',EMPLOYEE:'普通员工',MANAGER:'部门主管',BUYER:'采购专员',WAREHOUSE:'仓库管理员'}
const statusNames:Record<string,string>={PENDING:'待审批',APPROVED:'待下单',REJECTED:'已驳回',ORDERED:'收货中',RECEIVED:'已收齐',OPEN:'待收货',PARTIAL:'部分收货',RETURNED:'已退货待补货'}
const movementNames:Record<string,string>={OPENING:'期初建账',ISSUE:'领用出库',PURCHASE_RECEIPT:'采购入库',PURCHASE_RETURN:'采购退货',ISSUE_RETURN:'领用归还',COUNT_ADJUSTMENT:'盘点调整'}
const navItems=[
 {id:'overview',name:'工作台',icon:LayoutDashboard,group:'工作空间'},
 {id:'notifications',name:'通知中心',icon:Bell},
 {id:'requests',name:'采购申请',icon:ClipboardList,group:'业务管理'},
 {id:'orders',name:'采购订单',icon:ShoppingCart,roles:['ADMIN','BUYER','WAREHOUSE']},
 {id:'inventory',name:'库存管理',icon:Package},
 {id:'stock-tools',name:'盘点与归还',icon:ArrowLeftRight,roles:['ADMIN','WAREHOUSE']},
 {id:'movements',name:'出入库流水',icon:ArrowLeftRight,roles:['ADMIN','BUYER','WAREHOUSE']},
 {id:'products',name:'商品档案',icon:Layers},
 {id:'suppliers',name:'供应商',icon:Building2,roles:['ADMIN','BUYER']},
 {id:'users',name:'组织与成员',icon:Users,group:'系统管理',roles:['ADMIN']},
 {id:'audit',name:'操作审计',icon:ShieldCheck,roles:['ADMIN']},
 {id:'backups',name:'运行与备份',icon:ShieldCheck,roles:['ADMIN']},
 {id:'profile',name:'个人中心',icon:Users}
]
const nav=computed(()=>navItems.filter(i=>!i.roles || has(...i.roles)))
const currentNav=computed(()=>nav.value.find(i=>i.id===page.value)||navItems[0])
const subtitle:Record<string,string>={overview:'从采购需求到库存交付，让每一步都有迹可循。',requests:'集中管理采购需求，跟进每一笔申请的处理进度。',orders:'连接采购与仓储，跟进订单交付。',inventory:'掌握现有库存，及时补充短缺物资。',movements:'每一笔库存变化，都有清晰的来源。',products:'统一商品信息，让采购与仓储使用同一份档案。',suppliers:'维护合作伙伴与联系信息。',users:'查看团队成员、部门与角色分工。',audit:'追踪关键操作，还原业务处理过程。'}
const today=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())
function has(...roles:string[]) { return !!account.value && roles.includes(account.value.role) }
function money(value:number) { return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(value) }
function date(value:string,full=false) { if(!value)return '—'; return value.replace('T',' ').slice(0,full?16:10) }
function notify(message:string,error=false) { toast.value={message,error};clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value=null,4500) }
function navigate(id:string) { page.value=id;location.hash=id;search.value='';statusFilter.value='ALL';categoryFilter.value='ALL';stockFilter.value=false;pageNumber.value=1;mobileMenu.value=false;void nextTick(()=>window.scrollTo(0,0)) }
function matches(...values:unknown[]) { return values.some(v=>String(v??'').toLowerCase().includes(search.value.trim().toLowerCase())) }
const filteredRequests=computed(()=>requests.value.filter(r=>(statusFilter.value==='ALL'||r.status===statusFilter.value)&&matches(r.number,r.product_name,r.applicant_name,r.department,r.reason)))
const filteredProducts=computed(()=>products.value.filter(p=>(categoryFilter.value==='ALL'||p.category===categoryFilter.value)&&(!stockFilter.value||p.stock<p.min_stock)&&matches(p.name,p.sku,p.supplier_name)))
const filteredOrders=computed(()=>orders.value.filter(o=>(statusFilter.value==='ALL'||o.status===statusFilter.value)&&matches(o.number,o.product_name,o.supplier_name)))
const categories=computed(()=>[...new Set(products.value.map(p=>p.category))])
const lowProducts=computed(()=>products.value.filter(p=>p.stock<p.min_stock))
const displayedRequests=computed(()=>filteredRequests.value.slice((pageNumber.value-1)*10,pageNumber.value*10))
watch(()=>filteredRequests.value.length,count=>{pageNumber.value=Math.max(1,Math.min(pageNumber.value,Math.ceil(count/10)))})
const issueProduct=computed(()=>products.value.find(p=>p.id===issueForm.value.productId))
const counts=computed(()=>['PENDING','APPROVED','ORDERED','RECEIVED'].map(status=>({status,count:requests.value.filter(r=>r.status===status).length})))
const categorySpending=computed(()=>{
 const amounts=categories.value.map(name=>({name,amount:requests.value.filter(r=>r.status!=='REJECTED').flatMap(r=>r.lines).filter(l=>products.value.find(p=>p.id===l.product_id)?.category===name).reduce((s,l)=>s+Number(l.amount),0)}))
 const total=amounts.reduce((s,r)=>s+r.amount,0)
 return amounts.map(a=>({...a,percent:total?Math.round(a.amount/total*100):0}))
})
async function refresh(quiet=false) {
 if(!quiet)loading.value=true
 try {
  const result=await Promise.all([
   api<Overview>('/overview'),api<Product[]>('/products'),api<PurchaseRequest[]>('/requests'),
   has('ADMIN','BUYER','WAREHOUSE')?api<Order[]>('/orders'):Promise.resolve([]),
   has('ADMIN','BUYER')?api<Supplier[]>('/suppliers'):Promise.resolve([]),
   has('ADMIN','BUYER','WAREHOUSE')?api<Movement[]>('/movements'):Promise.resolve([]),
   has('ADMIN')?api<Audit[]>('/audit'):Promise.resolve([]),
   has('ADMIN')?api<User[]>('/users'):Promise.resolve([])
  ])
  ;[overview.value,products.value,requests.value,orders.value,suppliers.value,movements.value,audits.value,users.value]=result
  await refreshNotifications()
 } catch(e) { notify((e as Error).message,true) } finally { loading.value=false }
}
async function refreshNotifications(){if(!account.value)return;try{unreadNotifications.value=(await api<Inbox>('/notifications?size=1')).unread}catch{/* API reports expired sessions through the shared handler. */}}
function signedOut(message:string){account.value=null;password.value='';modal.value='';notify(message)}
async function login() {
 if(busy.value)return
 busy.value=true;loginError.value=''
 try {
  await csrf()
  await api('/auth/login',{method:'POST',body:new URLSearchParams({username:username.value,password:password.value})})
  await csrf();account.value=await api<Account>('/auth/me');navigate('overview');await refresh()
 } catch(e) { loginError.value=(e as Error).message } finally { busy.value=false }
}
async function logout() {
 try { await post('/auth/logout');account.value=null;modal.value='';await csrf() }
 catch(e) {notify((e as Error).message,true)}
}
function demo(name:string) { username.value=name;password.value='Qingzhou@2026' }
async function openModal(type:string, item?:PurchaseRequest|Order|Product|Supplier|User) {
 returnFocus=document.activeElement as HTMLElement;formError.value='';idempotencyKey.value=crypto.randomUUID();modal.value=type
 editing.value=item&&['request','product','supplier','user'].includes(type)?{id:item.id,version:(item as Product).version,status:(item as PurchaseRequest).status}:null
 if(type==='request')requestForm.value={lines:[{productId:products.value[0]?.id||1,quantity:1}],reason:''}
 if(type==='review'||type==='detail') { selectedRequest.value=item as PurchaseRequest;reviewNote.value='';decision.value='APPROVED' }
 if(['receive','purchaseReturn','orderDetail'].includes(type)){const order=item as Order;selectedOrder.value=order;fulfillmentForm.value={lines:order.lines.map(l=>({orderLineId:l.id,quantity:type==='receive'?l.remaining:0})),reason:''}}
 if(type==='issue')issueForm.value={productId:item?(item as Product).id:products.value[0]?.id||1,quantity:1,reason:''}
 if(type==='product')productForm.value={sku:'',name:'',category:'办公设备',unit:'件',price:1,minStock:5,supplierId:suppliers.value[0]?.id||1}
 if(type==='supplier')supplierForm.value={name:'',contact:'',phone:''}
 if(type==='user')userForm.value={username:'',name:'',department:'',role:'EMPLOYEE',password:'',enabled:true}
 if(item&&type==='request'){const r=item as PurchaseRequest;selectedRequest.value=r;requestForm.value={lines:r.lines.map(l=>({productId:l.product_id,quantity:l.quantity})),reason:r.reason}}
 if(item&&type==='product'){const p=item as Product;productForm.value={sku:p.sku,name:p.name,category:p.category,unit:p.unit,price:Number(p.price),minStock:p.min_stock,supplierId:p.supplier_id}}
 if(item&&type==='supplier'){const s=item as Supplier;supplierForm.value={name:s.name,contact:s.contact,phone:s.phone}}
 if(item&&type==='user'){const u=item as User;userForm.value={username:u.username,name:u.display_name,department:u.department,role:u.role,password:'',enabled:u.enabled}}
 await nextTick();document.querySelector<HTMLElement>('.modal input, .modal select, .modal button')?.focus()
}
function closeModal() { if(busy.value)return;modal.value='';returnFocus?.focus() }
async function submit() {
 if(busy.value)return
 busy.value=true;formError.value=''
 try {
  let message='操作已完成'
  if(modal.value==='request') { if(editing.value)await put(`/requests/${editing.value.id}`,{data:requestForm.value,version:editing.value.version});else await post('/requests',requestForm.value,idempotencyKey.value);message='采购申请已提交，等待主管审批' }
  if(modal.value==='review') { await post(`/requests/${selectedRequest.value!.id}/review`,{decision:decision.value,note:reviewNote.value,version:selectedRequest.value!.version});message='审批已完成' }
  if(modal.value==='receive'||modal.value==='purchaseReturn') {const lines=fulfillmentForm.value.lines.filter(l=>l.quantity>0);if(!lines.length)throw new Error('请至少填写一项本次处理数量');await post(`/orders/${selectedOrder.value!.id}/${modal.value==='receive'?'receive':'return'}`,{lines,reason:fulfillmentForm.value.reason,version:selectedOrder.value!.version},idempotencyKey.value);message=modal.value==='receive'?'本次收货已入库，剩余数量继续跟进':'采购退货已记录，库存与待补货数量已更新'}
  if(modal.value==='issue') { await post('/inventory/issue',issueForm.value,idempotencyKey.value);message='领用出库成功，流水已记录' }
  if(modal.value==='product') { if(editing.value)await put(`/products/${editing.value.id}`,{data:productForm.value,version:editing.value.version});else await post('/products',productForm.value);message=editing.value?'商品资料已保存，历史申请金额保持不变':'商品档案已创建' }
  if(modal.value==='supplier') { if(editing.value)await put(`/suppliers/${editing.value.id}`,{data:supplierForm.value,version:editing.value.version});else await post('/suppliers',supplierForm.value);message=editing.value?'供应商资料已保存':'供应商已创建' }
  if(modal.value==='user') { if(editing.value)await put(`/users/${editing.value.id}`,{name:userForm.value.name,department:userForm.value.department,role:userForm.value.role,enabled:userForm.value.enabled,version:editing.value.version});else await post('/users',userForm.value);message=editing.value?'成员资料已保存，该成员需重新登录':'成员已创建' }
  modal.value='';notify(message);await refresh(true);returnFocus?.focus()
 } catch(e) {formError.value=(e as Error).message} finally {busy.value=false}
}
async function createOrder(r:PurchaseRequest) {
 if(busy.value)return;busy.value=true
 try {const result=await post<{orders:Order[]}>(`/requests/${r.id}/order`);notify(`已按供应商生成 ${result.orders.length} 笔采购订单`);await refresh(true)}catch(e){notify((e as Error).message,true)}finally{busy.value=false}
}
function exportCsv() {
 let rows:unknown[][]=[]
 if(page.value==='requests')rows=[['申请编号','商品','SKU','申请人','部门','数量','单位','单价','行金额','单据总额','状态','时间'],...filteredRequests.value.flatMap(r=>r.lines.map(l=>[r.number,l.product_name,l.sku,r.applicant_name,r.department,l.quantity,l.unit,l.unit_price,l.amount,r.amount,statusNames[r.status],r.created_at]))]
 else if(page.value==='movements') rows=[['商品','业务类型','变动数量','结存','来源','操作人','时间'],...movements.value.filter(m=>matches(m.product_name,m.reference)).map(m=>[m.product_name,movementNames[m.business_type]||m.type,m.quantity,m.balance,m.reference,m.operator_name,m.created_at])]
 else rows=[['商品编号','商品名称','分类','库存','安全库存','单位','参考单价'],...filteredProducts.value.map(p=>[p.sku,p.name,p.category,p.stock,p.min_stock,p.unit,p.price])]
 const csv='\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')).join('\r\n')
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`轻舟-${currentNav.value.name}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);notify('已导出当前筛选结果')
}
function expired(event:Event) {account.value=null;modal.value='';notify(event instanceof CustomEvent&&event.detail?event.detail:'登录已过期，请重新登录',true)}
function hashChange() {const id=location.hash.slice(1);if(nav.value.some(i=>i.id===id)&&id!==page.value)navigate(id)}
function keydown(e:KeyboardEvent) {
 if(e.key==='Escape'&&mobileMenu.value){mobileMenu.value=false;document.querySelector<HTMLElement>('[aria-label="展开导航"]')?.focus()}
 if(!modal.value)return
 if(e.key==='Escape')closeModal()
 if(e.key==='Tab') {
  const elements=[...document.querySelectorAll<HTMLElement>('.modal button:not(:disabled),.modal input,.modal select,.modal textarea')].filter(e=>e.offsetParent!==null)
  const first=elements[0],last=elements[elements.length-1]
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }
}
onMounted(async()=>{
 notificationTimer=setInterval(()=>void refreshNotifications(),30000)
 layoutMedia.addEventListener('change',layoutChanged)
 window.addEventListener('session-expired',expired);window.addEventListener('hashchange',hashChange);window.addEventListener('keydown',keydown)
 try {await csrf();demoMode.value=(await api<{demo:boolean}>('/auth/config')).demo;if(demoMode.value)demo('admin');const res=await fetch('/api/auth/me',{signal:AbortSignal.timeout(15000)});if(res.ok){account.value=await res.json();if(!nav.value.some(n=>n.id===page.value))navigate('overview');await refresh()}}catch{loginError.value='无法连接服务，请先启动后端'}finally{ready.value=true}
})
onUnmounted(()=>{clearInterval(notificationTimer);layoutMedia.removeEventListener('change',layoutChanged);window.removeEventListener('session-expired',expired);window.removeEventListener('hashchange',hashChange);window.removeEventListener('keydown',keydown);clearTimeout(toastTimer)})
</script>

<template>
 <div v-if="!ready" class="boot"><LoaderCircle class="spin"/> 正在连接轻舟工作空间…</div>
 <div v-else-if="!account" class="login-page">
  <section class="login-story">
   <a class="brand" href="#"><span class="brand-mark"><Layers :size="25"/></span><span>轻舟<span class="brand-en">QINGZHOU</span></span></a>
   <div class="story-copy"><span class="eyebrow">PROCUREMENT, CONNECTED.</span><h1>让每一份需求，<br>有序抵达。</h1><p>从采购申请到物资入库，<br>连接团队、采购与仓储的每一步。</p></div>
   <div class="story-flow"><div><ClipboardList/><span>提出需求</span></div><i></i><div><ShieldCheck/><span>协同审批</span></div><i></i><div><Package/><span>交付入库</span></div></div>
   <div class="story-bottom"><span>轻舟 · 企业采购与库存协同</span><span>让协作自然发生</span></div>
  </section>
  <main class="login-main"><div class="login-card"><span class="mini-label">你的团队工作空间</span><h2>欢迎回来</h2><p class="muted">登录轻舟，开始今天的协作。</p>
   <form @submit.prevent="login"><label>账号<input v-model="username" name="username" autocomplete="username" required placeholder="请输入账号"/></label><label>密码<div class="password-field"><input v-model="password" :type="showPassword?'text':'password'" name="password" autocomplete="current-password" required placeholder="请输入密码"/><button type="button" :aria-label="showPassword?'隐藏密码':'显示密码'" @click="showPassword=!showPassword"><EyeOff v-if="showPassword" :size="18"/><Eye v-else :size="18"/></button></div></label><p v-if="loginError" class="form-error" role="alert">{{loginError}}</p><button class="btn primary login-submit" :disabled="busy"><LoaderCircle v-if="busy" class="spin" :size="17"/>登录工作空间<ArrowRight v-if="!busy" :size="17"/></button></form>
   <div v-if="demoMode" class="demo-accounts"><span>本地演示 · 选择角色体验</span><div><button v-for="(name,key) in {admin:'管理员',employee:'员工',manager:'主管',buyer:'采购',warehouse:'仓管'}" :key="key" :class="{selected:username===key}" @click="demo(String(key))">{{name}}</button></div><small>演示密码：Qingzhou@2026</small></div>
  </div><footer>轻舟采购协同平台 <span>·</span> {{demoMode?'本地开发工作空间':'团队协同工作空间'}}</footer></main>
 </div>
 <div v-else class="app-shell">
  <div v-if="mobileMenu" class="sidebar-scrim" @click="mobileMenu=false"></div>
  <aside class="sidebar" :class="{open:mobileMenu}" :inert="narrow&&!mobileMenu">
   <a class="brand" href="#overview" @click.prevent="navigate('overview')"><span class="brand-mark"><Layers :size="24"/></span><span>轻舟<span class="brand-en">QINGZHOU</span></span></a>
   <div class="workspace-label"><span class="workspace-avatar">舟</span><div>轻舟协同工作空间<small>采购与库存管理</small></div><ChevronRight :size="14"/></div>
   <nav aria-label="主导航"><template v-for="item in nav" :key="item.id"><span v-if="item.group" class="nav-group">{{item.group}}</span><button :class="{active:page===item.id}" @click="navigate(item.id)"><component :is="item.icon" :size="19"/><span>{{item.name}}</span><span v-if="item.id==='notifications'&&unreadNotifications" class="nav-count">{{unreadNotifications}}</span><span v-if="item.id==='requests'&&overview.pending" class="nav-count">{{overview.pending}}</span></button></template></nav>
   <div class="sidebar-note"><span class="live-dot"></span>业务数据已连接<small>每一步操作，实时留痕。</small></div>
   <div class="user-card"><span class="avatar">{{account.name.slice(-2)}}</span><div><strong>{{account.name}}</strong><small>{{roleNames[account.role]}}</small></div><button title="退出登录" aria-label="退出登录" @click="logout"><LogOut :size="17"/></button></div>
  </aside>
  <div class="main-shell">
   <header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-only" aria-label="展开导航" @click="mobileMenu=true"><Menu :size="20"/></button><span>工作空间</span><ChevronRight :size="14"/><strong>{{currentNav.name}}</strong></div><div class="topbar-right"><span class="local-tag"><span class="live-dot"></span>{{demoMode?'本地工作空间':'团队工作空间'}}</span><button class="icon-button" aria-label="使用指南" @click="openModal('help')"><CircleHelp :size="19"/></button><button class="icon-button" aria-label="查看待办" @click="navigate('notifications')"><Bell :size="19"/><span v-if="unreadNotifications" class="notification-dot"></span></button><button class="avatar small icon-button" aria-label="打开个人中心" @click="navigate('profile')">{{account.name.slice(-2)}}</button></div></header>
   <main id="main" class="page-content">
    <div class="page-heading"><div><span class="mini-label">{{page==='overview'?today:'轻舟 / '+currentNav.name}}</span><h1>{{page==='overview'?account.name+'，工作顺利':currentNav.name}}<span v-if="page==='overview'" class="greeting-dot">.</span></h1><p>{{subtitle[page]||({profile:'维护个人资料和登录密码。',notifications:'采购进展、库存提醒与待办通知。','stock-tools':'实物盘点、库存差异与领用归还。',backups:'本机稳定运行、备份与恢复。'} as Record<string,string>)[page]}}</p></div><div class="heading-actions"><button class="btn" aria-label="刷新数据" :disabled="loading" @click="refresh()"><RefreshCw :size="16" :class="{spin:loading}"/><span class="refresh-label">刷新数据</span></button><button v-if="(page==='overview'||page==='requests')&&has('EMPLOYEE','MANAGER','ADMIN')" class="btn primary" @click="openModal('request')"><Plus :size="17"/>新建采购申请</button><button v-if="page==='inventory'&&has('WAREHOUSE','ADMIN')" class="btn primary" @click="openModal('issue')"><ArrowUpRight :size="17"/>领用出库</button><button v-if="page==='products'&&has('BUYER','ADMIN')" class="btn primary" @click="openModal('product')"><Plus :size="17"/>新增商品</button><button v-if="page==='suppliers'" class="btn primary" @click="openModal('supplier')"><Plus :size="17"/>新增供应商</button><button v-if="page==='users'" class="btn primary" @click="openModal('user')"><Plus :size="17"/>新增成员</button></div></div>

    <template v-if="page==='overview'">
     <div class="metric-grid"><article class="metric"><div><span>有效采购申请金额</span><ShoppingCart :size="18"/></div><strong>{{money(overview.amount)}}<small>CNY</small></strong><p>当前可见申请 · 不含已驳回</p></article><article class="metric"><div><span>待处理审批</span><Clock3 :size="18"/></div><strong>{{overview.pending}}<small>笔</small></strong><p><span class="tiny-dot amber"></span>等待主管确认采购需求</p></article><article class="metric"><div><span>{{overview.openOrders===null?'采购申请总数':'待收货订单'}}</span><Box :size="18"/></div><strong>{{overview.openOrders??overview.requests}}<small>笔</small></strong><p>{{overview.openOrders===null?'当前账号可见的采购申请':'已下单，等待仓库确认入库'}}</p></article><article class="metric warning-metric"><div><span>库存预警</span><AlertCircle :size="18"/></div><strong>{{overview.lowStock}}<small>项</small></strong><button class="text-button" @click="navigate('inventory');stockFilter=true">低于安全库存，查看详情<ArrowRight :size="13"/></button></article></div>
     <section class="panel flow-panel"><div class="panel-title"><div><h2>采购协作，一目了然</h2><p>从需求到交付的完整业务进度</p></div><span class="subtle-tag">当前可见申请</span></div><div class="procurement-flow"><template v-for="(item,index) in counts" :key="item.status"><button :class="'flow-step step-'+index" @click="navigate('requests');statusFilter=item.status"><span class="flow-icon"><ClipboardList v-if="index===0" :size="21"/><CheckCircle2 v-else-if="index===1" :size="21"/><ShoppingCart v-else-if="index===2" :size="21"/><Package v-else :size="21"/></span><div><span>{{statusNames[item.status]}}</span><strong>{{item.count}}<small>笔申请</small></strong></div><ArrowUpRight class="flow-link" :size="16"/></button><ChevronRight v-if="index<3" class="flow-arrow" :size="18"/></template></div></section>
     <div class="dashboard-columns"><section class="panel recent-panel"><div class="panel-title"><div><h2>最近采购申请<span class="count-label">{{requests.length}}</span></h2><p>关注团队最新需求与处理进展</p></div><button class="text-button" @click="navigate('requests')">查看全部<ArrowRight :size="14"/></button></div><div class="table-scroll"><table><thead><tr><th>采购内容</th><th>申请人</th><th class="align-right">金额</th><th>状态</th></tr></thead><tbody><tr v-for="r in requests.slice(0,5)" :key="r.id" class="clickable" tabindex="0" @click="openModal('detail',r)" @keydown.enter="openModal('detail',r)"><td><strong>{{r.product_name}}</strong><small class="document-number">{{r.number}}</small></td><td>{{r.applicant_name}}<small>{{r.department}}</small></td><td class="align-right numeric">{{money(r.amount)}}</td><td><span class="status" :class="r.status">{{statusNames[r.status]}}</span></td></tr><tr v-if="!requests.length"><td colspan="4" class="empty">还没有采购申请，创建第一笔需求吧。</td></tr></tbody></table></div></section>
      <section class="panel stock-alerts"><div class="panel-title"><div><h2><span class="tiny-dot amber"></span>需要补货</h2><p>及时补充，让工作保持顺畅</p></div><span class="count-label">{{lowProducts.length}}</span></div><div v-for="p in lowProducts.slice(0,4)" :key="p.id" class="stock-alert"><div class="product-symbol"><Package :size="20"/></div><div><strong>{{p.name}}</strong><p>剩余 <b>{{p.stock}}</b> {{p.unit}}<span>安全库存 {{p.min_stock}}</span></p><div class="stock-track"><i :style="{width:Math.min(100,p.stock/p.min_stock*100)+'%'}"></i></div></div></div><div v-if="!lowProducts.length" class="empty">库存充足，暂无补货提醒。</div><button class="stock-more" @click="navigate('inventory');stockFilter=true">查看库存预警<ArrowRight :size="15"/></button></section></div>
     <section class="panel spending-panel"><div class="panel-title"><div><h2>采购投入分布</h2><p>按商品分类汇总有效采购申请金额</p></div><span class="subtle-tag">{{categories.length}} 个商品分类</span></div><div class="spending-row" v-for="(c,index) in categorySpending" :key="c.name"><span><i :class="'category-dot dot-'+index"></i>{{c.name}}</span><div class="spending-track"><i :class="'bar-'+index" :style="{width:c.percent+'%'}"></i></div><b class="numeric">{{money(c.amount)}}</b><small>{{c.percent}}%</small></div></section>
    </template>

    <PersonalCenter v-else-if="page==='profile'" @signed-out="signedOut"/><NotificationCenter v-else-if="page==='notifications'" @navigate="navigate" @changed="refreshNotifications"/><StockTools v-else-if="page==='stock-tools'" :products="products" @changed="refresh(true)"/><BackupCenter v-else-if="page==='backups'"/>
    <section v-else-if="page==='requests'" class="panel list-panel"><div class="filter-tabs"><button :class="{active:statusFilter==='ALL'}" @click="statusFilter='ALL';pageNumber=1">全部申请<span>{{requests.length}}</span></button><button v-for="s in ['PENDING','APPROVED','ORDERED','RECEIVED','REJECTED']" :key="s" :class="{active:statusFilter===s}" @click="statusFilter=s;pageNumber=1">{{statusNames[s]}}<span>{{requests.filter(r=>r.status===s).length}}</span></button></div><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索采购申请" placeholder="搜索商品、单号或申请人…" @input="pageNumber=1"/></label><button class="btn" @click="exportCsv"><Download :size="15"/>导出</button></div><div class="table-scroll"><table><thead><tr><th>申请编号 / 采购内容</th><th>申请人 / 部门</th><th class="align-right">数量</th><th class="align-right">申请金额</th><th>提交时间</th><th>状态</th><th class="align-right">操作</th></tr></thead><tbody><tr v-for="r in displayedRequests" :key="r.id"><td><button class="table-link" @click="openModal('detail',r)">{{r.product_name}}</button><small class="document-number">{{r.number}}</small></td><td>{{r.applicant_name}}<small>{{r.department}}</small></td><td class="align-right numeric">{{r.lines.length>1?r.lines.length+' 项明细':r.quantity+' '+r.unit}}</td><td class="align-right numeric">{{money(r.amount)}}</td><td class="date-cell">{{date(r.created_at)}}</td><td><span class="status" :class="r.status">{{statusNames[r.status]}}</span></td><td class="align-right"><button v-if="r.applicant_id===account.id&&['PENDING','REJECTED'].includes(r.status)" class="text-button" @click="openModal('request',r)">{{r.status==='REJECTED'?'修改重提':'修改申请'}}</button><button v-else-if="r.status==='PENDING'&&has('MANAGER','ADMIN')&&r.applicant_id!==account.id" class="text-button" @click="openModal('review',r)">审批<ArrowRight :size="13"/></button><button v-else-if="r.status==='APPROVED'&&has('BUYER','ADMIN')" class="text-button" :disabled="busy" @click="createOrder(r)">生成订单</button><button v-else class="text-button muted" @click="openModal('detail',r)">详情</button></td></tr><tr v-if="!filteredRequests.length"><td colspan="7" class="empty"><ClipboardList :size="30"/><p>{{search?'没有找到匹配的申请，试试其他关键词。':'当前状态下暂无申请。'}}</p></td></tr></tbody></table></div><div class="table-footer"><span>共 {{filteredRequests.length}} 条 · {{roleNames[account.role]}}可见范围</span><div><button class="btn compact" :disabled="pageNumber===1" @click="pageNumber--">上一页</button><span>{{pageNumber}} / {{Math.max(1,Math.ceil(filteredRequests.length/10))}}</span><button class="btn compact" :disabled="pageNumber*10>=filteredRequests.length" @click="pageNumber++">下一页</button></div></div></section>

    <template v-else-if="page==='inventory'||page==='products'"><div v-if="page==='inventory'" class="inventory-banner"><div><Package :size="24"/><div><strong>{{products.length}} 项在库商品</strong><p>库存随收货与领用实时更新</p></div></div><div v-if="overview.stockValue!==null"><span>当前库存参考价值</span><b class="numeric">{{money(overview.stockValue)}}</b></div></div><section class="panel list-panel"><div class="table-toolbar"><div class="toolbar-filters"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索商品" placeholder="搜索商品名称、SKU…"/></label><select v-model="categoryFilter" aria-label="商品分类"><option value="ALL">全部分类</option><option v-for="c in categories" :key="c">{{c}}</option></select><label v-if="page==='inventory'" class="checkbox-label"><input type="checkbox" v-model="stockFilter"/>仅看库存预警</label></div><button class="btn" @click="exportCsv"><Download :size="15"/>导出</button></div><div class="table-scroll"><table><thead><tr><th>商品名称 / SKU</th><th>分类</th><th class="align-right">参考单价</th><th class="align-right">可用库存</th><th class="align-right">安全库存</th><th>{{page==='products'?'供应商':'库存状态'}}</th><th v-if="(page==='inventory'&&has('WAREHOUSE','ADMIN'))||(page==='products'&&has('BUYER','ADMIN'))" class="align-right">操作</th></tr></thead><tbody><tr v-for="p in filteredProducts" :key="p.id"><td><div class="product-cell"><span class="product-symbol"><Package :size="19"/></span><div><strong>{{p.name}}</strong><small>{{p.sku}}</small></div></div></td><td><span class="category-tag">{{p.category}}</span></td><td class="align-right numeric">{{money(p.price)}}</td><td class="align-right numeric" :class="{shortage:p.stock<p.min_stock}"><b>{{p.stock}}</b> {{p.unit}}</td><td class="align-right numeric">{{p.min_stock}} {{p.unit}}</td><td v-if="page==='products'">{{p.supplier_name}}</td><td v-else><span class="status" :class="p.stock<p.min_stock?'PENDING':'RECEIVED'">{{p.stock<p.min_stock?'需要补货':'库存充足'}}</span></td><td v-if="page==='products'&&has('BUYER','ADMIN')" class="align-right"><button class="text-button" @click="openModal('product',p)">编辑资料</button></td><td v-if="page==='inventory'&&has('WAREHOUSE','ADMIN')" class="align-right"><button class="text-button" :disabled="!p.stock" @click="openModal('issue',p)">领用出库</button></td></tr><tr v-if="!filteredProducts.length"><td colspan="7" class="empty">没有符合筛选条件的商品。</td></tr></tbody></table></div><div class="table-footer"><span>共 {{filteredProducts.length}} 项商品</span><span>参考价值按商品当前单价计算</span></div></section></template>

    <section v-else-if="page==='orders'" class="panel list-panel"><div class="filter-tabs"><button v-for="s in ['ALL','OPEN','RECEIVED']" :key="s" :class="{active:statusFilter===s}" @click="statusFilter=s">{{s==='ALL'?'全部订单':statusNames[s]}}<span>{{orders.filter(o=>s==='ALL'||o.status===s).length}}</span></button></div><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索订单" placeholder="搜索订单、商品或供应商…"/></label><span class="muted">采购订单由已审批申请生成</span></div><div class="table-scroll"><table><thead><tr><th>订单 / 商品</th><th>供应商</th><th class="align-right">数量</th><th class="align-right">金额</th><th>采购人</th><th>状态</th><th class="align-right">操作</th></tr></thead><tbody><tr v-for="o in filteredOrders" :key="o.id"><td><button class="table-link" @click="openModal('orderDetail',o)">{{o.product_name}}</button><small class="document-number">{{o.number}}</small></td><td>{{o.supplier_name}}</td><td class="align-right">{{o.lines.length>1?o.lines.length+' 项明细':o.quantity+' '+o.unit}}</td><td class="align-right numeric">{{money(o.amount)}}</td><td>{{o.buyer_name}}</td><td><span class="status" :class="o.fulfillment_status">{{statusNames[o.fulfillment_status]}}</span></td><td class="align-right"><div class="toolbar-filters" v-if="has('WAREHOUSE','ADMIN')"><button v-if="o.lines.some(l=>l.remaining>0)" class="text-button" @click="openModal('receive',o)">分批收货</button><button v-if="o.lines.some(l=>l.net_received>0)" class="text-button" @click="openModal('purchaseReturn',o)">采购退货</button></div><span v-else class="muted">{{o.status==='RECEIVED'?'已收齐':'等待仓库收货'}}</span></td></tr><tr v-if="!filteredOrders.length"><td colspan="7" class="empty">暂无订单，采购人员可从已通过的申请生成订单。</td></tr></tbody></table></div><div class="table-footer">共 {{filteredOrders.length}} 笔订单</div></section>

    <section v-else-if="page==='movements'" class="panel list-panel"><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索库存流水" placeholder="搜索商品或来源单据…"/></label><button class="btn" @click="exportCsv"><Download :size="15"/>导出</button></div><div class="table-scroll"><table><thead><tr><th>商品</th><th>类型</th><th class="align-right">变动数量</th><th class="align-right">变动后结存</th><th>来源 / 领用说明</th><th>操作人</th><th>时间</th></tr></thead><tbody><tr v-for="m in movements.filter(m=>matches(m.product_name,m.reference))" :key="m.id"><td><strong>{{m.product_name}}</strong><small>{{m.sku}}</small></td><td><span class="status" :class="m.type==='OUT'?'PENDING':'RECEIVED'">{{movementNames[m.business_type]||m.type}}</span></td><td class="align-right numeric" :class="m.quantity<0?'shortage':'positive'">{{m.quantity>0?'+':''}}{{m.quantity}} {{m.unit}}</td><td class="align-right numeric">{{m.balance}} {{m.unit}}</td><td class="reference-cell">{{m.reference}}</td><td>{{m.operator_name}}</td><td class="date-cell">{{date(m.created_at,true)}}</td></tr><tr v-if="!movements.filter(m=>matches(m.product_name,m.reference)).length"><td colspan="7" class="empty">暂无匹配的出入库流水。</td></tr></tbody></table></div><div class="table-footer">最多展示最近 500 笔库存流水</div></section>

    <section v-else-if="page==='suppliers'" class="panel list-panel"><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索供应商" placeholder="搜索供应商或联系人…"/></label><span class="muted">{{suppliers.length}} 家合作伙伴</span></div><div class="table-scroll"><table><thead><tr><th>供应商名称</th><th>联系人</th><th>联系电话</th><th>关联商品</th><th class="align-right">操作</th></tr></thead><tbody><tr v-for="s in suppliers.filter(s=>matches(s.name,s.contact,s.phone))" :key="s.id"><td><div class="product-cell"><span class="product-symbol"><Building2 :size="19"/></span><strong>{{s.name}}</strong></div></td><td>{{s.contact}}</td><td class="numeric">{{s.phone}}</td><td>{{products.filter(p=>p.supplier_id===s.id).length}} 项</td><td class="align-right"><button class="text-button" @click="openModal('supplier',s)">编辑资料</button></td></tr><tr v-if="!suppliers.filter(s=>matches(s.name,s.contact,s.phone)).length"><td colspan="5" class="empty">暂无匹配的供应商。</td></tr></tbody></table></div></section>

    <section v-else-if="page==='users'" class="panel list-panel"><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索成员" placeholder="搜索姓名、账号或部门…"/></label><div class="toolbar-filters"><select v-model="memberStatus" aria-label="成员状态"><option value="ALL">全部状态</option><option value="ENABLED">仅看启用</option><option value="DISABLED">仅看停用</option></select><span class="muted">{{filteredUsers.length}} 位团队成员</span></div></div><div class="table-scroll"><table><thead><tr><th>团队成员</th><th>账号</th><th>所属部门</th><th>角色</th><th>账号状态</th><th class="align-right">操作</th></tr></thead><tbody><tr v-for="u in filteredUsers" :key="u.id"><td><div class="product-cell"><span class="avatar small">{{u.display_name.slice(-2)}}</span><strong>{{u.display_name}}</strong><span v-if="u.id===account.id" class="subtle-tag">我</span></div></td><td class="numeric">{{u.username}}</td><td>{{u.department}}</td><td><span class="category-tag">{{roleNames[u.role]}}</span></td><td><span class="status" :class="u.enabled?'RECEIVED':'REJECTED'">{{u.enabled?'启用':'已停用'}}</span></td><td class="align-right"><button class="text-button" @click="openModal('user',u)">编辑成员</button></td></tr><tr v-if="!filteredUsers.length"><td colspan="6" class="empty">暂无匹配的成员。</td></tr></tbody></table></div></section>

    <section v-else-if="page==='audit'" class="panel list-panel"><div class="table-toolbar"><label class="search-field"><Search :size="17"/><input v-model="search" aria-label="搜索操作日志" placeholder="搜索操作、成员或记录…"/></label><span class="muted">关键业务操作自动记录</span></div><div class="table-scroll"><table><thead><tr><th>操作人</th><th>操作</th><th>关联记录</th><th>操作详情</th><th>时间</th></tr></thead><tbody><tr v-for="a in audits.filter(a=>matches(a.actor_name,a.action,a.target,a.detail))" :key="a.id"><td>{{a.actor_name}}</td><td><span class="audit-action"><ShieldCheck :size="15"/>{{a.action}}</span></td><td class="reference-cell">{{a.target}}</td><td>{{a.detail||'—'}}</td><td class="date-cell">{{date(a.created_at,true)}}</td></tr><tr v-if="!audits.filter(a=>matches(a.actor_name,a.action,a.target,a.detail)).length"><td colspan="5" class="empty">暂无匹配的操作记录。</td></tr></tbody></table></div><div class="table-footer">最多展示最近 500 笔操作记录</div></section>
    <footer class="page-footer"><span>轻舟 · 让采购与库存有序协同</span><span>数据权限与操作记录已启用<ShieldCheck :size="13"/></span></footer>
   </main>
  </div>
 </div>

 <Teleport to="body"><div v-if="modal" class="modal-overlay" @click.self="closeModal"><section class="modal" :class="{'wide-modal':['detail','receive','purchaseReturn','orderDetail','request'].includes(modal)}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span class="mini-label">轻舟采购协同</span><h2 id="modal-title">{{modalTitle}}</h2></div><button class="icon-button" :disabled="busy" aria-label="关闭弹窗" @click="closeModal"><X :size="20"/></button></header>
  <div v-if="modal==='help'" class="modal-body help-content"><p>按角色体验一笔完整采购：</p><ol><li><b>员工</b>：在采购申请中创建需求。</li><li><b>主管</b>：审批本部门其他成员提交的申请。</li><li><b>采购</b>：为已通过的申请生成采购订单。</li><li><b>仓管</b>：确认订单收货，商品库存自动增加。</li><li><b>仓管</b>：登记领用出库，在流水中查看库存变化。</li></ol><p>管理员可跨部门处理业务和查看审计，但不能审批自己提交的申请。退出登录后，可在登录页选择其他演示角色。</p><button class="btn primary" @click="closeModal">知道了</button></div>
  <div v-else-if="modal==='detail'&&selectedRequest" class="modal-body"><div class="detail-banner"><div><strong>{{selectedRequest.product_name}}</strong><span class="document-number">{{selectedRequest.number}}</span></div><span class="status" :class="selectedRequest.status">{{statusNames[selectedRequest.status]}}</span></div><dl class="detail-grid"><div><dt>申请人</dt><dd>{{selectedRequest.applicant_name}}</dd></div><div><dt>所属部门</dt><dd>{{selectedRequest.department}}</dd></div><div><dt>商品明细</dt><dd>{{selectedRequest.lines.length}} 项商品</dd></div><div><dt>申请金额</dt><dd class="numeric">{{money(selectedRequest.amount)}}</dd></div><div><dt>提交时间</dt><dd>{{date(selectedRequest.created_at,true)}}</dd></div><div><dt>最近更新</dt><dd>{{date(selectedRequest.updated_at,true)}}</dd></div></dl><div class="table-scroll"><table><thead><tr><th>商品</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody><tr v-for="line in selectedRequest.lines" :key="line.id"><td>{{line.product_name}}</td><td>{{line.quantity}} {{line.unit}}</td><td>{{money(line.unit_price)}}</td><td>{{money(line.amount)}}</td></tr></tbody></table></div><div class="detail-reason"><span>采购用途</span><p>{{selectedRequest.reason}}</p></div><div v-if="selectedRequest.review_note" class="detail-reason"><span>审批意见</span><p>{{selectedRequest.review_note}}</p></div><footer class="modal-footer"><button class="btn" @click="closeModal">关闭详情</button><button v-if="selectedRequest.applicant_id===account?.id&&['PENDING','REJECTED'].includes(selectedRequest.status)" class="btn primary" @click="openModal('request',selectedRequest)">{{selectedRequest.status==='REJECTED'?'修改并重新提交':'修改申请'}}</button><button v-if="selectedRequest.status==='PENDING'&&has('MANAGER','ADMIN')&&selectedRequest.applicant_id!==account?.id" class="btn primary" @click="openModal('review',selectedRequest)">处理审批<ArrowRight :size="16"/></button></footer></div>
  <div v-else-if="modal==='orderDetail'&&selectedOrder" class="modal-body"><FulfillmentEditor v-model="fulfillmentForm" :order="selectedOrder" readonly/><footer class="modal-footer"><button class="btn" @click="closeModal">关闭详情</button></footer></div><form v-else class="modal-body" @submit.prevent="submit">
   <template v-if="modal==='request'"><p class="form-intro">{{editing?'保存后按当前商品单价重新计算金额，并进入待审批状态。':'填写物资需求，提交后将进入部门审批。'}}</p><div v-if="editing?.status==='REJECTED'&&selectedRequest?.review_note" class="review-summary"><strong>上次驳回原因</strong><p>{{selectedRequest.review_note}}</p></div><PurchaseLines v-model="requestForm.lines" :products="products"/><label>采购用途<textarea v-model="requestForm.reason" required maxlength="500" rows="3" placeholder="例如：新增研发工位，供新同事入职使用"></textarea></label><div class="form-hint"><ShieldCheck :size="16"/>申请将以当前账号提交，价格以提交时商品单价为准。</div></template>
   <template v-if="modal==='review'&&selectedRequest"><div class="review-summary"><strong>{{selectedRequest.product_name}}</strong><p>{{selectedRequest.applicant_name}} · {{selectedRequest.department}} · {{selectedRequest.lines.length}} 项商品</p><b>{{money(selectedRequest.amount)}}</b><p>{{selectedRequest.reason}}</p></div><RequestLinesTable :lines="selectedRequest.lines"/><label>审批结果<select v-model="decision"><option value="APPROVED">通过申请</option><option value="REJECTED">驳回申请</option></select></label><label>审批意见<span class="muted">{{decision==='REJECTED'?'（必填）':'（选填）'}}</span><textarea v-model="reviewNote" :required="decision==='REJECTED'" maxlength="500" rows="3" placeholder="填写审批意见，方便申请人跟进"></textarea></label></template>
   <template v-if="(modal==='receive'||modal==='purchaseReturn')&&selectedOrder"><FulfillmentEditor v-model="fulfillmentForm" :order="selectedOrder" :returning="modal==='purchaseReturn'"/></template>
   <template v-if="modal==='issue'"><p class="form-intro">登记实际领用情况，库存与流水将同步更新。</p><label>领用商品<select v-model="issueForm.productId" required><option v-for="p in products" :key="p.id" :value="p.id">{{p.name}} · 可用 {{p.stock}} {{p.unit}}</option></select></label><label>领用数量<input v-model.number="issueForm.quantity" type="number" min="1" :max="issueProduct?.stock||0" required/></label><label>领用人 / 用途<input v-model="issueForm.reason" maxlength="100" required placeholder="例如：林小满 / 产品研发部新员工工位"/></label><div class="form-hint"><AlertCircle :size="16"/>出库后即时扣减库存，请核对领用信息。</div></template>
   <template v-if="modal==='product'"><div v-if="editing" class="form-hint"><ShieldCheck :size="16"/>修改参考价只影响后续申请；已有业务记录的计量单位不能更改。</div><label>商品名称<input v-model="productForm.name" maxlength="120" required placeholder="输入完整商品名称"/></label><div class="form-row"><label>商品 SKU<input v-model="productForm.sku" pattern="[A-Za-z0-9_-]+" maxlength="40" required placeholder="例如 IT-004"/></label><label>分类<select v-model="productForm.category"><option>办公设备</option><option>办公耗材</option><option>数码设备</option><option>其他物资</option></select></label></div><div class="form-row"><label>参考单价（元）<input v-model.number="productForm.price" type="number" step="0.01" min="0.01" max="99999999.99" required/></label><label>计量单位<input v-model="productForm.unit" maxlength="16" required/></label></div><label>安全库存<input v-model.number="productForm.minStock" type="number" min="0" max="100000" required/></label><label>供应商<select v-model="productForm.supplierId" required><option v-for="s in suppliers" :key="s.id" :value="s.id">{{s.name}}</option></select></label><div v-if="!suppliers.length" class="form-hint">请先在供应商页面创建合作伙伴。</div></template>
   <template v-if="modal==='supplier'"><label>供应商名称<input v-model="supplierForm.name" maxlength="120" required placeholder="输入公司完整名称"/></label><label>联系人<input v-model="supplierForm.contact" maxlength="64" required/></label><label>联系电话<input v-model="supplierForm.phone" maxlength="32" type="tel" required/></label></template>
   <template v-if="modal==='user'"><div class="form-row"><label>成员姓名<input v-model="userForm.name" maxlength="64" required/></label><label>所属部门<input v-model="userForm.department" maxlength="64" required placeholder="例如 产品研发部"/></label></div><label>登录账号<input v-model="userForm.username" :readonly="!!editing" pattern="[a-zA-Z0-9_-]{3,64}" minlength="3" maxlength="64" required placeholder="3～64 位字母、数字、下划线" autocomplete="off"/></label><label>角色<select v-model="userForm.role" :disabled="editing?.id===account?.id"><option v-for="(name,key) in roleNames" :key="key" :value="key">{{name}}</option></select></label><label v-if="!editing">初始密码<input v-model="userForm.password" type="password" minlength="12" maxlength="64" required placeholder="至少 12 位" autocomplete="new-password"/></label><label v-if="editing">账号状态<select v-model="userForm.enabled" :disabled="editing.id===account?.id"><option :value="true">启用</option><option :value="false">停用</option></select></label><div class="form-hint"><ShieldCheck :size="16"/>{{editing?'保存后该成员的已有登录将失效；不能停用自己或移除自己的管理员角色。':'主管只能审批部门名称相同的成员申请。'}}</div></template>
   <p v-if="formError" class="form-error" role="alert"><AlertCircle :size="16"/>{{formError}}</p><footer class="modal-footer"><button class="btn" type="button" :disabled="busy" @click="closeModal">取消</button><button class="btn primary" :disabled="busy||(modal==='product'&&!suppliers.length)"><LoaderCircle v-if="busy" class="spin" :size="16"/><Check v-else :size="16"/>{{submitTitle}}</button></footer>
  </form>
 </section></div><Transition name="toast"><div v-if="toast" class="toast-message" :class="{error:toast.error}" role="status"><AlertCircle v-if="toast.error" :size="19"/><CheckCircle2 v-else :size="19"/>{{toast.message}}<button class="icon-button" aria-label="关闭提示" @click="toast=null"><X :size="16"/></button></div></Transition></Teleport>
</template>
