
// Minimal frontend to interact with Google Apps Script backend.
// Set this after you deploy the Web App in Google Apps Script:
const GAS_BASE_URL = localStorage.getItem('GAS_BASE_URL') || ""; // e.g., "https://script.google.com/macros/s/AKfyc.../exec"

// Utility
function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function toast(msg){ alert(msg); }

function getTokenFromURL(){
  const url = new URL(window.location.href);
  return url.searchParams.get("token") || "";
}

function setBaseURL(url){
  localStorage.setItem('GAS_BASE_URL', url);
  toast("URL backend guardada.");
}

async function api(path, payload){
  if(!GAS_BASE_URL){ throw new Error("Configura GAS_BASE_URL en index.html"); }
  const res = await fetch(GAS_BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload || {})
  });
  if(!res.ok){ throw new Error("Error HTTP " + res.status); }
  return await res.json();
}

// ---- Login simple (token + rol) ----
async function handleLogin(form){
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const token = q('#token').value.trim();
    if(!token){ return toast("Ingresa un token válido"); }
    // Ask backend who am I?
    try{
      const data = await api("/tokens/resolve", { token });
      const role = data.role;
      const page = {
        "ADMIN":"admin.html",
        "EP":"ep.html",
        "FORMADOR":"formador.html",
        "CHAMPION":"champion.html",
        "PARTICIPANTE":"participante.html"
      }[role];
      if(!page){ return toast("Token válido pero sin rol asignado"); }
      window.location.href = page + "?token=" + encodeURIComponent(token);
    }catch(err){
      toast("Token inválido o expirado");
    }
  });
}

// ---- EP: crear cohorte ----
async function epCreateCohort(form){
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      token: getTokenFromURL(),
      cohort: {
        hotel: q('#hotel').value,
        fecha_ingreso: q('#fecha_ingreso').value,
        ep_nombre: q('#ep_nombre').value,
        ep_email: q('#ep_email').value,
        relatores: [
          { dia:1, modulo:'D1', relator_nombre:q('#relator1').value, relator_email:q('#relator1_mail').value },
          { dia:2, modulo:'D2', relator_nombre:q('#relator2').value, relator_email:q('#relator2_mail').value },
          { dia:3, modulo:'D3', relator_nombre:q('#relator3').value, relator_email:q('#relator3_mail').value },
          { dia:4, modulo:'D4', relator_nombre:q('#relator4').value, relator_email:q('#relator4_mail').value }
        ]
      },
      participants_csv: q('#participants_csv').value // one per line: nombre,apellido,cargo,telefono,email,requiere_mod4,rut,jefe_directo
    };
    try{
      const resp = await api("/cohorts/create", payload);
      toast("Cohorte creado: " + resp.cohort_id);
      q('#cohort_id').textContent = resp.cohort_id;
    }catch(err){ toast("Error al crear cohorte"); }
  });
}

// ---- Formador: asistencia ----
async function formadorLoadAssigned(){
  const token = getTokenFromURL();
  try{
    const data = await api("/formador/assigned", { token });
    const tbody = q('#modulos_tbody');
    tbody.innerHTML = "";
    data.items.forEach(it=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.cohort_id}</td><td>${it.hotel}</td><td>${it.fecha_ingreso}</td><td>D${it.dia}</td>
        <td><button class="btn" data-cohort="${it.cohort_id}" data-dia="${it.dia}">Tomar asistencia</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-cohort]');
      if(!btn) return;
      const cohort_id = btn.dataset.cohort;
      const dia = parseInt(btn.dataset.dia,10);
      // open asistencia view
      const data2 = await api("/formador/participants_for_day", { token, cohort_id, dia });
      const ctn = q('#asistencia_ctn');
      ctn.innerHTML = "";
      data2.participants.forEach(p=>{
        const row = document.createElement('div');
        row.className = "card";
        row.innerHTML = `
          <div style="display:flex; gap:12px; align-items:center;">
            <strong>${p.nombre} ${p.apellido}</strong> <span class="badge">${p.cargo}</span>
          </div>
          <div class="grid cols-3" style="margin-top:10px;">
            <label>Asistencia
              <select class="input asist" data-id="${p.participant_id}">
                <option value="SI">Asiste</option>
                <option value="NO">No asiste</option>
              </select>
            </label>
            <label>Comentario
              <input class="input comentario" data-id="${p.participant_id}" placeholder="Opcional">
            </label>
            <div style="display:flex; align-items:end;">
              <button class="btn save" data-id="${p.participant_id}">Guardar</button>
            </div>
          </div>
        `;
        ctn.appendChild(row);
      });
      // Save all with one click
      const saveAll = document.createElement('button');
      saveAll.className = "btn secondary";
      saveAll.textContent = "Guardar todo y enviar micro-encuesta";
      saveAll.addEventListener('click', async ()=>{
        const payload = {
          token, cohort_id, dia,
          marks: []
        };
        qa('.asist').forEach(sel=>{
          const id = sel.dataset.id;
          const coment = q(`.comentario[data-id="${id}"]`).value;
          payload.marks.push({ participant_id:id, asiste: sel.value, comentario: coment });
        });
        try{
          await api("/attendance/mark", payload);
          toast("Asistencia guardada y encuestas enviadas.");
        }catch(err){ toast("Error guardando asistencia"); }
      });
      ctn.appendChild(document.createElement('hr'));
      ctn.appendChild(saveAll);
    });
  }catch(err){ toast("Error cargando módulos asignados"); }
}

// ---- Participante: micro-encuesta por módulo ----
async function participanteLoad(){
  const token = getTokenFromURL();
  // Load agenda + pending surveys
  try{
    const data = await api("/participante/agenda", { token });
    const agenda = q('#agenda');
    agenda.innerHTML = "";
    data.modules.forEach(m=>{
      const li = document.createElement('li');
      li.innerHTML = `<div class="card"><strong>${m.titulo}</strong><div>${m.fecha} (9:00–11:00)</div>
        ${m.survey_pending ? `<div style="margin-top:10px;">
          <label>Nivel de satisfacción (1-5)<input id="sat_${m.dia}" type="number" class="input" min="1" max="5"></label>
          <label>Comentario<input id="com_${m.dia}" class="input" placeholder="Opcional"></label>
          <button class="btn" onclick="enviarMicroEncuesta(${m.dia})">Enviar</button>
        </div>` : `<span class="badge">Encuesta enviada</span>`}
      </div>`;
      agenda.appendChild(li);
    });
  }catch(err){ toast("Error cargando agenda"); }
}

async function enviarMicroEncuesta(dia){
  const token = getTokenFromURL();
  const satis = parseInt(q(`#sat_${dia}`).value,10);
  const comentario = q(`#com_${dia}`).value;
  if(!satis || satis<1 || satis>5){ return toast("Ingresa un valor 1-5"); }
  try{
    await api("/survey/module", { token, dia, satis, comentario });
    toast("Gracias por tu respuesta.");
    location.reload();
  }catch(err){ toast("No se pudo enviar la encuesta"); }
}

// ---- Día 5 (evaluación y encuesta general) -> ver participante.html

// Export
window.Promet = {
  setBaseURL, handleLogin, epCreateCohort, formadorLoadAssigned, participanteLoad, enviarMicroEncuesta
};
