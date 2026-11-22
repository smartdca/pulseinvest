/* Real Money page: third row of key numbers, "The experiment, in numbers".
   Reads "cmp.st" (written by the Proxy job) plus the daily gap, and fills the third rail under the head-to-head rows.
   It stays hidden until "cmp.st" exists. It scrolls together with the two rows above so every column lines up. */
(function(){
  var rail=document.getElementById('rc-railC'),tag=document.getElementById('rc-tagC'),ra=document.getElementById('rc-railA');
  if(!rail||!tag||!ra) return;
  var ZHL=(window.DCA_LANG==='zh'),MINUS='−',UP='var(--up)',DN='var(--down)';
  function T(en,zh){return ZHL?zh:en}
  function sgn(v,d){return (v<0?MINUS:'+')+Math.abs(v).toFixed(d)}
  function fmtDate(s){return new Date(s+'T12:00:00Z').toLocaleDateString(ZHL?'zh-TW':'en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
  function card(l,v,u,c,note){return '<div class="rm-card"><div class="rm-lb">'+l+'</div><div class="rm-num"'+(c?' style="--c:'+c+'"':'')+'><span class="rm-v">'+v+'</span><span class="rm-u">'+u+'</span></div><div class="rm-nt">'+note+'</div></div>'}

  function render(j){
    var C=j&&j.cmp,st=C&&C.st;
    if(!st||!st.n||!st.ot||!C.ra||!C.rb||C.ra.length!==j.dates.length)return;
    var n=C.ra.length,last=n-1,pts=T(' pts',' 個百分點'),miss=st.n-st.ok,out=[];
    function g(i){return (C.ra[i]!=null&&C.rb[i]!=null)?C.ra[i]-C.rb[i]:null}
    var gn=g(last),g0=g(Math.max(0,last-5)),gd=(gn!=null&&g0!=null)?gn-g0:null,bp=Math.round(st.bo/st.ot*100);

    out.push(card(T('Orders placed','成功下單天數'),String(st.ok),T(' / '+st.n,' / '+st.n+' 天'),'',
      miss>0?T(miss+(miss>1?' days':' day')+' missed. We report misses as they happen.','有 '+miss+' 天沒下成單，我們照實公開。')
            :T('Every trading day filled.','每個交易日都下單成功。')));
    out.push(card(T('Boosted orders','加碼次數佔比'),String(bp),'%','',
      T(st.bo+' of '+st.ot+' orders went above the base amount.',st.ot+' 筆下單中，有 '+st.bo+' 筆高於基本金額。')));
    if(st.mxt)out.push(card(T('Biggest boost','最大單日加碼'),'+'+Math.round((st.mx-1)*100),'%','',
      st.mxt+T(', ','，')+fmtDate(st.mxd)+T(': '+st.mx+'× the base amount.','：基本金額的 '+st.mx+' 倍。')));
    if(gd!=null)out.push(card(T('Gap this week','本週差距變化'),(gd<0?MINUS:'+')+Math.abs(gd).toFixed(2),pts,gd<0?DN:UP,
      T('Now '+sgn(gn,2)+' pts, five trading days ago '+sgn(g0,2)+'.','目前 '+sgn(gn,2)+' 個百分點，五個交易日前 '+sgn(g0,2)+'。')));
    if(st.lt)out.push(card(T('Lower average cost','平均成本較低的資產'),String(st.lc),T(' of '+st.lt,' / '+st.lt+' 檔'),'',
      T('Assets bought at a lower average cost than traditional DCA.','平均買進成本低於傳統 DCA 的資產數。')));

    var rm=C.rm;
    if(rm&&rm.length===n&&rm[last]!=null&&C.ra[last]!=null){
      var vd=C.ra[last]-rm[last];
      out.push(card(T('Versus the S&P 500','對比大盤 S&P 500'),(vd<0?MINUS:'+')+Math.abs(vd).toFixed(2),pts,vd<0?DN:UP,
        T('Same days, same daily amount into the S&P 500: '+sgn(rm[last],2)+'%.','同樣日期、同樣每日金額投入 S&P 500：'+sgn(rm[last],2)+'%。')));
    }
    rail.innerHTML=out.join('');rail.hidden=tag.hidden=false;
    link();
  }

  var linked=false,lock=false;
  function link(){
    if(linked)return;linked=true;
    function follow(from,to){from.addEventListener('scroll',function(){if(lock)return;lock=true;to.scrollLeft=from.scrollLeft;window.requestAnimationFrame(function(){lock=false})},{passive:true})}
    follow(ra,rail);follow(rail,ra);
  }

  if(window.dcaRealAccount)render(window.dcaRealAccount);
  else document.addEventListener('dcaRealAccount',function(e){render(e.detail)});
})();
