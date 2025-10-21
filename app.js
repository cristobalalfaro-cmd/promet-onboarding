/*****************************************************
 * Promet Hotelería - Onboarding & Inducción
 * app.js (versión completa y actualizada)
 *****************************************************/

// Usa un proxy CORS para hablar con Apps Script desde GitHub Pages
const GAS_BASE_URL =
  "https://corsproxy.io/?" +
  encodeURIComponent("https://script.google.com/macros/s/AKfycbzinue2-0tTbsfiKeAstLrfVTROkdZMGUun9B33Ay7bJpjDB_gbSrLi0gfdLqpW5I45bQ/exec?route=");

// === UTILIDADES GENERALES ===
function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function toast(msg){ alert(msg); }

async function api(path, payload){
  const res = await fetch(GAS_BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload || {})
  });
  if(!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if(data.error) throw new Error(data.error);
  return data;
}

function getTokenFromURL(){
  const url = new URL(window.location.href);
  return url.searchParams.get("token");
}

// === ESPACIO NAMESPACE ===
window.Promet = {};

// ----------------------------------------------------
// ENCARGADO DE PERSONAS (EP)
// ----------------------------------------------------
Promet.epCreateCohort = function(bindButton){
  bindButton.addEventListener('click', async ()=>{
    const payload = {
      token: getTokenFromURL(),
      cohort: {
        hotel: q('#hotel').value,
        fecha_ingreso: q('#fecha_ingreso').value,
        ep_nombre: q('#ep_nombre').value,
        ep_email: q('#ep_email').value,
        relatores: [
          { dia:1, modulo:'D1',   relator_nombre:q('#relator1').value,   relator_email:q('#relator1_mail').value },
          { dia:2, modulo:'D2',   relator_nombre:q('#relator2').value,   relator_email:q('#relator2_mail').value },
          { dia:3, modulo:'D3A',  relator_nombre:q('#relator3a').value,  relator_email:q('#relator3a_mail').value },
          { dia:3, modulo:'D3B',  relator_nombre:q('#relator3b').value,  relator_email:q('#relator3b_mail').value },
          { dia:4, modulo:'D4',   relator_nombre:q('#relator4').value,   relator_email:q('#relator4_mail').value },
          { dia:5, modulo:'D5_EVAL', relator_nombre:q('#eval5').value,   relator_email:q('#eval5_mail').value }
        ]
      },
      participants_csv: q('#participants_csv').value
    };

    // Validaciones mínimas
    if(!payload.cohort.hotel || !payload.cohort.fecha_ingreso || !payload.cohort.ep_email){
      return toast("Completa los Datos generales.");
    }
    if(!payload.participants_csv.trim()){
      return toast("Debes cargar participantes (Excel o texto pegado).");
    }

    try{
      const resp = await api("/cohorts/create", payload);
      toast("Proceso creado: " + resp.cohort_id);
      q('#cohort_id').textContent = resp.cohort_id;
    }catch(err){
      console.error(err);
      toast("Error al crear el proceso");
    }
  });
};

// ----------------------------------------------------
// FORMADOR (RELATOR)
// ----------------------------------------------------
Promet.formadorLoadAssigned = async function(){
  try{
    const data = await api("/formador/assigned", { token: getTokenFromURL() });
    const cont = q('#assigned');
    cont.innerHTML = "";
    if(!data.items || !data.items.length){
      cont.innerHTML = "<p>No tienes módulos asignados.</p>";
      return;
    }
    data.items.forEach(it=>{
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h4>${it.hotel} - Día ${it.dia}</h4>
        <p><b>Participantes:</b> ${it.participantes_count}</p>
        <button class="btn" onclick="Promet.formadorVer(${it.dia}, '${it.cohort_id}')">Tomar asistencia</button>
      `;
      cont.appendChild(card);
    });
  }catch(e){
    toast("Error cargando módulos asignados");
    console.error(e);
  }
};

Promet.formadorVer = async function(dia, cohort_id){
  try{
    const data = await api("/formador/participants_for_day", {
      token: getTokenFromURL(), dia, cohort_id
    });
    const cont = q('#assigned');
    cont.innerHTML = `<h3>Día ${dia} - Lista de asistencia</h3>`;
    data.participantes.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <label><input type="checkbox" data-email="${p.email}" checked /> ${p.nombre} (${p.cargo})</label>
      `;
      cont.appendChild(div);
    });
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Guardar asistencia y enviar encuesta';
    btn.onclick = ()=> Promet.formadorGuardarAsistencia(dia, cohort_id);
    cont.appendChild(btn);
  }catch(e){
    toast("Error al cargar lista de asistencia");
    console.error(e);
  }
};

