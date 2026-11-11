(()=>{"use strict";
const KEY="interior-budget-v1",LOCAL_FILES="interior-budget-files",fmt=n=>n===null||n===undefined||n===""?"待报价":"¥"+Number(n).toLocaleString("zh-CN",{maximumFractionDigits:2}),today=()=>new Date().toISOString().slice(0,10),uid=()=>crypto.randomUUID(),safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),money=n=>n===""||n==null?null:Number(n),statusNames={pending:"未报价",quoted:"已报价",confirmed:"已确认",ordered:"已购买/签约"},palette=["#71917c","#cfaa7d","#799ca9","#bc9fba","#96b79f","#dcaa9e","#a0b7c8","#b5baa7"];
const categoriesSeed=["拆除与基础工程","空调与设备","厨房电器","洗衣与清洁","家具与家电","卫生间","全屋定制"];
const projectsSeed=[];
const makeSeed=()=>({schema:1,limit:null,categories:categoriesSeed.map(name=>({id:uid(),name})),items:[],quotes:[],payments:[],files:[],updated:new Date().toISOString()});
const seed=makeSeed();seed.items=projectsSeed.map(([name,cat,price,status,quantity=1])=>({id:uid(),name,categoryId:seed.categories[cat].id,quantity,unit:"项",budget:null,quote:price,actual:null,status,brand:"",vendor:"",notes:""}));
let state;try{state=JSON.parse(localStorage.getItem(KEY))}catch{}if(!state||!Array.isArray(state.items))state=seed;
for(const k of ["categories","items","quotes","payments","files"])if(!Array.isArray(state[k]))state[k]=[];
let remoteSha=localStorage.getItem("interior-remote-sha")||null,connected=false,active="overview",openCats=new Set(),search="",filterStatus="",dbPromise=null;
let dirty=localStorage.getItem("interior-dirty")==="1",syncTimer=null,syncBusy=false,initializing=false,conflict=false;
const setSyncStatus=message=>{const e=document.querySelector("#syncInfo");if(e)e.textContent=message};
const setDirty=()=>{dirty=true;localStorage.setItem("interior-dirty","1");setSyncStatus("存在未同步的本地更改");scheduleSync()};
const clearDirty=()=>{dirty=false;localStorage.removeItem("interior-dirty")};
const scheduleSync=()=>{clearTimeout(syncTimer);if(connected&&!conflict&&!initializing)syncTimer=setTimeout(()=>push(true),1800)};
const setRemoteSha=sha=>{remoteSha=sha;sha?localStorage.setItem("interior-remote-sha",sha):localStorage.removeItem("interior-remote-sha")};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],persist=()=>{state.updated=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state));setDirty();render()},toast=(s)=>{const d=document.createElement("div");d.className="toast";d.textContent=s;$("#toastRoot").append(d);setTimeout(()=>d.remove(),3800)};
const amounts=i=>({budget:i.budget===null?null:Math.max(0,Number(i.budget)||0)*Number(i.quantity||1),quote:i.quote===null?null:Math.max(0,Number(i.quote)||0)*Number(i.quantity||1),actual:i.actual===null?null:Math.max(0,Number(i.actual)||0)*Number(i.quantity||1)});
const priceFor=i=>{const a=amounts(i);return a.actual??a.quote??a.budget??null};
const itemName=i=>safe(i.name)+(Number(i.quantity)>1?" × "+Number(i.quantity):"");
const byItem=id=>state.items.find(i=>i.id===id),categoryName=id=>state.categories.find(c=>c.id===id)?.name||"未分类";
const sum=arr=>arr.reduce((a,b)=>a+(Number(b)||0),0),known=()=>sum(state.items.map(i=>priceFor(i))),paid=id=>sum(state.payments.filter(p=>!id||p.itemId===id).map(p=>p.amount)),totalPaid=()=>paid(),actualTotal=()=>sum(state.items.map(i=>amounts(i).actual)),expected=()=>sum(state.items.map(i=>priceFor(i))),countUnknown=()=>state.items.filter(i=>priceFor(i)===null).length;
function render(){const budget=known(),paidSum=totalPaid(),remain=Math.max(0,budget-paidSum),pct=state.limit?Math.round(budget/state.limit*100):null;
$("#metrics").innerHTML=[["已知预计费用",fmt(budget),"已报价/已确定/预算估计的金额合计","accent"],["已付款",fmt(paidSum),"仅根据付款记录统计",""],["待付参考",fmt(remain),"已知预计费用减去全部已付款",""],["预算上限",state.limit===null?"未设置":fmt(state.limit),pct===null?"可在设置中填写":("已占上限 "+pct+"%"),""]].map(([label,value,hint,cls])=>'<div class="card '+cls+'"><div class="metric">'+label+'</div><div class="amount">'+value+'</div><div class="hint">'+hint+'</div></div>').join("");
const catVals=state.categories.map(c=>({name:c.name,value:sum(state.items.filter(i=>i.categoryId===c.id).map(i=>priceFor(i)))})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
$("#breakdown").innerHTML=catVals.length?'<div class="bar">'+catVals.map((c,i)=>'<span style="width:'+(c.value/budget*100)+'%;background:'+palette[i%palette.length]+'"></span>').join("")+'</div>'+catVals.map((c,i)=>'<div class="item"><span class="dot" style="background:'+palette[i%palette.length]+'"></span><div class="grow">'+safe(c.name)+'</div><span class="hint">'+(100*c.value/budget).toFixed(1)+'%</span><strong class="price">'+fmt(c.value)+'</strong></div>').join(""):'<div class="empty">尚无已知金额</div>';
const missing=state.items.filter(i=>priceFor(i)===null);$("#pending").innerHTML=missing.length?'<div class="hint" style="margin-bottom:10px">'+missing.length+' 项暂未确认金额（未计入已知费用）</div>'+missing.slice(0,6).map(i=>'<div class="item"><div class="grow"><div class="name">'+itemName(i)+'</div><small>'+safe(categoryName(i.categoryId))+'</small></div><span class="chip warn">待报价</span><button class="linkbtn" data-edit="item" data-id="'+i.id+'">编辑</button></div>').join("")+(missing.length>6?'<button class="linkbtn" data-goto="items">还有 '+(missing.length-6)+' 项，查看全部 →</button>':""):'<div class="empty">所有项目都已有金额 🎉</div>';
$("#recent").innerHTML=renderPayments(state.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4),true);
$("#paymentMetrics").innerHTML=[["付款总额",fmt(paidSum),"全部付款流水"],["付款笔数",state.payments.length+" 笔","含定金与尾款"],["已确定成交总额",fmt(actualTotal()),"已填写实际成交价的项目"],["未付参考",fmt(Math.max(0,budget-paidSum)),"只作预算参考，不等于应付账款"]].map(([n,v,h])=>'<div class="card"><div class="metric">'+n+'</div><div class="amount">'+v+'</div><div class="hint">'+h+'</div></div>').join("");
$("#paymentList").innerHTML=renderPayments(state.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)),false);
$("#categories").innerHTML=renderCategories();
$("#categorySettings").innerHTML=state.categories.map(c=>'<div class="item"><div class="grow">'+safe(c.name)+'</div><button class="linkbtn" data-edit="category" data-id="'+c.id+'">编辑</button><button class="linkbtn" data-delete="category" data-id="'+c.id+'">删除</button></div>').join("");
$("#fileList").innerHTML=state.files.length?state.files.slice().reverse().map(f=>'<div class="item"><div class="grow"><div class="name">📄 '+safe(f.name)+'</div><small>'+safe(f.kind||"其他")+' · '+safe(byItem(f.itemId)?.name||"未关联项目")+' · '+safe(f.date||"")+' · '+(f.remote?(f.storage==="r2"?"已上传 R2 私库":"已上传 GitHub 私库"):"仅本机 · 待同步")+'</small></div><button class="linkbtn" data-open-file="'+f.id+'">打开</button><button class="linkbtn" data-delete="file" data-id="'+f.id+'">删除</button></div>').join(""):'<div class="empty"><strong>还没有上传文件</strong>点击“上传文件”保存报价、合同或发票。</div>';
$("#fileCount").textContent=state.files.length+" 份";
$("#quoteList").innerHTML=state.quotes.length?state.quotes.map(q=>'<div class="item"><div class="grow"><div class="name">'+safe(byItem(q.itemId)?.name||"未关联项目")+' · '+safe(q.vendor||"未命名供应商")+'</div><small>'+safe(q.note||"")+'</small></div><strong class="price">'+fmt(q.amount)+'</strong><button class="linkbtn" data-edit="quote" data-id="'+q.id+'">编辑</button><button class="linkbtn" data-delete="quote" data-id="'+q.id+'">删除</button></div>').join(""):'<div class="empty">暂无供应商报价记录</div>';
$("#limit").value=state.limit??"";$("#syncLabel").textContent=connected?"已连接私库":"本地数据";$("#syncLabel").className="status"+(connected?" online":"");
$("#fileNotice").textContent=connected?"已连接私密存储。所有新附件统一上传到 Cloudflare R2 私有存储桶；请检查同步状态。":"当前只保存在本设备。登录后会自动同步附件到 Cloudflare R2。";
}
function renderPayments(arr,short){
 if(!arr.length) return '<div class="empty"><strong>还没有付款记录</strong>付款后再添加，当前已付款金额为 ¥0。</div>';
 const rows=arr.map(p=>{
  const cols='<td>'+safe(p.date)+'</td><td>'+safe(byItem(p.itemId)?.name||"未关联项目")+'</td><td>'+safe(p.type||"付款")+'</td><td class="price">'+fmt(p.amount)+'</td>';
  const acts=short?'':'<td class="actions"><button class="linkbtn" data-edit="payment" data-id="'+p.id+'">编辑</button><button class="linkbtn" data-delete="payment" data-id="'+p.id+'">删除</button></td>';
  return '<tr>'+cols+acts+'</tr>';
 }).join('');
 return '<div class="tablewrap"><table class="tbl"><thead><tr><th>日期</th><th>项目</th><th>款项</th><th>金额</th>'+(short?'':'<th>操作</th>')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderCategories(){const term=search.trim().toLowerCase();return state.categories.map((cat,index)=>{const rows=state.items.filter(i=>i.categoryId===cat.id&&(!filterStatus||i.status===filterStatus)&&(!term||[i.name,i.brand,i.vendor,i.notes].some(x=>String(x||"").toLowerCase().includes(term))));if(!rows.length&&(term||filterStatus))return"";let v=sum(rows.map(i=>priceFor(i)));return '<div class="category"><div class="cathead" data-toggle="'+cat.id+'"><span style="font-size:21px;color:'+palette[index%palette.length]+'">▣</span><div class="grow"><strong>'+safe(cat.name)+'</strong><div class="hint">'+rows.length+' 个项目</div></div><strong class="price">'+fmt(v)+'</strong><span class="muted">'+(openCats.has(cat.id)||term||filterStatus?"⌃":"⌄")+'</span></div>'+(openCats.has(cat.id)||term||filterStatus?'<div class="tablewrap"><table class="tbl"><thead><tr><th>项目</th><th>状态</th><th>当前计入</th><th>操作</th></tr></thead><tbody>'+rows.map(i=>'<tr><td>'+itemName(i)+'<div class="hint">'+safe(i.brand||i.vendor||"")+'</div></td><td><span class="chip '+(i.status==="pending"?"warn":i.status==="ordered"?"ok":"")+'">'+(statusNames[i.status]||"未报价")+'</span></td><td class="price">'+fmt(priceFor(i))+'</td><td class="actions"><button class="linkbtn" data-edit="item" data-id="'+i.id+'">编辑</button><button class="linkbtn" data-delete="item" data-id="'+i.id+'">删除</button></td></tr>').join("")+'</tbody></table></div>':"")+'</div>'}).join("")||'<div class="empty">没有符合条件的项目</div>'}
function page(n){active=n;$$(".page").forEach(e=>e.classList.toggle("on",e.id===n));$$(".nav").forEach(e=>e.classList.toggle("active",e.dataset.page===n));window.scrollTo(0,0);render()}
const opts=(a,selected)=>a.map(([val,name])=>'<option value="'+safe(val)+'" '+(String(val)===String(selected)?"selected":"")+'>'+safe(name)+'</option>').join("");
const catOpts=sel=>opts(state.categories.map(c=>[c.id,c.name]),sel),itemOpts=sel=>opts([["","不关联项目"],...state.items.map(i=>[i.id,i.name])],sel);
const input=(name,label,value,type="text",other="")=>'<div class="formgroup"><label>'+label+'</label><input class="field" name="'+name+'" type="'+type+'" value="'+safe(value??"")+'" '+other+'></div>';
const select=(name,label,options,selected)=>'<div class="formgroup"><label>'+label+'</label><select class="field" name="'+name+'">'+opts(options,selected)+'</select></div>';
const modal=(title,body,save,extra)=>{$("#modalRoot").innerHTML='<div class="modalbg"><div class="modal"><div class="modalhead"><h2>'+title+'</h2><button type="button" class="close" id="closeModal" aria-label="关闭">×</button></div><form id="editForm">'+body+'<div class="modalfoot"><button type="button" class="btn" id="cancelModal">取消</button><button type="submit" class="btn primary">'+(save||"保存")+'</button></div></form></div></div>';$("#closeModal").onclick=$("#cancelModal").onclick=closeModal;$(".modalbg").addEventListener("click",e=>{if(e.target.classList.contains("modalbg"))closeModal()});$("#editForm").onsubmit=e=>{e.preventDefault();extra(new FormData(e.currentTarget))}};
const closeModal=()=>$("#modalRoot").innerHTML="";
function edit(kind,id){if(kind==="item"){const old=id?byItem(id):null,i=old||{name:"",categoryId:state.categories[0]?.id||"",quantity:1,unit:"项",status:"pending",budget:null,quote:null,actual:null,brand:"",vendor:"",notes:""};modal(old?"编辑装修项目":"添加装修项目",'<div class="formgrid">'+input("name","项目名称",i.name,"text","required maxlength=120")+select("categoryId","分类",state.categories.map(c=>[c.id,c.name]),i.categoryId)+input("quantity","数量",i.quantity,"number","min=0.01 step=any required")+input("unit","单位",i.unit||"项")+input("budget","单价 · 计划预算（可空）",i.budget,"number","min=0 step=0.01")+input("quote","单价 · 当前报价（可空）",i.quote,"number","min=0 step=0.01")+input("actual","单价 · 最终成交（可空）",i.actual,"number","min=0 step=0.01")+select("status","状态",Object.entries(statusNames).map(([k,v])=>[k,v]),i.status)+input("brand","品牌/型号",i.brand)+input("vendor","供应商/装修公司",i.vendor)+'<div class="formgroup full"><label>备注</label><textarea class="field" name="notes">'+safe(i.notes)+'</textarea></div></div><p class="info">优先统计：成交价 → 当前报价 → 计划预算；三个价格都没填则显示“待报价”。数量乘单价得到项目合计。</p>',"保存",f=>{const obj={...i,id:old?.id||uid(),name:String(f.get("name")).trim(),categoryId:String(f.get("categoryId")),quantity:Number(f.get("quantity")),unit:String(f.get("unit")),budget:money(f.get("budget")),quote:money(f.get("quote")),actual:money(f.get("actual")),status:String(f.get("status")),brand:String(f.get("brand")),vendor:String(f.get("vendor")),notes:String(f.get("notes"))};if(!obj.name||obj.quantity<=0)return toast("请填写名称与有效数量");if(old)Object.assign(old,obj);else state.items.push(obj);closeModal();persist();toast("项目已保存")});return}
if(kind==="category"){const old=state.categories.find(c=>c.id===id);modal(old?"编辑分类":"添加分类",input("name","分类名称",old?.name||"","text","required maxlength=50"),"保存",f=>{const name=String(f.get("name")).trim();if(!name)return;if(old)old.name=name;else state.categories.push({id:uid(),name});closeModal();persist()});return}
if(kind==="payment"){const old=state.payments.find(p=>p.id===id),p=old||{itemId:"",amount:"",date:today(),type:"定金",note:""};modal(old?"编辑付款":"添加付款",'<div class="formgrid">'+select("itemId","关联装修项目",state.items.map(i=>[i.id,i.name]),p.itemId||state.items[0]?.id)+input("amount","付款金额（人民币）",Math.abs(p.amount),"number","min=0.01 step=0.01 required")+input("date","付款日期",p.date,"date","required")+select("type","款项类型",[["定金","定金"],["进度款","进度款"],["尾款","尾款"],["全款","全款"],["退款","退款（负数计入）"]],p.type)+'<div class="formgroup full"><label>付款说明</label><textarea class="field" name="note">'+safe(p.note||"")+'</textarea></div></div>',"保存",f=>{const amount=Number(f.get("amount"));if(!(amount>0))return toast("金额需大于 0");const obj={id:old?.id||uid(),itemId:String(f.get("itemId")),amount:f.get("type")==="退款"?-amount:amount,date:String(f.get("date")),type:String(f.get("type")),note:String(f.get("note"))};if(old)Object.assign(old,obj);else state.payments.push(obj);closeModal();persist()});return}
if(kind==="quote"){const old=state.quotes.find(q=>q.id===id),q=old||{itemId:"",vendor:"",amount:"",date:today(),note:""};modal(old?"编辑报价":"添加供应商报价",'<div class="formgrid">'+select("itemId","关联项目",state.items.map(i=>[i.id,i.name]),q.itemId||state.items[0]?.id)+input("vendor","供应商/装修公司",q.vendor,"text","required")+input("amount","报价总额（人民币）",q.amount,"number","min=0 step=0.01 required")+input("date","报价日期",q.date,"date")+'<div class="formgroup full"><label>备注（含安装、税费、保修等）</label><textarea class="field" name="note">'+safe(q.note||"")+'</textarea></div></div><p class="info">供应商报价单独记录，只有你手动更新项目“当前报价”后，才会进入预算总额，避免重复统计。</p>',"保存",f=>{const obj={id:old?.id||uid(),itemId:String(f.get("itemId")),vendor:String(f.get("vendor")),amount:Number(f.get("amount")),date:String(f.get("date")),note:String(f.get("note"))};if(old)Object.assign(old,obj);else state.quotes.push(obj);closeModal();persist()});return}
if(kind==="file"){modal("上传装修文件",'<div class="formgrid">'+select("kind","文件类型",[["合同","合同"],["报价单","报价单"],["设计方案","设计方案"],["发票/收据","发票/收据"],["其他","其他"]],"报价单")+select("itemId","关联项目", [["","暂不关联"],...state.items.map(i=>[i.id,i.name])],"")+'<div class="formgroup full"><label>选择文件（PDF、Excel、图片，最大 80MB）</label><input name="file" class="field" type="file" accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png,image/jpeg,image/webp" required></div></div><p class="info">未连接云端时，文件只存储在当前浏览器的 IndexedDB。涉及身份证件、银行账号等敏感资料，建议先脱敏。</p>',"保存文件",async f=>{const file=f.get("file");if(!(file instanceof File)||!file.size)return toast("请选择文件");if(file.size>80*1024*1024)return toast("单个文件不能超过 80MB");const extension=file.name.toLowerCase().split(".").pop();const mimeByExt={pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel"};const resolvedMime=mimeByExt[extension];if(!resolvedMime)return toast("只支持 PDF、Excel（XLSX/XLS）和图片");if(file.type&&file.type!=="application/octet-stream"&&file.type!==resolvedMime&&!(extension==="xls"&&file.type==="application/x-msexcel")&&!(extension==="xlsx"&&file.type==="application/zip"))return toast("文件类型与扩展名不匹配，请检查文件");const id=uid(),meta={id,name:file.name,kind:String(f.get("kind")),itemId:String(f.get("itemId")),date:today(),size:file.size,mime:resolvedMime,storage:"r2",remote:false};try{await putLocalFile(id,file);state.files.push(meta);closeModal();persist();toast("文件已保存到本机"+(connected?"，可同步到私库":"；请及时备份"));}catch(e){toast("文件保存失败："+e.message)}});return}}
function del(kind,id){const names={item:"项目",category:"分类",payment:"付款",quote:"报价",file:"文件"};const obj=kind==="item"?byItem(id):state[kind==="category"?"categories":kind==="file"?"files":kind==="payment"?"payments":"quotes"].find(x=>x.id===id);if(!obj)return;if(kind==="category"&&state.items.some(i=>i.categoryId===id))return toast("此分类还有项目，请先将项目移动到别的分类");if(kind==="item"&&(state.payments.some(p=>p.itemId===id)||state.quotes.some(q=>q.itemId===id)||state.files.some(f=>f.itemId===id)))return toast("该项目关联了付款/报价/附件，请先处理关联数据");if(!confirm("确定删除此"+names[kind]+"？此操作无法撤销。"))return;if(kind==="file"){const x=state.files.find(f=>f.id===id);if(x.remote&&connected){api("/api/file/"+encodeURIComponent(id),{method:"DELETE"}).catch(()=>toast("云端文件删除失败，请检查私库"));}deleteLocalFile(id).catch(()=>{});}const arr=state[kind==="item"?"items":kind==="category"?"categories":kind==="file"?"files":kind==="payment"?"payments":"quotes"];state[kind==="item"?"items":kind==="category"?"categories":kind==="file"?"files":kind==="payment"?"payments":"quotes"]=arr.filter(x=>x.id!==id);persist();toast("已删除")}
function openDB(){return dbPromise||(dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(LOCAL_FILES,1);r.onupgradeneeded=()=>r.result.createObjectStore("docs");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}))}
async function dbTask(type,id,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("docs",type==="get"?"readonly":"readwrite");const op=type==="put"?tx.objectStore("docs").put(val,id):type==="get"?tx.objectStore("docs").get(id):tx.objectStore("docs").delete(id);op.onsuccess=()=>res(op.result);op.onerror=()=>rej(op.error)})}
const putLocalFile=(id,file)=>dbTask("put",id,file),getLocalFile=id=>dbTask("get",id),deleteLocalFile=id=>dbTask("delete",id);
let previewObjectUrl=null;
function closePreview(){document.querySelector("#filePreviewOverlay")?.remove();if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}}
async function openFile(id){
 const f=state.files.find(x=>x.id===id);if(!f)return;
 closePreview();
 const overlay=document.createElement("div");overlay.id="filePreviewOverlay";overlay.className="preview-overlay";
 overlay.innerHTML='<div class="preview-shell" role="dialog" aria-modal="true" aria-label="文件预览"><div class="preview-top"><div class="preview-title"></div><div class="preview-tools"><button type="button" class="btn small" id="previewDownload" disabled>下载</button><button type="button" class="btn small" id="previewClose">关闭</button></div></div><div class="preview-body" id="previewBody"><div class="preview-message">正在读取文件…</div></div></div>';
 document.body.appendChild(overlay);
 overlay.querySelector(".preview-title").textContent=f.name;
 overlay.querySelector("#previewClose").onclick=closePreview;
 overlay.addEventListener("click",e=>{if(e.target===overlay)closePreview()});
 const body=overlay.querySelector("#previewBody"),download=overlay.querySelector("#previewDownload");
 try{
  let blob=await getLocalFile(id);
  if(!blob&&f.remote){
   if(!connected)throw Error("文件位于私人仓库，请先授权本设备");
   const response=await api("/api/file/"+encodeURIComponent(id),{raw:true});
   blob=await response.blob();
  }
  if(!blob)throw Error("当前设备没有这个文件，而且文件尚未成功同步至私人仓库");
  if(!blob.size)throw Error("文件内容为空");
  if(!document.body.contains(overlay))return;
  const mime=f.mime||blob.type;
  const excelMime=["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel"];if(!["application/pdf","image/jpeg","image/png","image/webp",...excelMime].includes(mime))throw Error("此文件格式暂不支持预览或下载");
  previewObjectUrl=URL.createObjectURL(new Blob([blob],{type:mime}));
  download.disabled=false;
  download.onclick=()=>{
   const a=document.createElement("a");a.href=previewObjectUrl;a.download=f.name||"attachment";document.body.appendChild(a);a.click();a.remove();
  };
  body.replaceChildren();
  if(excelMime.includes(mime)){
   if(!window.InteriorExcel)throw Error("Excel 功能脚本尚未加载，请刷新网页");
   window.InteriorExcel.show({
    blob,file:f,mount:body,
    categories:state.categories.map(c=>({id:c.id,name:c.name})),
    existingNames:state.items.map(i=>i.name),
    onImport:items=>{
     if(!items.length)return;
     for(const item of items)state.items.push({
      id:uid(),name:item.name,categoryId:item.categoryId,
      quantity:item.quantity,unit:item.unit,budget:null,quote:item.quote,
      actual:null,status:"quoted",brand:"",vendor:item.vendor,notes:item.notes
     });
     persist();closePreview();page("items");
     toast("成功导入 "+items.length+" 条报价明细；已加入装修预算，稍后自动同步");
    }
   });
  }else if(mime==="application/pdf"){
   const frame=document.createElement("iframe");
   frame.className="preview-document";frame.title=f.name;frame.src=previewObjectUrl;
   body.appendChild(frame);
   const tip=document.createElement("div");tip.className="preview-tip";tip.textContent="如果此设备无法直接显示 PDF，请点击右上角「下载」后用系统文件应用打开。";body.appendChild(tip);
  }else{
   const image=document.createElement("img");image.className="preview-image";image.alt=f.name;image.src=previewObjectUrl;body.appendChild(image);
  }
 }catch(e){body.innerHTML='<div class="preview-message"></div>';body.firstChild.textContent="无法打开文件："+e.message;toast(e.message)}
}

const DEFAULT_URL="https://interior-budget-api.wangtszshan.workers.dev";
const apiConfig=()=>({url:localStorage.getItem("interior-api-url")||DEFAULT_URL,token:localStorage.getItem("interior-session-token")||""});
async function api(path,options={}){
 const {url,token}=apiConfig();if(!url)throw Error("请填写 Worker 地址");
 let response;
 try{response=await fetch(url.replace(/\/+$/,"")+path,{method:options.method||"GET",headers:{...(token?{"Authorization":"Bearer "+token}:{}),...(options.body?{"Content-Type":"application/json"}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:"no-store"})}
 catch{throw Error("无法连接 Worker，请检查网络连接")}
 if(!response.ok){if(response.status===401){connected=false;setSyncStatus("设备授权失效，请重新验证");}
 const body=await response.text();let msg=body;try{msg=JSON.parse(body).error||body}catch{}
 const err=new Error("HTTP "+response.status+"："+msg.slice(0,130));err.status=response.status;throw err}
 return options.raw?response:response.json()
}
async function connect(){
 const url=$("#apiUrl").value.trim().replace(/\/+$/,"");
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url))return toast("请填写有效的 https Worker 地址");
 const pw=$("#apiPassword").value;if(!pw)return toast("请输入 APP_PASSWORD");
 localStorage.setItem("interior-api-url",url);
 try{
  const response=await fetch(url+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw}),cache:"no-store"});
  const result=await response.json();if(!response.ok||!result.token)throw Error(result.error||"登录失败");
  localStorage.setItem("interior-session-token",result.token);
  localStorage.setItem("interior-session-expiry",String(result.expiresAt));
  $("#apiPassword").value="";
  connected=true;render();toast("本设备已授权，30 天内免登录");
  await refreshFromCloud(true);
 }catch(e){connected=false;setSyncStatus("授权失败："+e.message);toast(e.message)}
}
async function refreshFromCloud(first=false){
 if(!connected||syncBusy)return;
 try{
  const r=await api("/api/data");
  if(!r.data){setRemoteSha(null);if(dirty)scheduleSync();return}
  if(!Array.isArray(r.data.items)||!Array.isArray(r.data.categories))throw Error("云端预算格式无效");
  if(dirty){
   if(remoteSha&&r.sha!==remoteSha){conflict=true;setSyncStatus("发现其他设备的更新：已暂停自动同步，请备份本地数据后处理冲突");toast("检测到版本冲突，本地修改已保留");}
   else scheduleSync();
   return;
  }
  if(!remoteSha&&state.items.length>0&&JSON.stringify(state.items)!==JSON.stringify(r.data.items)){
   conflict=true;setSyncStatus("检测到旧版本地数据与私库不一致。为避免覆盖，先导出本地 JSON 备份，再点击“读取云端”手动确认。");
   toast("保留了旧版本地数据，未自动覆盖");return;
  }
  state=r.data;setRemoteSha(r.sha);localStorage.setItem(KEY,JSON.stringify(state));render();
  setSyncStatus("已从私库同步："+new Date().toLocaleString("zh-CN"));
  if(first)toast("私人预算已自动载入");
 }catch(e){setSyncStatus("读取失败："+e.message)}
}
async function pull(){
 if(dirty&&!confirm("当前设备有尚未同步的修改。确认覆盖本地版本？建议先导出 JSON 备份。"))return;
 if(dirty){clearDirty();conflict=false;}
 await refreshFromCloud(true)
}
const fileToBase64=f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=()=>reject(Error("读取文件失败"));r.readAsDataURL(f)});
async function push(automatic=false){
 if(syncBusy||!connected||conflict||initializing||!dirty)return;
 syncBusy=true;clearTimeout(syncTimer);setSyncStatus("正在同步…");
 try{
  const snap=await api("/api/data");
  if((snap.sha||null)!==(remoteSha||null)){conflict=true;setSyncStatus("其他设备修改了预算，已停止自动覆盖。请导出本地 JSON 备份，再决定如何合并。");toast("跨设备版本冲突，未覆盖云端数据");return;}
  for(const f of state.files.filter(f=>!f.remote)){
   const blob=await getLocalFile(f.id);if(!blob)throw Error("找不到本地附件 "+f.name);
   if(true){
    const {url,token}=apiConfig();
    if(!url||!token)throw Error("请先授权本设备");
    const response=await fetch(url.replace(/\/+$/,"")+"/api/r2-file/"+encodeURIComponent(f.id),{method:"PUT",headers:{"Authorization":"Bearer "+token,"Content-Type":f.mime,"X-File-Type":f.mime,"X-File-Size":String(blob.size)},body:blob,cache:"no-store"});
    if(!response.ok){const payload=await response.json().catch(()=>({error:"Upload failed"}));throw Error("R2 文件上传失败："+(payload.error||response.status))}
    f.storage="r2";
   }else{
    const content=await fileToBase64(blob);
    await api("/api/file",{method:"POST",body:{id:f.id,name:f.name,mime:f.mime,base64:content}});
    f.storage="github";
   }
   f.remote=true;
   localStorage.setItem(KEY,JSON.stringify(state));
  }
  const data=structuredClone(state);
  const res=await api("/api/data",{method:"PUT",body:{data,sha:remoteSha}});
  setRemoteSha(res.sha);
  if(JSON.stringify(state)===JSON.stringify(data)){clearDirty()}else scheduleSync();
  localStorage.setItem(KEY,JSON.stringify(state));
  setSyncStatus("已自动同步："+new Date().toLocaleString("zh-CN"));
  if(!automatic)toast("同步完成");
 }catch(e){
  if(e.status===409){conflict=true;setSyncStatus("云端版本变化，已暂停自动同步。请先备份本地修改。")}
  else setSyncStatus("同步未完成，本地修改已保留："+e.message);
  if(!automatic)toast(e.message);
 }finally{syncBusy=false}
}
async function initSession(){
 const {token}=apiConfig(),expiry=Number(localStorage.getItem("interior-session-expiry")||0);
 $("#apiUrl").value=apiConfig().url;
 if(!token||expiry<=Date.now()){setSyncStatus("首次连接请验证身份。已授权设备到期后需再次输入口令。");return}
 initializing=true;
 try{await api("/api/session");connected=true;render();}
 catch(e){localStorage.removeItem("interior-session-token");localStorage.removeItem("interior-session-expiry");connected=false;setSyncStatus("授权已失效，请重新验证");initializing=false;return}
 initializing=false;await refreshFromCloud();
 if(dirty&&!conflict)scheduleSync();
}
function download(name,content,type){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function wire(){document.addEventListener("click",e=>{const t=e.target.closest("[data-page],[data-goto],[data-add],[data-edit],[data-delete],[data-toggle],[data-open-file]");if(!t)return;if(t.dataset.page||t.dataset.goto)return page(t.dataset.page||t.dataset.goto);if(t.dataset.add)return edit(t.dataset.add);if(t.dataset.edit)return edit(t.dataset.edit,t.dataset.id);if(t.dataset.delete)return del(t.dataset.delete,t.dataset.id);if(t.dataset.toggle){openCats.has(t.dataset.toggle)?openCats.delete(t.dataset.toggle):openCats.add(t.dataset.toggle);return render()}if(t.dataset.openFile)return openFile(t.dataset.openFile)});
$("#search").oninput=e=>{search=e.target.value;render()};$("#filterStatus").onchange=e=>{filterStatus=e.target.value;render()};$("#saveLimit").onclick=()=>{let v=$("#limit").value;state.limit=v===""?null:Math.max(0,Number(v));persist();toast("预算上限已保存")};$("#connect").onclick=connect;$("#logout").onclick=()=>{if(dirty&&!confirm("存在未同步修改，退出后仍保留在本机，但不再自动同步。确认退出？"))return;localStorage.removeItem("interior-session-token");localStorage.removeItem("interior-session-expiry");connected=false;clearTimeout(syncTimer);setSyncStatus("本设备已退出，重新验证后可继续同步");render();toast("已退出本设备")};$("#pull").onclick=pull;$("#push").onclick=()=>push(false);$("#export").onclick=()=>download("装修预算备份-"+today()+".json",JSON.stringify(state,null,2),"application/json");$("#csv").onclick=()=>{const rows=[["分类","项目","数量","单位","计划单价","报价单价","成交单价","当前预计合计","状态","供应商","备注"],...state.items.map(i=>[categoryName(i.categoryId),i.name,i.quantity,i.unit,i.budget??"",i.quote??"",i.actual??"",priceFor(i)??"",statusNames[i.status],i.vendor,i.notes])];download("装修预算明细-"+today()+".csv","\ufeff"+rows.map(r=>r.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8")};$("#import").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.items)||!Array.isArray(d.categories)||!Array.isArray(d.payments))throw Error("数据格式不正确");if(!confirm("导入将覆盖当前预算数据（不包含文件二进制），确定继续？"))return;state=d;setRemoteSha(null);persist();toast("预算备份已导入，已暂停自动覆盖原有云端数据");conflict=true}catch(err){toast(err.message)}e.target.value=""};$("#apiUrl").value=apiConfig().url;$("#apiPassword").value="";document.addEventListener("keydown",e=>{if(e.key==="Escape")closePreview()});window.addEventListener("storage",e=>{if(e.key===KEY){try{state=JSON.parse(e.newValue);render()}catch{}}});if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});}
openCats=new Set(state.categories.map(c=>c.id));wire();render();initSession();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&connected){if(dirty)scheduleSync();else refreshFromCloud()}});
})();