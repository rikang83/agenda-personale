// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = { databaseURL: "https://agenda-2026-eceb7-default-rtdb.europe-west1.firebasedatabase.app/" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

// --- VARIABILI GLOBALI ---
let giornoCorrente = "";
let datiGiorno = {};
let giorniSelezionatiRep = [];
let myChart = null;

const orariFissi = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];

const colMap = { 
    ric: ['#2196f3', 'R'], 
    a: ['#4caf50', 'A'], 
    d: ['#ff9800', 'D'], 
    v: ['#fbc02d', 'V'], 
    def: ['#ddd', ''] 
};

const categories = [
    { label: 'Matrimoni', keys: ['matrimonio', 'matrimoni'], color: '#1a237e' },
    { label: 'Battesimi', keys: ['battesimo', 'battesimi'], color: '#03a9f4' },
    { label: 'Cresime', keys: ['cresima', 'cresime'], color: '#9c27b0' },
    { label: 'Comunioni', keys: ['comunione', 'comunioni'], color: '#e91e63' },
    { label: 'Compleanni', keys: ['compleanno', 'compleanni'], color: '#ff9800' },
    { label: 'Laurea', keys: ['laurea', 'lauree'], color: '#d32f2f' },
    { label: 'In Studio', keys: ['in studio'], color: '#4caf50' }
];

// --- UTILITY ---
function cleanH(h) { return parseInt((h||"").replace(":","")) || 0; }
function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function toggleVista(v) {
    document.getElementById('vGiorno').style.display = v === 'g' ? 'block' : 'none';
    document.getElementById('vMese').style.display = v === 'm' ? 'block' : 'none';
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- NAVIGAZIONE E CALENDARIO ---
function selezionaGiorno(iso, skipRender = false) {
    giornoCorrente = iso;
    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const target = document.getElementById("st-" + iso);
    if(target) target.classList.add('active');

    db.ref('titoli/' + iso).on('value', s => { document.getElementById('titoloGiorno').value = s.val() || ""; });
    
    db.ref('agenda/' + iso).on('value', s => {
        datiGiorno = s.val() || {};
        if(!skipRender) renderGiorno();
    });
}

function salvaTitolo(val) { if(giornoCorrente) db.ref('titoli/' + giornoCorrente).set(val.toUpperCase()); }

function salvaCampo(id, campo, valore, oraOriginale, isWedSub = false) {
    if(!giornoCorrente) return;
    let update = { [campo]: valore };
    if(campo === 'h') update.sort = cleanH(valore);
    if(!isWedSub && !datiGiorno[id]) update.c = "def";
    db.ref(`agenda/${giornoCorrente}/${id}`).update(update);
}

// --- FUNZIONI COLORE ---
function cambiaColore(id, colKey, ora) {
    db.ref(`agenda/${giornoCorrente}/${id}`).update({ c: colKey, h: ora || "00:00", sort: cleanH(ora) });
}

function cambiaColoreMultiplo(id, campoColore, colKey) {
    db.ref(`agenda/${giornoCorrente}/${id}`).update({ [campoColore]: colKey });
}

// --- LOGICA RENDERING GIORNO ---
function renderGiorno() {
    const container = document.getElementById('listaImpegni');
    const scrollPos = window.scrollY;
    container.innerHTML = "";
    
    const mostraTutteRighe = document.getElementById('checkRighe').checked;
    const mostraEtichettaOra = document.getElementById('checkOrarioLabel').checked;

    let visualizzazione = {};
    if(mostraTutteRighe) {
        orariFissi.forEach(h => {
            const id = "h" + h.replace(":", "");
            visualizzazione[id] = { id: id, h: h, t: "", c: "def", sortKey: cleanH(h) };
        });
    }

    Object.keys(datiGiorno).forEach(key => {
        const item = datiGiorno[key];
        visualizzazione[key] = { id: key, ...item, sortKey: item.sort || cleanH(item.h) || 999 };
    });

    const sorted = Object.values(visualizzazione).sort((a,b) => a.sortKey - b.sortKey);

    sorted.forEach(item => {
        if(item.t || mostraTutteRighe || item.isAdmin || item.isBattesimoBlock) {
            const div = document.createElement('div');
            div.className = "slot";
            const hexBordo = colMap[item.c] ? colMap[item.c][0] : colMap.def[0];
            div.setAttribute('style', `border-left: 8px solid ${hexBordo} !important;`);

            if(item.isBattesimoBlock) {
                // Rendering speciale Battesimo (già fornito)
                div.className = "macro-battesimo";
                div.innerHTML = `<input type="text" class="titolo-schema-editabile bg-battesimo" value="${item.titolo_bat || 'BATTESIMO'}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_bat:this.value.toUpperCase()})"><button onclick="del('${item.id}')" style="position:absolute; right:15px; top:15px; background:none; border:none; font-size:20px; cursor:pointer;">🗑️</button><div style="display:grid; gap:10px;">` + 
                ['cerimonia', 'ricevimento'].map(key => `
                    <div class="slot-main" style="background:white; padding:10px; border-radius:10px; border-left:5px solid ${colMap[item[key+'_c']]?.[0] || '#ddd'}">
                        <div class="ora-box"><input type="text" class="ora-input" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div>
                        <div style="flex:1"><textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea>
                        <div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item[key+'_c']===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','${key}_c','${k}')">${colMap[k][1]}</div>`).join('')}</div></div>
                    </div>`).join('') + `</div>`;
            } else {
                // Rendering standard
                div.innerHTML = `
                    <div class="slot-main">
                        <div class="ora-box ${(!mostraEtichettaOra)?'hidden':''}"><input type="text" class="ora-input" value="${item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div>
                        <textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t || ''}</textarea>
                    </div>
                    <div class="color-dots">
                        ${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}','${item.h}')">${colMap[k][1]}</div>`).join('')}
                        <button onclick="del('${item.id}')" style="background:none; border:none; cursor:pointer; margin-left:10px;">🗑️</button>
                    </div>`;
            }
            container.appendChild(div);
            div.querySelectorAll('textarea').forEach(autoResize);
        }
    });
    window.scrollTo(0, scrollPos);
}

function del(id) { if(confirm("Eliminare?")) db.ref(`agenda/${giornoCorrente}/${id}`).remove(); }

function aggiungiRigaExtra() {
    const id = "ex" + Date.now();
    db.ref(`agenda/${giornoCorrente}/${id}`).set({ h: "12:00", t: "", c: "def", sort: 1200 });
}

// --- INIZIALIZZAZIONE ---
window.onload = () => {
    initCalendar();
    // Caricamento stati checkbox (Righe e Ora)
    document.getElementById('checkRighe').checked = localStorage.getItem('cfg_righe') !== 'false';
    document.getElementById('checkOrarioLabel').checked = localStorage.getItem('cfg_ora') !== 'false';
};

function salvaStatoRighe(v) { localStorage.setItem('cfg_righe', v); renderGiorno(); }
function salvaStatoOra(v) { localStorage.setItem('cfg_ora', v); renderGiorno(); }

// Assicurati di includere anche initCalendar() che ti ho mandato prima per la vista mese.
