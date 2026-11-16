'use strict';

const stages = [
  {id:'received', label:'Recibido', icon:'box'},
  {id:'process', label:'En proceso', icon:'wash'},
  {id:'ready', label:'Listo', icon:'bag'},
  {id:'delivered', label:'Entregado', icon:'check'}
];
const titles = {pedidos:'Panel de pedidos',entregas:'Entregas',seguimiento:'Seguimiento'};
const storageKey = 'lavafacil-novatec-v1';
const sampleCode = 'LF-1043';
const timeZone = 'America/Asuncion';
const dateKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const timeKey = (date = new Date()) => new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
function shiftDate(day, shift) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0,10);
}
const dateLabel = (value, options) => new Intl.DateTimeFormat('es-PY',{timeZone:'UTC',...options}).format(new Date(value+'T12:00:00Z'));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const normalized = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const get = id => document.getElementById(id);
const search = get('search');
const typeFilter = get('type-filter');
const agendaFilter = get('date-filter');
const orderDialog = get('order-dialog');
const formDialog = get('form-dialog');
const messageDialog = get('message-dialog');
const resetDialog = get('reset-dialog');
const form = get('order-form');
const trackingInput = get('tracking-code');

function sampleOrders() {
  const now = dateKey();
  const rows = [
    [1045,'Familia Benítez','Hogar','Lavado por kilo','5 kg','Retiro en local',1,'11:00',0,'Separar prendas blancas.'],
    [1046,'Lofts Mburucuyá','Alojamiento','Sábanas y toallas','16 sábanas y 12 toallas','Entrega a domicilio',1,'16:00',0,'Preparar dos bolsas separadas.'],
    [1043,'Apartamentos del Sol','Alojamiento','Sábanas y toallas','12 sábanas y 8 toallas','Entrega a domicilio',0,'16:30',1,'Separar por departamento. Entrega acordada antes del ingreso de huéspedes.'],
    [1042,'Familia Duarte','Hogar','Edredones y frazadas','2 edredones','Retiro en local',-1,'17:00',1,'Avisar al cliente apenas el pedido esté listo.'],
    [1041,'Casa Laurel','Alojamiento','Sábanas y toallas','8 sábanas y 8 toallas','Retiro en local',0,'15:00',2,'Identificar las bolsas por unidad.'],
    [1040,'Familia Rojas','Hogar','Lavado y planchado','6 camisas','Retiro en local',1,'10:30',2,'Entregar las camisas en perchas.'],
    [1039,'Familia Vera','Hogar','Lavado por kilo','4 kg','Entrega a domicilio',-1,'13:00',3,'']
  ];
  return rows.map(([number,client,type,service,quantity,method,offset,time,step,note]) => ({
    id:'LF-'+number,client,type,service,quantity,method,date:shiftDate(now,offset),time,step,note
  }));
}

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.length && saved.every(item => stages[item.step] && item.id && item.date)) return saved;
  } catch {}
  return sampleOrders();
}

let orders = read();
let activeId = '';
let editingId = '';
let trackedId = '';
let metricFilter = '';
let timer;

