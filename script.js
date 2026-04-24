const firebaseConfig = { databaseURL: "https://agenda-2026-eceb7-default-rtdb.europe-west1.firebasedatabase.app/" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let giornoCorrente = "";
let datiGiorno = {};
let giorniSelezionatiRep = [];
let myChart = null;
let notifCount = 0;

const orariFissi = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
const colMap = { ric:['#2196f3','R'], a:['#4caf50','A'], d:['#ff9800','D'], v:['#fbc02d','V'], def:['#ddd',''] };
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

// --- UTILS ---
function cleanH(h) { 
    if (!h || h === "" || h === "00:00") return 9999;
    return parseInt(h.replace(":", "")) || 0; 
}
function autoResize(el) { 
    if(!el) return; 
    el.style.height = 'auto'; 
    el.style.height = (el.scrollHeight) + 'px'; 
}

// --- LOGICA TAB ---
document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        setTimeout(() => {
            const el = document.activeElement;
            if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                const val = el.value;
                if (val.includes(':')) {
                    const pos = val.indexOf(':') + 2;
                    el.setSelectionRange(pos, pos);
                }
            }
        }, 10);
    }
});

// --- NOTIFICHE ---
function setupNotifiche() {
    const list = document.getElementById('notif-list');
    db.ref('notifiche_log').orderByChild('timestamp').limitToLast(30).on('value', (snapshot) => {
        const logs = snapshot.val() || {};
        list.innerHTML = "";
        let unread = 0;
        const oraAttuale = Date.now();
        const ultimoCheckLocale = parseInt(localStorage.getItem('notifiche_lette_timestamp')) || 0;
        Object.keys(logs).reverse().forEach(key => {
            const n = logs[key];
            if (oraAttuale - n.timestamp > 86400000) { db.ref('notifiche_log/' + key).remove(); return; }
            const isRead = localStorage.getItem('read_' + key) || (n.timestamp <= ultimoCheckLocale);
            if (!isRead) unread++;
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.style.backgroundColor = isRead ? 'transparent' : '#fff9c4';
            item.style.borderLeft = isRead ? 'none' : '4px solid #2196f3';
            item.style.opacity = isRead ? '0.6' : '1';
            const dataModifica = new Date(n.timestamp).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            item.innerHTML = `<div style="font-size: 10px; color: #666; margin-bottom: 2px;">Modifica del ${dataModifica} - Giorno ${n.dataGiorno}</div><div style="font-size: 14px; font-weight: bold; color: #333;">${n.testo}</div>`;
            item.onclick = () => {
                localStorage.setItem('read_' + key, 'true');
                if(document.getElementById('vMese').style.display !== 'none') toggleVista('g');
                selezionaGiorno(n.dataGiorno, true);
                setTimeout(() => {
                    const rigaEl = document.getElementById('slot-' + n.rigaId);
                    if (rigaEl) { rigaEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); rigaEl.style.backgroundColor = '#fff9c4'; setTimeout(() => rigaEl.style.backgroundColor = 'transparent', 2000); }
                }, 600);
                closeModal('notifModal');
            };
            list.appendChild(item);
        });
        notifCount = unread;
        aggiornaBadge(unread);
    });
}
function aggiornaBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (badge) { badge.innerText = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
}
function toggleNotifiche() { openModal('notifModal'); }
function segnaTutteLette() { localStorage.setItem('notifiche_lette_timestamp', Date.now()); aggiornaBadge(0); setupNotifiche(); }
function chiudiNotifiche() { closeModal('notifModal'); }

