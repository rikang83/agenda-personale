const firebaseConfig = { databaseURL: "https://agenda-2026-eceb7-default-rtdb.europe-west1.firebasedatabase.app/" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let giornoCorrente = "";
let datiGiorno = {};
let giorniSelezionatiRep = [];
let myChart = null;

const orariFissi = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];

// --- MAPPA COLORI ORIGINALE (TUOI CODICI) ---
const colMap = { 
    ric: ['#2196f3', 'R'], 
    a: ['#4caf50', 'A'], 
    d: ['#ff9800', 'D'], 
    v: ['#fbc02d', 'V'], 
    def: ['#ddd', ''] 
};

const festivi2026 = { "01-01":"Capodanno", "01-06":"Epifania", "04-05":"Pasqua", "04-06":"Pasquetta", "04-25":"Liberazione", "05-01":"Festa Lavoro", "06-02":"Festa Rep.", "08-15":"Ferragosto", "11-01":"Ognissanti", "12-08":"Immacolata", "12-25":"Natale", "12-26":"S. Stefano" };

const categories = [
    { label: 'Matrimoni', keys: ['matrimonio', 'matrimoni'], color: '#1a237e' },
    { label: 'Battesimi', keys: ['battesimo', 'battesimi'], color: '#03a9f4' },
    { label: 'Cresime', keys: ['cresima', 'cresime'], color: '#9c27b0' },
    { label: 'Comunioni', keys: ['comunione', 'comunioni'], color: '#e91e63' },
    { label: 'Compleanni', keys: ['compleanno', 'compleanni'], color: '#ff9800' },
    { label: 'Laurea', keys: ['laurea', 'lauree'], color: '#d32f2f' },
    { label: 'In Studio', keys: ['in studio'], color: '#4caf50' }
];

function cleanH(h) { return parseInt((h||"").replace(":","")) || 0; }
function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function initCalendar() {
    const mp = document.getElementById('monthPicker');
    if(!mp.options.length) {
        ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].forEach((m, i) => mp.add(new Option(m+" 2026", `2026-${String(i+1).padStart(2,'0')}`)));
        mp.value = `2026-${String(new Date().getMonth()+1).padStart(2,'0')}`;
        const si = document.getElementById('repHInizio'); const sf = document.getElementById('repHFine');
        orariFissi.forEach(h => { si.add(new Option(h, h)); sf.add(new Option(h, h)); });
    }
    const [y, m] = mp.value.split('-').map(Number);
    const strip = document.getElementById('strip'); strip.innerHTML = "";
    const corpo = document.getElementById('corpoMese'); corpo.innerHTML = "";
    let primoGiorno = new Date(y, m-1, 1).getDay(); 
    let offset = primoGiorno === 0 ? 6 : primoGiorno - 1;

    for(let s=0; s<offset; s++) { corpo.innerHTML += `<div class="cell-mese empty"></div>`; }
    
    for(let d=1; d<=new Date(y, m, 0).getDate(); d++) {
        const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dObj = new Date(iso);
        const festName = festivi2026[iso.substring(5)];
        const isDomenica = dObj.getDay() === 0;
        const festClass = festName ? 'nat-holiday' : (isDomenica ? 'holiday' : '');
        
        const ds = document.createElement('div'); ds.className = `day-item ${festClass}`; ds.id = "st-"+iso;
        ds.innerHTML = `<small>${["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][dObj.getDay()]}</small><br><b>${d}</b>`;
        ds.onclick = () => selezionaGiorno(iso); strip.appendChild(ds);
        
        const dc = document.createElement('div'); dc.className = `cell-mese ${festClass}`;
        dc.innerHTML = `<div class="cell-header"><span class="num-giorno">${d}</span><button class="btn-del-mese-clean" onclick="pulisciTuttoGiorno('${iso}', event)">🗑️</button></div>${festName ? `<div class="label-festivo">${festName}</div>` : ''}<div id="m-tit-${iso}" class="m-titolo-box"></div><div id="m-list-${iso}" class="m-lista-impegni"></div>`;
        dc.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { toggleVista('g'); selezionaGiorno(iso, true); } };
        corpo.appendChild(dc);

        // --- GESTIONE TITOLI (CATEGORIE O ROSSO SE DOMENICA) ---
        db.ref('titoli/'+iso).on('value', s => { 
            const el = document.getElementById('m-tit-'+iso); 
            if(el) {
                const val = (s.val() || "").toUpperCase();
                el.innerText = val; el.style.display = val ? "block" : "none";
                let bgColor = "#eeeeee", txtColor = "#333";
                categories.forEach(cat => { if(cat.keys.some(k => val.includes(k.toUpperCase()))) { bgColor = cat.color; txtColor = "white"; } });
                if((festName || isDomenica) && txtColor !== "white") { bgColor = "#d32f2f"; txtColor = "white"; }
                el.style.backgroundColor = bgColor; el.style.color = txtColor;
            } 
        });

        // --- GESTIONE IMPEGNI NEL MESE (COLORI DINAMICI DA colMap) ---
        db.ref('agenda/'+iso).on('value', s => {
            const box = document.getElementById('m-list-'+iso); if(!box) return; box.innerHTML = "";
            const data = s.val() || {};
            Object.values(data).sort((a,b)=> cleanH(a.h)-cleanH(b.h)).forEach(v => {
                let testoBreve = v.isBattesimoBlock ? "BATTESIMO" : (v.isWed ? "MATRIMONIO" : (v.t ? v.t.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase() : ""));
                if(testoBreve) {
                    const cHex = (colMap[v.c] ? colMap[v.c][0] : colMap.def[0]);
                    const item = document.createElement('div');
                    item.className = "item-mese";
                    item.style.backgroundColor = cHex;
                    item.style.color = (v.c === 'def' || !v.c) ? "#333" : "white";
                    item.innerHTML = `<span class="ora-m">${v.h && v.h !== '00:00' ? v.h : ''}</span> ${testoBreve}`;
                    box.appendChild(item);
                }
            });
        });
    }
    selezionaGiorno(new Date().toISOString().split('T')[0], true);
}