function persist() {
  try {
    localStorage.setItem(storageKey,JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

function notify(text) {
  const toast = get('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { toast.hidden = true; },3500);
}

function dueStatus(order, now) {
  if (order.step === stages.length-1) return 'done';
  if (order.date < now.date || (order.date === now.date && order.time <= now.time)) return 'late';
  return order.date === now.date ? 'today' : 'future';
}

function dueBadge(order, now) {
  const flag = dueStatus(order,now);
  const value = flag === 'done' ? 'Entregado' : flag === 'late' ? 'Vencido' :
    flag === 'today' ? 'Hoy · '+order.time : dateLabel(order.date,{day:'numeric',month:'short'})+' · '+order.time;
  return `<span class="due ${flag}">${icon(flag === 'done' ? 'check' : 'clock')}${value}</span>`;
}

function scheduled(a,b) {
  return (a.date + a.time).localeCompare(b.date + b.time);
}

function orderById(id) { return orders.find(order => order.id === id); }

function render() {
  const now = {date:dateKey(),time:timeKey()};
  get('today').textContent = dateLabel(now.date,{weekday:'long', day:'numeric',month:'long'});
  const stats = [
    ['today','Entregas de hoy',orders.filter(o => o.step<3 && o.date===now.date).length,'calendar'],
    ['late','Vencidos',orders.filter(o => dueStatus(o,now)==='late').length,'clock'],
    ['ready','Listos',orders.filter(o => o.step===2).length,'bag']
  ];
  get('metrics').innerHTML = stats.map(([filter,label,count,symbol]) => `<button type="button" class="metric" data-action="metric" data-filter="${filter}" aria-pressed="${filter===metricFilter}"><span class="metric-label">${label}</span><strong>${count}</strong><span class="metric-icon ${filter}">${icon(symbol)}</span></button>`).join('');
  const q = normalized(search.value.trim());
  const filtered = orders.filter(order => {
    if (typeFilter.value && order.type !== typeFilter.value) return false;
    if (!normalized([order.id,order.client,order.service].join(' ')).includes(q)) return false;
    if (metricFilter === 'today') return order.step < 3 && order.date === now.date;
    if (metricFilter === 'late') return dueStatus(order,now) === 'late';
    if (metricFilter === 'ready') return order.step === 2;
    return true;
  });
  get('board-count').textContent = filtered.length + (filtered.length === 1 ? ' pedido' : ' pedidos') +
    ({today:' · Entregas de hoy',late:' · Vencidos',ready:' · Listos'}[metricFilter] || '');
  get('board').innerHTML = stages.map((stage,index) => {
    const list = filtered.filter(o => o.step === index).sort(scheduled);
    return `<section class="lane lane-${stage.id}" aria-label="${stage.label}">
      <h3><i class="state-dot"></i>${stage.label}<span class="lane-count">${list.length}</span></h3>
      ${list.map(o => `<button class="order-card" data-action="open" data-id="${o.id}" type="button">
        <span class="order-meta"><span>${o.id}</span><span class="type">${icon(o.type==='Hogar'?'home':'hotel')}${safe(o.type)}</span></span>
        <strong>${safe(o.client)}</strong><p class="service">${safe(o.service)}</p>${dueBadge(o,now)}
      </button>`).join('') || '<p class="empty">Sin pedidos.</p>'}</section>`;
  }).join('');
  renderAgenda(now);
  if (trackedId) renderTracking(trackedId);
}

function renderAgenda(now) {
  const groups = new Map();
  const mode = agendaFilter.value;
  for (const order of [...orders].sort(scheduled)) {
    const state = dueStatus(order,now);
    if (mode === 'pending' && state === 'done') continue;
    if (mode === 'today' && (state === 'done' || order.date !== now.date)) continue;
    if (mode === 'late' && state !== 'late') continue;
    if (mode === 'delivered' && state !== 'done') continue;
    if (!groups.has(order.date)) groups.set(order.date,[]);
    groups.get(order.date).push(order);
  }
  get('agenda').innerHTML = [...groups].map(([date,list]) => `<section class="agenda-group">
    <h3>${date === now.date ? 'Hoy · ' : ''}${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}</h3>
    ${list.map(order => `<button class="agenda-item" data-action="open" data-id="${order.id}" type="button">
      <span class="agenda-time">${order.time}</span><span><strong>${safe(order.client)}</strong><small>${order.id} · ${safe(order.service)}</small></span>
      <span class="agenda-method"><strong>${safe(order.method)}</strong><small>${stages[order.step].label}</small></span>
      ${dueBadge(order,now)}${icon('arrow')}
    </button>`).join('')}</section>`).join('') || '<p class="empty">No hay entregas para este filtro.</p>';
}

function showView() {
  const key = location.hash.slice(1);
  const view = Object.hasOwn(titles,key) ? key : 'pedidos';
  get('view-title').textContent = titles[view];
  for (const group of Object.keys(titles)) get('view-'+group).hidden = group !== view;
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view === view) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0,0);
}

function timeline(step) {
  return `<ol class="timeline" aria-label="Estado del pedido">${stages.map((stage,i) =>
    `<li${i<step ? ' class="complete"' : i===step ? ' aria-current="step"' : ''}><div>${icon(i<step?'check':stage.icon)}</div>${stage.label}</li>`
  ).join('')}</ol>`;
}

function showOrder(id) {
  const order = orderById(id);
  if (!order) return;
  activeId = id;
  get('order-code').textContent = id + ' · ' + stages[order.step].label.toUpperCase();
  get('order-title').textContent = order.client;
  get('order-kind').textContent = order.type + ' · ' + order.service;
  const facts = [
    ['Fecha acordada',dateLabel(order.date,{day:'numeric',month:'long'})+' · '+order.time],
    ['Modalidad',order.method],
    ['Cantidad o detalle',order.quantity || 'Sin detalle']
  ];
  get('order-content').innerHTML = `${timeline(order.step)}
    <dl class="facts">${facts.map(([key,value]) => `<div><dt>${key}</dt><dd>${safe(value)}</dd></div>`).join('')}</dl>
    ${order.note ? `<p class="notes"><strong>Indicaciones</strong>${safe(order.note)}</p>` : ''}
    <div class="dialog-actions">
      <button type="button" class="button secondary" data-action="edit">Editar</button>
      <button type="button" class="button secondary" data-action="message">${icon('message')} Preparar aviso</button>
      ${order.step < 3 ? `<button type="button" class="button primary" data-action="advance">${['Pasar a en proceso','Marcar listo','Marcar entregado'][order.step]}${icon('arrow')}</button>` : ''}
    </div>
    <p id="order-status" class="status-text" role="status"></p>`;
  if (!orderDialog.open) orderDialog.showModal();
}

function showForm(order) {
  editingId = order?.id || '';
  form.reset();
  const defaults = order || {date:shiftDate(dateKey(),1), time:'16:00'};
  for (const field of ['client','type','service','quantity','method','date','time','note']) {
    if (defaults[field] !== undefined) form.elements[field].value = defaults[field];
  }
  form.elements.client.setCustomValidity('');
  get('form-title').textContent = order ? 'Editar pedido' : 'Nuevo pedido';
  get('form-subtitle').textContent = order ? order.id+' · '+order.client : 'Cargá los datos ficticios del pedido para probar el flujo.';
  get('save-order').innerHTML = (order ? 'Guardar cambios' : 'Registrar pedido')+' '+icon('arrow');
  formDialog.showModal();
}

function makeMessage(order) {
  const when = dateLabel(order.date,{weekday:'long',day:'numeric',month:'long'})+' a las '+order.time;
  const collect = order.method === 'Retiro en local';
  if (order.step === 3) return `Hola. Desde Lavafácil te confirmamos que el pedido ${order.id} ya fue entregado. ¡Gracias por elegirnos!`;
  const end = collect ? `El retiro en el local está acordado para el ${when}.` : `La entrega a domicilio está acordada para el ${when}.`;
  const state = ['ya fue recibido','está en proceso','ya está listo'][order.step];
  return `Hola, te escribimos de Lavafácil. Tu pedido ${order.id} (${order.service.toLowerCase()}) ${state}. ${end} ¡Gracias!`;
}

function renderTracking(id) {
  const order = orderById(id);
  get('tracking-result').innerHTML = order ? `<article class="tracking-card">
    <p class="status-text">${order.id} · ${safe(order.service)}</p><h3>${stages[order.step].label}</h3>
    ${timeline(order.step)}
    <p>${order.step===3 ? 'Pedido entregado.' : safe(order.method)+' · '+dateLabel(order.date,{day:'numeric',month:'long'})+' a las '+order.time}</p></article>`
    : '<p class="empty">No encontramos ese código en esta muestra. Probá con LF-1043.</p>';
}

search.addEventListener('input',render);
typeFilter.addEventListener('change',render);
agendaFilter.addEventListener('change',render);
window.addEventListener('hashchange',showView);
form.elements.client.addEventListener('input',() => form.elements.client.setCustomValidity(''));
form.addEventListener('submit',event => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()]));
  if (!data.client) {
    form.elements.client.setCustomValidity('Ingresá el nombre del cliente.');
    form.elements.client.reportValidity();
    return;
  }
  const existing = orderById(editingId);
  if (existing) Object.assign(existing,data);
  else {
    const number = Math.max(1046,...orders.map(item => Number(item.id.slice(3)))) + 1;
    orders.push({...data,id:'LF-'+number,step:0});
  }
  const saved = persist();
  formDialog.close();
  render();
  if (existing) showOrder(existing.id);
  else {
    metricFilter = '';
    search.value = '';
    typeFilter.value = '';
    location.hash = '#pedidos';
    render();
    showOrder(orders.at(-1).id);
  }
  get('order-status').textContent = saved ? (existing ? 'Cambios guardados.' : 'Pedido registrado.') : 'Pedido disponible durante esta sesión.';
});

