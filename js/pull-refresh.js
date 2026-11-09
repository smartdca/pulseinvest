/* 下拉重新整理（共用）：iOS Safari / 加到主畫面的 PWA 都沒有原生下拉更新，要自己用 touch 事件做。
   規則與首頁相同：頁面捲到最上面才會觸發；距離 110px、至少拖 300ms 才算數（避免快速滑過去誤觸）。
   這支自己建立轉圈圈、自己塞樣式，不依賴任何 CSS 檔。需要時在頁面最後面加：
   <script src="/js/pull-refresh.js?v=版號"></script>
   重新整理＝帶一個 refresh 參數重新載入「目前這個網址」，所以中英文頁面各自留在原本的語言。 */
(function(){
  if(window.__dcaPtr) return; window.__dcaPtr=true;
  var THRESHOLD=110, MAX=150, MIN_MS=300;
  var el=document.createElement('div');
  el.id='ptrIndicator';
  el.setAttribute('aria-hidden','true');
  el.style.cssText='position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;width:36px;height:36px;margin-left:-18px;background:#fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(-40px);z-index:9999;pointer-events:none';
  el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c8813a" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>';
  var st=document.createElement('style');
  st.textContent='@keyframes dcaPtrSpin{to{transform:rotate(360deg)}}#ptrIndicator.spinning svg{animation:dcaPtrSpin .7s linear infinite}';
  document.head.appendChild(st);
  document.body.appendChild(el);
  var startY=0,startX=0,startT=0,pulling=false,triggered=false;
  function reset(){
    el.style.transition='opacity .2s ease, transform .2s ease';
    el.style.opacity=0;el.style.transform='translateY(-40px) rotate(0deg)';el.classList.remove('spinning');
    setTimeout(function(){el.style.transition=''},220);
  }
  document.addEventListener('touchstart',function(e){
    if(window.scrollY<=0&&!el.classList.contains('spinning')&&e.touches.length===1){
      startY=e.touches[0].clientY;startX=e.touches[0].clientX;startT=Date.now();pulling=true;triggered=false;
    }else pulling=false;
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!pulling)return;
    var dy=e.touches[0].clientY-startY,dx=e.touches[0].clientX-startX;
    if(Math.abs(dx)>Math.abs(dy)){pulling=false;reset();return}  /* 橫向滑（磁鐵）不算下拉 */
    if(dy>0&&window.scrollY<=0){
      var pull=Math.min(dy,MAX);
      el.style.transition='';el.style.opacity=Math.min(pull/THRESHOLD,1);
      el.style.transform='translateY('+(pull-30)+'px) rotate('+(pull*3)+'deg)';
      triggered=pull>=THRESHOLD;
    }else{pulling=false;reset()}
  },{passive:true});
  document.addEventListener('touchend',function(){
    if(!pulling)return;pulling=false;
    if(triggered&&(Date.now()-startT)>=MIN_MS){
      el.style.transition='transform .15s ease';el.style.opacity=1;el.style.transform='translateY(20px) rotate(0deg)';el.classList.add('spinning');
      setTimeout(function(){
        var u=new URL(location.href);u.searchParams.set('refresh',Date.now());location.replace(u.toString());
      },200);
    }else reset();
  },{passive:true});
  document.addEventListener('touchcancel',function(){if(pulling){pulling=false;reset()}},{passive:true});
})();
