const $ = s => document.querySelector(s);
const form = $('#extract-form'), progress = $('#progress'), progressBar = $('#progress-bar'), progressText = $('#progress-text'), progressNumber = $('#progress-number');
let currentResult = null, timer = null;
let bulkJob = null, bulkPoll = null;
const stages = [[8,'Connecting to website…'],[22,'Scanning homepage…'],[40,'Scanning contact pages…'],[58,'Scanning company pages…'],[74,'Searching for emails…'],[88,'Classifying addresses…']];

const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function setProgress(n, text){progressBar.style.width=n+'%';progressNumber.textContent=n+'%';progressText.textContent=text}
function startProgress(){let i=0;progress.classList.remove('hidden');setProgress(...stages[0]);timer=setInterval(()=>{if(i<stages.length-1)setProgress(...stages[++i])},650)}
function stopProgress(){clearInterval(timer);setProgress(100,'Completed');setTimeout(()=>progress.classList.add('hidden'),700)}
function showError(message){$('#error').textContent=message;$('#error').classList.remove('hidden')}

form.addEventListener('submit', async e => {
  e.preventDefault(); $('#error').classList.add('hidden'); $('#results').classList.add('hidden');
  const button=$('#submit'); button.disabled=true; startProgress();
  try{
    const response=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('#url').value,includeThirdParty:$('#third-party').checked})});
    const data=await response.json(); if(!response.ok) throw new Error(data.error||'The scan could not be completed.');
    currentResult=data; renderResults(data); saveHistory(data); stopProgress();
  }catch(error){clearInterval(timer);progress.classList.add('hidden');showError(error.message)}finally{button.disabled=false}
});

function renderResults(data){
  $('#company-name').textContent=data.company; $('#company-url').textContent=data.website; $('#company-url').href=data.website;
  const stats=[['Pages scanned',data.pagesCrawled],['Emails found',data.totalEmailsFound],['Official emails',data.officialEmailsFound],['Root domain',data.rootDomain]];
  $('#stats').innerHTML=stats.map(([l,v])=>`<div class="stat"><b>${escapeHtml(v)}</b><span>${l}</span></div>`).join('');
  $('#email-grid').innerHTML=data.emails.map((item,i)=>`<article class="email-card"><div><span class="badge">${escapeHtml(item.department)} · ${item.official?'Official':'Unverified'}</span><h3>${escapeHtml(item.email)}</h3></div><button class="copy" data-copy="${i}" title="Copy email">⧉</button></article>`).join('');
  $('#empty').classList.toggle('hidden',data.emails.length>0); $('#results').classList.remove('hidden');
  setTimeout(()=>$('#results').scrollIntoView({behavior:'smooth',block:'start'}),150);
}