Promet.formadorGuardarAsistencia = async function(dia, cohort_id){
  try{
    const checks = qa('input[type=checkbox]');
    const presentes = checks.filter(c=>c.checked).map(c=>c.dataset.email);
    const ausentes = checks.filter(c=>!c.checked).map(c=>c.dataset.email);

    await api("/attendance/mark", {
      token: getTokenFromURL(),
      dia, cohort_id, presentes, ausentes
    });
    toast("Asistencia guardada y encuestas enviadas");
    Promet.formadorLoadAssigned();
  }catch(e){
    toast("Error guardando asistencia");
    console.error(e);
  }
};

// ----------------------------------------------------
// PARTICIPANTE (vista agenda / encuesta final)
// ----------------------------------------------------
Promet.participanteAgenda = async function(){
  try{
    const data = await api("/participante/agenda", { token: getTokenFromURL() });
    const cont = q('#agenda');
    cont.innerHTML = "";
    data.agenda.forEach(d=>{
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <h4>${d.dia_titulo}</h4>
        <p>${d.descripcion}</p>
        <small>${d.horario}</small>
      `;
      cont.appendChild(el);
    });
  }catch(e){
    console.error(e);
    toast("Error cargando agenda");
  }
};

// ----------------------------------------------------
// CHAMPION (evaluación de competencias)
// ----------------------------------------------------
Promet.championEvaluar = async function(){
  try{
    const data = await api("/champion/pending", { token: getTokenFromURL() });
    const cont = q('#pending');
    cont.innerHTML = "";
    data.participantes.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <h4>${p.nombre}</h4>
        <p>${p.cargo}</p>
        <button class="btn" onclick="Promet.championAbrir('${p.email}')">Evaluar</button>
      `;
      cont.appendChild(div);
    });
  }catch(e){
    console.error(e);
    toast("Error cargando pendientes");
  }
};

// ----------------------------------------------------
// ADMIN (tablero general)
// ----------------------------------------------------
Promet.adminDashboard = async function(){
  try{
    const data = await api("/admin/dashboard", { token: getTokenFromURL() });
    const cont = q('#dashboard');
    cont.innerHTML = "";
    data.cohortes.forEach(c=>{
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <h4>${c.hotel} - ${c.fecha_ingreso}</h4>
        <p>${c.estado}</p>
        <small>${c.ep_nombre} (${c.ep_email})</small>
      `;
      cont.appendChild(div);
    });
  }catch(e){
    console.error(e);
    toast("Error cargando dashboard");
  }
};

// ----------------------------------------------------
// LECTOR DE EXCEL DE PARTICIPANTES (usado por EP)
// ----------------------------------------------------
async function handleParticipantsXLSX(file){
  try{
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type:'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval:"" });

    const lines = json.map(row=>{
      const nombre   = (row.nombre||"").toString().trim();
      const apellido = (row.apellido||"").toString().trim();
      const cargo    = (row.cargo||"").toString().trim();
      const telefono = (row.telefono||"").toString().trim();
      const email    = (row.email||"").toString().trim();
      const req4     = (row.requiere_mod4||"NO").toString().trim().toUpperCase();
      const rut      = (row.rut||"").toString().trim();
      const jefe     = (row.jefe_directo||"").toString().trim();
      return [nombre,apellido,cargo,telefono,email,req4,rut,jefe].join(",");
    });

    if(!lines.length){ return toast("El Excel no contiene filas válidas."); }
    const ta = q('#participants_csv');
    ta.value = lines.join("\n");
    toast(`Participantes cargados: ${lines.length}`);
  }catch(err){
    console.error(err);
    toast("No se pudo leer el Excel. Revisa columnas y formato.");
  }
}
window.Promet.handleParticipantsXLSX = handleParticipantsXLSX;
