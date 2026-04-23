const firebaseConfig = { databaseURL: "https://agenda-2026-eceb7-default-rtdb.europe-west1.firebasedatabase.app/" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let giornoCorrente = "";
let datiGiorno = {};
let giorniSelezionatiRep = [];
let myChart = null;

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

function cleanH(h) { return parseInt((h||"").replace(":","")) || 0; }
function autoResize(el) { 
    el.style.height = 'auto'; 
    el.style.height = el.scrollHeight + 'px'; 
}

// --- NUOVA FUNZIONE LOG ATTIVITA (CHIRURGICA) ---
function logAttivita(messaggio, oraEvento = "", isoData = "") {
    const timestamp = Date.now();
    let dataIt = "";
    if (isoData) {
        const [y, m, d] = isoData.split("-");
        dataIt = `${d}/${m}/${y}`;
    }

    db.ref('logs').push({
        msg: messaggio,
        ora: oraEvento,
        dataIt: dataIt,
        iso: isoData,
        time: timestamp,
        letta: false
    });
}

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

    for(let s=0; s<offset; s++) {
        corpo.innerHTML += `<div class="cell-mese empty"></div>`;
    }
    
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
        dc.innerHTML = `
            <div class="cell-header">
                <span class="num-giorno">${d}</span>
                <button class="btn-del-mese-clean" onclick="pulisciTuttoGiorno('${iso}', event)">🗑️</button>
            </div>
            ${festName ? `<div class="label-festivo">${festName}</div>` : ''}
            <div id="m-tit-${iso}" class="m-titolo-box"></div>
            <div id="m-list-${iso}" class="m-lista-impegni"></div>
        `;
        dc.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { toggleVista('g'); selezionaGiorno(iso, true); } };
        corpo.appendChild(dc);

        db.ref('titoli/'+iso).on('value', s => { 
            const el = document.getElementById('m-tit-'+iso); 
            if(el) {
                const val = (s.val() || "").toUpperCase();
                el.innerText = val;
                el.style.display = val ? "block" : "none";
                el.style.backgroundColor = "#eeeeee"; 
                el.style.color = "#333";
                categories.forEach(cat => {
                    if(cat.keys.some(key => val.includes(key.toUpperCase()))) {
                        el.style.backgroundColor = cat.color;
                        el.style.color = "white";
                    }
                });
                if((festName || isDomenica) && el.style.color !== "white") {
                    el.style.backgroundColor = "#d32f2f"; 
                    el.style.color = "white";
                }
            } 
        });

        db.ref('agenda/'+iso).on('value', s => {
            const box = document.getElementById('m-list-'+iso); if(!box) return; box.innerHTML = "";
            const data = s.val() || {};
            Object.values(data).sort((a,b)=> cleanH(a.h)-cleanH(b.h)).forEach(v => {
                let testoBreve = "";
                if(v.isBattesimoBlock) testoBreve = "BATTESIMO";
                else if(v.isWed) testoBreve = "MATRIMONIO";
                else if(v.t) {
                    const parole = v.t.trim().split(/\s+/);
                    testoBreve = parole.slice(0, 2).join(' ').toUpperCase();
                }
                if(testoBreve) {
                    const cHex = (colMap[v.c] ? colMap[v.c][0] : colMap.def[0]);
                    const item = document.createElement('div');
                    item.className = "item-mese";
                    item.style.backgroundColor = cHex;
                    item.innerHTML = `<span class="ora-m">${v.h && v.h !== '00:00' ? v.h : ''}</span> ${testoBreve}`;
                    box.appendChild(item);
                }
            });
        });
    }
    selezionaGiorno(new Date().toISOString().split('T')[0], true);
    monitoraNotifiche(); 
}