$('#email-grid').addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;copyText(currentResult.emails[+b.dataset.copy].email,b)});
async function copyText(text,button){await navigator.clipboard.writeText(text);if(button){const old=button.textContent;button.textContent='✓';setTimeout(()=>button.textContent=old,1000)}}
document.querySelector('.actions').addEventListener('click',e=>{const type=e.target.dataset.export;if(!type||!currentResult)return;const rows=currentResult.emails;if(type==='copy')return copyText(rows.map(x=>x.email).join('\n'),e.target);if(type==='json')return download(JSON.stringify(currentResult,null,2),'emails.json','application/json');const csv=['Email,Department,Official',...rows.map(x=>`"${x.email}","${x.department}","${x.official?'Yes':'No'}"`)].join('\r\n');download('\ufeff'+csv,type==='excel'?'emails.xls':'emails.csv',type==='excel'?'application/vnd.ms-excel':'text/csv')});
function download(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

function saveHistory(data){const history=JSON.parse(localStorage.getItem('mailscope-history')||'[]').filter(x=>x.website!==data.website);history.unshift({company:data.company,website:data.website,date:new Date().toISOString(),emails:data.emails.length});localStorage.setItem('mailscope-history',JSON.stringify(history.slice(0,20)));renderHistory()}
function renderHistory(){const history=JSON.parse(localStorage.getItem('mailscope-history')||'[]');$('#history-list').innerHTML=history.length?history.map(x=>`<div class="history-item"><div><b>${escapeHtml(x.company)}</b><span>${escapeHtml(x.website)}</span></div><div><span>${new Date(x.date).toLocaleString()}</span></div><div class="history-count">${x.emails} email${x.emails===1?'':'s'}</div></div>`).join(''):'<div class="empty-history">Your latest scans will appear here.</div>'}
$('#clear-history').addEventListener('click',()=>{localStorage.removeItem('mailscope-history');renderHistory()});
const preferred=localStorage.getItem('mailscope-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=preferred;$('#theme').textContent=preferred==='dark'?'☀':'☾';
$('#theme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('mailscope-theme',next);$('#theme').textContent=next==='dark'?'☀':'☾'});renderHistory();

document.querySelector('.mode-nav').addEventListener('click',e=>{const button=e.target.closest('[data-mode]');if(!button)return;document.querySelectorAll('.mode-nav button').forEach(x=>x.classList.toggle('active',x===button));$('#single-view').classList.toggle('hidden',button.dataset.mode!=='single');$('#bulk-view').classList.toggle('hidden',button.dataset.mode!=='bulk')});
$('#bulk-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;$('#bulk-error').classList.add('hidden');$('#file-card').classList.remove('hidden');$('#file-name').textContent=file.name;$('#file-meta').textContent='Uploading and validating...';const body=new FormData();body.append('file',file);try{const response=await fetch('/api/bulk/upload',{method:'POST',body});const data=await response.json();if(!response.ok)throw new Error(data.error);bulkJob=data;$('#file-meta').textContent=`${data.total.toLocaleString()} unique website${data.total===1?'':'s'} ready`;$('#bulk-controls').classList.remove('hidden');$('#bulk-dashboard').classList.remove('hidden');renderBulk(data)}catch(error){$('#bulk-error').textContent=error.message;$('#bulk-error').classList.remove('hidden');$('#file-meta').textContent='Upload failed'}});
$('#remove-file').addEventListener('click',()=>{if(bulkJob&&!['completed','cancelled'].includes(bulkJob.state))fetch(`/api/bulk/${bulkJob.id}/cancel`,{method:'POST'});bulkJob=null;clearInterval(bulkPoll);$('#bulk-file').value='';$('#file-card').classList.add('hidden');$('#bulk-controls').classList.add('hidden');$('#bulk-dashboard').classList.add('hidden')});
async function bulkAction(action){if(!bulkJob)return;const response=await fetch(`/api/bulk/${bulkJob.id}/${action}`,{method:'POST'});const data=await response.json();if(!response.ok)return showBulkError(data.error);bulkJob=data;renderBulk(data);if(['start','resume'].includes(action))startBulkPoll()}
$('#bulk-start').addEventListener('click',()=>bulkAction('start'));$('#bulk-pause').addEventListener('click',()=>bulkAction('pause'));$('#bulk-resume').addEventListener('click',()=>bulkAction('resume'));$('#bulk-cancel').addEventListener('click',()=>bulkAction('cancel'));
function startBulkPoll(){clearInterval(bulkPoll);bulkPoll=setInterval(async()=>{if(!bulkJob)return;try{const response=await fetch(`/api/bulk/${bulkJob.id}/status`);bulkJob=await response.json();renderBulk(bulkJob);if(['completed','cancelled','error'].includes(bulkJob.state))clearInterval(bulkPoll)}catch{}},900)}
function renderBulk(job){$('#bulk-state').textContent=job.state==='ready'?'Ready to start':job.state;$('#bulk-counter').textContent=`Website ${job.processed.toLocaleString()} of ${job.total.toLocaleString()}`;$('#bulk-percent').textContent=job.percent+'%';$('#bulk-progress-bar').style.width=job.percent+'%';const stats=[['Total websites',job.total],['Processed',job.processed],['Success',job.success],['Failed',job.failed],['Emails found',job.emails],['Phones found',job.phones],['Time remaining',formatTime(job.remainingSeconds)]];$('#bulk-stats').innerHTML=stats.map(([l,v])=>`<div class="bulk-stat"><b>${typeof v==='number'?v.toLocaleString():v}</b><span>${l}</span></div>`).join('');$('#bulk-start').disabled=job.state!=='ready';$('#bulk-pause').disabled=job.state!=='running';$('#bulk-resume').disabled=job.state!=='paused';$('#bulk-download').classList.toggle('disabled',!job.outputReady);$('#bulk-download').href=job.outputReady?`/api/bulk/${job.id}/download`:'';if(job.error)showBulkError(job.error)}
function formatTime(seconds){if(!seconds)return '-';const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}h ${m}m`:m?`${m}m ${s}s`:`${s}s`}
function showBulkError(message){$('#bulk-error').textContent=message;$('#bulk-error').classList.remove('hidden')}