// --- CALENDARIO & VISTE ---
function initCalendar() {
    const mp = document.getElementById('monthPicker');
    if(!mp.options.length) {
        ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].forEach((m, i) => mp.add(new Option(m+" 2026", `2026-${String(i+1).padStart(2,'0')}`)));
        mp.value = `2026-${String(new Date().getMonth()+1).padStart(2,'0')}`;
        const si = document.getElementById('repHInizio'), sf = document.getElementById('repHFine');
        if(si && sf) orariFissi.forEach(h => { si.add(new Option(h, h)); sf.add(new Option(h, h)); });
        setupNotifiche();
    }
    const [y, m] = mp.value.split('-').map(Number);
    const strip = document.getElementById('strip'), corpo = document.getElementById('corpoMese');
    strip.innerHTML = ""; corpo.innerHTML = "";
    let offset = new Date(y, m-1, 1).getDay(); offset = offset === 0 ? 6 : offset - 1;
    for(let s=0; s<offset; s++) corpo.innerHTML += `<div class="cell-mese empty"></div>`;
    for(let d=1; d<=new Date(y, m, 0).getDate(); d++) {
        const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const festName = festivi2026[iso.substring(5)], isDom = new Date(iso).getDay() === 0;
        const festClass = festName ? 'nat-holiday' : (isDom ? 'holiday' : '');
        
        const ds = document.createElement('div'); ds.className = `day-item ${festClass}`; ds.id = "st-"+iso;
        ds.innerHTML = `<small>${["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][new Date(iso).getDay()]}</small><br><b>${d}</b>`;
        ds.onclick = () => selezionaGiorno(iso); strip.appendChild(ds);

        const dc = document.createElement('div'); dc.className = `cell-mese ${festClass}`;
        dc.innerHTML = `<div class="cell-header"><span class="num-giorno">${d}</span><button class="btn-del-mese-clean" onclick="pulisciTuttoGiorno('${iso}', event)" style="background:none; border:none; cursor:pointer;">🗑️</button></div>${festName ? `<div style="font-size:9px; color:red; font-weight:bold;">${festName}</div>` : ''}<div id="m-tit-${iso}" style="font-size:10px; font-weight:bold; margin-top:2px; padding:2px; border-radius:3px;"></div><div id="m-list-${iso}" style="margin-top:2px;"></div>`;
        dc.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { toggleVista('g'); selezionaGiorno(iso, true); } };
        corpo.appendChild(dc);

        db.ref('titoli/'+iso).on('value', s => { 
            const el = document.getElementById('m-tit-'+iso); 
            if(el) {
                const val = (s.val() || "").toUpperCase();
                el.innerText = val; el.style.display = val ? "block" : "none"; el.style.backgroundColor = "#eeeeee"; el.style.color = "#333";
                categories.forEach(cat => { if(cat.keys.some(key => val.includes(key.toUpperCase()))) { el.style.backgroundColor = cat.color; el.style.color = "white"; } });
            } 
        });
        db.ref('agenda/'+iso).on('value', s => {
            const box = document.getElementById('m-list-'+iso); if(!box) return; box.innerHTML = "";
            const data = s.val() || {};
            Object.values(data).sort((a,b)=> cleanH(a.h)-cleanH(b.h)).forEach(v => {
                let testoBreve = v.isBattesimoBlock ? "BATTESIMO" : (v.isWedBlock ? "MATRIMONIO" : (v.isWed ? "MATRIMONIO" : (v.t ? v.t.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase() : "")));
                if(testoBreve) { const item = document.createElement('div'); item.className = "item-mese"; item.style.backgroundColor = (colMap[v.c] ? colMap[v.c][0] : colMap.def[0]); item.innerHTML = `${v.h && v.h !== '00:00' ? v.h : ''} ${testoBreve}`; box.appendChild(item); }
            });
        });
    }
    if(!giornoCorrente) selezionaGiorno(new Date().toISOString().split('T')[0], true);
}

function selezionaGiorno(data, scroll = false) {
    if(giornoCorrente) { db.ref('agenda/'+giornoCorrente).off(); db.ref('config/'+giornoCorrente).off(); }
    giornoCorrente = data;
    document.querySelectorAll('.day-item').forEach(i => i.classList.remove('active'));
    const att = document.getElementById('st-'+data); 
    if(att) { att.classList.add('active'); if(scroll) att.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }
    db.ref('titoli/'+data).once('value', s => { document.getElementById('titoloGiorno').value = s.val() || ""; });
    db.ref('config/'+data).on('value', s => {
        const conf = s.val() || {};
        document.getElementById('checkOrarioLabel').checked = conf.mostraOra !== false;
        document.getElementById('checkRighe').checked = conf.mostraRighe !== false;
        renderGiorno();
    });
    db.ref('agenda/'+data).on('value', s => { datiGiorno = s.val() || {}; renderGiorno(); });
}

