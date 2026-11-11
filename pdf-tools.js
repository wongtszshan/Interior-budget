/* PDF.js continuous, scrollable PDF viewer. Files stay in the local browser. */
(function(){
"use strict";
const VERSION="3.11.174";
const SRC="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/"+VERSION+"/pdf.min.js";
const WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/"+VERSION+"/pdf.worker.min.js";
let loading;
function getLibrary(){
 if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src=SRC;s.async=true;
  s.onload=()=>{if(!window.pdfjsLib)return reject(new Error("PDF 阅读器加载失败"));window.pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;resolve(window.pdfjsLib)};
  s.onerror=()=>reject(new Error("无法下载 PDF 阅读器，请检查网络"));document.head.appendChild(s);
 }).catch(e=>{loading=null;throw e});
 return loading;
}
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function show({blob,mount,file}){
 let closed=false,pdf=null,observer=null,zoom=1,generation=0;
 const tasks=new Map();
 mount.replaceChildren();
 const root=document.createElement("div");root.className="pdf-viewer";
 root.innerHTML='<div class="pdf-controls"><span class="pdf-counter">正在打开 PDF…</span><span class="pdf-control-group"><button type="button" data-zoom="-1" title="缩小">−</button><span class="pdf-zoom-label">100%</span><button type="button" data-zoom="1" title="放大">＋</button><button type="button" data-fit="1">适应宽度</button></span></div><div class="pdf-scroll" tabindex="0" aria-label="PDF 连续阅读区"></div>';
 mount.appendChild(root);
 const container=root.querySelector(".pdf-scroll"),counter=root.querySelector(".pdf-counter"),zoomLabel=root.querySelector(".pdf-zoom-label");
 const isActive=()=>!closed&&mount.contains(root)&&document.body.contains(root);
 const stopTasks=()=>{for(const task of tasks.values())try{task.cancel()}catch{}tasks.clear()};
 const close=()=>{closed=true;generation++;observer?.disconnect();observer=null;stopTasks();try{pdf?.destroy()}catch{}};
 root.pdfCleanup=close;
 async function draw(n,round){
  if(!isActive()||round!==generation||tasks.has(n))return;
  const holder=container.querySelector('[data-pdf-page="'+n+'"]');if(!holder||holder.dataset.drawn===String(round))return;
  holder.dataset.drawn=String(round);
  try{
   const page=await pdf.getPage(n);if(!isActive()||round!==generation)return;
   const width=Math.max(180,container.clientWidth-28);
   const base=page.getViewport({scale:1}),scale=clamp(width/base.width,0.1,5)*zoom;
   const viewport=page.getViewport({scale}),dpr=Math.min(window.devicePixelRatio||1,2);
   const canvas=document.createElement("canvas");canvas.className="pdf-page-canvas";
   canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);
   canvas.style.width=viewport.width+"px";canvas.style.height=viewport.height+"px";
   const context=canvas.getContext("2d",{alpha:false});if(!context)throw Error("Canvas unavailable");
   holder.replaceChildren(canvas);
   const task=page.render({canvasContext:context,viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null});
   tasks.set(n,task);
   await task.promise;
  }catch(e){if(round===generation&&isActive()&&e.name!=="RenderingCancelledException")holder.textContent="第 "+n+" 页渲染失败："+e.message}
  finally{tasks.delete(n)}
 }
 function refresh(){
  if(!pdf||!isActive())return;
  generation++;stopTasks();observer?.disconnect();
  const round=generation;container.replaceChildren();
  counter.textContent="共 "+pdf.numPages+" 页 · 向下滚动连续阅读";
  zoomLabel.textContent=Math.round(zoom*100)+"%";
  observer=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){const n=Number(entry.target.dataset.pdfPage);draw(n,round)}
  },{root:container,rootMargin:"650px 0px"});
  for(let n=1;n<=pdf.numPages;n++){
   const holder=document.createElement("div");holder.className="pdf-page-holder";holder.dataset.pdfPage=n;
   const label=document.createElement("div");label.className="pdf-page-number";label.textContent="第 "+n+" / "+pdf.numPages+" 页";
   holder.appendChild(label);container.appendChild(holder);observer.observe(holder);
  }
 }
 root.querySelectorAll("[data-zoom]").forEach(b=>b.onclick=()=>{const next=clamp(Math.round((zoom+Number(b.dataset.zoom)*.2)*10)/10,.6,3);if(next!==zoom){zoom=next;refresh()}});
 root.querySelector("[data-fit]").onclick=()=>{zoom=1;refresh()};
 (async()=>{
  try{
   const lib=await getLibrary();if(!isActive())return;
   const bytes=new Uint8Array(await blob.arrayBuffer());if(!isActive())return;
   const loadingTask=lib.getDocument({data:bytes});
   pdf=await loadingTask.promise;if(!isActive()){pdf.destroy();return}
   if(!pdf.numPages)throw Error("PDF 没有可显示的页面");
   refresh();
  }catch(e){if(isActive()){counter.textContent="无法预览";container.innerHTML='<div class="preview-message"></div>';container.firstChild.textContent="PDF 阅读器出错："+e.message+"。请使用右上角「下载」打开原文件。"}}
 })();
 return close;
}
window.InteriorPDF={show};
})();