get('track-form').addEventListener('submit',event => {
  event.preventDefault();
  trackedId = trackingInput.value.trim().toUpperCase();
  renderTracking(trackedId);
});

const actions = {
  create:() => showForm(),
  example:() => showOrder(sampleCode),
  open:button => showOrder(button.dataset.id),
  'close-order':() => orderDialog.close(),
  'close-form':() => formDialog.close(),
  'close-message':() => messageDialog.close(),
  'close-reset':() => resetDialog.close(),
  edit:() => showForm(orderById(activeId)),
  metric:button => {
    const key = button.dataset.filter;
    metricFilter = metricFilter === key ? '' : key;
    render();
    document.querySelector(`.metric[data-filter="${key}"]`)?.focus();
  },
  advance:() => {
    const order = orderById(activeId);
    if (!order || order.step >= 3) return;
    order.step += 1;
    const saved = persist();
    render();
    showOrder(activeId);
    (orderDialog.querySelector('[data-action="advance"]') || orderDialog.querySelector('[data-action="message"]')).focus();
    get('order-status').textContent = saved ? 'Estado actualizado.' : 'Estado actualizado durante esta sesión.';
  },
  message:() => {
    const order = orderById(activeId);
    if (!order) return;
    get('message-text').value = makeMessage(order);
    get('copy-status').textContent = '';
    messageDialog.showModal();
  },
  copy:async () => {
    const field = get('message-text');
    try {
      await navigator.clipboard.writeText(field.value);
      get('copy-status').textContent = 'Mensaje copiado.';
    } catch {
      field.focus();
      field.select();
      get('copy-status').textContent = 'Texto seleccionado. Podés copiarlo desde tu dispositivo.';
    }
  },
  'tracking-example':() => {
    trackingInput.value = sampleCode;
    get('track-form').requestSubmit();
  },
  reset:() => resetDialog.showModal(),
  'confirm-reset':() => {
    orders = sampleOrders();
    const saved = persist();
    search.value = '';
    typeFilter.value = '';
    agendaFilter.value = 'pending';
    trackedId = '';
    trackingInput.value = '';
    get('tracking-result').textContent = '';
    metricFilter = '';
    resetDialog.close();
    render();
    notify(saved ? 'Muestra reiniciada.' : 'Muestra reiniciada durante esta sesión.');
  }
};

document.addEventListener('click',event => {
  const button = event.target.closest('button[data-action]');
  if (button && Object.hasOwn(actions,button.dataset.action)) actions[button.dataset.action](button);
});

persist();
showView();
render();
setInterval(() => { if (!document.querySelector('dialog[open]')) render(); },60000);
