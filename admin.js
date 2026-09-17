/* Mr.MR V5.4 — protected admin, leads + project management + notifications */
const config = window.MR_SUPABASE_CONFIG;
const supabaseClient = config && window.supabase?.createClient ? window.supabase.createClient(config.url, config.publishableKey) : null;

const $ = (id) => document.getElementById(id);
const loginView = $('loginView'), resetView = $('resetView'), dashboardView = $('dashboardView');
const loginForm = $('loginForm'), resetForm = $('resetForm');
const loginStatus = $('loginStatus'), resetStatus = $('resetStatus');
const dashboardStatus = $('dashboardStatus'), projectsStatus = $('projectsStatus');
const detailDialog = $('detailDialog'), projectDialog = $('projectDialog'), taskDialog = $('taskDialog'), clientDialog = $('clientDialog');
let inquiries = [], projects = [], clients = [], currentProjectTasks = [], notifications = [], notificationTimer = null, notificationChannel = null;

function setStatus(el, message, type = '') { if (!el) return; el.className = 'status' + (type ? ` ${type}` : ''); el.textContent = message; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatDate(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
function formatShortDate(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(value + 'T00:00:00')); }
function isAdminError(error) { return error?.message?.toLowerCase().includes('permission') || error?.code === '42501'; }
function todayPlus(days) { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d; }

function showLogin() { loginView.hidden=false; resetView.hidden=true; dashboardView.hidden=true; }
function showResetPassword() { loginView.hidden=true; dashboardView.hidden=true; resetView.hidden=false; setStatus(resetStatus,'Create a new password for your Mr.MR admin account.'); }

resetForm?.addEventListener('submit', async e => {
  e.preventDefault(); if (!supabaseClient) return setStatus(resetStatus,'Supabase configuration is missing.','error');
  const password = $('newPassword').value, confirm = $('confirmPassword').value;
  if (password.length < 8) return setStatus(resetStatus,'Password must be at least 8 characters.','error');
  if (password !== confirm) return setStatus(resetStatus,'Passwords do not match.','error');
  const btn = $('resetPasswordButton'); btn.disabled=true; setStatus(resetStatus,'Updating your password…');
  const {error} = await supabaseClient.auth.updateUser({password}); btn.disabled=false;
  if (error) return setStatus(resetStatus,error.message,'error');
  resetForm.reset(); setStatus(resetStatus,'Password updated successfully.','success');
  setTimeout(() => { showLogin(); setStatus(loginStatus,'Password updated. Sign in with your new password.','success'); },900);
});


// ---------- NOTIFICATIONS ----------
async function createDueNotifications() {
  const {error} = await supabaseClient.rpc('mrmr_create_due_notifications');
  if (error) console.warn('Due notification check:', error.message);
}
function notificationTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
function renderNotifications() {
  const count = notifications.filter(n => !n.read_at).length;
  $('notificationCount').hidden = count === 0;
  $('notificationCount').textContent = count > 99 ? '99+' : String(count);
  const list = $('notificationList');
  if (!notifications.length) { list.innerHTML = '<div class="notification-empty">You are all caught up.</div>'; return; }
  list.innerHTML = notifications.map(n => `<button type="button" class="notification-item ${n.read_at?'':'unread'}" data-notification-id="${escapeHtml(n.id)}"><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message)}</p><small>${escapeHtml(notificationTime(n.created_at))}</small></button>`).join('');
}
async function loadNotifications() {
  if (!supabaseClient) return;
  await createDueNotifications();
  const {data,error} = await supabaseClient.from('admin_notifications').select('id,created_at,type,title,message,entity_type,entity_id,read_at').order('created_at',{ascending:false}).limit(30);
  if (error) { console.warn('Notifications:', error.message); return; }
  notifications = data || [];
  renderNotifications();
}
async function markNotificationRead(id) {
  const {error} = await supabaseClient.from('admin_notifications').update({read_at:new Date().toISOString()}).eq('id',id).is('read_at',null);
  if (error) return;
  const n = notifications.find(x => x.id === id); if (n) n.read_at = new Date().toISOString();
  renderNotifications();
}
async function markAllNotificationsRead() {
  const {error} = await supabaseClient.from('admin_notifications').update({read_at:new Date().toISOString()}).is('read_at',null);
  if (error) return;
  notifications.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
  renderNotifications();
}
function startNotificationPolling() {
  clearInterval(notificationTimer);
  notificationTimer = setInterval(loadNotifications, 30000);
}

function startNotificationRealtime() {
  if (!supabaseClient || notificationChannel) return;

  notificationChannel = supabaseClient
    .channel('mrmr-admin-notifications')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'admin_notifications'
      },
      async () => {
        // A database trigger may create the notification a moment after
        // the lead/project/task change. Reload the latest notification list
        // as soon as Supabase Realtime reports the change.
        await loadNotifications();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Mr.MR notification realtime connected.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Notification realtime unavailable; 30-second polling remains active.');
      }
    });
}

