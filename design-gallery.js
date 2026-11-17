/* Renovation gallery: private R2 image assets, client-side lazy previews and comparison. */
(()=>{
"use strict";
const $=s=>document.querySelector(s);
const base=()=>localStorage.getItem("interior-api-url")||"https://interior-budget-api.wangtszshan.workers.dev";
const auth=()=>localStorage.getItem("interior-session-token")||"";
const spaces=["客厅","餐厅","厨房","玄关","主卧","次卧","儿童房","书房","卫生间","阳台","全屋","其他"];
const statuses=["待比较","需要修改","已确认","已淘汰"];
let items=[],rev="",page=1,filterSpace="",filterProvider="",filterStatus="",term="",selected=new Set(),editId=null,busy=false,loaded=false;
const thumbCache=new Map(),fullCache=new Map();
const statusEl=()=>$("#galleryStatus");
const note=(msg,error=false)=>{const el=statusEl();if(el){el.textContent=msg;el.style.color=error?"#a04444":"#647768"}};
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bytes=n=>n<1024*1024?(n/1024).toFixed(0)+" KB":(n/1048576).toFixed(1)+" MB";
async function api(path,opts={}){
 if(!auth())throw Error("请先在「设置与同步」完成设备授权");
 const r=await fetch(base().replace(/\/+$/,"")+path,{method:opts.method||"GET",headers:{Authorization:"Bearer "+auth(),...(opts.headers||{})},body:opts.body,cache:"no-store"});
 if(!r.ok){let msg="请求失败 ("+r.status+")";try{msg=(await r.json()).error||msg}catch{}if(r.status===401)msg="设备授权过期，请重新登录";const e=new Error(msg);e.status=r.status;throw e}
 return opts.blob?r.blob():r.json();
}
async function refresh(){
 if(busy)return;
 if(!auth()){loaded=false;items=[];render();note("需要先在「设置与同步」授权，才能查看私人效果图库。");return}
 try{const r=await api("/api/design-gallery");items=r.items;rev=r.revision;loaded=true;selected=new Set([...selected].filter(id=>items.some(x=>x.id===id)));render();note("私人效果图库已同步 · 共 "+items.length+" 张图片")}
 catch(e){loaded=false;note("云端读取失败："+e.message,true);render()}
}
function current(){return items.filter(x=>(!filterSpace||x.space===filterSpace)&&(!filterProvider||x.provider===filterProvider)&&(!filterStatus||x.status===filterStatus)&&(!term||(x.name+" "+x.note+" "+x.provider+" "+x.space+" "+x.version).toLowerCase().includes(term.toLowerCase())))}
function updateFilters(){
 const sp=$("#gallerySpace"),pr=$("#galleryProvider"),st=$("#galleryFilterStatus");
 const spacesSet=[...new Set([...spaces,...items.map(x=>x.space)])].filter(Boolean);
 sp.innerHTML='<option value="">全部空间</option>'+spacesSet.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 sp.value=filterSpace;
 const providers=[...new Set(items.map(x=>x.provider).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
 pr.innerHTML='<option value="">全部商家 / 设计师</option>'+providers.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 pr.value=filterProvider;
 st.innerHTML='<option value="">全部状态</option>'+statuses.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 st.value=filterStatus;
}
function clearCache(map){for(const u of map.values())URL.revokeObjectURL(u);map.clear()}
async function loadPicture(id,kind){
 const cache=kind==="thumb"?thumbCache:fullCache;if(cache.has(id))return cache.get(id);
 const blob=await api("/api/design-gallery/image/"+id+"/"+kind,{blob:true});
 const u=URL.createObjectURL(blob);cache.set(id,u);return u;
}
function observeImages(){
 const imgs=[...document.querySelectorAll(".gallery-thumb[data-id]")];
 const io=typeof IntersectionObserver!=="undefined"?new IntersectionObserver((entries,observer)=>{for(const x of entries){if(!x.isIntersecting)continue;observer.unobserve(x.target);hydrate(x.target)}},{rootMargin:"160px"}):null;
 function hydrate(img){const id=img.dataset.id;loadPicture(id,"thumb").then(url=>{if(img.isConnected&&img.dataset.id===id){img.src=url;img.classList.add("loaded")}}).catch(()=>{if(img.isConnected)img.alt="预览加载失败"})}
 for(const img of imgs){if(io)io.observe(img);else hydrate(img)}
}
function render(){
 if(!$("#galleryGrid"))return;
 updateFilters();
 const result=current(),totalPages=Math.max(1,Math.ceil(result.length/18));page=Math.min(page,totalPages);
 const subset=result.slice((page-1)*18,page*18);
 $("#galleryCount").textContent=items.length+" 张效果图";
 $("#galleryCompare").disabled=selected.size!==2;
 $("#galleryCompare").textContent="对比选中图片 ("+selected.size+"/2)";
 $("#gallerySelection").textContent="选择两张效果图可进行双图对比";
 $("#galleryGrid").innerHTML=subset.length?subset.map(x=>'<article class="gallery-tile"><button type="button" class="gallery-photo" data-view="'+x.id+'" aria-label="查看 '+safe(x.name)+'"><img class="gallery-thumb" data-id="'+x.id+'" alt="'+safe(x.name)+'" loading="lazy"><span class="gallery-photo-hint">点击放大</span></button><div class="gallery-tile-content"><div class="gallery-tile-head"><strong title="'+safe(x.name)+'">'+safe(x.name)+'</strong><span class="gallery-badge '+(x.status==="已确认"?"is-confirmed":"")+'">'+safe(x.status)+'</span></div><div class="gallery-tags"><span>'+safe(x.space)+'</span><span>'+safe(x.provider||"未分类商家")+'</span><span>'+safe(x.version)+'</span></div><p>'+safe(x.note||"暂无备注")+'</p><div class="gallery-tile-bottom"><label><input type="checkbox" class="gallery-select" data-id="'+x.id+'" '+(selected.has(x.id)?"checked":"")+'> 对比</label><button type="button" data-edit-gallery="'+x.id+'">编辑</button></div></div></article>').join(""):'<div class="gallery-empty">'+(loaded?"没有匹配的图片。可以调整筛选，或先上传一些效果图。":"尚未读取私人效果图库，请确认设备已经授权。")+'</div>';
 $("#galleryPageLabel").textContent=page+" / "+totalPages;
 $("#galleryPrev").disabled=page===1;$("#galleryNext").disabled=page>=totalPages;
 observeImages();
}
function formMeta(id){
 const x=items.find(a=>a.id===id);
 editId=id||null;
 $("#galleryEditorTitle").textContent=id?"编辑效果图":"新建效果图";
 $("#galleryEditName").value=x?.name||"";
 $("#galleryEditSpace").innerHTML=[...new Set([...spaces,...items.map(a=>a.space)])].filter(Boolean).map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 $("#galleryEditSpace").value=x?.space||"客厅";
 $("#galleryEditProvider").value=x?.provider||"";
 $("#galleryEditVersion").value=x?.version||"V1";
 $("#galleryEditStatus").value=x?.status||"待比较";
 $("#galleryEditNote").value=x?.note||"";
 $("#galleryEditBudget").value=x?.linkedBudgetId||"";
 $("#galleryEditDelete").hidden=!id;
 $("#galleryEditor").hidden=false;
}
function editorData(){
 return {name:$("#galleryEditName").value.trim(),space:$("#galleryEditSpace").value,provider:$("#galleryEditProvider").value.trim(),version:$("#galleryEditVersion").value.trim(),status:$("#galleryEditStatus").value,note:$("#galleryEditNote").value.trim(),linkedBudgetId:$("#galleryEditBudget").value.trim()};
}
async function mutation(action,id,meta,retry=false){
 try{
 const r=await api("/api/design-gallery/entry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id,meta,revision:rev})});
 items=r.items;rev=r.revision;render();return true
 }catch(e){
 if(e.status===409&&!retry){await refresh();return mutation(action,id,meta,true)}
 throw e
 }
}
async function saveEditor(){
 if(!editId)return;
 const meta=editorData();
 if(!meta.name||!meta.space){note("请填写图片名称及空间",true);return}
 busy=true;$("#galleryEditSave").disabled=true;
 try{await mutation("update",editId,meta);$("#galleryEditor").hidden=true;note("图片资料已保存")}
 catch(e){note("保存失败："+e.message,true)}
 finally{busy=false;$("#galleryEditSave").disabled=false}
}
async function removeEditor(){
 if(!editId||!confirm("确定永久删除这张效果图及其 R2 文件？此操作不可撤销。"))return;
 busy=true;
 try{await mutation("delete",editId);selected.delete(editId);clearCache(thumbCache);clearCache(fullCache);$("#galleryEditor").hidden=true;render();note("图片已经删除")}
 catch(e){note("删除失败："+e.message,true)}
 finally{busy=false}
}
function getThumb(file){
 return new Promise(async(resolve,reject)=>{
  try{
   const bitmap=await createImageBitmap(file);const factor=Math.min(1,680/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
   const ctx=canvas.getContext("2d");ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("无法生成缩略图")),"image/webp",.75)
  }catch(e){reject(e)}
 })
}
async function putImage(id,kind,blob,mime){
 return api("/api/design-gallery/image/"+id+"/"+kind,{method:"PUT",headers:{"Content-Type":mime,"X-File-Type":mime,"X-File-Size":String(blob.size)},body:blob})
}
async function uploadFiles(list){
 if(busy)return;
 const files=[...list];if(!files.length)return;
 if(files.length>30){note("为确保手机稳定，单次最多选择 30 张图片",true);return}
 const ok=files.filter(f=>["image/jpeg","image/png","image/webp"].includes(f.type)&&f.size>0&&f.size<=15*1048576);
 if(ok.length!==files.length){note("仅支持 JPG、PNG、WEBP，单张最大 15 MB；已跳过不合规文件。",true)}
 if(!ok.length)return;
 if(!auth()){note("请先连接私人云端",true);return}
 const space=$("#galleryUploadSpace").value||"客厅",provider=$("#galleryUploadProvider").value.trim(),version=$("#galleryUploadVersion").value.trim()||"V1";
 busy=true;$("#galleryUploadBtn").disabled=true;let done=0,failed=[];
 for(const file of ok){
  const id=crypto.randomUUID();
  try{
   note("正在上传 "+(done+failed.length+1)+"/"+ok.length+" · "+file.name);
   const thumbnail=await getThumb(file);
   await putImage(id,"original",file,file.type);
   await putImage(id,"thumb",thumbnail,"image/webp");
   await mutation("create",id,{name:file.name.replace(/\.[^.]+$/,""),space,provider,version,status:"待比较",note:"",mime:file.type,size:file.size});
   done++;
  }catch(e){failed.push(file.name+"："+e.message)}
 }
 busy=false;$("#galleryUploadBtn").disabled=false;$("#galleryUploadInput").value="";
 await refresh();
 note("成功上传 "+done+" 张"+(failed.length?"；失败 "+failed.length+" 张："+failed.slice(0,2).join("；"):""),!!failed.length)
}
async function imageOverlay(ids,compare=false){
 const overlay=document.createElement("div");overlay.className="gallery-lightbox";overlay.id="galleryLightbox";
 const names=ids.map(id=>items.find(x=>x.id===id)?.name||"效果图");
 const toolbar=document.createElement("div");toolbar.className="gallery-lightbox-bar";
 const title=document.createElement("strong");title.textContent=compare?"效果图对比 · "+names.join(" vs "):names[0];
 const close=document.createElement("button");close.type="button";close.className="btn";close.textContent="关闭 ✕";close.onclick=()=>closeOverlay();
 toolbar.append(title,close);overlay.append(toolbar);
 const content=document.createElement("div");content.className=compare?"gallery-lightbox-content compare":"gallery-lightbox-content";
 overlay.append(content);
 document.body.append(overlay);document.body.style.overflow="hidden";
 const pane=async(id,container)=>{
  const frame=document.createElement("div");frame.className="gallery-lightbox-pane";
  const label=document.createElement("div");label.className="gallery-lightbox-caption";
  const x=items.find(a=>a.id===id);label.textContent=(x?.name||"图片")+" · "+(x?.space||"")+" · "+(x?.provider||"")+" · "+(x?.version||"");
  frame.append(label);
  const img=document.createElement("img");img.alt=x?.name||"效果图";img.className="gallery-full";img.style.transform="scale(1)";
  frame.append(img);container.append(frame);
  let scale=1;const zoom=(delta)=>{scale=Math.min(5,Math.max(1,scale+delta));img.style.transform="scale("+scale+")"};
  const controls=document.createElement("div");controls.className="gallery-zoom";
  for(const [lab,delta] of [["−",-.35],["+",.35],["重置",0]]){
   const btn=document.createElement("button");btn.type="button";btn.textContent=lab;btn.onclick=()=>delta?zoom(delta):(scale=1,img.style.transform="scale(1)");controls.append(btn)
  }
  frame.append(controls);
  img.addEventListener("wheel",e=>{e.preventDefault();zoom(e.deltaY<0?.2:-.2)},{passive:false});
  try{img.src=await loadPicture(id,"original")}catch(e){label.textContent="图片加载失败："+e.message}
 };
 await Promise.all(ids.map(id=>pane(id,content)));
}
function closeOverlay(){const el=$("#galleryLightbox");if(el)el.remove();document.body.style.overflow=""}
function init(){
 if(!$("#galleryGrid"))return;
 $("#galleryUploadSpace").innerHTML=spaces.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 $("#galleryUploadBtn").onclick=()=>$("#galleryUploadInput").click();
 $("#galleryUploadInput").onchange=e=>uploadFiles(e.target.files);
 $("#galleryRefresh").onclick=refresh;
 $("#gallerySpace").onchange=e=>{filterSpace=e.target.value;page=1;render()};
 $("#galleryProvider").onchange=e=>{filterProvider=e.target.value;page=1;render()};
 $("#galleryFilterStatus").onchange=e=>{filterStatus=e.target.value;page=1;render()};
 $("#gallerySearch").oninput=e=>{term=e.target.value.trim();page=1;render()};
 $("#galleryPrev").onclick=()=>{page--;render()};
 $("#galleryNext").onclick=()=>{page++;render()};
 $("#galleryCompare").onclick=()=>{if(selected.size===2)imageOverlay([...selected],true)};
 $("#galleryEditSave").onclick=saveEditor;$("#galleryEditDelete").onclick=removeEditor;
 $("#galleryEditCancel").onclick=()=>$("#galleryEditor").hidden=true;
 document.addEventListener("change",e=>{const c=e.target.closest(".gallery-select");if(!c)return;if(c.checked){if(selected.size>=2){c.checked=false;note("每次最多选择两张对比");return}selected.add(c.dataset.id)}else selected.delete(c.dataset.id);render()});
 document.addEventListener("click",e=>{const view=e.target.closest("[data-view]"),edit=e.target.closest("[data-edit-gallery]");if(view)imageOverlay([view.dataset.view]);if(edit)formMeta(edit.dataset.editGallery);if(e.target.closest('[data-page="design"],[data-goto="design"]'))setTimeout(()=>{if(!busy)refresh()},100)});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeOverlay();$("#galleryEditor").hidden=true}});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&$("#design.page.on")&&!busy)refresh()});
 render();if(auth())refresh();else note("尚未授权设备。连接私人云端后即可上传及管理效果图。")
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();