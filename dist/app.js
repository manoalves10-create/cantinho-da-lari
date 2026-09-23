/* Cantinho de Estudos da Lari: questões, biblioteca e Tutor IA com Gemini */
const DB_NAME='cantinho-da-lari-v1';
const DB_VERSION=1;
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={
  view:'overview',
  questions:[],
  articles:[],
  attempts:[],
  dataset:'demo',
  filter:{query:'',topic:'Todos',type:'multiple'},
  libraryFilter:{query:'',category:'Todas'},
  question:null,
  selected:null,
  submitted:false,
  openText:'',
  showModel:false,
  profile:{name:'Lari',goal:10,minutes:45,exam:''},
  geminiKey:localStorage.getItem('lari-gemini-key')||'',
  time:{},
  db:null
};

const views={
  overview:'Visão geral',
  practice:'Resolver questões',
  errors:'Caderno de erros',
  library:'Biblioteca de Artigos',
  results:'Resultados',
  history:'Histórico',
  settings:'Meu plano e dados'
};

function dbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('attempts'))db.createObjectStore('attempts',{keyPath:'id'});
      if(!db.objectStoreNames.contains('content'))db.createObjectStore('content',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function dbGetAll(name){return new Promise((resolve,reject)=>{const req=state.db.transaction(name,'readonly').objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbGet(name,key){return new Promise((resolve,reject)=>{const req=state.db.transaction(name,'readonly').objectStore(name).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbPut(name,value){return new Promise((resolve,reject)=>{const req=state.db.transaction(name,'readwrite').objectStore(name).put(value);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}
function dbClear(name){return new Promise((resolve,reject)=>{const req=state.db.transaction(name,'readwrite').objectStore(name).clear();req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}

const currentAttempts=()=>state.attempts.filter(a=>a.dataset===state.dataset);
function keyDay(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function monday(date=new Date()){const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());d.setDate(d.getDate()-(d.getDay()+6)%7);return d;}
function weekKey(date=new Date()){return keyDay(monday(date));}
function inCurrentWeek(a){return weekKey(new Date(a.at))===weekKey();}
function firstAttempts(attempts=currentAttempts()){const seen=new Set();return [...attempts].sort((a,b)=>a.at.localeCompare(b.at)).filter(a=>{if(seen.has(a.questionId))return false;seen.add(a.questionId);return true;});}
function objectiveFirst(){return firstAttempts().filter(a=>a.type==='multiple');}
function answeredIds(){return new Set(firstAttempts().map(a=>a.questionId));}
function unresolvedErrors(){const byQuestion=new Map();for(const a of currentAttempts().sort((a,b)=>a.at.localeCompare(b.at)))byQuestion.set(a.questionId,a);return [...byQuestion.values()].filter(a=>a.correct===false).map(a=>({attempt:a,question:state.questions.find(q=>q.id===a.questionId)})).filter(x=>x.question);}
function pct(part,total){return total?`${(part/total*100).toFixed(1).replace('.',',')}%`:'—';}
function fmtDate(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
function fmtTime(sec){const m=Math.floor(sec/60);return m>=60?`${Math.floor(m/60)} h ${m%60} min`:`${m} min`;}

function notice(){
  return state.dataset==='demo'
    ? '<div class="demo-note"><span aria-hidden="true">◈</span><span><strong>Modo de configuração:</strong> Questões e artigos de demonstração ativos. Os materiais completos podem ser carregados a qualquer momento.</span></div>'
    : '';
}

function header(title,subtitle,action=''){
  return `<div class="page-heading"><div><p class="eyebrow">CANTINHO DA LARI / FITOPLÂNCTON</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function sourceLink(q){
  const u=q.source?.url;
  return u&&/^https:\/\//.test(u)
    ? `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(q.source.title||'Abrir fonte')} ↗</a>`
    : `<span>${escapeHTML(q.source?.title||'Material da disciplina')}${q.source?.locator?' · '+escapeHTML(q.source.locator):''}</span>`;
}

function renderOverview(){
  const first=firstAttempts(),week=first.filter(inCurrentWeek),objWeek=objectiveFirst().filter(inCurrentWeek),correct=objWeek.filter(a=>a.correct).length,goal=Math.max(1,Number(state.profile.goal)||10),miss=unresolvedErrors();
  const topicItems=[...new Set(state.questions.map(q=>q.topic))].map(t=>{
    const qs=new Set(state.questions.filter(q=>q.topic===t).map(q=>q.id)),all=objectiveFirst().filter(a=>qs.has(a.questionId));
    return {name:t,done:all.length,right:all.filter(a=>a.correct).length};
  }).filter(t=>t.done).sort((a,b)=>a.right/a.done-b.right/b.done).slice(0,4);
  const mins=Object.entries(state.time).filter(([d])=>weekKey(new Date(d+'T12:00:00'))===weekKey()).reduce((s,[,v])=>s+v,0);

  return `${header(`Olá${state.profile.name?', '+escapeHTML(state.profile.name):''}.`,`Seu estudo de Fitoplâncton com foco e acompanhamento.`,`<button class="btn" data-action="start">Resolver questões <span aria-hidden="true">→</span></button>`)}${notice()}
  <div class="overview-grid">
    <section class="feature panel">
      <p class="eyebrow">ESTUDO ATIVO</p>
      <h2>${miss.length?'Revise um ponto que ficou em aberto.':'Consulte artigos ou converse com o Tutor IA.'}</h2>
      <p>${miss.length?`Você tem ${miss.length}${miss.length===1?'questão pendente':'questões pendentes'} no caderno de erros.`:'Faça pesquisas na Biblioteca ou abra o chat para raciocinar e sintetizar respostas com o Tutor IA.'}</p>
      <button class="btn" data-action="${miss.length?'go-errors':'go-library'}">${miss.length?'Abrir caderno de erros':'Explorar biblioteca de artigos'} →</button>
    </section>
    <section class="goal-card panel">
      <div class="card-top"><span class="label">META DA SEMANA</span><span class="badge">${Math.min(100,Math.round(week.length/goal*100))}%</span></div>
      <h2>${week.length}<span> / ${goal} questões</span></h2>
      <p>Primeiras tentativas nesta semana</p>
      <div class="progress-track"><i style="width:${Math.min(100,week.length/goal*100)}%"></i></div>
      <div class="goal-footer"><span>${Math.max(0,goal-week.length)} para concluir</span><span>Meta ajustável</span></div>
    </section>
  </div>
  <div class="stats-grid">
    <section class="stat panel"><span class="label">ACERTOS NA SEMANA</span><strong>${pct(correct,objWeek.length)}</strong><small>${correct} de ${objWeek.length} objetivas inéditas</small></section>
    <section class="stat panel"><span class="label">QUESTÕES FEITAS</span><strong>${first.length}</strong><small>Primeiras tentativas no total</small></section>
    <section class="stat panel"><span class="label">ARTIGOS CADASTRADOS</span><strong>${state.articles.length}</strong><small>Disponíveis para pesquisa e IA</small></section>
    <section class="stat panel"><span class="label">TEMPO ATIVO</span><strong>${fmtTime(mins)}</strong><small>Página visível nesta semana</small></section>
  </div>
  <div class="split-grid">
    <section class="section-panel panel">
      <div class="section-head"><h2>Desempenho por assunto</h2><button class="text-link" data-action="go-results">Ver resultados →</button></div>
      ${topicItems.length?topicItems.map(t=>`<div class="topic-row"><b>${escapeHTML(t.name)}</b><div class="progress-track"><i style="width:${t.right/t.done*100}\%"></i></div><em>${pct(t.right,t.done)}</em></div>`).join(''):'<p class="empty-message">Ao resolver questões objetivas, você verá os acertos em cada assunto.</p>'}
    </section>
    <section class="section-panel panel">
      <div class="section-head"><h2>Retomar a leitura</h2><button class="text-link" data-action="go-errors">Caderno de erros →</button></div>
      <div class="review-list">
        ${miss.length?miss.slice(0,3).map(x=>`<div class="review-item"><strong>${escapeHTML(x.question.topic)} · ${escapeHTML(x.question.prompt)}</strong><small>${escapeHTML(x.question.reading||'Revise a explicação da questão.')}</small></div>`).join(''):'<p class="empty-message">As leituras recomendadas para questões erradas aparecem aqui.</p>'}
      </div>
    </section>
  </div>`;
}

function filteredArticles(){
  const f=state.libraryFilter,q=f.query.trim().toLowerCase();
  return state.articles.filter(a=>{
    const matchCat = f.category==='Todas' || a.categoria===f.category;
    const matchQuery = !q || (
      a.titulo.toLowerCase().includes(q) ||
      a.resumo.toLowerCase().includes(q) ||
      a.categoria.toLowerCase().includes(q) ||
      (a.palavras_chave && a.palavras_chave.some(k=>k.toLowerCase().includes(q)))
    );
    return matchCat && matchQuery;
  });
}

function renderLibrary(){
  const categories=['Todas',...new Set(state.articles.map(a=>a.categoria))];
  const list=filteredArticles();

  return `${header('Biblioteca & Artigos de Fitoplâncton','Pesquise por conceitos, estruturas morfológicas, autores e florações.')}${notice()}
  <div class="toolbar">
    <input class="field search-field" type="search" id="article-search" placeholder="Pesquisar por frústula, sílica, maré vermelha, Alexandrium..." value="${escapeHTML(state.libraryFilter.query)}" aria-label="Pesquisar artigos" />
    <select class="field" id="article-category-filter" aria-label="Filtrar por categoria">
      ${categories.map(c=>`<option value="${escapeHTML(c)}" ${state.libraryFilter.category===c?'selected':''}>${escapeHTML(c==='Todas'?'Todas as categorias':c)}</option>`).join('')}
    </select>
  </div>
  <div class="filters-foot">
    <span>${list.length} ${list.length===1?'artigo/resumo encontrado':'artigos/resumos encontrados'}</span>
    <span>Dica: Use palavras-chave para encontrar trechos exatos</span>
  </div>
  ${list.length?`
    <div class="articles-list">
      ${list.map(a=>`
        <article class="article-card panel">
          <div class="article-header">
            <h2>${escapeHTML(a.titulo)}</h2>
            <span class="badge">${escapeHTML(a.categoria)}</span>
          </div>
          <div class="article-source">Fonte: ${escapeHTML(a.autor_fonte)}</div>
          <div class="article-body">${escapeHTML(a.resumo)}</div>
          <div class="article-keywords">
            ${(a.palavras_chave||[]).map(k=>`<span class="keyword-tag">#${escapeHTML(k)}</span>`).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `:`
    <div class="empty-state panel">
      <h2>Nenhum resultado encontrado para "${escapeHTML(state.libraryFilter.query)}".</h2>
      <button class="btn light" data-action="clear-library-filter">Limpar busca</button>
    </div>
  `}`;
}

function filteredQuestions(){
  const f=state.filter,q=f.query.trim().toLocaleLowerCase('pt-BR');
  return state.questions.filter(x=>(f.type==='all'||x.type===f.type)&&(f.topic==='Todos'||x.topic===f.topic)&&(!q||[x.id,x.topic,x.prompt].some(s=>String(s).toLocaleLowerCase('pt-BR').includes(q))));
}

function nextQuestion(review=false){
  const pool=review?unresolvedErrors().map(x=>x.question).filter(q=>filteredQuestions().some(f=>f.id===q.id)):filteredQuestions().filter(q=>!answeredIds().has(q.id));
  if(!pool.length){state.question=null;return;}
  state.question=pool[Math.floor(Math.random()*pool.length)];
  state.selected=null;
  state.submitted=false;
  state.openText='';
  state.showModel=false;
}

function renderPractice(){
  const topics=['Todos',...new Set(state.questions.map(q=>q.topic))],pool=filteredQuestions(),unseen=pool.filter(q=>!answeredIds().has(q.id));
  if(state.question&&!pool.some(q=>q.id===state.question.id))state.question=null;
  if(!state.question&&unseen.length)nextQuestion();
  const q=state.question;
  return `${header('Resolver questões','Busque por número, texto ou assunto. O sorteio usa questões inéditas primeiro.')}${notice()}
  <div class="toolbar">
    <input class="field search-field" type="search" id="question-search" placeholder="Buscar assunto ou questão..." value="${escapeHTML(state.filter.query)}" aria-label="Buscar questão" />
    <select class="field" id="topic-filter" aria-label="Filtrar assunto">${topics.map(t=>`<option value="${escapeHTML(t)}" ${state.filter.topic===t?'selected':''}>${escapeHTML(t==='Todos'?'Todos os assuntos':t)}</option>`).join('')}</select>
    <select class="field" id="type-filter" aria-label="Filtrar tipo"><option value="multiple" ${state.filter.type==='multiple'?'selected':''}>Múltipla escolha</option><option value="open" ${state.filter.type==='open'?'selected':''}>Discursivas</option><option value="all" ${state.filter.type==='all'?'selected':''}>Todos os tipos</option></select>
  </div>
  <div class="filters-foot"><span>${pool.length} ${pool.length===1?'questão encontrada':'questões encontradas'} · ${unseen.length} inéditas</span><span>Revisões ficam no caderno de erros</span></div>
  ${q?`<div class="question-layout">
    <section class="question-card panel">
      <div class="question-meta"><span class="badge">${escapeHTML(q.topic)}</span><span class="badge warm">${escapeHTML(q.difficulty||'Sem nível')}</span><span class="question-id">${escapeHTML(q.id)}</span></div>
      <h2>${escapeHTML(q.prompt)}</h2>${q.type==='multiple'?renderMultiple(q):renderOpen(q)}
    </section>
    <aside class="context-card panel">
      <h3>Sua prática</h3>
      <p>Questões inéditas aparecem antes de repetições. Erros ficam salvos no caderno para revisão.</p>
      <div class="mini-stat"><span>Neste filtro</span><b>${pool.length}</b></div>
      <div class="mini-stat"><span>Ainda inéditas</span><b>${unseen.length}</b></div>
      <div class="mini-stat"><span>Para revisar</span><b>${unresolvedErrors().length}</b></div>
    </aside>
  </div>`:`<div class="empty-state panel"><h2>${pool.length?'Você concluiu as questões inéditas deste filtro.':'Nenhuma questão neste filtro.'}</h2><button class="btn light" data-action="${pool.length?'go-errors':'clear-filter'}">${pool.length?'Revisar erros':'Limpar filtros'}</button></div>`}`;
}

function renderMultiple(q){
  return `<div class="choices" role="group" aria-label="Alternativas">
    ${q.options.map((opt,i)=>`<button type="button" class="choice ${state.selected===i?'selected':''}${state.submitted?(i===q.answer?'correct':state.selected===i?'wrong':''):''}" data-action="choose" data-index="${i}" ${state.submitted?'disabled':''}><span class="choice-letter">${'ABCD'[i]\vert{}\vert{}i+1}</span><span>${escapeHTML(opt)}</span></button>`).join('')}
  </div>
  ${state.submitted?feedback(q,state.selected===q.answer):''}
  <div class="question-actions">
    ${!state.submitted?'<button class="btn" data-action="submit-choice" '+(state.selected===null?'disabled':'')+'>Corrigir resposta</button>':'<button class="btn" data-action="next">Próxima questão →</button>'}
  </div>`;
}

function renderOpen(q){
  return `<textarea class="answer-box" id="open-answer" placeholder="Escreva sua resposta antes de consultar o modelo..." aria-label="Sua resposta" ${state.showModel?'readonly':''}>${escapeHTML(state.openText)}</textarea>
  ${!state.showModel?'<div class="question-actions"><button class="btn" data-action="show-model">Comparar com o modelo</button></div>':`<div class="feedback"><h3>Resposta de referência</h3><p>${escapeHTML(q.model)}</p><p class="reading"><strong>Onde reler:</strong> ${escapeHTML(q.reading)}<br />${sourceLink(q)}</p></div>${state.submitted?'<div class="feedback"><h3>Autoavaliação salva.</h3><p>Veja a nota no histórico.</p></div><div class="question-actions"><button class="btn" data-action="next">Próxima questão →</button></div>':`<div class="model-box"><strong>Autoavaliação</strong><p>Marque os pontos explicados corretamente:</p><div class="self-check">${q.criteria.map((c,i)=>`<label><input type="checkbox" data-criterion="${i}" /><span>${escapeHTML(c)}</span></label>`).join('')}</div><strong id="self-score">0 de 10 pontos</strong></div><div class="question-actions"><button class="btn" data-action="save-open">Salvar autoavaliação</button></div>`}`}`;
}

function feedback(q,correct){
  return `<div class="feedback ${correct?'':'incorrect'}"><h3>${correct?'Você acertou!':'Vale retomar este ponto.'}</h3><p>${escapeHTML(q.explanation)}</p><p class="reading"><strong>Onde reler:</strong> ${escapeHTML(q.reading)}<br />${sourceLink(q)}</p></div>`;
}

function renderErrors(){
  const errors=unresolvedErrors();
  return `${header('Caderno de erros','Cada item guarda a explicação e o caminho de leitura.')}${notice()}
  ${errors.length?`<div class="panel section-panel"><div class="section-head"><h2>${errors.length}${errors.length===1?'questão pendente':'questões pendentes'}</h2><span class="badge warm">Revisão dirigida</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Questão</th><th>Onde reler</th><th>Última tentativa</th><th></th></tr></thead><tbody>${errors.map(({question:q,attempt:a})=>`<tr><td><strong>${escapeHTML(q.prompt)}</strong><small>${escapeHTML(q.topic)} · ${escapeHTML(q.id)}</small></td><td>${escapeHTML(q.reading||'Consulte a explicação.')}</td><td>${fmtDate(a.at)}</td><td><button class="btn light" data-action="retry" data-id="${escapeHTML(q.id)}">Refazer</button></td></tr>`).join('')}</tbody></table></div></div>`:`<div class="empty-state panel"><h2>Nenhuma questão pendente de revisão.</h2><button class="btn" data-action="start">Resolver questões</button></div>`}`;
}

function renderResults(){
  const first=firstAttempts(),objective=objectiveFirst(),right=objective.filter(a=>a.correct).length;
  const byTopic=[...new Set(state.questions.map(q=>q.topic))].map(t=>{const ids=new Set(state.questions.filter(q=>q.topic===t).map(q=>q.id)),a=objective.filter(x=>ids.has(x.questionId));return {topic:t,total:a.length,right:a.filter(x=>x.correct).length};});
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const date=keyDay(d),items=first.filter(a=>keyDay(new Date(a.at))===date);return {date,label:new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d).replace('.',''),total:items.length,right:items.filter(a=>a.correct).length};});
  const totalTime=Object.values(state.time).reduce((a,b)=>a+b,0);

  return `${header('Resultados','Estatísticas das questões objetivas inéditas.')}${notice()}
  <div class="stats-grid">
    <section class="stat panel"><span class="label">ACERTO GERAL</span><strong>${pct(right,objective.length)}</strong><small>${right} de ${objective.length} objetivas</small></section>
    <section class="stat panel"><span class="label">QUESTÕES FEITAS</span><strong>${currentAttempts().length}</strong><small>${first.length} inéditas · ${currentAttempts().length-first.length} revisões</small></section>
    <section class="stat panel"><span class="label">PONTOS A REVER</span><strong>${unresolvedErrors().length}</strong><small>Pendências ativas</small></section>
    <section class="stat panel"><span class="label">TEMPO REGISTRADO</span><strong>${fmtTime(totalTime)}</strong><small>Tempo ativo</small></section>
  </div>
  <div class="split-grid">
    <section class="section-panel panel"><div class="section-head"><h2>Acertos por assunto</h2><span class="label">OBJETIVAS</span></div>${byTopic.filter(t=>t.total).length?byTopic.filter(t=>t.total).map(t=>`<div class="topic-row"><b>${escapeHTML(t.topic)}</b><div class="progress-track"><i style="width:${t.right/t.total*100}%"></i></div><em title="${t.right} de ${t.total}">${pct(t.right,t.total)}</em></div>`).join(''):'<p class="empty-message">Ainda não há respostas.</p>'}</section>
    <section class="section-panel panel"><div class="section-head"><h2>Últimos 7 dias</h2><span class="label">INÉDITAS</span></div><div class="trend">${days.map(d=>`<div class="trend-col"><strong>${d.total||''}</strong><div class="trend-bar" style="height:${Math.max(3,d.total/Math.max(1,...days.map(x=>x.total))*110)}px"></div><span>${d.label}</span></div>`).join('')}</div></section>
  </div>`;
}

function renderHistory(){
  const list=[...currentAttempts()].sort((a,b)=>b.at.localeCompare(a.at));
  return `${header('Histórico','Todas as tentativas registradas neste navegador.')}${notice()}
  ${list.length?`<div class="section-panel panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Quando</th><th>Questão</th><th>Resultado</th><th>Tentativa</th></tr></thead><tbody>${list.map(a=>{const q=state.questions.find(x=>x.id===a.questionId);return `<tr><td>${fmtDate(a.at)}</td><td><strong>${escapeHTML(q?.prompt||a.questionId)}</strong><small>${escapeHTML(q?.topic||'Questão')}</small></td><td><span class="badge ${a.correct?'':'red'}">${a.type==='open'?`${a.score}/10 · autoavaliação`:a.correct?'Acertou':'Errou'}</span></td><td>${a.first?'Primeira':'Revisão'}</td></tr>`;}).join('')}</tbody></table></div></div>`:'<div class="empty-state panel"><h2>Seu histórico começa na primeira resposta.</h2><button class="btn" data-action="start">Começar</button></div>'}`;
}

function renderSettings(){
  return `${header('Meu plano e dados','Ajuste sua meta e configure a inteligência do Tutor IA.')}${notice()}
  <div class="settings-grid">
    <section class="panel">
      <h2>Plano de estudo</h2>
      <div class="form-row"><label for="profile-name">Como prefere ser chamada?</label><input class="field" id="profile-name" maxlength="36" value="${escapeHTML(state.profile.name)}" /></div>
      <div class="form-row"><label for="profile-goal">Questões inéditas por semana</label><input class="field" id="profile-goal" type="number" min="1" max="500" value="${escapeHTML(state.profile.goal)}" /></div>
      <div class="form-row"><label for="profile-minutes">Minutos disponíveis por dia</label><input class="field" id="profile-minutes" type="number" min="5" max="600" value="${escapeHTML(state.profile.minutes)}" /></div>
      <div class="form-row"><label for="profile-exam">Data da prova (opcional)</label><input class="field" id="profile-exam" type="date" value="${escapeHTML(state.profile.exam)}" /></div>
      <button class="btn" data-action="save-profile">Salvar plano</button>
    </section>
    <section class="panel">
      <h2>Inteligência Artificial (Google Gemini)</h2>
      <p>Ligue o Tutor IA aos artigos com raciocínio e síntese em tempo real.</p>
      <div class="form-row">
        <label for="gemini-key-input">Chave de API do Gemini (Google AI Studio)</label>
        <input class="field" id="gemini-key-input" type="password" placeholder="Cole sua chave AIzaSy..." value="${escapeHTML(state.geminiKey)}" />
        <small class="small-print">Esta chave fica guardada exclusivamente neste navegador. É 100% segura e nunca será enviada para o GitHub.</small>
      </div>
      <button class="btn" data-action="save-key">Ativar IA no Tutor</button>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <h2>Conteúdo e backup</h2>
      <p>Banco atual: ${state.questions.length} questões e ${state.articles.length} artigos indexados.</p>
      <button class="btn light" data-action="import">Importar banco de questões (.json)</button>
      <br/><br/>
      <button class="btn ghost" data-action="export">Baixar backup do progresso</button>
    </section>
  </div>`;
}

function render(){
  const app=$('#app-content');if(!app)return;
  app.innerHTML=({overview:renderOverview,practice:renderPractice,errors:renderErrors,library:renderLibrary,results:renderResults,history:renderHistory,settings:renderSettings}[state.view])();
  $('#crumb-current').textContent=views[state.view];
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  $('#nav-count').textContent=state.questions.length;
  $('#active-time').textContent=`◷ ${fmtTime(Object.values(state.time).reduce((a,b)=>a+b,0))}`;
}

function setView(view){
  state.view=view;
  if(view==='practice'){state.question=null;state.selected=null;}
  $('#sidebar').classList.remove('open');
  $('#menu-toggle').setAttribute('aria-expanded','false');
  render();
  $('#app-content').focus({preventScroll:true});
}

async function saveAttempt(data){
  const a={id:crypto.randomUUID(),dataset:state.dataset,questionId:state.question.id,type:state.question.type,at:new Date().toISOString(),first:!answeredIds().has(state.question.id),...data};
  await dbPut('attempts',a);
  state.attempts.push(a);
  render();
}

function toast(s){
  const t=$('#toast');t.textContent=s;t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>t.classList.remove('show'),3500);
}

function safeQuestion(x){
  return x&&typeof x.id==='string'&&typeof x.prompt==='string'&&typeof x.topic==='string'&&['multiple','open'].includes(x.type)&&typeof x.reading==='string'&&x.source&&typeof x.source.title==='string'&&(x.type==='multiple'?Array.isArray(x.options)&&x.options.length>=2&&Number.isInteger(x.answer)&&typeof x.explanation==='string':typeof x.model==='string'&&Array.isArray(x.criteria));
}

async function importQuestions(file){
  if(file.size>5_000_000)throw Error('Arquivo grande demais.');
  const parsed=JSON.parse(await file.text());
  const questions=Array.isArray(parsed)?parsed:parsed.questions;
  if(!Array.isArray(questions)||!questions.length||!questions.every(safeQuestion))throw Error('Banco de questões inválido.');
  state.questions=questions;
  state.dataset=`import-${Date.now()}`;
  await dbPut('content',{key:'questions',dataset:state.dataset,items:questions});
  toast(`${questions.length} questões importadas com sucesso!`);
  state.question=null;
  setView('overview');
}

function downloadBackup(){
  const data={format:'cantinho-da-lari-backup-v1',exportedAt:new Date().toISOString(),dataset:state.dataset,questions:state.questions,attempts:state.attempts,profile:state.profile,time:state.time};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`cantinho-da-lari-backup-${keyDay()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-view]');
  if(nav){setView(nav.dataset.view);return;}
  const b=e.target.closest('[data-action]');
  if(!b)return;
  const action=b.dataset.action;

  try{
    if(action==='start'){setView('practice');return;}
    if(action==='go-errors'){setView('errors');return;}
    if(action==='go-library'){setView('library');return;}
    if(action==='go-results'){setView('results');return;}
    if(action==='clear-filter'){state.filter={query:'',topic:'Todos',type:'multiple'};state.question=null;render();return;}
    if(action==='clear-library-filter'){state.libraryFilter={query:'',category:'Todas'};render();return;}
    if(action==='choose'){state.selected=Number(b.dataset.index);render();return;}
    if(action==='submit-choice'){
      if(state.selected===null)return;
      const correct=state.selected===state.question.answer;
      state.submitted=true;
      await saveAttempt({correct,selected:state.selected});
      return;
    }
    if(action==='next'){state.question=null;nextQuestion();render();return;}
    if(action==='retry'){
      const q=state.questions.find(x=>x.id===b.dataset.id);
      if(!q)return;
      state.filter={query:'',topic:'Todos',type:'all'};
      state.view='practice';state.question=q;state.selected=null;state.submitted=false;state.showModel=false;state.openText='';render();
      return;
    }
    if(action==='show-model'){
      state.openText=$('#open-answer').value.trim();
      if(state.openText.length<20){toast('Escreva uma resposta antes de comparar.');return;}
      state.showModel=true;render();return;
    }
    if(action==='save-open'){
      const checked=[...document.querySelectorAll('[data-criterion]')].filter(el=>el.checked).length;
      state.submitted=true;
      await saveAttempt({correct:checked===3,score:Math.round(checked/3*10),answer:state.openText});
      return;
    }
    if(action==='save-profile'){
      state.profile={name:$('#profile-name').value.trim(),goal:Number($('#profile-goal').value),minutes:Number($('#profile-minutes').value),exam:$('#profile-exam').value};
      localStorage.setItem('lari-profile',JSON.stringify(state.profile));
      toast('Plano atualizado com sucesso.');render();return;
    }
    if(action==='save-key'){
      const val=$('#gemini-key-input').value.trim();
      state.geminiKey=val;
      localStorage.setItem('lari-gemini-key',val);
      toast(val?'Chave ativada! Tutor IA pronto com Gemini.':'Chave removida. Tutor voltou ao modo padrão.');
      render();return;
    }
    if(action==='export'){downloadBackup();return;}
    if(action==='import'){$('#import-input').click();return;}
  }catch(err){console.error(err);toast('Erro ao processar ação.');}
});

document.addEventListener('input',e=>{
  if(e.target.id==='article-search'){
    state.libraryFilter.query=e.target.value;
    render();
    const input=$('#article-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);
  }
  if(e.target.id==='question-search'){
    const start=e.target.selectionStart;state.filter.query=e.target.value;state.question=null;render();
    const input=$('#question-search');input?.focus();input?.setSelectionRange(start,start);
  }
});

document.addEventListener('change',e=>{
  if(e.target.id==='article-category-filter'){state.libraryFilter.category=$('#article-category-filter').value;render();}
  if(e.target.id==='topic-filter'||e.target.id==='type-filter'){state.filter.topic=$('#topic-filter').value;state.filter.type=$('#type-filter').value;state.question=null;render();}
});

$('#import-input')?.addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{await importQuestions(file);}catch(err){toast(err.message||'Falha ao importar.');}
  e.target.value='';
});
$('#menu-toggle')?.addEventListener('click',()=>{
  const open=$('#sidebar').classList.toggle('open');
  $('#menu-toggle').setAttribute('aria-expanded',String(open));
});

/* Tutor IA: Inteligência Real com Gemini API + Contexto dos Artigos */
function appendChatMessage(text,sender='bot'){
  const box=$('#ai-widget-messages');
  if(!box)return null;
  const msg=document.createElement('div');
  msg.className=`ai-bubble ai-${sender}`;
  msg.innerHTML=escapeHTML(text).replace(/\n/g,'<br />');
  box.appendChild(msg);
  box.scrollTop=box.scrollHeight;
  return msg;
}

async function askGemini(query){
  if(!state.geminiKey){
    return `Para ter respostas com raciocínio e síntese completa de IA, ative a chave gratuita do Gemini na aba "Meu plano e dados".\n\n(No momento, estou respondendo com busca textual simples dos artigos cadastrados).`;
  }

  const prompt = `Você é o Tutor de Fitoplâncton no site "Cantinho de Estudos da Lari".
Sua aluna é a Lari, estudante de biologia/oceanografia.
Responda de forma pedagógica, completa, didática e cientificamente precisa em português.
Use prioritariamente os artigos e conceitos cadastrados abaixo como base de conhecimento, mas tenha liberdade para raciocinar, sintetizar, fazer analogias, deduções ecológicas e responder questões hipotéticas ou enunciados inventados:

--- BASE DE ARTIGOS CADASTRADOS ---
${JSON.stringify(state.articles, null, 2)}
------------------------------------

Dúvida ou questão da Lari: "${query}"`;

  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(state.geminiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });

    if(!res.ok){
      const errData = await res.json().catch(()=>({}));
      console.error('Gemini API Error:', errData);
      return `Houve um erro na comunicação com a IA (${res.status}). Verifique se a sua chave do Gemini em "Meu plano e dados" está correta.`;
    }

    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return answer || 'Não obtive uma resposta detalhada. Tente reformular a pergunta!';
  }catch(err){
    console.error(err);
    return 'Falha na conexão com a IA. Verifique sua conexão com a internet.';
  }
}

$('#ai-fab')?.addEventListener('click',()=>{
  const w=$('#ai-widget');
  w.classList.toggle('open');
  w.setAttribute('aria-hidden',String(!w.classList.contains('open')));
  if(w.classList.contains('open')){$('#ai-widget-input')?.focus();}
});

$('#ai-widget-close')?.addEventListener('click',()=>{
  const w=$('#ai-widget');
  w.classList.remove('open');
  w.setAttribute('aria-hidden','true');
});

$('#ai-widget-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const input=$('#ai-widget-input');
  const txt=input.value.trim();
  if(!txt)return;

  appendChatMessage(txt,'user');
  input.value='';

  const loadingBubble = appendChatMessage('Consultando os materiais e raciocinando...','bot');

  const reply = await askGemini(txt);
  if(loadingBubble){
    loadingBubble.innerHTML = escapeHTML(reply).replace(/\n/g,'<br />');
    const box=$('#ai-widget-messages');
    if(box) box.scrollTop=box.scrollHeight;
  }
});

let lastInteraction=Date.now(),lastTick=Date.now(),dirtySeconds=0;
for(const name of ['pointerdown','keydown','scroll'])document.addEventListener(name,()=>{lastInteraction=Date.now();},{passive:true});
function tick(){
  const now=Date.now(),delta=Math.min(1000,Math.max(0,now-lastTick));lastTick=now;
  if(document.visibilityState==='visible'&&document.hasFocus()&&now-lastInteraction<120000){
    const day=keyDay();state.time[day]=(state.time[day]||0)+delta/1000;dirtySeconds+=delta/1000;
    if(dirtySeconds>=15){localStorage.setItem('lari-time',JSON.stringify(state.time));dirtySeconds=0;}
    $('#active-time').textContent=`◷ ${fmtTime(Object.values(state.time).reduce((a,b)=>a+b,0))}`;
  }
}
setInterval(tick,1000);

async function init(){
  try{
    state.db=await dbOpen();
    const [saved,attempts,demoQuestions,demoArticles]=await Promise.all([
      dbGet('content','questions'),
      dbGetAll('attempts'),
      fetch('./questions.json').then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch('./artigos.json').then(r=>r.ok?r.json():[]).catch(()=>[])
    ]);
    state.questions=saved?.items||demoQuestions;
    state.articles=demoArticles||[];
    state.dataset=saved?.dataset||'demo';
    state.attempts=attempts;
    state.profile={...state.profile,...JSON.parse(localStorage.getItem('lari-profile')||'{}')};
    state.time=JSON.parse(localStorage.getItem('lari-time')||'{}');
    render();
  }catch(err){
    console.error(err);
    $('#app-content').innerHTML='<div class="empty-state panel"><h2>Erro ao iniciar a plataforma.</h2><p>Recarregue a página no seu navegador.</p></div>';
  }
}
init();