function renderGiorno() {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT") && active.type !== "checkbox") return;
    const container = document.getElementById('listaImpegni'); const scrollPos = window.scrollY; container.innerHTML = "";
    const mostraTutteRighe = document.getElementById('checkRighe').checked;
    const mostraEtichettaOra = document.getElementById('checkOrarioLabel').checked;
    let visualizzazione = {};
    if(mostraTutteRighe) orariFissi.forEach(h => { const id = "h" + h.replace(":", ""); visualizzazione[id] = { id: id, h: h, t: "", c: "def", sortKey: cleanH(h) }; });
    Object.keys(datiGiorno).forEach(key => { const item = datiGiorno[key]; visualizzazione[key] = { id: key, ...item, sortKey: item.sort || cleanH(item.h) || 999 }; });
    const sorted = Object.values(visualizzazione).sort((a,b) => a.sortKey - b.sortKey);
    
    sorted.forEach((item) => {
        if(item.t || mostraTutteRighe || item.isAdmin || item.isBattesimoBlock || item.id.startsWith("ex") || item.id.startsWith("rep_")) {
            const div = document.createElement('div'); 
            div.className = "slot"; 
            div.id = "slot-" + item.id;
            
            // --- FORZO IL COLORE DEL BORDO USANDO colMap ---
            const hexBordo = colMap[item.c] ? colMap[item.c][0] : colMap.def[0];
            div.setAttribute('style', `border-left: 6px solid ${hexBordo} !important;`);

            if(item.isBattesimoBlock) {
                div.className = "macro-battesimo";
                div.innerHTML = `<input type="text" class="titolo-schema-editabile bg-battesimo" value="${item.titolo_bat || 'BATTESIMO'}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_bat:this.value.toUpperCase()})"><button onclick="del('${item.id}')" style="position:absolute; right:25px; margin-top:-45px; background:none; border:none; color:white; cursor:pointer; font-size:18px;">🗑️</button><div style="display:grid; gap:10px;">${['cerimonia', 'ricevimento'].map(key => `<div class="slot-main" style="background:white; padding:10px; border-radius:10px; border-left:5px solid ${colMap[item[key+'_c']]?.[0] || '#ddd'}"><div class="ora-box"><input type="text" class="ora-input" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div><div style="flex:1"><textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea><div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item[key+'_c']===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','${key}_c','${k}')">${colMap[k][1]}</div>`).join('')}</div></div></div>`).join('')}<div class="slot-main" style="background:white; padding:10px; border-radius:10px; border-left:5px solid ${colMap[item.note_c]?.[0] || '#ddd'}"><div style="flex:1"><textarea class="nota-input" placeholder="NOTE" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || ''}</textarea><div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.note_c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','note_c','${k}')">${colMap[k][1]}</div>`).join('')}</div></div></div><div class="admin-block" style="border-color:var(--battesimo);"><div class="admin-top-row"><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><input type="text" class="input-adm" placeholder="FOTOGRAFO" value="${item.op_foto||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_foto:this.value})"><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" placeholder="OPERATORE" value="${item.op_video||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_video:this.value})"></div><div class="admin-grid"><div class="admin-label-row">ACCONTO</div><input type="number" class="input-adm" value="${item.acc1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({acc1:this.value})"><input type="text" class="input-adm" placeholder="DATA" value="${item.dat1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({dat1:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item.chi1===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item.id}').update({chi1:'${k}'})">${colMap[k][1]}</div>`).join('')}</div></div></div></div>`;
            } else {
                let contentHTML = "";
                if(item.isWed && item.t.startsWith("SPOSO:")) contentHTML += `<input type="text" class="titolo-schema-editabile bg-matrimonio" value="${item.titolo_mat || 'MATRIMONIO'}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_mat:this.value.toUpperCase()})">`;
                if(item.isAdmin) {
                    contentHTML += `<div class="admin-block"><div class="admin-top-row"><div class="admin-item">CONTRATTO <input type="checkbox" ${item.contratto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({contratto:this.checked})"></div><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" placeholder="OPERATORE" value="${item.operatore||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({operatore:this.value})"></div><div class="admin-grid">`;
                    for(let i=1; i<=6; i++) { contentHTML += `<div class="admin-label-row">${i===1?'1° ACCONTO':i+'° ACCONTO'}</div><input type="number" class="input-adm" value="${item['acc'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['acc'+${i}]:this.value})"><input type="text" class="input-adm" value="${item['dat'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['dat'+${i}]:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item['chi'+i]===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['chi'+${i}]:'${k}'})">${colMap[k][1]}</div>`).join('')}</div>`; }
                    contentHTML += `</div></div>`;
                } else if(item.isWed && (item.t.startsWith("SPOSO:") || item.t.startsWith("SPOSA:") || item.t.startsWith("CHIESA:"))) {
                    contentHTML += `<div class="slot-main"><div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><div style="flex:1"><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea><textarea class="nota-input" style="font-size:12px" onblur="salvaCampo('${item.id}_tel','t',this.value,'${item.h}',true)">${(datiGiorno[item.id+'_tel']?.t||'TEL: ')}</textarea><textarea class="nota-input" style="font-size:12px" onblur="salvaCampo('${item.id}_via','t',this.value,'${item.h}',true)">${(datiGiorno[item.id+'_via']?.t||'VIA: ')}</textarea></div></div>`;
                } else {
                    contentHTML += `<div class="slot-main"><div class="ora-box ${(!mostraEtichettaOra && !item.isWed)?'hidden':''}"><input type="text" class="ora-input" value="${item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div>`;
                }
                div.innerHTML = contentHTML + `<div class="color-dots">${(!item.isWed && !item.isAdmin)?Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}','${item.h}')">${colMap[k][1]}</div>`).join(''):''}<button onclick="del('${item.id}')" style="background:none; border:none; margin-left:10px; cursor:pointer;">🗑️</button></div>`;
            }
            container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize);
        }
    });
    window.scrollTo(0, scrollPos);
}

// ... (Resto delle funzioni logAttivita, selezionaGiorno, cambiaColore, ecc. rimangono come nel codice precedente)