async function stopNotificationRealtime() {
  if (!supabaseClient || !notificationChannel) return;
  await supabaseClient.removeChannel(notificationChannel);
  notificationChannel = null;
}

async function verifyAdmin(user) {
  const {data,error} = await supabaseClient.from('admin_users').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
  if (error) throw error; return Boolean(data);
}

// ---------- LEADS ----------
async function loadInquiries() {
  setStatus(dashboardStatus,'Loading inquiries…');
  const {data,error} = await supabaseClient.from('project_inquiries').select('id,created_at,name,email,business,phone,service,website,budget,project_details,status').order('created_at',{ascending:false});
  if (error) throw error; inquiries=data||[]; renderLeads();
  setStatus(dashboardStatus,`${inquiries.length} ${inquiries.length===1?'inquiry':'inquiries'} loaded.`,'success');
}
function filteredInquiries() {
  const q=($('searchInput')?.value||'').trim().toLowerCase(), f=$('statusFilter')?.value||'ALL';
  return inquiries.filter(x => (f==='ALL'||x.status===f) && (!q || [x.name,x.email,x.business,x.service,x.phone].filter(Boolean).join(' ').toLowerCase().includes(q)));
}
function renderLeadStats() { $('statTotal').textContent=inquiries.length; $('statNew').textContent=inquiries.filter(x=>x.status==='NEW').length; $('statProgress').textContent=inquiries.filter(x=>['CONTACTED','DISCUSSION','PROPOSAL'].includes(x.status)).length; $('statWon').textContent=inquiries.filter(x=>x.status==='WON').length; }
function statusOptions(current) { return ['NEW','CONTACTED','DISCUSSION','PROPOSAL','WON','LOST'].map(s=>`<option value="${s}" ${s===current?'selected':''}>${s}</option>`).join(''); }
function renderLeads() {
  renderLeadStats(); const items=filteredInquiries(); $('resultCount').textContent=`${items.length} ${items.length===1?'result':'results'}`;
  $('leadRows').innerHTML=items.map(item=>`<tr><td><span class="lead-name">${escapeHtml(item.name)}</span><span class="lead-meta">${escapeHtml(item.email)}${item.business?` · ${escapeHtml(item.business)}`:''}</span></td><td>${escapeHtml(item.service||'—')}</td><td>${escapeHtml(item.budget||'—')}</td><td class="muted">${escapeHtml(formatDate(item.created_at))}</td><td><select class="status-select" data-status-id="${escapeHtml(item.id)}">${statusOptions(item.status)}</select></td><td><button class="view-button" data-view-id="${escapeHtml(item.id)}">View</button></td></tr>`).join('');
  $('emptyState').hidden=items.length!==0;
}
async function updateLeadStatus(id,newStatus) { const {error}=await supabaseClient.from('project_inquiries').update({status:newStatus}).eq('id',id); if(error)throw error; const item=inquiries.find(x=>x.id===id); if(item)item.status=newStatus; renderLeads(); setStatus(dashboardStatus,'Lead status updated.','success'); }
function showLeadDetails(id) {
  const item=inquiries.find(x=>x.id===id); if(!item)return;
  const existing=projects.find(p=>p.inquiry_id===id);
  $('detailTitle').textContent=item.business||item.name||'Inquiry';
  $('detailContent').innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Name</small>${escapeHtml(item.name)}</div><div class="detail-item"><small>Email</small><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></div><div class="detail-item"><small>Phone / WhatsApp</small>${item.phone?`<a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a>`:'—'}</div><div class="detail-item"><small>Business</small>${escapeHtml(item.business||'—')}</div><div class="detail-item"><small>Service</small>${escapeHtml(item.service||'—')}</div><div class="detail-item"><small>Budget</small>${escapeHtml(item.budget||'—')}</div><div class="detail-item"><small>Received</small>${escapeHtml(formatDate(item.created_at))}</div><div class="detail-item"><small>Website / Social</small>${item.website?`<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener">${escapeHtml(item.website)}</a>`:'—'}</div></div><div class="detail-message"><small>Project details</small><p>${escapeHtml(item.project_details||'—')}</p></div><div class="detail-actions"><select id="detailStatus" class="status-select">${statusOptions(item.status)}</select><button id="detailSave" class="ghost">Save status</button>${existing?`<button id="openExistingProject" class="primary compact">Open project</button>`:`<button id="createFromInquiry" class="primary compact">Create project</button>`}</div>`;
  detailDialog.showModal();
  $('detailSave').onclick=async()=>{try{await updateLeadStatus(id,$('detailStatus').value);detailDialog.close();}catch(e){setStatus(dashboardStatus,e.message,'error');}};
  if(existing) $('openExistingProject').onclick=()=>{detailDialog.close();openProject(existing.id);}; else $('createFromInquiry').onclick=()=>{detailDialog.close();openProjectForm(null,item);};
}

// ---------- PROJECTS ----------
async function loadProjects() {
  setStatus(projectsStatus,'Loading projects…');
  const {data,error}=await supabaseClient.from('client_projects').select('id,created_at,updated_at,inquiry_id,name,client_name,client_email,client_phone,service,budget,status,progress,start_date,due_date,project_url,repo_url,notes').order('created_at',{ascending:false});
  if(error)throw error; projects=data||[]; renderProjects(); setStatus(projectsStatus,`${projects.length} ${projects.length===1?'project':'projects'} loaded.`,'success');
}
function projectStatusOptions(current){return ['PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'].map(s=>`<option value="${s}" ${s===current?'selected':''}>${s.replace('_',' ')}</option>`).join('');}
function filteredProjects(){const q=($('projectSearchInput')?.value||'').trim().toLowerCase(),f=$('projectStatusFilter')?.value||'ALL';return projects.filter(p=>(f==='ALL'||p.status===f)&&(!q||[p.name,p.client_name,p.client_email,p.service].filter(Boolean).join(' ').toLowerCase().includes(q)));}
function renderProjectStats(){const active=projects.filter(p=>p.status==='ACTIVE').length,completed=projects.filter(p=>p.status==='COMPLETED').length,due=projects.filter(p=>p.due_date&&p.status!=='COMPLETED'&&p.status!=='CANCELLED'&&new Date(p.due_date+'T23:59:59')>=todayPlus(0)&&new Date(p.due_date+'T23:59:59')<=todayPlus(7)).length;$('projectStatTotal').textContent=projects.length;$('projectStatActive').textContent=active;$('projectStatDue').textContent=due;$('projectStatCompleted').textContent=completed;}
function renderProjects(){renderProjectStats();const items=filteredProjects();$('projectResultCount').textContent=`${items.length} ${items.length===1?'project':'projects'}`;$('projectRows').innerHTML=items.map(p=>`<tr><td><span class="lead-name">${escapeHtml(p.name)}</span><span class="lead-meta">${escapeHtml(p.service||'No service')}</span></td><td>${escapeHtml(p.client_name||'—')}<span class="lead-meta">${escapeHtml(p.client_email||'')}</span></td><td><select class="status-select" data-project-status-id="${escapeHtml(p.id)}">${projectStatusOptions(p.status)}</select></td><td><div class="progress-wrap"><div class="progress-bar"><span style="width:${Math.max(0,Math.min(100,p.progress||0))}%"></span></div><small>${p.progress||0}%</small></div></td><td class="muted">${escapeHtml(formatShortDate(p.due_date))}</td><td><button class="view-button" data-project-id="${escapeHtml(p.id)}">Open</button></td></tr>`).join('');$('projectEmptyState').hidden=items.length!==0;}

function fillProjectForm(p,inquiry){
  $('projectId').value=p?.id||''; $('projectInquiryId').value=p?.inquiry_id||inquiry?.id||''; $('projectName').value=p?.name||((inquiry?.business||inquiry?.name||'')+(inquiry?' — Project':'')); $('projectClientName').value=p?.client_name||inquiry?.name||''; $('projectClientEmail').value=p?.client_email||inquiry?.email||''; $('projectClientPhone').value=p?.client_phone||inquiry?.phone||''; $('projectService').value=p?.service||inquiry?.service||''; $('projectBudget').value=p?.budget||inquiry?.budget||''; $('projectStatus').value=p?.status||'PLANNING'; $('projectProgress').value=p?.progress||0; $('progressValue').textContent=`${p?.progress||0}%`; $('projectStartDate').value=p?.start_date||''; $('projectDueDate').value=p?.due_date||''; $('projectUrl').value=p?.project_url||''; $('projectRepoUrl').value=p?.repo_url||''; $('projectNotes').value=p?.notes||''; $('projectDialogTitle').textContent=p?'Edit project':'New project'; $('taskSection').hidden=!p; }
async function openProjectForm(p,inquiry=null){fillProjectForm(p,inquiry);currentProjectTasks=[];if(p)await loadTasks(p.id);else renderTasks();projectDialog.showModal();}
async function openProject(id){const p=projects.find(x=>x.id===id);if(p)await openProjectForm(p);}
async function loadTasks(projectId){const {data,error}=await supabaseClient.from('project_tasks').select('id,created_at,project_id,title,description,status,priority,due_date').eq('project_id',projectId).order('created_at',{ascending:true});if(error)throw error;currentProjectTasks=data||[];renderTasks();}
function renderTasks(){const list=$('taskList');if(!currentProjectTasks.length){list.innerHTML='<div class="task-empty">No tasks yet. Add the first delivery task.</div>';return;}list.innerHTML=currentProjectTasks.map(t=>`<article class="task-row"><div class="task-check ${t.status==='DONE'?'done':''}" data-task-toggle="${t.id}">${t.status==='DONE'?'✓':''}</div><div class="task-main"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.priority)}${t.due_date?` · due ${escapeHtml(formatShortDate(t.due_date))}`:''}</span></div><span class="task-status ${t.status.toLowerCase()}">${t.status.replace('_',' ')}</span><button type="button" class="view-button" data-task-edit="${t.id}">Edit</button></article>`).join('');}
async function saveProject(event){event.preventDefault();if(!supabaseClient)return;const id=$('projectId').value||null;const payload={inquiry_id:$('projectInquiryId').value||null,name:$('projectName').value.trim(),client_name:$('projectClientName').value.trim()||null,client_email:$('projectClientEmail').value.trim()||null,client_phone:$('projectClientPhone').value.trim()||null,service:$('projectService').value.trim()||null,budget:$('projectBudget').value.trim()||null,status:$('projectStatus').value,progress:Number($('projectProgress').value),start_date:$('projectStartDate').value||null,due_date:$('projectDueDate').value||null,project_url:$('projectUrl').value.trim()||null,repo_url:$('projectRepoUrl').value.trim()||null,notes:$('projectNotes').value.trim()||null};if(!payload.name)return setStatus($('projectFormStatus'),'Project name is required.','error');const btn=$('saveProjectButton');btn.disabled=true;setStatus($('projectFormStatus'),'Saving project…');let result;if(id)result=await supabaseClient.from('client_projects').update(payload).eq('id',id).select().single();else result=await supabaseClient.from('client_projects').insert(payload).select().single();btn.disabled=false;if(result.error)return setStatus($('projectFormStatus'),result.error.message,'error');const saved=result.data;if(id){const idx=projects.findIndex(p=>p.id===id);if(idx>=0)projects[idx]=saved;}else projects.unshift(saved);renderProjects();setStatus(projectsStatus,'Project saved.','success');setStatus($('projectFormStatus'),'Project saved successfully.','success');$('taskSection').hidden=false;$('projectId').value=saved.id;$('projectInquiryId').value=saved.inquiry_id||'';if(!id)await loadTasks(saved.id);}
async function updateProjectStatus(id,status){const {error}=await supabaseClient.from('client_projects').update({status}).eq('id',id);if(error)throw error;const p=projects.find(x=>x.id===id);if(p)p.status=status;renderProjects();setStatus(projectsStatus,'Project status updated.','success');}

// ---------- TASKS ----------
function openTaskForm(task=null,projectId=$('projectId').value){$('taskId').value=task?.id||'';$('taskProjectId').value=projectId||'';$('taskTitle').value=task?.title||'';$('taskDescription').value=task?.description||'';$('taskPriority').value=task?.priority||'MEDIUM';$('taskStatus').value=task?.status||'TODO';$('taskDueDate').value=task?.due_date||'';$('taskDialogTitle').textContent=task?'Edit task':'Add task';setStatus($('taskFormStatus'),'');taskDialog.showModal();}
async function saveTask(e){e.preventDefault();const id=$('taskId').value||null,projectId=$('taskProjectId').value;const payload={project_id:projectId,title:$('taskTitle').value.trim(),description:$('taskDescription').value.trim()||null,priority:$('taskPriority').value,status:$('taskStatus').value,due_date:$('taskDueDate').value||null};if(!payload.title)return setStatus($('taskFormStatus'),'Task title is required.','error');const result=id?await supabaseClient.from('project_tasks').update(payload).eq('id',id).select().single():await supabaseClient.from('project_tasks').insert(payload).select().single();if(result.error)return setStatus($('taskFormStatus'),result.error.message,'error');const task=result.data;if(id){const i=currentProjectTasks.findIndex(t=>t.id===id);if(i>=0)currentProjectTasks[i]=task;}else currentProjectTasks.push(task);renderTasks();taskDialog.close();setStatus($('projectFormStatus'),'Task saved.','success');}
async function toggleTask(id){const task=currentProjectTasks.find(t=>t.id===id);if(!task)return;const status=task.status==='DONE'?'TODO':'DONE';const {error}=await supabaseClient.from('project_tasks').update({status}).eq('id',id);if(error)return setStatus($('projectFormStatus'),error.message,'error');task.status=status;renderTasks();}



// ---------- CLIENT CRM ----------
async function loadClients() {
  setStatus($('clientsStatus'), 'Loading clients…');
  const { data, error } = await supabaseClient
    .from('client_profiles')
    .select('id,created_at,updated_at,name,email,phone,business,website,status,source_inquiry_id,notes')
    .order('created_at', { ascending: false });
  if (error) throw error;
  clients = data || [];
  renderClients();
  setStatus($('clientsStatus'), `${clients.length} ${clients.length === 1 ? 'client' : 'clients'} loaded.`, 'success');
}
function filteredClients() {
  const q = ($('clientSearchInput')?.value || '').trim().toLowerCase();
  const f = $('clientStatusFilter')?.value || 'ALL';
  return clients.filter(c => (f === 'ALL' || c.status === f) && (!q || [c.name,c.email,c.business,c.phone].filter(Boolean).join(' ').toLowerCase().includes(q)));
}
function renderClientStats() {
  $('clientStatTotal').textContent = clients.length;
  $('clientStatActive').textContent = clients.filter(c => c.status === 'ACTIVE').length;
  $('clientStatInactive').textContent = clients.filter(c => c.status === 'INACTIVE').length;
  $('clientStatArchived').textContent = clients.filter(c => c.status === 'ARCHIVED').length;
}
function clientStatusOptions(current) { return ['ACTIVE','INACTIVE','ARCHIVED'].map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join(''); }
function renderClients() {
  renderClientStats();
  const items = filteredClients();
  $('clientResultCount').textContent = `${items.length} ${items.length === 1 ? 'client' : 'clients'}`;
  $('clientRows').innerHTML = items.map(c => `<tr><td><span class="lead-name">${escapeHtml(c.name)}</span><span class="lead-meta">${escapeHtml(c.email || '')}</span></td><td>${escapeHtml(c.business || '—')}</td><td>${c.phone ? `<a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a>` : '—'}</td><td><select class="status-select" data-client-status-id="${escapeHtml(c.id)}">${clientStatusOptions(c.status)}</select></td><td class="muted">${escapeHtml(formatDate(c.created_at))}</td><td><button type="button" class="view-button" data-client-edit="${escapeHtml(c.id)}">Edit</button></td></tr>`).join('');
  $('clientEmptyState').hidden = items.length !== 0;
}
function fillClientForm(c) {
  $('clientId').value = c?.id || '';
  $('clientName').value = c?.name || '';
  $('clientEmail').value = c?.email || '';
  $('clientPhone').value = c?.phone || '';
  $('clientBusiness').value = c?.business || '';
  $('clientWebsite').value = c?.website || '';
  $('clientStatus').value = c?.status || 'ACTIVE';
  $('clientNotes').value = c?.notes || '';
  $('clientDialogTitle').textContent = c ? 'Edit client' : 'New client';
  setStatus($('clientFormStatus'), '');
}
function openClientForm(c = null) { fillClientForm(c); clientDialog.showModal(); }
async function saveClient(e) {
  e.preventDefault();
  const id = $('clientId').value || null;
  const payload = { name:$('clientName').value.trim(), email:$('clientEmail').value.trim()||null, phone:$('clientPhone').value.trim()||null, business:$('clientBusiness').value.trim()||null, website:$('clientWebsite').value.trim()||null, status:$('clientStatus').value, notes:$('clientNotes').value.trim()||null };
  if (!payload.name) return setStatus($('clientFormStatus'), 'Client name is required.', 'error');
  const btn=$('saveClientButton'); btn.disabled=true; setStatus($('clientFormStatus'),'Saving client…');
  const result = id ? await supabaseClient.from('client_profiles').update(payload).eq('id',id).select().single() : await supabaseClient.from('client_profiles').insert(payload).select().single();
  btn.disabled=false;
  if (result.error) return setStatus($('clientFormStatus'), result.error.message, 'error');
  if (id) { const i=clients.findIndex(c=>c.id===id); if(i>=0) clients[i]=result.data; } else clients.unshift(result.data);
  renderClients(); clientDialog.close(); setStatus($('clientsStatus'),'Client saved successfully.','success');
}
async function updateClientStatus(id,status) {
  const {error}=await supabaseClient.from('client_profiles').update({status}).eq('id',id);
  if(error) throw error;
  const c=clients.find(x=>x.id===id); if(c)c.status=status;
  renderClients(); setStatus($('clientsStatus'),'Client status updated.','success');
}

// ---------- UI EVENTS ----------
$('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!supabaseClient)return setStatus(loginStatus,'Supabase configuration is missing.','error');const b=$('loginButton');b.disabled=true;setStatus(loginStatus,'Signing in…');const {data,error}=await supabaseClient.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});b.disabled=false;if(error)return setStatus(loginStatus,error.message,'error');await showDashboard(data.session);});
$('logoutButton')?.addEventListener('click',async()=>{await stopNotificationRealtime();clearInterval(notificationTimer);await supabaseClient.auth.signOut();location.reload();});
$('refreshButton')?.addEventListener('click',async()=>{try{await Promise.all([loadInquiries(),loadProjects(),loadClients(),loadNotifications()]);}catch(e){setStatus(dashboardStatus,e.message,'error');setStatus(projectsStatus,e.message,'error');}});
$('notificationButton')?.addEventListener('click',()=>{const panel=$('notificationPanel');const open=panel.hidden;panel.hidden=!open;$('notificationButton').setAttribute('aria-expanded',String(open));});
$('markAllReadButton')?.addEventListener('click',markAllNotificationsRead);
$('notificationList')?.addEventListener('click',async e=>{const item=e.target.closest('[data-notification-id]');if(!item)return;await markNotificationRead(item.dataset.notificationId);});
document.addEventListener('click',e=>{const wrap=e.target.closest('.notification-wrap');if(!wrap){$('notificationPanel')?.setAttribute('hidden','');$('notificationButton')?.setAttribute('aria-expanded','false');}});
$('searchInput')?.addEventListener('input',renderLeads);$('statusFilter')?.addEventListener('change',renderLeads);$('projectSearchInput')?.addEventListener('input',renderProjects);$('projectStatusFilter')?.addEventListener('change',renderProjects);
$('leadRows')?.addEventListener('change',async e=>{const s=e.target.closest('[data-status-id]');if(!s)return;try{await updateLeadStatus(s.dataset.statusId,s.value);}catch(err){setStatus(dashboardStatus,err.message,'error');}});
$('leadRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-view-id]');if(b)showLeadDetails(b.dataset.viewId);});
$('projectRows')?.addEventListener('change',async e=>{const s=e.target.closest('[data-project-status-id]');if(!s)return;try{await updateProjectStatus(s.dataset.projectStatusId,s.value);}catch(err){setStatus(projectsStatus,err.message,'error');}});
$('projectRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-project-id]');if(b)openProject(b.dataset.projectId);});
$('clientSearchInput')?.addEventListener('input',renderClients);
$('clientStatusFilter')?.addEventListener('change',renderClients);
$('newClientButton')?.addEventListener('click',()=>openClientForm());
$('clientForm')?.addEventListener('submit',saveClient);
$('cancelClientButton')?.addEventListener('click',()=>clientDialog.close());
$('closeClientDialog')?.addEventListener('click',()=>clientDialog.close());
$('clientRows')?.addEventListener('change',async e=>{const s=e.target.closest('[data-client-status-id]');if(!s)return;try{await updateClientStatus(s.dataset.clientStatusId,s.value);}catch(err){setStatus($('clientsStatus'),err.message,'error');}});
$('clientRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-client-edit]');if(b){const c=clients.find(x=>x.id===b.dataset.clientEdit);if(c)openClientForm(c);}});
clientDialog?.addEventListener('click',e=>{if(e.target===clientDialog)clientDialog.close();});

$('projectProgress')?.addEventListener('input',e=>$('progressValue').textContent=`${e.target.value}%`);
$('newProjectButton')?.addEventListener('click',()=>openProjectForm(null));
$('projectForm')?.addEventListener('submit',saveProject);$('cancelProjectButton')?.addEventListener('click',()=>projectDialog.close());$('closeProjectDialog')?.addEventListener('click',()=>projectDialog.close());
$('addTaskButton')?.addEventListener('click',()=>openTaskForm());$('taskForm')?.addEventListener('submit',saveTask);$('cancelTaskButton')?.addEventListener('click',()=>taskDialog.close());$('closeTaskDialog')?.addEventListener('click',()=>taskDialog.close());
$('taskList')?.addEventListener('click',e=>{const toggle=e.target.closest('[data-task-toggle]');if(toggle)toggleTask(toggle.dataset.taskToggle);const edit=e.target.closest('[data-task-edit]');if(edit){const task=currentProjectTasks.find(t=>t.id===edit.dataset.taskEdit);if(task)openTaskForm(task);}});
$('closeDialog')?.addEventListener('click',()=>detailDialog.close());detailDialog?.addEventListener('click',e=>{if(e.target===detailDialog)detailDialog.close();});projectDialog?.addEventListener('click',e=>{if(e.target===projectDialog)projectDialog.close();});taskDialog?.addEventListener('click',e=>{if(e.target===taskDialog)taskDialog.close();});
document.querySelectorAll('.tab-button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.admin-tab-view').forEach(x=>x.hidden=true);btn.classList.add('active');$(btn.dataset.tab).hidden=false;}));

async function showDashboard(session){loginView.hidden=true;resetView.hidden=true;dashboardView.hidden=false;$('adminEmail').textContent=session.user.email||'';try{if(!await verifyAdmin(session.user))throw new Error('This account is not authorized for the Mr.MR admin dashboard.');await Promise.all([loadInquiries(),loadProjects(),loadClients(),loadNotifications()]);
    startNotificationPolling();
    startNotificationRealtime();
  }catch(error){console.error(error);await supabaseClient.auth.signOut();dashboardView.hidden=true;loginView.hidden=false;setStatus(loginStatus,isAdminError(error)?'Admin database permissions are not configured yet.':error.message,'error');}}

if(supabaseClient){supabaseClient.auth.onAuthStateChange(async(event,session)=>{if(event==='PASSWORD_RECOVERY'){showResetPassword();return;}if(event==='SIGNED_IN'&&session)await showDashboard(session);});}
(async function init(){if(!supabaseClient)return setStatus(loginStatus,'Supabase configuration is missing. Copy your working supabase-config.js into this folder.','error');const {data:{session}}=await supabaseClient.auth.getSession();if(window.location.hash.includes('type=recovery')){showResetPassword();return;}if(session)await showDashboard(session);})();
