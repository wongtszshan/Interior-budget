/* Local-only Excel preview and review-before-import; parsed workbook never leaves browser. */
(function(){
"use strict";
const LIB="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
let libraryPromise;
function loadLibrary(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");script.src=LIB;script.async=true;
  script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error("Excel 解析组件没有正确加载"));
  script.onerror=()=>reject(new Error("Excel 解析组件加载失败，请检查网络并重试"));
  document.head.appendChild(script);
 });
 return libraryPromise;
}
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toText=v=>String(v??"").replace(/\u0000/g,"").trim();
const toNumber=v=>{
 if(typeof v==="number")return Number.isFinite(v)?v:null;
 const raw=String(v??"").trim().replace(/[￥¥,\s，]/g,"");
 if(!raw||!/^-?\d+(?:\.\d+)?$/.test(raw))return null;
 const n=Number(raw);return Number.isFinite(n)?n:null;
};
function colOptions(cols,value,allowEmpty=true){
 return (allowEmpty?'<option value="">不使用</option>':"")+cols.map((c,i)=>'<option value="'+i+'" '+(String(i)===String(value)?"selected":"")+'>'+esc(String.fromCharCode(65+i))+' · '+esc(c||"第"+(i+1)+"列")+'</option>').join("");
}
const keys=[
 {key:"name",label:"项目名称",pattern:/项目名称|项目内容|工程项目|费用项目|材料名称|品名|名称|明细|描述|内容|产品|物品|货品|施工项目/},
 {key:"quantity",label:"数量",pattern:/数量|工程量|数量\/|数量（/},
 {key:"unit",label:"单位",pattern:/^单位$|计量单位|单位\/|单位（/},
 {key:"unitPrice",label:"单价",pattern:/单价|综合单价|报价单价|含税单价/},
 {key:"total",label:"合计金额",pattern:/合计金额|总价|金额|小计|合价|报价合计|总金额|费用合计/}
];
function guessed(cols){
 const used=new Set(),map={};
 for(const k of keys){
  const i=cols.findIndex((v,j)=>!used.has(j)&&k.pattern.test(toText(v).replace(/\s/g,"")));
  map[k.key]=i<0?"":String(i);if(i>=0)used.add(i);
 }
 return map;
}
function show({blob,file,mount,categories,existingNames,onImport}){
 mount.innerHTML='<div class="preview-message">正在本机解析 Excel 文件…</div>';
 (async()=>{
  const XLSX=await loadLibrary();
  const bytes=await blob.arrayBuffer();
  const wb=XLSX.read(bytes,{type:"array",dense:true,cellFormula:false,cellHTML:false,bookVBA:false});
  if(!wb.SheetNames.length)throw Error("这个 Excel 文件没有工作表");
  let sheet=wb.SheetNames[0],header=0,mapping={},selected=new Set(),allRows=[],columns=[],mappedRows=[],mode="view";
  const root=document.createElement("div");root.className="excel-root";mount.replaceChildren(root);
  function loadSheet(){
   let worksheet=wb.Sheets[sheet];
   allRows=XLSX.utils.sheet_to_json(worksheet,{header:1,defval:"",raw:false,blankrows:false})
    .slice(0,2001).map(r=>r.slice(0,80).map(x=>toText(x)));
   const width=Math.min(80,Math.max(1,...allRows.map(r=>r.length)));
   columns=Array.from({length:width},(_,i)=>allRows[header]?.[i]||"");
   mapping=guessed(columns);selected=new Set();renderMode();
  }
  function renderMode(){if(mode==="view")renderViewer();else render()}
  function renderViewer(){
   const sheetOptions=wb.SheetNames.map(v=>'<option value="'+esc(v)+'" '+(v===sheet?'selected':'')+'>'+esc(v)+'</option>').join("");
   const maxColumns=Math.min(60,Math.max(1,...allRows.map(r=>r.length)));
   const maxRows=Math.min(250,allRows.length);
   const headers=Array.from({length:maxColumns},(_,i)=>'<th>'+esc(i<26?String.fromCharCode(65+i):String.fromCharCode(65+Math.floor(i/26)-1)+String.fromCharCode(65+i%26))+'</th>').join("");
   const trs=allRows.slice(0,maxRows).map((row,i)=>'<tr><th>'+Number(i+1)+'</th>'+Array.from({length:maxColumns},(_,j)=>'<td>'+esc(row[j]??"")+'</td>').join("")+'</tr>').join("");
   root.innerHTML='<div class="excel-view-toolbar"><label>工作表 <select class="field" id="excelViewSheet">'+sheetOptions+'</select></label><button type="button" class="btn primary" id="excelSwitchImport">导入预算明细</button></div>'+
   '<div class="excel-notice">当前为只读预览，不会导入或修改预算。左右滑动查看列，上下滑动查看行。<span>显示前 '+maxRows+' 行，'+maxColumns+' 列；完整内容请下载原文件。</span></div>'+
   '<div class="excel-sheet-scroller" tabindex="0" aria-label="Excel 工作表预览"><table class="excel-sheet-table"><thead><tr><th>行</th>'+headers+'</tr></thead><tbody>'+trs+'</tbody></table></div>';
   root.querySelector("#excelViewSheet").onchange=e=>{sheet=e.target.value;header=0;loadSheet()};
   root.querySelector("#excelSwitchImport").onclick=()=>{mode="import";renderMode()};
  }
  function picked(row,key){const i=mapping[key];return i===""||i===undefined?"":toText(row[Number(i)]);}
  function getRows(){
   const rows=[];const seen=new Set(existingNames.map(s=>toText(s).toLowerCase()));
   for(let i=header+1;i<allRows.length;i++){
    const row=allRows[i],name=picked(row,"name");
    if(!name)continue;
    const qty=toNumber(picked(row,"quantity"))??1;
    const unitPrice=toNumber(picked(row,"unitPrice"));
    const total=toNumber(picked(row,"total"));
    const valid=qty>0&&unitPrice!==null&&unitPrice>=0||qty>0&&total!==null&&total>=0;
    const price=qty>0?(unitPrice!==null&&unitPrice>=0?unitPrice:total!==null&&total>=0?total/qty:null):null;
    const duplicate=seen.has(name.toLowerCase());seen.add(name.toLowerCase());
    rows.push({index:i,name,quantity:qty,unit:picked(row,"unit")||"项",unitPrice:price,total:total??(price!==null?price*qty:null),valid,duplicate});
   }
   return rows.slice(0,1000);
  }
  function render(){
   mappedRows=getRows();
   selected=new Set([...selected].filter(i=>mappedRows.some(r=>r.index===i&&r.valid&&!r.duplicate)));
   
   const cats=categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join("");
   const headerOpts=allRows.slice(0,Math.min(allRows.length,12)).map((r,i)=>'<option value="'+i+'" '+(i===header?"selected":"")+'>'+(i+1)+' · '+esc(r.slice(0,3).join(" / ").slice(0,70))+'</option>').join("");
   const sheets=wb.SheetNames.map(v=>'<option value="'+esc(v)+'" '+(v===sheet?"selected":"")+'>'+esc(v)+'</option>').join("");
   const selectFields=keys.map(k=>'<label class="excel-map-field">'+esc(k.label)+'<select class="field" data-column="'+k.key+'">'+colOptions(columns,mapping[k.key],k.key!=="name")+'</select></label>').join("");
   const display=mappedRows.slice(0,1000);
   const rawPreview=allRows.slice(0,40).map((r,i)=>"<tr><td>"+(i+1)+"</td>"+Array.from({length:Math.min(14,columns.length)},(_,j)=>"<td>"+esc(r[j]??"")+"</td>").join("")+"</tr>").join("");
   const rows=display.map(r=>'<tr class="'+(r.duplicate?"excel-duplicate":"")+'"><td><input type="checkbox" data-row="'+r.index+'" '+(selected.has(r.index)?"checked":"")+' '+(!r.valid||r.duplicate?"disabled":"")+'></td><td>'+(r.index+1)+'</td><td>'+esc(r.name)+(r.duplicate?' <span class="chip warn">名称重复</span>':!r.valid?' <span class="chip warn">缺少有效金额</span>':"")+'</td><td>'+esc(r.quantity)+'</td><td>'+esc(r.unit)+'</td><td>'+ (r.unitPrice===null?"—":"¥"+r.unitPrice.toFixed(2))+'</td><td>'+(r.total===null?"—":"¥"+r.total.toFixed(2))+'</td></tr>').join("");
   root.innerHTML='<div class="excel-mode-toolbar"><button type="button" class="btn" id="excelBackView">← 返回表格预览</button><strong>选择报价明细导入预算</strong></div><div class="excel-controls"><label>工作表<select class="field" id="excelSheet">'+sheets+'</select></label><label>表头所在行<select class="field" id="excelHeader">'+headerOpts+'</select></label></div>'+
   '<div class="excel-notice">表格仅在当前浏览器解析，不会传给 Excel 解析服务。公式不会在此重新计算；请核对报价金额、合并单元格及最终合同报价。</div>'+
   '<details class="excel-source"><summary>查看原始工作表（前 40 行，前 14 列）</summary><div class="excel-table-wrap"><table class="excel-table"><tbody>'+rawPreview+'</tbody></table></div></details><div class="excel-mapping">'+selectFields+'</div>'+
   '<div class="excel-import-options"><label>导入到预算分类<select class="field" id="excelCategory">'+cats+'</select></label><label>供应商 / 公司<input class="field" id="excelVendor" placeholder="可选，填报价方"></label></div>'+
   '<div class="excel-summary"><strong>可导入 '+mappedRows.filter(r=>r.valid&&!r.duplicate).length+' 项</strong><span>已勾选 <b id="excelSelected">'+selected.size+'</b> 项 · 显示 '+display.length+' 项</span></div>'+
   '<div class="excel-table-wrap"><table class="excel-table"><thead><tr><th><input id="excelCheckAll" type="checkbox"></th><th>行</th><th>项目</th><th>数量</th><th>单位</th><th>单价</th><th>总金额</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<div class="excel-bottom"><button class="btn" id="excelSelectNone">取消选择</button><button class="btn primary" id="excelImport" type="button">确认导入选中的项目</button></div>'+
   '<p class="info">导入只新增独立的预算项目，不修改原 Excel、不覆盖已有项目，也不计入已付款。名称与现有项目或表内其他明细相同的行默认跳过；仅识别有金额的明细行。最多导入 1000 项。</p>';
   root.querySelector("#excelBackView").onclick=()=>{mode="view";renderMode()};
   root.querySelector("#excelSheet").onchange=e=>{sheet=e.target.value;header=0;loadSheet()};
   root.querySelector("#excelHeader").onchange=e=>{header=Number(e.target.value);columns=Array.from({length:Math.max(1,...allRows.map(r=>r.length))},(_,i)=>allRows[header]?.[i]||"");mapping=guessed(columns);selected.clear();renderMode()};
   root.querySelectorAll("[data-column]").forEach(el=>el.onchange=()=>{mapping[el.dataset.column]=el.value;selected.clear();renderMode()});
   root.querySelectorAll("[data-row]").forEach(el=>el.onchange=()=>{if(el.checked)selected.add(Number(el.dataset.row));else selected.delete(Number(el.dataset.row));root.querySelector("#excelSelected").textContent=selected.size});
   root.querySelector("#excelCheckAll").onchange=e=>{selected=new Set(e.target.checked?display.filter(r=>r.valid&&!r.duplicate).map(r=>r.index):[]);root.querySelectorAll("[data-row]").forEach(el=>el.checked=selected.has(Number(el.dataset.row)));root.querySelector("#excelSelected").textContent=selected.size};
   root.querySelector("#excelSelectNone").onclick=()=>{selected.clear();root.querySelectorAll("[data-row]").forEach(el=>el.checked=false);root.querySelector("#excelSelected").textContent="0"};
   root.querySelector("#excelImport").onclick=()=>{
    const chosen=mappedRows.filter(r=>selected.has(r.index)&&r.valid&&!r.duplicate);
    if(!chosen.length)return alert("请先选择有效的报价明细行");
    const categoryId=root.querySelector("#excelCategory").value, vendor=root.querySelector("#excelVendor").value.trim();
    const total=chosen.reduce((a,r)=>a+(r.unitPrice*r.quantity),0);
    if(!confirm("确定新增 "+chosen.length+" 个预算项目，合计约 ¥"+total.toLocaleString("zh-CN",{maximumFractionDigits:2})+"？\n原文件和已有项目不会修改。"))return;
    onImport(chosen.map(r=>({name:r.name,quantity:r.quantity,unit:r.unit,quote:Math.round(r.unitPrice*10000)/10000,categoryId,vendor,notes:"来源："+file.name+" / "+sheet+" / 第 "+(r.index+1)+" 行"})));
   };
  }
  loadSheet();
 })().catch(err=>{mount.innerHTML='<div class="preview-message"></div>';mount.firstChild.textContent="Excel 解析失败："+err.message+"。你仍可点击右上角「下载」，通过 Excel / WPS 打开原文件。"});
}
window.InteriorExcel={show};
})();