function selezionaGiorno(data, scroll = false) {
    if(giornoCorrente) { 
        db.ref('agenda/'+giornoCorrente).off(); 
        db.ref('config/'+giornoCorrente).off(); 
    }
    giornoCorrente = data;
    
    // Gestione cambio mese automatico se clicco da notifica
    const [y, m] = data.split("-");
    const mp = document.getElementById('monthPicker');
    const targetMonth = `${y}-${m}`;
    if (mp.value !== targetMonth) {
        mp.value = targetMonth;
        initCalendar();
    }

    document.querySelectorAll('.day-item').forEach(i => i.classList.remove('active'));
    const att = document.getElementById('st-'+data); 
    if(att) { 
        att.classList.add('active'); 
        if(scroll) att.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    
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
            
            if(item.isBattesimoBlock) {
                const div = document.createElement('div'); div.className = "macro-battesimo";
                div.innerHTML = `
                    <input type="text" class="titolo-schema-editabile bg-battesimo" value="${item.titolo_bat || 'BATTESIMO'}" 
                        onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_bat:this.value.toUpperCase()})">
                    <button onclick="del('${item.id}')" style="position:absolute; right:25px; margin-top:-45px; background:none; border:none; color:white; cursor:pointer; font-size:18px;">🗑️</button>
                    <div style="display:grid; gap:10px;">
                        ${['cerimonia', 'ricevimento'].map(key => `
                            <div class="slot-main" style="background:white; padding:10px; border-radius:10px;">
                                <div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div>
                                <div style="flex:1">
                                    <textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea>
                                    <div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item[key+'_c']===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','${key}_c','${k}')">${colMap[k][1]}</div>`).join('')}</div>
                                </div>
                            </div>`).join('')}
                        <div class="slot-main" style="background:white; padding:10px; border-radius:10px;">
                            <div style="flex:1">
                                <textarea class="nota-input" placeholder="NOTE" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || ''}</textarea>
                                <div class="color-dots">${Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.note_c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColoreMultiplo('${item.id}','note_c','${k}')">${colMap[k][1]}</div>`).join('')}</div>
                            </div>
                        </div>
                        <div class="admin-block" style="border-color:var(--battesimo);">
                            <div class="admin-top-row">
                                <div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div>
                                <input type="text" class="input-adm" style="width:120px;" placeholder="FOTOGRAFO" value="${item.op_foto||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_foto:this.value})">
                                <div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div>
                                <input type="text" class="input-adm" style="width:120px;" placeholder="OPERATORE" value="${item.op_video||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_video:this.value})">
                            </div>
                            <div class="admin-grid">
                                <div class="admin-label-row">ACCONTO</div>
                                <input type="number" class="input-adm" style="width:70px" value="${item.acc1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({acc1:this.value})">
                                <input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item.dat1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({dat1:this.value})">
                                <div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item.chi1===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item.id}').update({chi1:'${k}'})">${colMap[k][1]}</div>`).join('')}</div>
                            </div>
                        </div>
                    </div>`;
                container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize); return;
            }

            const div = document.createElement('div'); div.className = "slot"; div.id = "slot-" + item.id;
            div.style.borderLeftColor = colMap[item.c]?.[0] || colMap.def[0];
            let contentHTML = "";

            if(item.isWed && item.t.startsWith("SPOSO:")) {
                contentHTML += `<input type="text" class="titolo-schema-editabile bg-matrimonio" value="${item.titolo_mat || 'MATRIMONIO'}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_mat:this.value.toUpperCase()})">`;
            }

            if(item.isAdmin) {
                contentHTML += `<div class="admin-block"><div class="admin-top-row"><div class="admin-item">CONTRATTO <input type="checkbox" ${item.contratto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({contratto:this.checked})"></div><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" placeholder="OPERATORE" value="${item.operatore||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({operatore:this.value})"></div><div class="admin-grid">`;
                for(let i=1; i<=6; i++) { contentHTML += `<div class="admin-label-row">${i===1?'1° ACCONTO':i+'° ACCONTO'}</div><input type="number" class="input-adm" style="width:70px" value="${item['acc'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['acc'+${i}]:this.value})"><input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item['dat'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['dat'+${i}]:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item['chi'+i]===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item['id']}').update({['chi'+${i}]:'${k}'})">${colMap[k][1]}</div>`).join('')}</div>`; }
                contentHTML += `</div></div>`;
            } else if(item.isWed && (item.t.startsWith("SPOSO:") || item.t.startsWith("SPOSA:") || item.t.startsWith("CHIESA:"))) {
                const tid = item.id+"_tel"; const vid = item.id+"_via";
                contentHTML += `<div class="slot-main"><div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><div style="flex:1"><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea><textarea class="nota-input" style="font-size:12px" onblur="salvaCampo('${tid}','t',this.value,'${item.h}',true)">${(datiGiorno[tid]?.t||'TEL: ')}</textarea><textarea class="nota-input" style="font-size:12px" onblur="salvaCampo('${vid}','t',this.value,'${item.h}',true)">${(datiGiorno[vid]?.t||'VIA: ')}</textarea></div></div>`;
            } else if(item.isWed && item.t.startsWith("ESTERNI:")) {
                contentHTML += `<div class="esterni-grid"><div class="esterni-header-label">ESTERNI</div>${[1,2,3,4,5].map(i => `<input type="text" class="loc-input" placeholder="Ora" value="${item['loc_h'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_h'+${i}]:this.value})"><input type="text" class="loc-input" placeholder="Location" value="${item['loc_t'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_t'+${i}]:this.value})">`).join('')}</div>`;
            } else if (item.id.endsWith("_tel") || item.id.endsWith("_via")) { return; }
            else { contentHTML += `<div class="slot-main"><div class="ora-box ${(!mostraEtichettaOra && !item.isWed)?'hidden':''}"><input type="text" class="ora-input" value="${item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div>`; }
            
            div.innerHTML = contentHTML + `<div class="color-dots">${(!item.isWed && !item.isAdmin)?Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}','${item.h}')">${colMap[k][1]}</div>`).join(''):''}<button onclick="del('${item.id}')" style="background:none; border:none; margin-left:10px; cursor:pointer;">🗑️</button></div>`;
            container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize);
        }
    });
    window.scrollTo(0, scrollPos);
}

function cambiaColoreMultiplo(id, campoC, colore) { const valAtt = datiGiorno[id]?.[campoC]; db.ref(`agenda/${giornoCorrente}/${id}`).update({[campoC]: (valAtt === colore ? 'def' : colore)}); }

function salvaCampo(id, campo, valore, oraDef, isSub=false) { 
    const valVecchio = isSub ? (datiGiorno[id]?.t || "") : (datiGiorno[id]?.[campo] || "");
    if(valore === valVecchio) return;

    const up = {[campo]:valore}; 
    if(oraDef!==undefined) up.h=oraDef; 
    if(isSub) up.isSub=true; 
    db.ref(`agenda/${giornoCorrente}/${id}`).update(up);

    if(campo === 't' && valore.length > 3) {
        logAttivita(`Modificato: ${valore.substring(0,30)}`, oraDef, giornoCorrente);
    }
}

function cambiaColore(id, c, oraDef) { const newVal = (datiGiorno[id]?.c === c) ? 'def' : c; db.ref(`agenda/${giornoCorrente}/${id}`).update({c:newVal, h:oraDef}); }
function del(id) { if(confirm("Eliminare?")) { db.ref(`agenda/${giornoCorrente}/${id}`).remove(); db.ref(`agenda/${giornoCorrente}/${id}_tel`).remove(); db.ref(`agenda/${giornoCorrente}/${id}_via`).remove(); } }
function salvaStatoOra(v) { db.ref('config/'+giornoCorrente).update({mostraOra:v}); renderGiorno(); }
function salvaStatoRighe(v) { db.ref('config/'+giornoCorrente).update({mostraRighe:v}); renderGiorno(); }
function salvaTitolo(v) { db.ref('titoli/'+giornoCorrente).set(v); logAttivita(`Titolo: ${v}`, "", giornoCorrente); }
function toggleVista(v) { document.getElementById('vGiorno').style.display = v==='g'?'block':'none'; document.getElementById('vMese').style.display = v==='m'?'block':'none'; if(v==='m') initCalendar(); }
function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function aggiungiRigaExtra() { const id = "ex" + Date.now(); db.ref(`agenda/${giornoCorrente}/${id}`).set({h:"00:00", t:"", c:"def", sort:999}); }

function applicaSchemaMatrimonio() {
    const ts = Date.now(); 
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    const titSpec = "MATRIMONIO";
    db.ref('titoli/'+giornoCorrente).once('value', s => { 
        let tOld = s.val() || ""; 
        let tNew = tOld ? (tOld.includes(titSpec) ? tOld : tOld + " E " + titSpec) : titSpec + " A "; 
        db.ref('titoli/'+giornoCorrente).set(tNew); 
    });
    const sc = [{id:"m"+ts+"_1",t:"SPOSO: ",s:1, tit: titSpec},{id:"m"+ts+"_2",t:"SPOSA: ",s:2},{id:"m"+ts+"_3",t:"CHIESA: ",s:3},{id:"m"+ts+"_4",t:"SALA: ",s:4},{id:"m"+ts+"_5",t:"ESTERNI:",s:5},{id:"m"+ts+"_6",t:"NOTE: ",s:6},{id:"adm_"+ts,isAdmin:true,s:7}];
    sc.forEach(i => { 
        if(i.isAdmin) db.ref(`agenda/${giornoCorrente}/${i.id}`).set({h:"00:00", isAdmin:true, sort:i.s, contratto:false, foto:false, video:false, operatore:""}); 
        else { 
            let data = {h:(i.s<4?"00:00":""), t:i.t, c:'def', isWed:true, sort:i.s};
            if(i.tit) data.titolo_mat = i.tit; 
            db.ref(`agenda/${giornoCorrente}/${i.id}`).set(data); 
            if(i.t.includes("SPOS")) { 
                db.ref(`agenda/${giornoCorrente}/${i.id}_tel`).set({h:"00:00", t:"TEL: ", c:'def', isSub:true, sort:i.s+0.1}); 
                db.ref(`agenda/${giornoCorrente}/${i.id}_via`).set({h:"00:00", t:"VIA: ", c:'def', isSub:true, sort:i.s+0.2}); 
            } 
        } 
    });
    logAttivita(`Aggiunto Schema MATRIMONIO`, "", giornoCorrente);
    closeModal('mainModal');
}

function applicaSchemaBattesimo() {
    const ts = Date.now(); 
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    const titSpec = "BATTESIMO";
    db.ref('titoli/'+giornoCorrente).once('value', s => { 
        let tOld = s.val() || ""; 
        let tNew = tOld ? (tOld.includes(titSpec) ? tOld : tOld + " E " + titSpec) : titSpec; 
        db.ref('titoli/'+giornoCorrente).set(tNew); 
    });
    const id = "bat_" + ts; 
    db.ref(`agenda/${giornoCorrente}/${id}`).set({ isBattesimoBlock: true, sort: 1, titolo_bat: titSpec, cerimonia_h: "", cerimonia_t: "", cerimonia_c: "def", ricevimento_h: "", ricevimento_t: "", ricevimento_c: "def", note_t: "", note_c: "def", foto: false, op_foto: "", video: false, op_video: "", acc1: "", dat1: "", chi1: "def" });
    logAttivita(`Aggiunto Schema BATTESIMO`, "", giornoCorrente);
    closeModal('mainModal');
}

function openRepModal() { document.getElementById('repTesto').value=""; document.getElementById('repDataFine').value=giornoCorrente; giorniSelezionatiRep=[]; document.querySelectorAll('.dot-day-rep').forEach(d=>d.classList.remove('active')); openModal('repModal'); }
function toggleRepDay(el,d) { if(giorniSelezionatiRep.includes(d)) { giorniSelezionatiRep=giorniSelezionatiRep.filter(x=>x!==d); el.classList.remove('active'); } else { giorniSelezionatiRep.push(d); el.classList.add('active'); } }
function eseguiRipetizione() { const t=document.getElementById('repTesto').value, h=document.getElementById('repHInizio').value, df=document.getElementById('repDataFine').value; if(!t||!df||giorniSelezionatiRep.length===0) return; let cur=new Date(giornoCorrente), fine=new Date(df); while(cur<=fine) { if(giorniSelezionatiRep.includes(cur.getDay())) { db.ref(`agenda/${cur.toISOString().split('T')[0]}/rep_${Date.now()}_${cur.getTime()}`).set({h:h, t:t, c:'def', sort:cleanH(h)}); } cur.setDate(cur.getDate()+1); } logAttivita(`Ripetizione: ${t}`); closeModal('repModal'); }
function cancellaRipetizioniInBlocco() { const df=document.getElementById('repDataFine').value; if(!df||!confirm("Eliminare?")) return; let cur=new Date(giornoCorrente), fine=new Date(df); while(cur<=fine) { let iso=cur.toISOString().split('T')[0]; db.ref(`agenda/${iso}`).once('value', s=>{ let d=s.val(); if(d) Object.keys(d).forEach(k=>{ if(k.startsWith('rep_')) db.ref(`agenda/${iso}/${k}`).remove(); }); }); cur.setDate(cur.getDate()+1); } logAttivita(`Cancellate ripetizioni`); closeModal('repModal'); }
function pulisciTuttoGiorno(iso, e) { if(e) e.stopPropagation(); if(confirm("Svuotare?")) { db.ref('agenda/'+iso).remove(); db.ref('titoli/'+iso).remove(); db.ref('config/'+iso).remove(); logAttivita(`Svuotata giornata`, "", iso); } }

function condividiWhatsApp() {
    if (!giornoCorrente) { alert("Seleziona prima un giorno."); return; }
    const tit = document.getElementById('titoloGiorno').value || "Agenda";
    let msg = `📅 *${tit}* (${giornoCorrente})\n\n`;
    if (datiGiorno) {
        Object.values(datiGiorno).sort((a,b)=>(a.sort||0)-(b.sort||0)).forEach(i => {
            if(i.isBattesimoBlock) {
                msg += `• *${i.titolo_bat || 'BATTESIMO'}*\n${i.cerimonia_h? '*'+i.cerimonia_h+'* ':''}${i.cerimonia_t}\n${i.ricevimento_h? '*'+i.ricevimento_h+'* ':''}${i.ricevimento_t}\n${i.note_t}\n`;
            } else if(!i.isSub && !i.isAdmin && i.t && i.t.length > 2) {
                msg += `• ${i.h && i.h !== '00:00' ? '*' + i.h + '* ' : ''}${i.t}\n`;
            }
        });
    }
    const whatsappLink = "https://wa.me/?text=" + encodeURIComponent(msg);
    window.open(whatsappLink, '_blank');
}

function openChartModal() { openModal('chartModal'); fetchAndDraw(); }
function fetchAndDraw() {
    db.ref('agenda').once('value', snapshot => {
        const allData = snapshot.val() || {}; 
        const stats = categories.map(() => new Array(12).fill(0)); 
        let total = 0;
        Object.keys(allData).forEach(date => { 
            if(!date.startsWith("2026")) return; 
            const mIdx = parseInt(date.split("-")[1])-1; 
            Object.values(allData[date]).forEach(item => { 
                if(item.isBattesimoBlock) { stats[1][mIdx]++; total++; return; } 
                if(!item.t || item.isSub) return; 
                const txt = item.t.toLowerCase(); 
                categories.forEach((cat, cIdx) => { 
                    if(cat.keys.some(k=>txt.includes(k))) { stats[cIdx][mIdx]++; total++; } 
                }); 
            }); 
        });
        document.getElementById('totalWorkCount').innerText = total; 
        const ctx = document.getElementById('workChart').getContext('2d'); 
        if(myChart) myChart.destroy();
        myChart = new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels:['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'], 
                datasets: categories.map((cat, i) => ({
                    label: cat.label, 
                    data: stats[i], 
                    borderColor: cat.color, 
                    backgroundColor: cat.color, 
                    tension: 0.3, 
                    fill: false, 
                    pointRadius: 4
                })) 
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        document.getElementById('statsLegend').innerHTML = categories.map(cat => `<div class="leg-item"><div class="leg-col" style="background:${cat.color}"></div>${cat.label}</div>`).join('');
    });
}

// --- LOGICA CENTRO NOTIFICHE (CHIRURGICA) ---
function monitoraNotifiche() {
    db.ref('logs').on('value', s => {
        const logs = s.val() || {};
        const contenitore = document.getElementById('notif-list');
        const badge = document.getElementById('notif-badge');
        contenitore.innerHTML = "";
        let nuovi = 0;
        const oraAttuale = Date.now();

        const chiavi = Object.keys(logs).reverse();
        chiavi.forEach(key => {
            const l = logs[key];
            
            // Auto-pulizia: se è letta da più di 24 ore, la cancello dal DB
            if (l.letta && (oraAttuale - l.time > 86400000)) {
                db.ref('logs/' + key).remove();
                return;
            }

            if (!l.letta) nuovi++;

            const item = document.createElement('div');
            item.className = "notif-item";
            item.style.padding = "12px";
            item.style.borderBottom = "1px solid #eee";
            item.style.backgroundColor = l.letta ? "transparent" : "#fffde7";
            item.style.cursor = "pointer";
            
            const dataOra = new Date(l.time).toLocaleString('it-IT', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
            item.innerHTML = `
                <div style="font-size:10px; color:#888; margin-bottom:3px;">${dataOra}</div>
                <div style="font-weight:${l.letta?'normal':'bold'}; color:#333;">${l.msg}</div>
                <div style="font-size:11px; color:var(--p); margin-top:3px;">${l.dataIt ? '📅 Vai al ' + l.dataIt : ''} ${l.ora ? ' 🕒 ore ' + l.ora : ''}</div>
            `;

            item.onclick = () => {
                db.ref('logs/' + key).update({ letta: true });
                if (l.iso) {
                    toggleVista('g');
                    selezionaGiorno(l.iso, true);
                    closeModal('notifModal');
                }
            };
            contenitore.appendChild(item);
        });

        badge.innerText = nuovi;
        badge.style.display = nuovi > 0 ? "flex" : "none";
    });
}

function toggleNotifiche() { openModal('notifModal'); }

window.onload = initCalendar;

/* --- SWIPE PER CAMBIO MESE --- */
let touchstartX = 0;
let touchendX = 0;
const vMeseArea = document.getElementById('vMese');
vMeseArea.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, false);
vMeseArea.addEventListener('touchend', e => { touchendX = e.changedTouches[0].screenX; handleGesture(); }, false);

function handleGesture() {
    const picker = document.getElementById('monthPicker');
    let currentIndex = picker.selectedIndex;
    if (touchendX < touchstartX - 70) {
        if (currentIndex < picker.options.length - 1) {
            picker.selectedIndex = currentIndex + 1;
            initCalendar();
        }
    }
    if (touchendX > touchstartX + 70) {
        if (currentIndex > 0) {
            picker.selectedIndex = currentIndex - 1;
            initCalendar();
        }
    }
}
