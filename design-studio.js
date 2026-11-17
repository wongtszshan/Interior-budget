/* Private design showroom controller. User HTML always runs in an opaque-origin sandbox. */
(()=>{
"use strict";
const $=s=>document.querySelector(s);
const apiBase=()=>localStorage.getItem("interior-api-url")||"https://interior-budget-api.wongtszshan.workers.dev";
const token=()=>localStorage.getItem("interior-session-token")||"";
const state={private:false,loaded:false,busy:false,objectUrl:null};
const statusText=()=>$("#designUploadStatus");
const setStatus=(s,isError=false)=>{const e=statusText();if(e){e.textContent=s;e.style.color=isError?"#ab514b":"#667e6e"}};
async function request(path,options={}){
 const auth=token();if(!auth)throw Error("请先前往「设置与同步」授权本设备");
 const r=await fetch(apiBase().replace(/\/+$/,"")+path,{method:options.method||"GET",headers:{"Authorization":"Bearer "+auth,...(options.headers||{})},body:options.body,cache:"no-store"});
 if(!r.ok){let msg="请求失败（"+r.status+"）";try{msg=(await r.json()).error||msg}catch{}if(r.status===401)msg="设备授权已过期，请重新登录";throw Error(msg)}
 return options.binary?r.blob():r.json();
}
async function loadStatus(){
 if(state.busy)return;
 if(!token()){setStatus("尚未连接私人存储。请先到「设置与同步」授权设备。");return}
 try{
 const r=await request("/api/showroom/status");
 state.private=!!r.exists;state.loaded=true;
 const source=$("#designSourceLabel");
 if(r.exists){source.textContent="私人 R2 方案";$("#designFileName").textContent=r.name||"showroom.html";$("#designFileMeta").textContent="已上传 · "+new Date(r.updatedAt).toLocaleString("zh-CN")+" · "+(r.size/1024).toFixed(0)+" KB";setStatus("已读取私人云端方案，上传新 HTML 即可替换当前展示。")}
 else{source.textContent="初始公开方案";$("#designFileName").textContent="封阳台版 3D 样板间";$("#designFileMeta").textContent="默认演示文件 · 后续上传后优先使用私人版本";setStatus("私人存储暂无样板间，可上传新 HTML 作为当前方案。")}
 }catch(e){state.loaded=false;setStatus("读取私人方案失败："+e.message,true)}
}
async function upload(file){
 if(!file)return;
 if(!/\.html?$/i.test(file.name)){setStatus("请选择 .html 或 .htm 文件",true);return}
 if(file.size<1||file.size>12*1024*1024){setStatus("文件大小须在 1 字节至 12 MiB 之间",true);return}
 if(!token()){setStatus("请先在「设置与同步」授权本设备",true);return}
 const beginning=(await file.slice(0,2048).text()).trimStart();
 if(!/^<!doctype\s+html\b|^<html(?:\s|>)/i.test(beginning)){setStatus("请选择完整的 HTML 页面文件",true);return}
 if(!confirm("确定将「"+file.name+"」设为新的 3D 样板间？现有私人版本不会显示在主入口，但会保留在存储桶中。"))return;
 state.busy=true;$("#designUploadBtn").disabled=true;setStatus("正在上传私人存储，请不要关闭页面…");
 try{
 const r=await request("/api/showroom",{method:"PUT",headers:{"Content-Type":"text/html;charset=utf-8","X-File-Size":String(file.size),"X-Showroom-Name":encodeURIComponent(file.name)},body:file});
 setStatus("上传成功！当前展示已切换至 "+r.name);state.loaded=false;await loadStatus();
 }catch(e){setStatus("上传失败："+e.message,true)}
 finally{state.busy=false;$("#designUploadBtn").disabled=false;$("#designFileInput").value=""}
}
function closeViewer(){
 const overlay=$("#designViewerOverlay");if(overlay)overlay.remove();
 if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl=null}
 document.body.style.overflow="";
}
async function view(){
 if($("#designViewerOverlay"))return;
 const overlay=document.createElement("div");overlay.id="designViewerOverlay";overlay.className="design-viewer-overlay";
 overlay.innerHTML='<div class="design-viewer-toolbar"><span id="designViewerTitle">3D 样板间 · 安全隔离预览</span><button type="button" class="btn" id="designViewerClose">关闭 ✕</button></div><div class="design-viewer-stage"><div class="design-viewer-loading" id="designViewerLoading">正在载入 3D 样板间…</div></div>';
 document.body.append(overlay);document.body.style.overflow="hidden";
 overlay.querySelector("#designViewerClose").addEventListener("click",closeViewer);
 try{
 let blob;
 if(state.private){blob=await request("/api/showroom",{binary:true})}
 else{const r=await fetch("./design/showroom.html",{cache:"no-store"});if(!r.ok)throw Error("默认样板间无法读取");blob=await r.blob()}
 if(!document.body.contains(overlay))return;
 state.objectUrl=URL.createObjectURL(new Blob([blob],{type:"text/html;charset=utf-8"}));
 const frame=document.createElement("iframe");frame.className="design-viewer-frame";frame.title="独立沙盒 3D 样板间";
 // Deliberately omit allow-same-origin. Uploaded scripts cannot access parent cookies, storage or DOM.
 frame.setAttribute("sandbox","allow-scripts allow-pointer-lock");frame.setAttribute("allow","fullscreen");frame.setAttribute("allowfullscreen","");
 frame.addEventListener("load",()=>overlay.querySelector("#designViewerLoading")?.remove());
 frame.src=state.objectUrl;overlay.querySelector(".design-viewer-stage").append(frame);
 }catch(e){const load=overlay.querySelector("#designViewerLoading");if(load)load.textContent="打开失败："+e.message;setStatus("打开失败："+e.message,true)}
}
function init(){
 $("#designUploadBtn")?.addEventListener("click",()=>$("#designFileInput").click());
 $("#designFileInput")?.addEventListener("change",e=>upload(e.target.files?.[0]));
 $("#designOpenBtn")?.addEventListener("click",view);
 $("#designRefreshBtn")?.addEventListener("click",loadStatus);
 document.addEventListener("click",e=>{if(e.target.closest('[data-page="design"],[data-goto="design"]'))setTimeout(loadStatus,50)});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#designViewerOverlay"))closeViewer()});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&document.querySelector("#design.page.on"))loadStatus()});
 if(token())loadStatus();else setStatus("初始展示为公开样板间。授权设备后可以上传私人 HTML 版本。");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();