function renderGiorno() {
    const active = document.activeElement;
    // Non resettiamo se l'utente sta scrivendo in una textarea (per non perdere il focus)
    // Permettiamo invece il reset se l'utente ha appena finito di scrivere in un input (ora)
    if (active && active.tagName === "TEXTAREA") return;
    
    const container = document.getElementById('listaImpegni'), scrollPos = window.scrollY; 
    container.innerHTML = "";
    const mostraTutteRighe = document.getElementById('checkRighe').checked;
    const mostraEtichettaOra = document.getElementById('checkOrarioLabel').checked;
    
    // Funzione interna per trovare il primo orario utile in un blocco (Logica Fallback)
    const getFirstValidHour = (item, type) => {
        const priorityWed = ['sposo_h', 'sposa_h', 'chiesa_h', 'sala_h'];
        const priorityBat = ['cerimonia_h', 'ricevimento_h'];
        const list = type === 'wed' ? priorityWed : priorityBat;
        
        for (let field of list) {
            if (item[field] && item[field].trim() !== "" && item[field] !== "00:00") {
                return cleanH(item[field]);
            }
        }
        return 9999; // In fondo se tutto vuoto
    };

    let visualizzazione = [];

    // 1. Slot vuoti (se attivi)
    if(mostraTutteRighe) {
        orariFissi.forEach(h => {
            visualizzazione.push({ id: "h" + h.replace(":", ""), h: h, t: "", c: "def", sortKey: cleanH(h) });
        });
    }
    
    // 2. Elaborazione Dati con nuova priorità
    Object.keys(datiGiorno).forEach(key => { 
        const item = datiGiorno[key]; 
        let p;

        if (item.isWedBlock) {
            p = getFirstValidHour(item, 'wed');
        } else if (item.isBattesimoBlock) {
            p = getFirstValidHour(item, 'bat');
        } else {
            p = cleanH(item.h);
        }
        
        visualizzazione.push({ id: key, ...item, sortKey: p }); 
    });

    // 3. Ordinamento Finale
    const sorted = visualizzazione.sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        return a.id.localeCompare(b.id);
    });
    
    sorted.forEach((item) => {
        if(item.t || mostraTutteRighe || item.isAdmin || item.isBattesimoBlock || item.isWedBlock || item.id.startsWith("ex") || item.id.startsWith("rep_")) {
            
            // --- BLOCCO BATTESIMO ---
            if(item.isBattesimoBlock) {
                const div = document.createElement('div'); div.className = "macro-battesimo"; div.id = "slot-" + item.id;
                div.innerHTML = `<div class="titolo-battesimo"><input type="text" value="${item.titolo_bat || 'BATTESIMO'}" style="background:none; border:none; color:white; font-weight:900; text-align:center; width:80%; outline:none; font-family:inherit; font-size:18px;" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_bat:this.value})"><button onclick="del('${item.id}')" style="float:right; background:none; border:none; color:white; cursor:pointer;">🗑️</button></div>
                    <div style="display:grid; gap:10px;">${['cerimonia', 'ricevimento'].map(key => `<div class="slot-main" style="background:white; padding:10px; border-radius:10px;"><div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value}).then(()=>renderGiorno())"></div><div style="flex:1"><textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea><div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item[key+'_c']===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','${key}_c','${k}')">${colMap[k][1]}</div>`).join('')}</div></div></div>`).join('')}
                    <div class="slot-main" style="background:white; padding:10px; border-radius:10px;"><div style="flex:1"><textarea class="nota-input" placeholder="NOTE" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || ''}</textarea><div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.note_c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','note_c','${k}')">${colMap[k][1]}</div>`).join('')}</div></div></div>
                    <div class="admin-block" style="border-color:var(--battesimo);"><div class="admin-top-row"><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><input type="text" class="input-adm" style="width:120px;" placeholder="FOTOGRAFO" value="${item.op_foto||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_foto:this.value})"><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" style="width:120px;" placeholder="OPERATORE" value="${item.op_video||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_video:this.value})"></div><div class="admin-grid"><div class="admin-label-row">ACCONTO</div><input type="number" class="input-adm" style="width:70px" value="${item.acc1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({acc1:this.value})"><input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item.dat1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({dat1:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item.chi1===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item.id}').update({chi1:'${k}'})">${colMap[k][1]}</div>`).join('')}</div></div></div></div>`;
                container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize); return;
            }

            // --- BLOCCO MATRIMONIO MACRO ---
            if(item.isWedBlock) {
                const div = document.createElement('div'); div.className = "macro-battesimo"; div.id = "slot-" + item.id;
                div.style.background = "#e8eaf6"; div.style.border = "2px solid #1a237e";
                div.innerHTML = `<div class="titolo-battesimo" style="background:#1a237e"><input type="text" value="${item.titolo_wed || 'MATRIMONIO'}" style="background:none; border:none; color:white; font-weight:900; text-align:center; width:80%; outline:none; font-family:inherit; font-size:18px;" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_wed:this.value})"><button onclick="del('${item.id}')" style="float:right; background:none; border:none; color:white; cursor:pointer;">🗑️</button></div>
                    <div style="display:grid; gap:10px; padding:10px;">
                        ${['sposo','sposa'].map(k => `<div class="slot-main" style="background:white; padding:10px; border-radius:10px;"><div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[k+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_h']:this.value}).then(()=>renderGiorno())"></div><div style="flex:1; display:flex; flex-direction:column; gap:5px;"><div style="display:flex; gap:10px;"><textarea class="nota-input" style="flex:2; font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_t']:this.value})">${item[k+'_t']||(k.toUpperCase()+': ')}</textarea><textarea class="nota-input" style="flex:1; font-weight:bold; font-size:16px;" placeholder="TEL:" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_tel']:this.value})">${item[k+'_tel']||'TEL: '}</textarea></div><textarea class="nota-input" style="font-weight:bold; font-size:16px; border-top:1px dashed #eee;" placeholder="VIA:" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_via']:this.value})">${item[k+'_via']||'VIA: '}</textarea></div></div>`).join('')}
                        ${['chiesa', 'sala'].map(key => `<div class="slot-main" style="background:white; padding:10px; border-radius:10px;"><div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value}).then(()=>renderGiorno())"></div><div style="flex:1"><textarea class="nota-input" style="font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || (key.toUpperCase()+': ')}</textarea></div></div>`).join('')}
                        <div class="esterni-grid" style="background:white; padding:10px; border-radius:10px;"><div class="esterni-header-label" style="color:#1a237e">ESTERNI</div>${[1,2,3,4,5].map(i => `<input type="text" class="loc-input" placeholder="Ora" value="${item['loc_h'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_h'+${i}]:this.value}).then(()=>renderGiorno())"><input type="text" class="loc-input" placeholder="Location" value="${item['loc_t'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_t'+${i}]:this.value})">`).join('')}</div>
                        <div class="slot-main" style="background:white; padding:10px; border-radius:10px;"><textarea class="nota-input" style="font-weight:bold; font-size:16px;" placeholder="NOTE" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || 'NOTE: '}</textarea></div>
                    </div>`;
                container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize); return;
            }

            // --- RIGA STANDARD ---
            const div = document.createElement('div'); div.className = "slot"; div.id = "slot-" + item.id;
            div.style.borderLeftColor = colMap[item.c]?.[0] || colMap.def[0];
            let contentHTML = "";
            if(item.isAdmin) {
                contentHTML = `<div class="admin-block"><div class="admin-top-row"><div class="admin-item">CONTRATTO <input type="checkbox" ${item.contratto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({contratto:this.checked})"></div><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" placeholder="OPERATORE" value="${item.operatore||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({operatore:this.value})"></div><div class="admin-grid">`;
                for(let i=1; i<=6; i++) { contentHTML += `<div class="admin-label-row">${i===1?'1° ACCONTO':i+'° ACCONTO'}</div><input type="number" class="input-adm" style="width:70px" value="${item['acc'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['acc'+${i}]:this.value})"><input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item['dat'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['dat'+${i}]:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item['chi'+i]===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item.id}').update({['chi'+${i}]:'${k}'})">${colMap[k][1]}</div>`).join('')}</div>`; }
                contentHTML += `</div></div>`;
            } 
            else if(item.isWed && (item.t.startsWith("SPOSO:") || item.t.startsWith("SPOSA:"))) {
                const tid = item.id+"_tel", vid = item.id+"_via";
                contentHTML = `<div class="slot-main"><div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><div style="flex:1; display:flex; flex-direction:column; gap:5px;"><div style="display:flex; gap:10px;"><textarea class="nota-input" style="flex:2; font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea><textarea class="nota-input" style="flex:1; font-weight:bold; font-size:16px;" placeholder="TEL:" oninput="autoResize(this)" onblur="salvaCampo('${tid}','t',this.value,'${item.h}',true)">${(datiGiorno[tid]?.t||'TEL: ')}</textarea></div><textarea class="nota-input" style="font-weight:bold; font-size:16px; border-top:1px dashed #eee;" placeholder="VIA:" oninput="autoResize(this)" onblur="salvaCampo('${vid}','t',this.value,'${item.h}',true)">${(datiGiorno[vid]?.t||'VIA: ')}</textarea></div></div>`;
            } 
            else if(item.isWed && (item.t.startsWith("CHIESA:") || item.t.startsWith("SALA:") || item.t.startsWith("NOTE:"))) {
                contentHTML = `<div class="slot-main"><div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><div style="flex:1"><textarea class="nota-input" style="font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div></div>`;
            } else if(item.isWed && item.t.startsWith("ESTERNI:")) {
                contentHTML = `<div class="esterni-grid"><div class="esterni-header-label">ESTERNI</div>${[1,2,3,4,5].map(i => `<input type="text" class="loc-input" placeholder="Ora" value="${item['loc_h'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_h'+${i}]:this.value}).then(()=>renderGiorno())"><input type="text" class="loc-input" placeholder="Location" value="${item['loc_t'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_t'+${i}]:this.value})">`).join('')}</div>`;
            } else if (item.id.endsWith("_tel") || item.id.endsWith("_via")) { return; }
            else { contentHTML = `<div class="slot-main"><div class="ora-box ${(!mostraEtichettaOra && !item.isWed)?'hidden':''}"><input type="text" class="ora-input" value="${item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div>`; }
            div.innerHTML = contentHTML + `<div class="color-dots">${(!item.isWed && !item.isAdmin)?Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}','${item.h}')">${colMap[k][1]}</div>`).join(''):''}<button onclick="del('${item.id}')" style="background:none; border:none; margin-left:10px; cursor:pointer;">🗑️</button></div>`;
            container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize);
        }
    });

    setTimeout(() => { document.querySelectorAll('textarea.nota-input').forEach(tx => autoResize(tx)); }, 150);
    window.scrollTo(0, scrollPos);
}

// --- FUNZIONI DATABASE ---
function salvaCampo(id, campo, valore, oraDef, isSub=false) { 
    const mainId = id.replace('_tel', '').replace('_via', '');
    const up = {[campo]:valore}; 
    const oraInput = document.querySelector(`#slot-${mainId} .ora-input`)?.value || oraDef;
    
    if(oraInput !== undefined) { 
        up.h = oraInput; 
        up.sort = cleanH(oraInput); 
    }
    
    if(isSub) up.isSub=true; 
    
    db.ref(`agenda/${giornoCorrente}/${id}`).update(up).then(() => {
        // Se abbiamo salvato un orario, rinfreschiamo l'ordine della lista
        if (campo === 'h') {
            renderGiorno();
        }
    }); 

    if (campo === 't' && valore.trim().length > 1 && !isSub) { 
        db.ref('notifiche_log').push({ 
            timestamp: Date.now(), 
            dataGiorno: giornoCorrente, 
            rigaId: mainId, 
            testo: `Ora: ${oraInput || '00:00'} - ${valore.substring(0,40)}` 
        }); 
    }
}
function cambiaColore(id, c, oraDef) { 
    const mainId = id.replace('_tel', '').replace('_via', '');
    const oraAttuale = document.querySelector(`#slot-${mainId} .ora-input`)?.value || oraDef;
    
    db.ref(`agenda/${giornoCorrente}/${id}`).update({
        c: (datiGiorno[id]?.c === c ? 'def' : c), 
        h: oraAttuale, 
        sort: cleanH(oraAttuale)
    }).then(() => {
        // Ricarichiamo per applicare il colore visivamente e mantenere l'ordine
        renderGiorno();
    }); 
}
function cambiaColoreMultiplo(id, campoC, colore) { db.ref(`agenda/${giornoCorrente}/${id}`).update({[campoC]: (datiGiorno[id]?.[campoC] === colore ? 'def' : colore)}); }
function del(id) { if(confirm("Eliminare?")) { db.ref(`agenda/${giornoCorrente}/${id}`).remove(); db.ref(`agenda/${giornoCorrente}/${id}_tel`).remove(); db.ref(`agenda/${giornoCorrente}/${id}_via`).remove(); } }
function pulisciTuttoGiorno(iso, e) { if(e) e.stopPropagation(); if(confirm("Svuotare tutto?")) { db.ref('agenda/'+iso).remove(); db.ref('titoli/'+iso).remove(); db.ref('config/'+iso).remove(); } }

