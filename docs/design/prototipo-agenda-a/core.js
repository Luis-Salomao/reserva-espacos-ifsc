/* Dados ficticios + logica compartilhada dos prototipos (sem backend). */
(function(){
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DS=['dom','seg','ter','qua','qui','sex','sáb'],DL=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const MS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],ML=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const pd=i=>{const[a,b,c]=i.split('-').map(Number);return new Date(a,b-1,c)};
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const add=(i,n)=>{const d=pd(i);d.setDate(d.getDate()+n);return iso(d)};
const dow=i=>pd(i).getDay();
const t=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const tm=s=>{const[h,m]=s.split(':').map(Number);return h*60+m};
const rng=(s,e)=>t(s)+'–'+t(e);
const short=i=>DS[dow(i)]+', '+pd(i).getDate()+' '+MS[pd(i).getMonth()];
const long=i=>DL[dow(i)]+', '+pd(i).getDate()+' de '+ML[pd(i).getMonth()];
const TODAY='2026-11-03',D0=480,D1=1320;
const P=[{k:'M12',s:480,e:590},{k:'M34',s:610,e:720},{k:'T12',s:810,e:920},{k:'T34',s:940,e:1050},{k:'N12',s:1080,e:1190},{k:'N34',s:1210,e:1320},{k:'N123',s:1140,e:1320}];
const ROOMS=['A-202','B-105','Lab. Informática 1','Auditório','Sala de Reuniões'];
const SEM={from:'2026-08-03',to:'2026-12-18'};
let seq=100;const items=[];
const imp=(room,dows,k,title,mine)=>{const p=P.find(x=>x.k===k);items.push({id:'i'+(++seq),room,dows,...SEM,s:p.s,e:p.e,title,type:'imported',mine:!!mine,ex:[]})};
const man=(room,date,s,e,title,mine)=>items.push({id:'m'+(++seq),room,date,s:tm(s),e:tm(e),title,type:'booked',mine:!!mine,ex:[]});
imp('A-202',[1],'M12','MAT2 — INF 1');imp('A-202',[1],'M34','POR1 — INF 1');imp('A-202',[1],'T12','FIS1 — ADM 1');
imp('A-202',[2],'M12','HIS1 — INF 1');imp('A-202',[2],'M34','MAT1 — ADM 2',true);imp('A-202',[2],'T34','QUI1 — ADM 2');
imp('A-202',[3],'M12','ING1 — ADM 1');imp('A-202',[3],'T12','MAT2 — INF 2');imp('A-202',[3],'N12','ELE1 — Noturno');
imp('A-202',[4],'M12','MAT1 — ADM 2',true);imp('A-202',[4],'T34','GEO1 — INF 1');imp('A-202',[5],'M34','ART1 — ADM 1');
imp('B-105',[1],'T34','POR2 — ADM 1');imp('B-105',[3],'M12','FIS2 — INF 2');imp('B-105',[5],'T12','HIS2 — ADM 2');
imp('Lab. Informática 1',[1,2],'M12','PRG1 — INF 2');imp('Lab. Informática 1',[1,4],'T12','BD1 — INF 3');imp('Lab. Informática 1',[2],'T34','RED1 — INF 3');
imp('Lab. Informática 1',[3],'N34','RED2 — Noturno');imp('Lab. Informática 1',[3],'N123','Projeto Integrador');imp('Lab. Informática 1',[5],'M12','PRG1 — INF 2');
imp('Auditório',[5],'M34','Aula magna — ADM 1');
man('Auditório','2026-11-03','13:30','15:20','Reserva: Palestra Semana Acadêmica');
man('B-105','2026-11-04','10:10','12:00','Reserva: Monitoria de Cálculo');
man('A-202','2026-11-06','13:30','15:20','Reserva: Prova de recuperação',true);
man('Lab. Informática 1','2026-11-09','10:10','12:00','Reserva: Oficina de Python',true);
items.push({id:'m'+(++seq),room:'Sala de Reuniões',dows:[4],from:'2026-09-03',to:'2026-12-17',s:940,e:1050,title:'Reserva: Reunião NDE',type:'booked',mine:true,ex:[]});
const occurs=(it,d)=>!it.ex.includes(d)&&(it.date?it.date===d:(it.dows.includes(dow(d))&&d>=it.from&&d<=it.to));
function dayEvents(room,d){
 const ev=items.filter(it=>it.room===room&&occurs(it,d)).map(it=>({id:it.id,item:it,start:it.s,end:it.e,title:it.title,type:it.type,mine:it.mine,series:!it.date,conflict:false})).sort((a,b)=>a.start-b.start||a.end-b.end);
 ev.forEach((a,i)=>ev.forEach((b,j)=>{if(i!==j&&a.start<b.end&&b.start<a.end)a.conflict=true}));
 let cl=[],end=0;const flush=()=>{const le=[];cl.forEach(e=>{let k=le.findIndex(x=>x<=e.start);if(k<0){k=le.length;le.push(0)}le[k]=e.end;e.lane=k});cl.forEach(e=>e.lanes=le.length);cl=[]};
 ev.forEach(e=>{if(cl.length&&e.start>=end){flush();end=0}cl.push(e);end=Math.max(end,e.end)});flush();
 return ev;
}
function gaps(room,d){
 const ev=dayEvents(room,d),out=[];let cur=D0;
 const push=(s,e)=>{if(e>s)out.push({s,e,label:(s===720&&e===810)?'Almoço':(e-s<=30)?'Intervalo':(s===D0&&e===D1)?'Livre o dia todo':'Livre'})};
 ev.forEach(e=>{push(cur,e.start);cur=Math.max(cur,e.end)});push(cur,D1);return out;
}
function check(room,d,s,e){const x=dayEvents(room,d).find(v=>s<v.end&&v.start<e);return x?{ev:x,msg:`Conflita com ${x.title}, ${rng(x.start,x.end)}`}:null}
function validate(room,d,s,e,title){
 if(!d)return'Informe a data.';if(isNaN(s)||isNaN(e))return'Informe início e fim.';
 if(e<=s)return'O fim deve ser depois do início.';if(s<D0||e>D1)return'Horário fora do funcionamento (08:00–22:00).';
 if(dow(d)===0||dow(d)===6)return'';
 const c=check(room,d,s,e);if(c)return c.msg+'.';return'';
}
function addBooking(o){const it={id:'u'+(++seq),room:o.room,date:o.date,s:o.s,e:o.e,title:o.title,type:'booked',mine:true,ex:[]};items.push(it);return it}
function cancel(id,scope,d){const k=items.findIndex(x=>x.id===id);if(k<0)return;const it=items[k];if(it.date||scope==='series')items.splice(k,1);else it.ex.push(d)}
function nextOcc(it){for(let i=0;i<120;i++){const d=add(TODAY,i);if(occurs(it,d))return d}return null}
function mine(){return items.filter(i=>i.mine).map(it=>({item:it,iso:nextOcc(it)})).filter(x=>x.iso).sort((a,b)=>a.iso<b.iso?-1:a.iso>b.iso?1:a.item.s-b.item.s)}
function weekDates(d){const w=dow(d)||7;const mon=add(d,1-w);return[0,1,2,3,4].map(n=>add(mon,n))}
const nextWorkday=(d,n)=>{let x=add(d,n);while(dow(x)===0||dow(x)===6)x=add(x,n);return x};
/* ---- icones ---- */
const IC={
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
x:'<path d="M18 6 6 18M6 6l12 12"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
chevL:'<path d="m15 18-6-6 6-6"/>',
chevR:'<path d="m9 18 6-6-6-6"/>',
clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
door:'<path d="M3 21h18M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
repeat:'<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/>',
login:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
kbd:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
import:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n]||''}</svg>`;
/* ---- tema / auth ---- */
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
function themeInit(def){const s=ls.get('proto-theme');const v=s||def;if(v)document.documentElement.dataset.theme=v}
function isDark(){const d=document.documentElement.dataset.theme;return d?d==='dark':matchMedia('(prefers-color-scheme: dark)').matches}
function themeToggle(){const n=isDark()?'light':'dark';document.documentElement.dataset.theme=n;ls.set('proto-theme',n);return n}
function bindTheme(btn){const up=()=>{const d=isDark();btn.innerHTML=ic(d?'sun':'moon');btn.setAttribute('aria-label',d?'Mudar para tema claro':'Mudar para tema escuro');btn.title=btn.getAttribute('aria-label');btn.setAttribute('aria-pressed',String(d))};up();btn.addEventListener('click',()=>{themeToggle();up()})}
const auth={in:(ls.get('proto-auth')||'in')==='in',set(v){this.in=v;ls.set('proto-auth',v?'in':'out')}};
function toast(m){const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=m;document.body.append(e);setTimeout(()=>e.remove(),3200)}
/* ---- views dentro do dialog ---- */
function wireClose(host,cb){host.onclick=e=>{if(e.target.closest('[data-close]'))cb.onClose&&cb.onClose()}}
const head=(title,id)=>`<div class="dlg-head"><h2 id="${id||'dlg-title'}">${title}</h2><button type="button" class="btn-icon" data-close aria-label="Fechar">${ic('x')}</button></div>`;
function bookingForm(host,init,cb){
 wireClose(host,cb);
 host.innerHTML=`<form novalidate>${head('Nova reserva')}<div class="dlg-body">
 <div class="field"><label for="bf-room">Sala</label><select id="bf-room">${ROOMS.map(r=>`<option${r===init.room?' selected':''}>${esc(r)}</option>`).join('')}</select></div>
 <div class="field"><label for="bf-date">Data</label><input id="bf-date" type="date" value="${init.date}"></div>
 <div class="row2"><div class="field"><label for="bf-s">Início</label><input id="bf-s" type="time" step="600" value="${t(init.s)}"></div><div class="field"><label for="bf-e">Fim</label><input id="bf-e" type="time" step="600" value="${t(init.e)}"></div></div>
 <div class="chips" role="group" aria-label="Atalhos de bloco">${P.map(p=>`<button type="button" class="chipbtn" data-s="${p.s}" data-e="${p.e}">${p.k} ${rng(p.s,p.e)}</button>`).join('')}</div>
 <div class="field"><label for="bf-t">Finalidade</label><input id="bf-t" maxlength="80" value="Reserva: " autocomplete="off"></div>
 <div id="bf-msg" aria-live="polite"></div>
 <button type="button" class="btn-link" id="bf-demo" style="justify-self:start">Simular conflito (só protótipo)</button></div>
 <div class="dlg-foot"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" id="bf-go">Reservar</button></div></form>`;
 const f=host.querySelector('form'),$=id=>f.querySelector('#'+id);
 const val=()=>({room:$('bf-room').value,date:$('bf-date').value,s:tm($('bf-s').value||'x:x'),e:tm($('bf-e').value||'x:x')});
 const upd=()=>{const v=val(),er=validate(v.room,v.date,v.s,v.e),m=$('bf-msg'),go=$('bf-go');
  const tt=$('bf-t').value.trim().length>'Reserva:'.length;
  if(er){m.innerHTML=`<p class="err" role="alert">${ic('alert')}<span>${esc(er)}</span></p>`;go.disabled=true}
  else{m.innerHTML=`<p class="okmsg">${ic('check')}<span>Horário livre: ${rng(v.s,v.e)}</span></p>`;go.disabled=!tt}
  go.setAttribute('aria-disabled',go.disabled)};
 f.addEventListener('input',upd);
 f.querySelectorAll('.chipbtn').forEach(b=>b.onclick=()=>{$('bf-s').value=t(+b.dataset.s);$('bf-e').value=t(+b.dataset.e);upd()});
 $('bf-demo').onclick=()=>{$('bf-room').value='A-202';$('bf-date').value=TODAY;$('bf-s').value='10:30';$('bf-e').value='11:30';upd()};
 f.onsubmit=ev=>{ev.preventDefault();const v=val();if(validate(v.room,v.date,v.s,v.e))return;
  const b=addBooking({...v,title:$('bf-t').value.trim()});
  host.innerHTML=`<div class="done"><div class="ring">${ic('check')}</div><h2 id="dlg-title">Reserva confirmada</h2><p class="muted">Seu horário está garantido.</p>
  <div class="summary"><b>${esc(b.title)}</b><span>${esc(b.room)}</span><span>${long(b.date)}</span><span>${rng(b.s,b.e)}</span></div></div>
  <div class="dlg-foot"><button class="btn" data-close>Fechar</button><button class="btn btn-primary" id="bf-view">Ver reserva</button></div>`;
  host.querySelector('#bf-view').onclick=()=>cb.onView&&cb.onView(b);cb.onSaved&&cb.onSaved(b)};
 upd();setTimeout(()=>$('bf-t').focus(),30);
}
function cancelForm(host,o,cb){
 wireClose(host,cb);const it=o.item,ser=!it.date;
 const where=it.type==='imported'?'Aula importada do horário oficial. Você é a pessoa responsável.':'Reserva feita por você.';
 host.innerHTML=`<form>${head('Cancelar reserva')}<div class="dlg-body">
 <div class="summary"><b>${esc(it.title)}</b><span>${esc(it.room)} · ${rng(it.s,it.e)}</span><span class="muted">${where}</span></div>
 ${ser?`<fieldset class="field" style="border:0;padding:0;margin:0;min-width:0"><legend>O que cancelar?</legend>
 <label class="radio"><input type="radio" name="sc" value="one" checked><span><b>Somente ${short(o.iso)}</b><span>As demais datas continuam valendo.</span></span></label>
 <label class="radio"><input type="radio" name="sc" value="series"><span><b>Toda a série</b><span>Todas as ocorrências semanais (${DL[dow(o.iso)]}), até ${short(it.to)}.</span></span></label></fieldset>`
 :`<p>Cancelar <b>${long(o.iso)}</b>? Isso libera a sala para outras pessoas.</p>`}
 </div><div class="dlg-foot"><button type="button" class="btn" data-close>Voltar</button><button class="btn btn-danger" id="cf-go">${ser?`Cancelar só ${short(o.iso)}`:'Cancelar reserva'}</button></div></form>`;
 const go=host.querySelector('#cf-go');
 host.querySelectorAll('input[name=sc]').forEach(r=>r.onchange=()=>{go.textContent=r.value==='one'?`Cancelar só ${short(o.iso)}`:'Cancelar toda a série'});
 host.querySelector('form').onsubmit=e=>{e.preventDefault();const sc=ser?host.querySelector('input[name=sc]:checked').value:'one';cancel(it.id,sc,o.iso);
  cb.onDone&&cb.onDone(sc==='series'?'Série cancelada.':`Cancelado: ${short(o.iso)}.`)};
 setTimeout(()=>host.querySelector('input,#cf-go').focus(),30);
}
function infoView(host,ev,d,room,cb){
 wireClose(host,cb);const kind=ev.conflict?'Conflito de horário':ev.type==='imported'?'Aula importada':'Reserva manual';
 host.innerHTML=`${head(esc(ev.title))}<div class="dlg-body"><p><span class="tag occ ${ev.conflict?'occ-conflict':'occ-'+ev.type}">${kind}</span></p>
 <div class="summary"><span>${esc(room)}</span><span>${long(d)}</span><span>${rng(ev.start,ev.end)}</span>${ev.series?'<span class="muted">Repete toda semana</span>':''}</div>
 ${ev.conflict?'<p class="err" role="alert">'+ic('alert')+'<span>Duas ocupações se sobrepõem nesta sala. A secretaria precisa resolver.</span></p>':''}</div>
 <div class="dlg-foot"><button class="btn" data-close>Fechar</button>${ev.mine?'<button class="btn btn-danger" id="iv-c">Cancelar…</button>':''}</div>`;
 const c=host.querySelector('#iv-c');if(c)c.onclick=()=>cb.onCancel&&cb.onCancel({item:ev.item,iso:d});
}
function gateView(host,cb){
 wireClose(host,cb);
 host.innerHTML=`${head('Entre para reservar')}<div class="dlg-body"><p class="muted">Qualquer pessoa pode consultar a agenda. Para reservar ou cancelar, entre com sua conta institucional.</p></div>
 <div class="dlg-foot"><button class="btn" data-close>Agora não</button><button class="btn btn-primary" id="g-in">${ic('login')} Entrar</button></div>`;
 host.querySelector('#g-in').onclick=()=>cb.onLogin&&cb.onLogin();
}
window.C={esc,DS,DL,MS,ML,pd,iso,add,dow,t,tm,rng,short,long,TODAY,D0,D1,P,ROOMS,dayEvents,gaps,check,validate,addBooking,cancel,mine,weekDates,nextWorkday,ic,themeInit,bindTheme,isDark,auth,toast,bookingForm,cancelForm,infoView,gateView,ls};
})();
