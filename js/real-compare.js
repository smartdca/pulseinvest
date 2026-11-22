/* Real Money page, head-to-head block: DCA Score strategy (the real account) vs. traditional DCA (simulated).
   Reads the "cmp" part of real-account.json (written by the Proxy job) and draws two plain-SVG charts plus two rows of key numbers.
   The block stays hidden until "cmp" exists, so an older data file never shows a broken block. */
(function(){
  var sec=document.getElementById('rc-sec'); if(!sec) return;
  var ZHL=(window.DCA_LANG==='zh');
  function T(en,zh){return ZHL?zh:en}
  function $(id){return document.getElementById(id)}
  var CA='#E07B00',CB='#2B4FA3',GAP='#8793a8',MID='#6E6E66',RULE='#E4E4DC',UP='#1c7a45',DN='#c2402e',MINUS='−';
  var D=null,C=null,days=[],gap=[],hov=-1,tipTimer=0,AX=null;

  function fmtDate(s){return new Date(s+'T12:00:00Z').toLocaleDateString(ZHL?'zh-TW':'en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
  function fmtTick1(s){if(!ZHL)return fmtDate(s);var t=new Date(s+'T12:00:00Z');return (t.getUTCMonth()+1)+'/'+t.getUTCDate()}
  function fmtMonth(s,yr){return new Date(s+'T12:00:00Z').toLocaleDateString(ZHL?'zh-TW':'en-US',yr?{month:'short',year:'2-digit',timeZone:'UTC'}:{month:'short',timeZone:'UTC'})}
  function addDays(s,n){var t=new Date(s+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
  function sgn(v,d){return (v<0?MINUS:'+')+Math.abs(v).toFixed(d)}
  function nice(span,n){var raw=span/n,p=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)),m=raw/p;return (m<1.5?1:m<3?2:m<7?5:10)*p}
  function fmtTick(v,step){var s=Math.abs(v)<1e-9?'0':(step<1?v.toFixed(step<.1?2:1):v.toFixed(0));return s.replace('-',MINUS)}

  /* ---- the time axis: only as long as the data needs, growing to a full year ---- */
  function axis(){
    var span=days[days.length-1],end;
    if(span<=292)end=Math.min(365,Math.max(30,Math.ceil(span*1.25)));else end=Math.max(365,Math.ceil(span*1.02));
    var ticks=[],i,d;
    if(end<=70){for(d=0;d<=end;d+=7)ticks.push([d,fmtTick1(addDays(D.start,d))])}
    else{
      var months=[],t0=new Date(D.start+'T12:00:00Z');
      for(d=0;d<=end;d++){var dt=new Date(t0.getTime()+d*864e5);if(dt.getUTCDate()===1)months.push(d)}
      var step=Math.max(1,Math.ceil(months.length/7));
      for(i=0;i<months.length;i+=step)ticks.push([months[i],fmtMonth(addDays(D.start,months[i]),end>400)]);
    }
    return {end:end,ticks:ticks};
  }

  /* ---- one chart ---- */
  function chart(svg,series,lo,hi,mode){
    var box=svg.parentNode,W=box.clientWidth,H=box.clientHeight; if(W<40||H<40)return;
    var pl=38,pr=8,pt=10,pb=18,w=W-pl-pr,h=H-pt-pb,step=nice(hi-lo,Math.max(2,Math.min(5,Math.floor(h/34)))),o='',v,y;
    function X(d){return pl+w*d/AX.end}
    function Y(val){return pt+h*(hi-val)/(hi-lo)}
    for(v=Math.ceil(lo/step-1e-9)*step;v<=hi+1e-9;v+=step){
      y=Y(v).toFixed(1);var z=Math.abs(v)<1e-9;
      o+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y+'" y2="'+y+'" stroke="'+(z?MID:RULE)+'" stroke-width="'+(z?1.2:.8)+'"'+(z&&mode==='ret'?' stroke-dasharray="3 3"':'')+'/>';
      o+='<text x="'+(pl-5)+'" y="'+(+y+3.5)+'" text-anchor="end">'+(mode==='gap'&&v>1e-9?'+':'')+fmtTick(v,step)+'</text>';
    }
    AX.ticks.forEach(function(k,j){var an=j===0?'start':'middle';o+='<text x="'+X(k[0]).toFixed(1)+'" y="'+(H-4)+'" text-anchor="'+an+'">'+k[1]+'</text>'});
    var n=days.length,last=n-1;
    series.forEach(function(s,si){
      var pts=[],first=-1,i;
      for(i=0;i<n;i++){if(s.v[i]!=null){pts.push(X(days[i]).toFixed(1)+','+Y(s.v[i]).toFixed(1));if(first<0)first=i}}
      if(!pts.length)return;
      if(s.fill){
        var y0=Y(0),area='M'+X(days[first]).toFixed(1)+','+y0.toFixed(1)+' L'+pts.join(' L')+' L'+X(days[last]).toFixed(1)+','+y0.toFixed(1)+' Z';
        o+='<clipPath id="rc-cu"><rect x="0" y="0" width="'+W+'" height="'+y0.toFixed(1)+'"/></clipPath><clipPath id="rc-cd"><rect x="0" y="'+y0.toFixed(1)+'" width="'+W+'" height="'+H+'"/></clipPath>';
        o+='<path d="'+area+'" fill="'+UP+'" fill-opacity=".2" clip-path="url(#rc-cu)"/><path d="'+area+'" fill="'+DN+'" fill-opacity=".2" clip-path="url(#rc-cd)"/>';
      }
      if(s.halo)o+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+s.c+'" stroke-opacity=".28" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>';
      o+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+s.c+'" stroke-width="'+(s.w||2)+'" stroke-linejoin="round" stroke-linecap="round"/>';
      if(s.v[last]!=null)o+='<circle cx="'+X(days[last]).toFixed(1)+'" cy="'+Y(s.v[last]).toFixed(1)+'" r="3.5" fill="'+s.c+'" stroke="#FBFBF9" stroke-width="1.5"/>';
    });
    if(mode==='ret'&&C.ra[last]!=null&&C.rb[last]!=null){
      var a=C.ra[last],b=C.rb[last],lx=X(days[last]),right=lx+62>W-2;
      [[a,CA,a>=b],[b,CB,b>a]].forEach(function(q){
        o+='<text x="'+(right?lx-8:lx+10).toFixed(1)+'" y="'+(Y(q[0])+(q[2]?-7:14)).toFixed(1)+'" text-anchor="'+(right?'end':'start')+'" style="font-weight:650;font-size:10px;fill:'+q[1]+'">'+sgn(q[0],2)+'%</text>';
      });
    }
    if(hov>=0&&hov<n&&days[hov]!=null){
      var hx=X(days[hov]).toFixed(1);
      o+='<line x1="'+hx+'" x2="'+hx+'" y1="'+pt+'" y2="'+(pt+h)+'" stroke="'+MID+'" stroke-width=".9"/>';
      series.forEach(function(s){if(s.v[hov]!=null)o+='<circle cx="'+hx+'" cy="'+Y(s.v[hov]).toFixed(1)+'" r="3.5" fill="'+s.c+'" stroke="#fff" stroke-width="1.5"/>'});
    }
    o+='<rect x="'+pl+'" y="0" width="'+w+'" height="'+H+'" fill="transparent" data-hit="1"/>';
    svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.innerHTML=o;
    svg._m={pl:pl,w:w,end:AX.end};
  }

  function range(arrs,minPad){
    var vals=[];arrs.forEach(function(a){a.forEach(function(v){if(v!=null)vals.push(v)})});
    if(!vals.length)return [-1,1];
    var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),pd=Math.max((hi-lo)*.15,minPad);
    return [lo-pd,hi+pd];
  }

  function drawAll(){
    if(!C)return;
    AX=axis();
    var r=range([C.ra,C.rb],.4);
    chart($('rc-svg1'),[{v:C.rb,c:CB,halo:1,w:2},{v:C.ra,c:CA,w:2.2}],r[0],r[1],'ret');
    var g=0;gap.forEach(function(v){if(v!=null&&Math.abs(v)>g)g=Math.abs(v)});g=Math.max(g*1.3,.2);
    chart($('rc-svg2'),[{v:gap,c:GAP,fill:1,w:1.6}],-g,g,'gap');
    tips();
  }

  /* ---- hover / press-and-hold details: replaces the card heading with that day's numbers ---- */
  function tips(){
    [1,2].forEach(function(k){
      var t=$('rc-tip'+k);if(!t)return;
      if(hov<0||C.ra[hov]==null){t.hidden=true;return}
      var a=C.ra[hov],b=C.rb[hov],gp=gap[hov];
      t.innerHTML='<div class="rc-tt">'+T('Day ','第 ')+(hov+1)+T(' · ',' 天 · ')+fmtDate(D.dates[hov])+'</div><div class="rc-tg"><span><i style="background:'+CA+'"></i>'+sgn(a,2)+'%</span><span><i style="background:'+CB+'"></i>'+sgn(b,2)+'%</span><span class="'+(gp>=0?'rc-up':'rc-dn')+'">'+T('Gap ','差距 ')+sgn(gp,2)+'%'+'</span></div>';
      t.hidden=false;
    });
  }
  function onMove(e,svg){
    var m=svg._m;if(!m)return false;
    var rc=svg.getBoundingClientRect(),px=e.clientX-rc.left,n=days.length;
    var xl=m.pl+m.w*days[0]/m.end,xr=m.pl+m.w*days[n-1]/m.end,tol=14;
    if(px<xl-tol||px>xr+tol){if(e.pointerType!=='touch'&&hov!==-1){hov=-1;drawAll()}return false}
    var d=(px-m.pl)/m.w*m.end,best=0,bd=1e9,i;
    for(i=0;i<n;i++){var dd=Math.abs(days[i]-d);if(dd<bd){bd=dd;best=i}}
    if(best!==hov){hov=best;drawAll()}
    clearTimeout(tipTimer);
    return true;
  }
  function onLeave(e){if(e.pointerType==='touch'){clearTimeout(tipTimer);tipTimer=setTimeout(function(){hov=-1;drawAll()},2600)}else{hov=-1;drawAll()}}
  /* same behaviour as the charts above: touch needs a press and hold of about 0.35 s; mouse just hovers */
  var HOLD_MS=350,MOVE_TOL=8;
  function wire(id){
    var s=$(id),holdT=0,scrub=false,sx=0,sy=0,last=null;
    function stopHold(){clearTimeout(holdT);holdT=0}
    s.addEventListener('pointerdown',function(e){
      if(e.pointerType!=='touch'){onMove(e,s);return}
      scrub=false;sx=e.clientX;sy=e.clientY;last=e;stopHold();
      holdT=setTimeout(function(){holdT=0;scrub=onMove(last,s)},HOLD_MS);
    });
    s.addEventListener('pointermove',function(e){
      if(e.pointerType!=='touch'){onMove(e,s);return}
      last=e;
      if(scrub){onMove(e,s);return}
      if(holdT&&(Math.abs(e.clientX-sx)>MOVE_TOL||Math.abs(e.clientY-sy)>MOVE_TOL))stopHold();
    });
    function end(e){if(e.pointerType!=='touch'){onLeave(e);return}stopHold();if(scrub){scrub=false;onLeave(e)}}
    s.addEventListener('pointerup',end);s.addEventListener('pointercancel',end);
    s.addEventListener('pointerleave',function(e){if(e.pointerType!=='touch')onLeave(e)});
    /* no touchmove listener on purpose: a non-passive one makes iOS wait for script before it will scroll. touch-action:pan-y on the chart does the job. */
    s.addEventListener('contextmenu',function(e){e.preventDefault()});
  }

  /* ---- key numbers: two rows (DCA Score strategy on top, traditional DCA below), one column per measure ---- */
  function stat(arr){var lo=null,hi=null;arr.forEach(function(v){if(v!=null){if(lo==null||v<lo)lo=v;if(hi==null||v>hi)hi=v}});return {lo:lo,hi:hi}}
  function pctTxt(v,d){return v==null?'—':sgn(v,d)}
  function bigPct(x){
    if(x==null)return '—';
    var p=x*100;return (p<0?MINUS:'+')+(Math.abs(p)>=1000?Math.abs(p).toLocaleString('en-US',{maximumFractionDigits:0}):Math.abs(p).toFixed(1));
  }
  function colorOf(v){return v==null?'':(v<0?'var(--down)':'var(--up)')}
  function dtxt(diff,unit,d,prefix){
    if(diff==null)return '';
    var cls=diff>=-1e-9?'rc-up':'rc-dn',vs=T(' vs traditional',' 相較傳統 DCA');
    return '<span class="'+cls+'">'+(diff<0?MINUS:'+')+(prefix||'')+Math.abs(diff).toFixed(d)+unit+'</span>'+vs;
  }
  function rows(){
    var n=days.length,last=n-1,A=stat(C.ra),B=stat(C.rb),la=0,lb=0,tot=0,i,pts='%';
    for(i=0;i<n;i++){if(C.ra[i]!=null&&C.rb[i]!=null){tot++;if(C.ra[i]>C.rb[i])la++;else if(C.rb[i]>C.ra[i])lb++}}
    var xd=(C.xa!=null&&C.xb!=null)?(C.xa-C.xb)*100:null,rd=(C.ra[last]!=null&&C.rb[last]!=null)?C.ra[last]-C.rb[last]:null,
        wd=(C.wa!=null&&C.wb!=null)?C.wa-C.wb:null;
    function card(l,v,u,c,note){return {l:l,v:v,u:u,c:c,n:note}}
    var rowA=[
      card(T('XIRR','XIRR'),bigPct(C.xa),C.xa==null?'':'%',colorOf(C.xa),dtxt(xd,pts,1)),
      card(T('Return to date','累計報酬率'),pctTxt(C.ra[last],1),C.ra[last]==null?'':'%',colorOf(C.ra[last]),dtxt(rd,pts,1)),
      card(T('Value per $1 invested','每投入 1 美元現值'),C.wa==null?'—':'$'+C.wa.toFixed(3),'','',dtxt(wd,'',3,'$')),
      card(T('Lowest point so far','目前最低點'),pctTxt(A.lo,1),A.lo==null?'':'%',colorOf(A.lo),dtxt(A.lo!=null&&B.lo!=null?A.lo-B.lo:null,pts,1)),
      card(T('Highest point so far','目前最高點'),pctTxt(A.hi,1),A.hi==null?'':'%',colorOf(A.hi),dtxt(A.hi!=null&&B.hi!=null?A.hi-B.hi:null,pts,1)),
      card(T('Days in the lead','領先天數'),tot?String(Math.round(la/tot*100)):'—',tot?'%':'','',tot?T(la+' of '+tot+' days',tot+' 天中的 '+la+' 天'):'')
    ];
    var rowB=[
      card(T('XIRR','XIRR'),bigPct(C.xb),C.xb==null?'':'%',colorOf(C.xb),T('Annualized.','年化')),
      card(T('Return to date','累計報酬率'),pctTxt(C.rb[last],1),C.rb[last]==null?'':'%',colorOf(C.rb[last]),'&nbsp;'),
      card(T('Value per $1 invested','每投入 1 美元現值'),C.wb==null?'—':'$'+C.wb.toFixed(3),'','','&nbsp;'),
      card(T('Lowest point so far','目前最低點'),pctTxt(B.lo,1),B.lo==null?'':'%',colorOf(B.lo),'&nbsp;'),
      card(T('Highest point so far','目前最高點'),pctTxt(B.hi,1),B.hi==null?'':'%',colorOf(B.hi),'&nbsp;'),
      card(T('Days in the lead','領先天數'),tot?String(Math.round(lb/tot*100)):'—',tot?'%':'','',tot?T(lb+' of '+tot+' days',tot+' 天中的 '+lb+' 天'):'')
    ];
    return [rowA,rowB];
  }
  function cardHtml(x){return '<div class="rm-card"><div class="rm-lb">'+x.l+'</div><div class="rm-num"'+(x.c?' style="--c:'+x.c+'"':'')+'><span class="rm-v">'+x.v+'</span><span class="rm-u">'+x.u+'</span></div><div class="rm-nt">'+x.n+'</div></div>'}
  function buildMagnets(){
    var r=rows(),ra=$('rc-railA'),rb=$('rc-railB'),dots=$('rc-dots'),prev=$('rc-prev'),next=$('rc-next'),lock=false,d='',i;
    ra.innerHTML=r[0].map(cardHtml).join('');rb.innerHTML=r[1].map(cardHtml).join('');
    for(i=0;i<r[0].length;i++)d+='<span class="rm-dot'+(i===0?' on':'')+'"></span>';dots.innerHTML=d;
    function step(){var c=ra.children;return c.length>1?c[1].offsetLeft-c[0].offsetLeft:260}
    function sync(){
      var idx=Math.round(ra.scrollLeft/step()),n=ra.children.length;if(idx<0)idx=0;if(idx>n-1)idx=n-1;
      Array.prototype.forEach.call(dots.children,function(el,k){el.className='rm-dot'+(k===idx?' on':'')});
      prev.disabled=ra.scrollLeft<=2;next.disabled=ra.scrollLeft+ra.clientWidth>=ra.scrollWidth-2;
    }
    /* the two rows move together so every column stays lined up */
    function link(from,to){from.addEventListener('scroll',function(){if(lock)return;lock=true;to.scrollLeft=from.scrollLeft;window.requestAnimationFrame(function(){lock=false;sync()})},{passive:true})}
    link(ra,rb);link(rb,ra);
    prev.onclick=function(){ra.scrollBy({left:-step()*2,behavior:'smooth'})};
    next.onclick=function(){ra.scrollBy({left:step()*2,behavior:'smooth'})};
    sync();
  }

  function render(j){
    if(!j||!j.cmp||!j.cmp.ra||!j.cmp.rb||!j.dates||j.cmp.ra.length!==j.dates.length)return;
    D=j;C=j.cmp;
    days=j.dates.map(function(s){return Math.round((new Date(s+'T12:00:00Z')-new Date(j.start+'T12:00:00Z'))/864e5)});
    gap=C.ra.map(function(v,i){return (v!=null&&C.rb[i]!=null)?Math.round((v-C.rb[i])*1000)/1000:null});
    sec.hidden=false;
    buildMagnets();wire('rc-svg1');wire('rc-svg2');drawAll();
    if(window.ResizeObserver){new ResizeObserver(function(){drawAll()}).observe($('rc-box1'));new ResizeObserver(function(){drawAll()}).observe($('rc-box2'))}
    else window.addEventListener('resize',drawAll);
  }
  if(window.dcaRealAccount)render(window.dcaRealAccount);
  else document.addEventListener('dcaRealAccount',function(e){render(e.detail)});
})();
