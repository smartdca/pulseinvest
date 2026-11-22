/* Real Money page: "Weekly log". One tile per week (green up, red down, three shades by size),
   and under the tiles the selected week's X card and post, newest week selected by default.
   Reads /week/index.json (written by the weekly Proxy job, one entry per week) and stays hidden until it exists. */
(function(){
  var sec=document.getElementById('weekly-log'); if(!sec) return;
  var ZHL=(window.DCA_LANG==='zh'),MINUS='−',COLS=13;
  function T(en,zh){return ZHL?zh:en}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function sgn(v){return (v<0?MINUS:'+')+Math.abs(v).toFixed(2)}
  /* three shades per side: under 1, 1 to 3, 3 and above (percent change in return over the week) */
  function lvl(c){var a=Math.abs(c);return a<1?1:a<3?2:3}
  var MON={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  var X_PROFILE='https://x.com/DCA_cafe';
  function rng(r){return ZHL?String(r).replace(/([A-Z][a-z]{2}) (\d+)/g,function(m,a,b){return MON[a]?MON[a]+'/'+b:m}):r}
  var items=[],sel=-1;

  function tiles(){
    var out='',lastYear='',n=items.length,rows={},k;
    items.forEach(function(e,i){
      var y=e.w.slice(0,4);(rows[y]=rows[y]||[]).push(i);
    });
    Object.keys(rows).sort().forEach(function(y){
      var idx=rows[y],pad=(COLS-idx.length%COLS)%COLS;
      out+='<div class="wk-yr">'+y+'</div><div class="wk-grid">';
      idx.forEach(function(i){
        var e=items[i],c=e.c,cl=(c<0?'dn':'up')+lvl(c);
        out+='<button type="button" class="wk-t '+cl+(i===sel?' sel':'')+'" data-i="'+i+'" aria-label="'+esc(rng(e.r))+', '+sgn(c)+'%"'+(i===sel?' aria-pressed="true"':' aria-pressed="false"')+'></button>';
      });
      for(k=0;k<pad;k++)out+='<span class="wk-t e" aria-hidden="true"></span>';
      out+='</div>';
    });
    $('wk-tiles').innerHTML=out;
  }
  function detail(){
    var e=items[sel];if(!e)return;
    var c=e.c;
    $('wk-det').innerHTML=
      '<div class="wk-meta"><span class="wk-range">'+esc(rng(e.r))+'</span><span class="wk-chg '+(c<0?'dn':'up')+'">'+sgn(c)+'%</span></div>'+
      '<img class="wk-img" src="'+esc(e.i)+'" width="1200" height="630" loading="lazy" alt="'+esc(e.h)+'">'+
      '<p class="wk-post">'+esc(ZHL&&e.pz?e.pz:e.p)+'</p>'+
      '<a class="wk-open" href="'+esc(e.x||X_PROFILE)+'" target="_blank" rel="noopener">'+(e.x?T('See it on X','到 X 看這則貼文'):T('Follow us on X','在 X 追蹤我們'))+' &rarr;</a>';
  }
  function pick(i){sel=i;tiles();detail()}
  function render(list){
    if(!Array.isArray(list)||!list.length)return;
    items=list.filter(function(e){return e&&e.w&&typeof e.c==='number'&&e.i&&e.u&&e.p}).sort(function(a,b){return a.w<b.w?-1:1});
    if(!items.length)return;
    $('wk-count').textContent=T(items.length+(items.length>1?' weeks so far':' week so far'),'已累積 '+items.length+' 週');
    sel=items.length-1;tiles();detail();
    $('wk-tiles').addEventListener('click',function(ev){
      var b=ev.target.closest?ev.target.closest('.wk-t[data-i]'):null;
      if(b)pick(+b.getAttribute('data-i'));
    });
    sec.hidden=false;
  }
  fetch('/week/index.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(render).catch(function(){});
})();
