/* Real account card: reads real-account.json (history only ever appended), draws two line charts with plain SVG. */
(function(){
  var root=document.getElementById('rl'); if(!root) return;
  var ZHL=(window.DCA_LANG==='zh');
  function T(en,zh){return ZHL?zh:en}
  function $(id){return document.getElementById(id)}
  var BRAND='#C8813A',INK='#131310',MID='#6E6E66',RULE='#E4E4DC';
  var COL={'NFLX':'#2a78d6','SPCX':'#1baf7a','BTC-USD':'#e87ba4','GLD':'#008300','VTI':'#6250d6'};
  var FALL=['#b8860b','#0e7c86','#8a4fb0','#c2410c','#4d7c0f','#7a5c3e'],fi=0;
  function colorOf(t){if(!COL[t]){COL[t]=FALL[fi%FALL.length];fi++}return COL[t]}

  /* copy */
  $('rl-t').textContent=T('Real DCA account','真實 DCA 帳戶');
  $('rl-s').textContent=T('One order per asset, every trading day. Real money, no hindsight.','每個交易日、每檔資產各下一筆。真實資金，不事後修改。');
  $('rl-c1t').textContent=T('Wealth over time','財富累積');
  $('rl-c2t').textContent=T('Return','投報率走勢');
  $('rl-c2n').textContent=T('(value − invested) ÷ invested','（市值 − 累計投入）÷ 累計投入');
  $('rl-lg2t').textContent=T('Invested','累計投入');
  $('rl-ft').textContent=T('Real account record. Not a forecast, not investment advice. Updated each trading day after the US market closes.','實際帳戶紀錄，不代表未來表現，非投資建議。每個交易日美股收盤後更新。');

  var D=null,sel={},per='all',hov=-1,tipTimer=0;
  var MINUS='−';
  function money(v,d){return '$'+v.toLocaleString('en-US',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d})}
  function pct(v){return (v<0?MINUS:'+')+Math.abs(v).toFixed(1)+'%'}
  function fmtDate(s){return new Date(s+'T12:00:00Z').toLocaleDateString(ZHL?'zh-TW':'en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
  function ticks(lo,hi,n){var span=hi-lo;if(!(span>0))return [lo];var raw=span/n,p=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)),m=raw/p,st=(m<1.5?1:m<3?2:m<7?5:10)*p,out=[];for(var v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st)out.push(Math.abs(v)<1e-9?0:v);return out}
  function yMoney(v){return v>=1000?'$'+(v/1000)+'k':'$'+(Math.round(v*100)/100)}

  /* load */
  fetch('/real-account.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(j){
    if(!j||!j.dates||!j.dates.length||!j.assets||!j.assets.length)return;
    D=j;D.assets.forEach(function(a){sel[a.t]=true;colorOf(a.t)});
    root.hidden=false;
    window.dcaRealAccount=j;try{document.dispatchEvent(new CustomEvent('dcaRealAccount',{detail:j}))}catch(e){}
    var sp=$('jrst');if(sp&&sp.nextElementSibling){sp.nextElementSibling.textContent=fmtDate(j.start)}
    build();draw();
    if(window.ResizeObserver){new ResizeObserver(function(){draw()}).observe($('rl-c1'));new ResizeObserver(function(){draw()}).observe($('rl-c2'))}
    else window.addEventListener('resize',draw);
  }).catch(function(){});

  function activeAssets(){return D.assets.filter(function(a){return sel[a.t]})}
  function allOn(){return D.assets.every(function(a){return sel[a.t]})}
  function setSel(t){
    if(t==='*'){D.assets.forEach(function(a){sel[a.t]=true})}
    else if(allOn()){D.assets.forEach(function(a){sel[a.t]=(a.t===t)})}
    else{sel[t]=!sel[t];if(!activeAssets().length)D.assets.forEach(function(a){sel[a.t]=true})}
    hov=-1;build();draw();
  }
  function build(){
    var h='<button type="button" class="rl-chip'+(allOn()?' on':'')+'" data-t="*" aria-pressed="'+allOn()+'">'+T('All','全部')+'</button>';
    D.assets.forEach(function(a){var on=sel[a.t]&&!allOn()||allOn();h+='<button type="button" class="rl-chip'+(sel[a.t]?' on':'')+'" data-t="'+a.t+'" aria-pressed="'+!!sel[a.t]+'" style="'+(sel[a.t]?'border-color:'+colorOf(a.t)+';background:'+colorOf(a.t)+'22;':'')+'color:'+(sel[a.t]?INK:MID)+'"><i style="color:'+colorOf(a.t)+'"></i>'+a.t+'</button>'});
    $('rl-chips').innerHTML=h;
    var N=D.dates.length,opts=[['21',T('1M','1月')],['63',T('3M','3月')],['252',T('1Y','1年')],['all',T('All','全部')]],ph='';
    if(N>21){opts.forEach(function(o){if(o[0]==='all'||+o[0]<N)ph+='<button type="button" class="rl-chip'+(per===o[0]?' on':'')+'" data-p="'+o[0]+'" aria-pressed="'+(per===o[0])+'">'+o[1]+'</button>'})}
    $('rl-per').innerHTML=ph;placePer();
  }
  function isDesk(){return window.matchMedia('(min-width:960px)').matches}
  function placePer(){var per_=$('rl-per'),want=isDesk()?$('rl-bar'):$('rl-c2').querySelector('figcaption');if(per_.parentNode!==want)want.appendChild(per_)}
  window.addEventListener('resize',placePer);
  $('rl-chips').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setSel(b.getAttribute('data-t'))});
  $('rl-per').addEventListener('click',function(e){var b=e.target.closest('button');if(b){per=b.getAttribute('data-p');hov=-1;build();draw()}});

  /* numbers for the current selection */
  function series(){
    var N=D.dates.length,act=activeAssets(),V=[],I=[],R=[],M=[];
    for(var i=0;i<N;i++){
      var v=0,iv=0,has=false,fs=0,bs=0;
      act.forEach(function(a){if(a.v[i]!=null){v+=a.v[i];iv+=a.i[i];has=true;if(a.f[i]>0&&a.m[i]>0){fs+=a.f[i];bs+=a.f[i]/a.m[i]}}});
      V.push(has?v:null);I.push(has?iv:null);R.push(has&&iv>0?(v/iv-1)*100:null);M.push(bs>0?fs/bs:null);
    }
    return {V:V,I:I,R:R,M:M,act:act};
  }

  function draw(){
    if(!D)return;
    var S=series(),N=D.dates.length,last=N-1,act=S.act,single=act.length===1;
    var s0=per==='all'?0:Math.max(0,N-(+per)),dom=per==='all'?Math.max(252,N):(N-s0);
    /* stats */
    var v=S.V[last],iv=S.I[last],r=S.R[last];
    $('rl-stats').innerHTML=[[T('Invested','累計投入'),money(iv,iv>=1000?0:2),0],[T('Value','目前市值'),money(v,v>=1000?0:2),0],[T('Return','投報率'),pct(r),1],[T('Days','已記錄天數'),N+T(' days',' 天'),0]]
      .map(function(x){return '<div class="rl-st'+(x[2]?' acc':'')+'"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>'}).join('');
    $('rl-lg1t').textContent=single?act[0].t:(allOn()?T('Total value','整體市值'):T('Selected value','所選合計市值'));
    $('rl-lg1').style.borderTopColor=single?colorOf(act[0].t):BRAND;
    var tcol=single?colorOf(act[0].t):BRAND;
    /* table */
    var th='<thead><tr><th>'+T('Asset','代碼')+'</th><th>'+T('Invested','累計投入')+'</th><th>'+T('Value','目前市值')+'</th><th>'+T('Return','投報率')+'</th><th>'+T('Avg ×','平均倍數')+'</th></tr></thead><tbody>';
    D.assets.forEach(function(a){
      var vi=a.v[last],ii=a.i[last],ms=a.m.filter(function(x,k){return x!=null&&a.f[k]>0}),am=ms.length?ms.reduce(function(p,q){return p+q},0)/ms.length:null;
      th+='<tr class="'+(sel[a.t]?'':'off')+'"><td style="color:'+(sel[a.t]?colorOf(a.t):'')+'"><i></i><span style="color:'+(sel[a.t]?INK:'inherit')+'">'+a.t+'</span></td><td>'+money(ii,ii>=100?0:2)+'</td><td>'+money(vi,vi>=100?0:2)+'</td><td>'+pct((vi/ii-1)*100)+'</td><td>'+(am?am.toFixed(2)+'×':'–')+'</td></tr>';
    });
    var allM=[];act.forEach(function(a){a.m.forEach(function(x,k){if(x!=null&&a.f[k]>0)allM.push(x)})});
    th+='<tr class="sum"><td>'+(allOn()?T('Total','合計'):T('Selected','所選合計'))+'</td><td>'+money(iv,iv>=100?0:2)+'</td><td>'+money(v,v>=100?0:2)+'</td><td>'+pct(r)+'</td><td>'+(allM.length?(allM.reduce(function(p,q){return p+q},0)/allM.length).toFixed(2)+'×':'–')+'</td></tr></tbody>';
    $('rl-tb').innerHTML=th;
    /* charts */
    chart(1,$('rl-svg1'),S,s0,dom,tcol,single);
    chart(2,$('rl-svg2'),S,s0,dom,tcol,single);
    tip(S,s0,dom);
  }

  function chart(kind,svg,S,s0,dom,tcol,single){
    var box=svg.parentNode,W=box.clientWidth,H=box.clientHeight;if(W<40||H<30)return;
    var N=D.dates.length,act=S.act,pl=kind===1?(ZHL?36:38):34,pr=(per==='all'&&N<dom)?6:46,pt=6,pb=16,w=W-pl-pr,h=H-pt-pb;
    function X(i){return pl+(i-s0)/Math.max(1,dom-1)*w}
    var lo=0,hi=1,key=kind===1?'v':null;
    var vals=[];
    if(kind===1){for(var i=s0;i<N;i++){if(S.V[i]!=null){vals.push(S.V[i],S.I[i])}}act.forEach(function(a){for(var i=s0;i<N;i++)if(a.v[i]!=null)vals.push(a.v[i])});lo=0;hi=Math.max.apply(null,vals)*1.06}
    else{for(var i=s0;i<N;i++)if(S.R[i]!=null)vals.push(S.R[i]);act.forEach(function(a){for(var i=s0;i<N;i++)if(a.i[i]>0)vals.push((a.v[i]/a.i[i]-1)*100)});lo=Math.min.apply(null,vals.concat([0]));hi=Math.max.apply(null,vals.concat([0]));var pd=Math.max((hi-lo)*.1,.4);lo-=pd;hi+=pd}
    if(!(hi>lo))hi=lo+1;
    function Y(v){return pt+(1-(v-lo)/(hi-lo))*h}
    var o='',ty=ticks(lo,hi,Math.max(2,Math.min(5,Math.floor(h/34))));
    ty.forEach(function(t){var y=Y(t).toFixed(1);o+='<line x1="'+pl+'" x2="'+(pl+w)+'" y1="'+y+'" y2="'+y+'" stroke="'+(kind===2&&t===0?MID:RULE)+'" stroke-width="'+(kind===2&&t===0?1:.7)+'"/><text x="'+(pl-5)+'" y="'+(+y+3.5)+'" text-anchor="end">'+(kind===1?yMoney(t):(t===0?'0%':pct(t).replace('.0%','%')))+'</text>'});
    /* x axis labels */
    var xl=[];
    if(per==='all'&&N<=252){xl=[[0,T('Start','開始')],[62,T('3 mo','第3月')],[125,T('6 mo','第6月')],[188,T('9 mo','第9月')],[251,T('12 mo','第12月')]]}
    else if(per==='all'){for(var y=1;y*252<N;y++)xl.push([y*252,y+T(' yr','年')]);xl.unshift([0,T('Start','開始')])}
    else{xl=[[s0,fmtDate(D.dates[s0])],[Math.round((s0+N-1)/2),fmtDate(D.dates[Math.round((s0+N-1)/2)])],[N-1,fmtDate(D.dates[N-1])]]}
    xl.forEach(function(t,k){var x=X(t[0]),an=k===0?'start':(k===xl.length-1&&per==='all'&&N<=252?'end':'middle');o+='<text x="'+x.toFixed(1)+'" y="'+(H-3)+'" text-anchor="'+an+'">'+t[1]+'</text>'});
    /* the part of the year that has not happened yet */
    if(per==='all'&&N<dom){o+='<rect x="'+X(N-1).toFixed(1)+'" y="'+pt+'" width="'+(pl+w-X(N-1)).toFixed(1)+'" height="'+h+'" fill="#F3F2EC" opacity=".7"/>'}
    function path(get,sc){var d='',pen=false;for(var i=s0;i<N;i++){var v=get(i);if(v==null){pen=false;continue}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);pen=true}return d}
    if(!single){act.forEach(function(a){o+='<path d="'+path(kind===1?function(i){return a.v[i]}:function(i){return a.i[i]>0?(a.v[i]/a.i[i]-1)*100:null})+'" fill="none" stroke="'+colorOf(a.t)+'" stroke-width="1.2" stroke-linejoin="round" opacity=".95"/>'})}
    if(kind===1){o+='<path d="'+path(function(i){return S.I[i]})+'" fill="none" stroke="'+MID+'" stroke-width="1.2" stroke-dasharray="4 3"/>'}
    o+='<path d="'+path(kind===1?function(i){return S.V[i]}:function(i){return S.R[i]})+'" fill="none" stroke="'+tcol+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    var e=kind===1?S.V[N-1]:S.R[N-1];
    o+='<circle cx="'+X(N-1).toFixed(1)+'" cy="'+Y(e).toFixed(1)+'" r="3" fill="'+tcol+'" stroke="#FBFBF9" stroke-width="1.5"/>';
    if(kind===2)o+='<text x="'+(X(N-1)+7).toFixed(1)+'" y="'+(Y(e)+3.5).toFixed(1)+'" style="fill:'+INK+';font-weight:650">'+pct(e)+'</text>';
    if(hov>=s0&&hov<N){var hv=kind===1?S.V[hov]:S.R[hov];o+='<line x1="'+X(hov).toFixed(1)+'" x2="'+X(hov).toFixed(1)+'" y1="'+pt+'" y2="'+(pt+h)+'" stroke="'+MID+'" stroke-width=".9"/>';if(hv!=null)o+='<circle cx="'+X(hov).toFixed(1)+'" cy="'+Y(hv).toFixed(1)+'" r="3.5" fill="'+tcol+'" stroke="#fff" stroke-width="1.6"/>'}
    o+='<rect x="'+pl+'" y="0" width="'+w+'" height="'+H+'" fill="transparent" data-hit="1"/>';
    svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.innerHTML=o;
    svg.setAttribute('aria-label',(kind===1?T('Wealth over time','財富累積')+': '+money(S.V[N-1])+' / '+money(S.I[N-1]):T('Return','投報率走勢')+': '+pct(S.R[N-1])));
    svg._m={pl:pl,w:w,s0:s0,dom:dom,N:N};
  }

  function tip(S,s0,dom){
    var old=document.getElementById('rl-tip');if(old)old.remove();
    if(hov<0)return;
    var i=hov,box=$('rl-c1').querySelector('.rl-sv'),m=$('rl-svg1')._m;if(!m)return;
    var x=m.pl+(i-m.s0)/Math.max(1,m.dom-1)*m.w,rows='',fs=0,bs=0;
    S.act.forEach(function(a){
      if(a.v[i]==null){rows+='<div class="r"><i style="background:'+colorOf(a.t)+'"></i><em>'+a.t+'</em><u>'+T('not started','尚未投入')+'</u></div>';return}
      var p=a.p[i],pc=p>=1000?money(p,0):money(p,2);
      rows+='<div class="r"><i style="background:'+colorOf(a.t)+'"></i><em>'+a.t+'</em><u>'+pc+' · '+money(a.f[i])+' · '+(a.m[i]!=null?a.m[i].toFixed(2)+'×':'–')+'</u></div>';
      if(a.f[i]>0&&a.m[i]>0){fs+=a.f[i];bs+=a.f[i]/a.m[i]}
    });
    var el=document.createElement('div');el.className='rl-tip';el.id='rl-tip';
    el.innerHTML='<div class="h"><b>'+T('Day ','第 ')+(i+1)+T(' · ',' 天 · ')+fmtDate(D.dates[i])+'</b></div><div class="k">'+T('Price · Amount · Multiple','單價 ・ 投入金額 ・ 倍數')+'</div>'+rows+'<div class="r t"><em>'+T('Today','當日')+'</em><u>'+money(fs)+' · '+(bs>0?(fs/bs).toFixed(2)+'×':'–')+'</u></div>';
    if(!isDesk()){el.classList.add('m');root.appendChild(el);return}
    box.appendChild(el);
    var bw=el.offsetWidth,left=x+12;if(left+bw>box.clientWidth)left=x-bw-12;if(left<0)left=0;el.style.left=left+'px';
  }

  /* hover / touch scrub, shared by both charts */
  function onMove(e){
    var svg=e.currentTarget,m=svg._m;if(!m)return;
    var rc=svg.getBoundingClientRect(),px=e.clientX-rc.left;
    var i=Math.round(m.s0+(px-m.pl)/m.w*(m.dom-1));
    i=Math.max(m.s0,Math.min(m.N-1,i));
    if(i!==hov){hov=i;draw()}
    clearTimeout(tipTimer);
  }
  function onLeave(e){if(e.pointerType==='touch'){clearTimeout(tipTimer);tipTimer=setTimeout(function(){hov=-1;draw()},2600)}else{hov=-1;draw()}}
  ['rl-svg1','rl-svg2'].forEach(function(id){var s=$(id);s.addEventListener('pointermove',onMove);s.addEventListener('pointerdown',onMove);s.addEventListener('pointerleave',onLeave);s.addEventListener('pointerup',onLeave);s.addEventListener('pointercancel',onLeave)});
})();
