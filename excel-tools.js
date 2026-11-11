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
function letter(i){let n=i+1,r="";while(n>0){n--;r=String.fromCharCode(65+n%26)+r;n=Math.floor(n/26)}return r}
function colOptions(cols,value,allowEmpty=true){
 return (allowEmpty?'<option value="">不使用</option>':"")+cols.map((heading,i)=>{
  const title=toText(heading);
  return '<option value="'+i+'" '+(String(i)===String(value)?"selected":"")+'>'+letter(i)+' 列 · '+esc(title||"无表头")+'</option>';
 }).join("");
}

const keys=[
 {key:"group",label:"空间 / 柜体",pattern:/^空间$|^区域$|房间|使用空间|柜体名称|位置|^分组$/},
 {key:"name",label:"项目名称",pattern:/项目名称|项目内容|工程项目|费用项目|材料名称|品名|名称|明细|描述|内容|产品|物品|货品|施工项目/},
 {key:"quantity",label:"数量 / 面积",pattern:/数量|工程量|面积|用量|数量\/|数量（/},
 {key:"unit",label:"单位",pattern:/^单位$|计量单位|单位\/|单位（/},
 {key:"unitPrice",label:"单价",pattern:/单价|综合单价|报价单价|含税单价/},
 {key:"total",label:"商家行金额",pattern:/^金额$|^总价$|^合价$|合计金额|报价金额|行金额/},
 {key:"groupTotal",label:"分组小计（仅核对，不导入）",pattern:/单项合计|分组合计|分组小计|^组小计$/}
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
  let sheet=wb.SheetNames[0],header=0,mapping={},selected=new Set(),allRows=[],columns=[],mappedRows=[],mode="view",viewLimit=250,rawLimit=200,merges=[];
  const root=document.createElement("div");root.className="excel-root";mount.replaceChildren(root);
  // Read cells by absolute Excel coordinates. sheet_to_json may offset a
  // non-A1 worksheet range; that makes the visible column letters misleading.
  function readCell(ws,r,c){
   const cell=ws["!data"]?.[r]?.[c]||ws[XLSX.utils.encode_cell({r,c})];
   if(!cell||cell.v===null||cell.v===undefined)return "";
   return toText(cell.w!==undefined?cell.w:cell.v);
  }
  function loadSheet(){
   const ws=wb.Sheets[sheet];
   const bounds=XLSX.utils.decode_range(ws["!ref"]||"A1");
   const height=Math.min(10001,bounds.e.r+1),width=Math.min(80,bounds.e.c+1);
   allRows=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>readCell(ws,r,c)));
   merges=ws["!merges"]||[];
   const scoreRow=row=>{
    const a=row.map(v=>toText(v).replace(/\s/g,""));
    let hits=0;
    if(a.some(x=>/^(项目|项目名称|工程项目|明细|品名|内容)$/.test(x)))hits+=4;
    if(a.some(x=>/^(面积\/数量|数量|面积|工程量|用量)$/.test(x)))hits+=3;
    if(a.some(x=>/^单价/.test(x)))hits+=3;
    if(a.some(x=>/^(金额|合价|总价|合计金额)$/.test(x)))hits+=3;
    if(a.some(x=>/^(空间|区域|柜体)$/.test(x)))hits+=2;
    // Mixed title rows often mention words but aren't actual column labels.
    return hits;
   };
   let bestScore=-1;header=0;
   for(let r=0;r<Math.min(height,35);r++){
    const score=scoreRow(allRows[r]);if(score>bestScore){bestScore=score;header=r}
   }
   columns=Array.from({length:width},(_,c)=>allRows[header]?.[c]||"");
   mapping=guessed(columns);
   selected=new Set();viewLimit=250;rawLimit=200;renderMode();
  }
  function sourceTable(maxRows,maxCols){
   const occupied=new Set(),rmax=Math.min(allRows.length,maxRows),cmax=Math.min(columns.length,maxCols);
   const mergeMap=new Map();
   for(const m of merges){
    const sr=m.s.r,sc=m.s.c;
    if(sr>=rmax||sc>=cmax)continue;
    const er=Math.min(m.e.r,rmax-1),ec=Math.min(m.e.c,cmax-1);
    mergeMap.set(sr+":"+sc,{rows:er-sr+1,cols:ec-sc+1});
    for(let r=sr;r<=er;r++)for(let c=sc;c<=ec;c++)if(r!==sr||c!==sc)occupied.add(r+":"+c);
   }
   const heads=Array.from({length:cmax},(_,c)=>'<th>'+letter(c)+'</th>').join("");
   const body=allRows.slice(0,rmax).map((cells,r)=>{
    const cellsHTML=Array.from({length:cmax},(_,c)=>{
     if(occupied.has(r+":"+c))return "";
     const merge=mergeMap.get(r+":"+c),spans=merge?(' rowspan="'+merge.rows+'" colspan="'+merge.cols+'"'):"";
     return '<td'+spans+'>'+esc(cells[c]||"")+'</td>';
    }).join("");
    return '<tr><th>'+(r+1)+'</th>'+cellsHTML+'</tr>';
   }).join("");
   return '<table class="excel-sheet-table"><thead><tr><th>行</th>'+heads+'</tr></thead><tbody>'+body+'</tbody></table>';
  }
  function renderMode(){root.classList.toggle("excel-import-mode",mode==="import");if(mode==="view")renderViewer();else render()}
  function renderViewer(){
   const sheetOptions=wb.SheetNames.map(v=>'<option value="'+esc(v)+'" '+(v===sheet?'selected':'')+'>'+esc(v)+'</option>').join("");
   const maxColumns=Math.min(60,Math.max(1,...allRows.map(r=>r.length)));
   const maxRows=Math.min(viewLimit,allRows.length);
   const tableMarkup=sourceTable(maxRows,maxColumns);
   root.innerHTML='<div class="excel-view-toolbar"><label>工作表 <select class="field" id="excelViewSheet">'+sheetOptions+'</select></label><button type="button" class="btn primary" id="excelSwitchImport">导入预算明细</button></div>'+
   '<div class="excel-notice">当前为只读预览，不会导入或修改预算。左右滑动查看列，上下滑动查看行。当前显示 '+maxRows+' / '+allRows.length+' 行；此模式不展示 Excel 内嵌图片和完整排版，如需查看请点顶部「用其他 App 打开」。</div>'+
   '<div class="excel-sheet-scroller" tabindex="0" aria-label="Excel 工作表预览">'+tableMarkup+'</div>'+
   (maxRows<allRows.length?'<button type="button" class="btn" id="excelViewMore">继续显示后面 250 行（剩余 '+(allRows.length-maxRows)+' 行）</button>':'');
   root.querySelector("#excelViewSheet").onchange=e=>{sheet=e.target.value;header=0;loadSheet()};
   root.querySelector("#excelSwitchImport").onclick=()=>{mode="import";renderMode()};
   const more=root.querySelector("#excelViewMore");if(more)more.onclick=()=>{const scroller=root.querySelector(".excel-sheet-scroller");const top=scroller.scrollTop,left=scroller.scrollLeft;viewLimit+=250;renderViewer();const next=root.querySelector(".excel-sheet-scroller");next.scrollTop=top;next.scrollLeft=left};
  }
  function picked(row,key){const i=mapping[key];return i===""||i===undefined?"":toText(row[Number(i)]);}
  function groupAt(index){
   const col=mapping.group;if(col===""||col===undefined)return "";
   const c=Number(col),direct=toText(allRows[index]?.[c]);if(direct)return direct;
   const merged=merges.find(m=>m.s.c<=c&&m.e.c>=c&&m.s.r<=index&&m.e.r>=index);
   if(merged)return toText(allRows[merged.s.r]?.[merged.s.c]);
   return "";
  }
  function getRows(){
   const rows=[],seen=new Set(existingNames.map(s=>toText(s).toLowerCase()));
   for(let i=header+1;i<allRows.length;i++){
    const row=allRows[i],baseName=picked(row,"name");
    if(!baseName||/^(合计|总计|小计|总金额|备注|说明|序号|项目|项目名称|金额)$/i.test(baseName))continue;
    const group=groupAt(i);
    const fullName=group?group+"｜"+baseName:baseName;
    const qtyRaw=toNumber(picked(row,"quantity")),qty=qtyRaw??1;
    const unitPrice=toNumber(picked(row,"unitPrice"));
    const total=toNumber(picked(row,"total"));
    // A zero amount is not an approved quote; never infer a positive price over it.
    const valid=qty>0&&total!==0&&total!==null&&total>0 || qty>0&&total===null&&unitPrice!==null&&unitPrice>0;
    const price=unitPrice;
    const effectiveTotal=total!==null?total:(unitPrice!==null?Math.round(qty*unitPrice*100)/100:null);
    const diff=total!==null&&unitPrice!==null?Math.round((total-qty*unitPrice)*100)/100:null;
    const groupTotal=toNumber(picked(row,"groupTotal"));
    const duplicate=seen.has(fullName.toLowerCase());
    if(duplicate===false)seen.add(fullName.toLowerCase());
    rows.push({index:i,name:fullName,baseName,group,quantity:qty,unit:picked(row,"unit")||(/面积|㎡|m²|m2/.test(columns[Number(mapping.quantity)]||"")?"㎡":"项"),unitPrice:price,total:effectiveTotal,sourceTotal:total,difference:diff,groupTotal,valid,duplicate});
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
   const groups=new Map();
   // H-column group subtotals are verification only, never added to the budget.
   for(const r of mappedRows){
    if(!r.group)continue;
    let g=groups.get(r.group);
    if(!g){g={amount:0,subtotal:null,lines:0};groups.set(r.group,g)}
    if(r.total!==null&&r.valid){g.amount+=r.total;g.lines++}
    if(r.groupTotal!==null)g.subtotal=r.groupTotal;
   }
   const groupChecks=[...groups].filter(([,g])=>g.subtotal!==null).map(([name,g])=>'<div class="excel-group-check">'+esc(name)+'：明细 ¥'+g.amount.toFixed(2)+' / 商家小计 ¥'+g.subtotal.toFixed(2)+(Math.abs(g.amount-g.subtotal)>.01?' <strong>差额 ¥'+(g.subtotal-g.amount).toFixed(2)+'（请核对）</strong>':' <strong>吻合</strong>')+'</div>').join("");

   const rawPreview=sourceTable(rawLimit,Math.min(14,columns.length));
   const rows=display.map(r=>'<tr class="'+(r.duplicate?"excel-duplicate":"")+'"><td><input type="checkbox" data-row="'+r.index+'" '+(selected.has(r.index)?"checked":"")+' '+(!r.valid||r.duplicate?"disabled":"")+'></td><td>'+(r.index+1)+'</td><td>'+esc(r.name)+(r.duplicate?' <span class="chip warn">名称重复</span>':!r.valid?' <span class="chip warn">缺少有效金额</span>':"")+'</td><td>'+esc(r.quantity)+'</td><td>'+esc(r.unit)+'</td><td>'+ (r.unitPrice===null?"—":"¥"+r.unitPrice.toFixed(2))+'</td><td>'+(r.total===null?"—":"¥"+r.total.toFixed(2))+'</td><td>'+(r.difference===null?"—":(Math.abs(r.difference)<.005?"一致":("¥"+(r.difference>0?"+":"")+r.difference.toFixed(2))))+'</td></tr>').join("");
   root.innerHTML='<div class="excel-mode-toolbar"><button type="button" class="btn" id="excelBackView">← 返回表格预览</button><strong>选择报价明细导入预算</strong></div><div class="excel-controls"><label>工作表<select class="field" id="excelSheet">'+sheets+'</select></label><label>表头所在行<select class="field" id="excelHeader">'+headerOpts+'</select></label></div>'+
   '<div class="excel-notice">请按<strong>Excel 原文件的列字母</strong>选择，不是按示例值筛选。对于你提供的定制柜报价：A=空间、B=项目、E=面积/数量、F=单价、G=行金额；H 是分组小计，仅核对不计价。报价金额以 G 为准，保留 F 的原始单价并显示两者差额。预览保留合并单元格关系，但不完全复刻 Excel 样式。</div>'+
   '<details class="excel-source" open><summary>查看原始工作表（当前 '+Math.min(rawLimit,allRows.length)+' / '+allRows.length+' 行，前 14 列）</summary><div class="excel-table-wrap">'+rawPreview+'</div>'+(rawLimit<allRows.length?'<button type="button" class="btn" id="excelRawMore">继续显示后面 200 行</button>':'')+'</details><div class="excel-mapping">'+selectFields+'</div>'+
   '<div class="excel-import-options"><label>导入到预算分类<select class="field" id="excelCategory">'+cats+'</select></label><label>供应商 / 公司<input class="field" id="excelVendor" placeholder="可选，填报价方"></label></div>'+
   '<div class="excel-summary"><strong>可导入 '+mappedRows.filter(r=>r.valid&&!r.duplicate).length+' 项</strong><span>已勾选 <b id="excelSelected">'+selected.size+'</b> 项 · 显示 '+display.length+' 项</span></div>'+
   '<details class="excel-source"><summary>分组小计核对（不计入预算）</summary><div class="excel-group-results">'+(groupChecks||'当前没有可核对的分组小计；可手动将 H 列映射到“分组小计”')+'</div></details>'+
   '<div class="excel-table-wrap"><table class="excel-table"><thead><tr><th><input id="excelCheckAll" type="checkbox"></th><th>行</th><th>项目</th><th>数量</th><th>单位</th><th>原始单价</th><th>商家行金额</th><th>计算差额</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<div class="excel-bottom"><button class="btn" id="excelSelectNone">取消选择</button><button class="btn primary" id="excelImport" type="button">确认导入选中的项目</button></div>'+
   '<p class="info">导入只新增独立的预算项目，不修改原 Excel、不覆盖已有项目，也不计入已付款。名称与现有项目或表内其他明细相同的行默认跳过；仅识别有金额的明细行。最多导入 1000 项。</p>';
   root.querySelector("#excelBackView").onclick=()=>{mode="view";renderMode()};
   const moreRaw=root.querySelector("#excelRawMore");if(moreRaw)moreRaw.onclick=()=>{rawLimit+=200;renderMode()};
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
    const total=chosen.reduce((a,r)=>a+(r.total||0),0);
    if(!confirm("确定新增 "+chosen.length+" 个预算项目，合计约 ¥"+total.toLocaleString("zh-CN",{maximumFractionDigits:2})+"？\n原文件和已有项目不会修改。"))return;
    onImport(chosen.map(r=>({name:r.name,quantity:r.quantity,unit:r.unit,quote:r.unitPrice,quoteTotal:r.sourceTotal,categoryId,vendor,notes:"来源："+file.name+" / "+sheet+" / 第 "+(r.index+1)+" 行"+(r.group?"；空间："+r.group:"")})));
   };
  }
  loadSheet();
 })().catch(err=>{mount.innerHTML='<div class="preview-message"></div>';mount.firstChild.textContent="Excel 解析失败："+err.message+"。你仍可点击右上角「下载」，通过 Excel / WPS 打开原文件。"});
}
window.InteriorExcel={show};
})();