// --- SCHEMI & MODAL ---
function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function aggiungiRigaExtra() { const id = "ex" + Date.now(); db.ref(`agenda/${giornoCorrente}/${id}`).set({h:"00:00", t:"", c:"def", sort:9999}); }
function salvaStatoOra(v) { db.ref('config/'+giornoCorrente).update({mostraOra:v}); renderGiorno(); }
function salvaStatoRighe(v) { db.ref('config/'+giornoCorrente).update({mostraRighe:v}); renderGiorno(); }
function salvaTitolo(v) { db.ref('titoli/'+giornoCorrente).set(v); }

function applicaSchemaMatrimonio() {
    const id = "wed_" + Date.now();
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    db.ref(`agenda/${giornoCorrente}/${id}`).set({ isWedBlock: true, sort: 1, titolo_wed: "MATRIMONIO", sposo_t: "SPOSO: ", sposa_t: "SPOSA: ", chiesa_t: "CHIESA: ", sala_t: "SALA: ", note_t: "NOTE: " });
    closeModal('mainModal');
}
function applicaSchemaBattesimo() {
    const id = "bat_" + Date.now();
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    db.ref(`agenda/${giornoCorrente}/${id}`).set({ isBattesimoBlock: true, sort: 1, titolo_bat: "BATTESIMO" });
    closeModal('mainModal');
}

