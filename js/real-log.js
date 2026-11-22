/* Real Money page: third row of key numbers, "The experiment, in numbers".
   Reads "cmp.st" (written by the Proxy job) plus the daily gap, and fills the third rail under the head-to-head rows.
   It stays hidden until "cmp.st" exists. It scrolls on its own; only the two comparison rows are linked to each other. */
(function(){
  var rail=document.getElementById('rc-railC'),tag=document.getElementById('rc-tagC');
  if(!rail||!tag) return;
  var ZHL=(window.DCA_LANG==='zh'),MINUS='−',UP='var(--up)',DN='var(--down)';
  function T(en,zh){return ZHL?zh:en}
  function sgn(v,d){return (v<0?MINUS:'+')+Math.abs(v).toFixed(d)}
  function fmtDate(s){return new Date(s+'T12:00:00Z').toLocaleDateString(ZHL?'zh-TW':'en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
  function card(l,v,u,c,note){return '<div class="rm-card"><div class="rm-lb">'+l+'</div><div class="rm-num"'+(c?' style="--c:'+c+'"':'')+'><span class="rm-v">'+v+'</span><span class="rm-u">'+u+'</span></div><div class="rm-nt">'+note+'</div></div>'}

  function render(j){
    var C=j&&j.cmp,st=C&&C.st;
    if(!st||!st.n||!st.ot||!C.ra||!C.rb||C.ra.length!==j.dates.length)return;
    var n=C.ra.length,last=n-1,miss=st.n-st.ok,out=[];
    function g(i){return (C.ra[i]!=null&&C.rb[i]!=null)?C.ra[i]-C.rb[i]:null}
    var gn=g(last),g0=g(Math.max(0,last-5)),gd=(gn!=null&&g0!=null)?gn-g0:null,bp=Math.round(st.bo/st.ot*100);

    out.push(card(T('Orders placed','成功下單天數'),String(st.ok),T(' / '+st.n,' / '+st.n+' 天'),'',
      miss>0?T(miss+(miss>1?' days':' day')+' missed','漏單 '+miss+' 天'):T('None missed','沒有漏單')));
    out.push(card(T('Boosted orders','加碼次數佔比'),String(bp),'%','',T(st.bo+' of '+st.ot+' orders',st.ot+' 筆中 '+st.bo+' 筆')));
    if(st.mxt)out.push(card(T('Biggest boost','最大單日加碼'),'+'+Math.round((st.mx-1)*100),'%','',st.mxt+T(', ','，')+fmtDate(st.mxd)));
    if(gd!=null)out.push(card(T('Gap this week','本週差距變化'),(gd<0?MINUS:'+')+Math.abs(gd).toFixed(2),'%',gd<0?DN:UP,
      T('From '+sgn(g0,2)+'% to '+sgn(gn,2)+'%','從 '+sgn(g0,2)+'% 到 '+sgn(gn,2)+'%')));
    if(st.lt)out.push(card(T('Lower average cost','平均成本較低的資產'),String(st.lc),T(' of '+st.lt,' / '+st.lt+' 檔'),'',T('vs. traditional DCA','相較傳統 DCA')));
    var rm=C.rm;
    if(rm&&rm.length===n&&rm[last]!=null&&C.ra[last]!=null){
      var vd=C.ra[last]-rm[last];
      out.push(card(T('Vs. the S&P 500','對比 S&P 500'),(vd<0?MINUS:'+')+Math.abs(vd).toFixed(2),'%',vd<0?DN:UP,T('S&P 500: ','S&P 500：')+sgn(rm[last],2)+'%'));
    }
    rail.innerHTML=out.join('');rail.hidden=tag.hidden=false;
  }

  if(window.dcaRealAccount)render(window.dcaRealAccount);
  else document.addEventListener('dcaRealAccount',function(e){render(e.detail)});
})();
