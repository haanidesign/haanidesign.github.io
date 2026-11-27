/* 本棚の 本を 押すと、本が ひらいて めくれる（右とじ） */
(function(){
  var rd = document.getElementById('reader'); if(!rd) return;
  var book = rd.querySelector('.r-book'), no = rd.querySelector('.r-no');
  var bNext = rd.querySelector('.r-next'), bPrev = rd.querySelector('.r-prev');
  var pages = [], leaves = [], at = 0, single = false, one = null;
  function img(src){ return '<img src="' + src + '" alt="" draggable="false">'; }
  function build(){
    single = matchMedia('(max-width:700px)').matches;
    rd.classList.toggle('single', single);
    book.innerHTML = '';
    var base = document.createElement('div'); base.className = 'r-base r'; base.innerHTML = img(pages[0]); book.appendChild(base);
    var lbase = document.createElement('div'); lbase.className = 'r-base'; lbase.style.left = '0'; book.appendChild(lbase);
    leaves = [];
    var n = Math.ceil((pages.length - 1) / 2);
    for(var i = 0; i < n; i++){
      var lf = document.createElement('div'); lf.className = 'leaf';
      lf.innerHTML = '<div class="fr">' + img(pages[2*i+1]) + '</div><div class="bk">' + (pages[2*i+2] ? img(pages[2*i+2]) : '') + '</div>';
      book.appendChild(lf); leaves.push(lf);
    }
    one = document.createElement('div'); one.className = 'r-one'; one.innerHTML = img(pages[0]); book.appendChild(one);
    at = 0; show();
  }
  function steps(){ return single ? pages.length - 1 : leaves.length; }
  function show(){
    if(single){
      one.querySelector('img').src = pages[at];
      no.textContent = (at + 1) + ' / ' + pages.length;
    }else{
      leaves.forEach(function(lf, i){
        lf.classList.toggle('on', i < at);
        lf.style.zIndex = i < at ? (i + 1) : (leaves.length - i + 1);
      });
      var a = at * 2, b = Math.min(a + 2, pages.length);
      no.textContent = (a + 1) + (b > a + 1 ? '–' + b : '') + ' / ' + pages.length;
    }
    bNext.disabled = at >= steps(); bPrev.disabled = at <= 0;
  }
  function go(d){ var t = at + d; if(t < 0 || t > steps()) return; at = t; show(); }
  bNext.onclick = function(){ go(1); };
  bPrev.onclick = function(){ go(-1); };
  function close(){ rd.hidden = true; book.innerHTML = ''; document.body.style.overflow = ''; }
  rd.querySelector('.r-x').onclick = close;
  addEventListener('keydown', function(e){
    if(rd.hidden) return;
    if(e.key === 'Escape') close();
    if(e.key === 'ArrowLeft') go(1);   // 右とじなので 左へ 進む
    if(e.key === 'ArrowRight') go(-1);
  });
  var x0 = null;
  rd.addEventListener('touchstart', function(e){ x0 = e.changedTouches[0].clientX; }, {passive:true});
  rd.addEventListener('touchend', function(e){
    if(x0 === null) return; var d = e.changedTouches[0].clientX - x0;
    if(Math.abs(d) > 45) go(d > 0 ? 1 : -1);   // 右へ はらうと 次
    x0 = null;
  }, {passive:true});
  book.addEventListener('click', function(e){
    var r = book.getBoundingClientRect();
    go(e.clientX < r.left + r.width / 2 ? 1 : -1);
  });
  document.querySelectorAll('.book3').forEach(function(b){
    b.addEventListener('click', function(){
      pages = b.dataset.pages.split(',');
      rd.querySelector('.r-title').textContent = b.dataset.title;
      rd.querySelector('.r-link').href = b.dataset.link;
      rd.hidden = false; document.body.style.overflow = 'hidden';
      build();
    });
  });
})();