// --- RIPETIZIONI ---
function openRepModal() { document.getElementById('repTesto').value=""; document.getElementById('repDataFine').value=giornoCorrente; giorniSelezionatiRep=[]; document.querySelectorAll('.dot-day-rep').forEach(d=>d.classList.remove('active')); openModal('repModal'); }
function toggleRepDay(el,d) { if(giorniSelezionatiRep.includes(d)) { giorniSelezionatiRep=giorniSelezionatiRep.filter(x=>x!==d); el.classList.remove('active'); } else { giorniSelezionatiRep.push(d); el.classList.add('active'); } }
function eseguiRipetizione() {
    const t=document.getElementById('repTesto').value, h=document.getElementById('repHInizio').value, df=document.getElementById('repDataFine').value;
    if(!t||!df||giorniSelezionatiRep.length===0) return;
    let cur=new Date(giornoCorrente), fine=new Date(df);
    while(cur<=fine) {
        if(giorniSelezionatiRep.includes(cur.getDay())) {
            db.ref(`agenda/${cur.toISOString().split('T')[0]}/rep_${Date.now()}_${cur.getTime()}`).set({h:h, t:t, c:'def', sort:cleanH(h)});
        }
        cur.setDate(cur.getDate()+1);
    }
    closeModal('repModal');
}
function cancellaRipetizioniInBlocco() {
    const df=document.getElementById('repDataFine').value; if(!df||!confirm("Eliminare?")) return;
    let cur=new Date(giornoCorrente), fine=new Date(df);
    while(cur<=fine) {
        let iso=cur.toISOString().split('T')[0];
        db.ref(`agenda/${iso}`).once('value', s=>{ let d=s.val(); if(d) Object.keys(d).forEach(k=>{ if(k.startsWith('rep_')) db.ref(`agenda/${iso}/${k}`).remove(); }); });
        cur.setDate(cur.getDate()+1);
    }
    closeModal('repModal');
}

// --- UTILS EXTRA ---
function condividiWhatsApp() {
    if (!giornoCorrente) return;
    const tit = document.getElementById('titoloGiorno').value || "Agenda";
    let msg = `📅 *${tit}* (${giornoCorrente})\n\n`;
    const sorted = Object.values(datiGiorno).sort((a,b)=>(a.sort||cleanH(a.h))-(b.sort||cleanH(b.h)));
    sorted.forEach(i => {
        if(i.isBattesimoBlock) msg += `• *${i.titolo_bat || 'BATTESIMO'}*\n${i.cerimonia_h? '*'+i.cerimonia_h+'* ':''}${i.cerimonia_t}\n`;
        else if(!i.isSub && !i.isAdmin && i.t && i.t.length > 2) msg += `• ${i.h && i.h !== '00:00' ? '*' + i.h + '* ' : ''}${i.t}\n`;
    });
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), '_blank');
}

function openChartModal() { openModal('chartModal'); fetchAndDraw(); }
function fetchAndDraw() {
    db.ref('agenda').once('value', snapshot => {
        const allData = snapshot.val() || {}, stats = categories.map(() => new Array(12).fill(0)); let total = 0;
        Object.keys(allData).forEach(date => {
            if(!date.startsWith("2026")) return;
            const mIdx = parseInt(date.split("-")[1])-1;
            Object.values(allData[date]).forEach(item => {
                if(item.isBattesimoBlock) { stats[1][mIdx]++; total++; return; }
                if(!item.t || item.isSub) return;
                const txt = item.t.toLowerCase();
                categories.forEach((cat, cIdx) => { if(cat.keys.some(k=>txt.includes(k))) { stats[cIdx][mIdx]++; total++; } });
            });
        });
        document.getElementById('totalWorkCount').innerText = total;
        const ctx = document.getElementById('workChart').getContext('2d');
        if(myChart) myChart.destroy();
        myChart = new Chart(ctx, { type: 'line', data: { labels:['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'], datasets: categories.map((cat, i) => ({ label: cat.label, data: stats[i], borderColor: cat.color, backgroundColor: cat.color, tension: 0.3, fill: false, pointRadius: 4 })) }, options: { responsive: true, maintainAspectRatio: false } });
        document.getElementById('statsLegend').innerHTML = categories.map(cat => `<div class="leg-item"><div class="leg-col" style="background:${cat.color}"></div>${cat.label}</div>`).join('');
    });
}

function toggleVista(v) {
    const vg = document.getElementById('vGiorno'), vm = document.getElementById('vMese');
    if (v === 'm') { vg.style.display = 'none'; vm.style.display = 'block'; initCalendar(); } 
    else { vg.style.display = 'block'; vm.style.display = 'none'; }
}

// --- SWIPE ---
let touchstartX = 0, touchendX = 0;
const vMeseContainer = document.getElementById('vMese');
vMeseContainer.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, false);
vMeseContainer.addEventListener('touchend', e => { touchendX = e.changedTouches[0].screenX; handleGesture(); }, false);
function handleGesture() { if (touchendX < touchstartX - 100) cambiaMeseOffset(1); if (touchendX > touchstartX + 100) cambiaMeseOffset(-1); }
function cambiaMeseOffset(offset) { const mp = document.getElementById('monthPicker'); let n = mp.selectedIndex + offset; if (n >= 0 && n < mp.options.length) { mp.selectedIndex = n; initCalendar(); } }

window.onload = initCalendar;
