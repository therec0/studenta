// ==UserScript==
// @name         Studenta Attendance Analyzer v7 (Kebab Toggle Fixed)
// @namespace    https://github.com/Mies/studenta-analyzer
// @version      1.8
// @description  Minimalistic stoic UI with hidden panel, toggled by kebab emoji, highlights, >10% popup, credit link.
// @author       Mies
// @homepage     https://github.com/Mies/studenta-analyzer
// @match        *://*/studentgo/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- Create emoji toggle button ---
    const toggleBtn = document.createElement('div');
    toggleBtn.textContent = '🥙';
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.bottom = '20px';
    toggleBtn.style.right = '20px';
    toggleBtn.style.fontSize = '26px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.zIndex = '999999';
    toggleBtn.style.userSelect = 'none';
    document.body.appendChild(toggleBtn);

    // --- Panel placeholder created immediately ---
    let panel = document.createElement('div');
    panel.style.display = 'none'; // hidden by default
    document.body.appendChild(panel);

    toggleBtn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    const waitForTable = setInterval(() => {
        const fieldsets = document.querySelectorAll('fieldset');
        let tbody = null;
        fieldsets.forEach(fs => {
            const h = fs.querySelector('legend h2');
            if (h && h.textContent.includes('Päiväkirjamerkinnät')) {
                const b = fs.querySelector('table tbody');
                if (b) tbody = b;
            }
        });
        if (!tbody) return;
        clearInterval(waitForTable);
        setupAnalyzer(tbody);
    }, 800);

    function setupAnalyzer(tbody) {
        const bgColor = '#f8f8f8';
        const borderColor = '#ccc';
        const textColor = '#2c2c2c';
        const highlightAbsence = 'rgba(200, 50, 50, 0.2)';
        const highlightPresent = 'rgba(50, 200, 50, 0.15)';

        // --- Populate panel with content ---
        panel.id = 'studentaAnalyzer';
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '60px'; // leave space for emoji
        panel.style.zIndex = '999998';
        panel.innerHTML = `
        <div style="
            background:${bgColor};
            padding:14px;border-radius:10px;border:1px solid ${borderColor};
            font-family:Helvetica, Arial, sans-serif;width:340px;color:${textColor};">
            <h3 style="margin:0 0 10px;font-size:15px;font-weight:400;">📘 Poissaoloanalyysi</h3>
            <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;">
              <select id="lessonSelect" style="flex:1;min-width:0;padding:5px 6px;border-radius:5px;border:1px solid ${borderColor};font-size:14px;"></select>
              <button id="refreshBtn" style="flex-shrink:0;padding:5px 8px;border-radius:5px;border:1px solid ${borderColor};background:none;color:${textColor};font-size:14px;cursor:pointer;">⟳</button>
              <button id="popupBtn" style="flex-shrink:0;padding:5px 8px;border-radius:5px;border:1px solid ${borderColor};background:none;color:${textColor};font-size:14px;cursor:pointer;">%10+</button>
            </div>
            <div id="lessonStats" style="font-size:13px;line-height:1.4;">Valitse oppiaine nähdäksesi tiedot</div>
            <div id="lessonDates" style="margin-top:8px;font-size:12px;max-height:180px;overflow:auto;"></div>
            <div style="margin-top:10px;font-size:10px;color:#888;">
              Made by <a href="https://github.com/Mies" target="_blank" style="color:#888;text-decoration:none;">Mies</a>
            </div>
        </div>
        `;

        const select = panel.querySelector('#lessonSelect');
        const refreshBtn = panel.querySelector('#refreshBtn');
        const popupBtn = panel.querySelector('#popupBtn');
        const statsDiv = panel.querySelector('#lessonStats');
        const datesDiv = panel.querySelector('#lessonDates');

        function parseToMinutes(s) {
            if (!s) return 0;
            const str = s.trim();
            if (!str.includes(':')) {
                const n = parseFloat(str.replace(/[^\d\-.,]/g, '').replace(',', '.'));
                return isNaN(n) ? 0 : Math.round(n * 60);
            }
            const parts = str.split(':');
            let h = parseInt(parts[0], 10);
            let m = parseInt(parts[1], 10);
            if (isNaN(h)) h = 0;
            if (isNaN(m)) m = 0;
            return h * 60 + m;
        }

        function tryShowAllAndWait(cb) {
            const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
            const allRadio = radios.find(r => (r.name && r.name.toLowerCase().includes('diary')) && (r.value && r.value.toLowerCase() === 'all'));
            let alt = null;
            if (!allRadio) {
                alt = radios.find(r => {
                    const id = r.id;
                    if (!id) return false;
                    const lab = document.querySelector(`label[for="${id}"]`);
                    return lab && lab.textContent && lab.textContent.trim().includes('Näytä kaikki');
                });
            }
            const radioToClick = allRadio || alt;
            if (radioToClick) {
                try { radioToClick.click(); } catch(e){ radioToClick.checked = true; radioToClick.dispatchEvent(new Event('change',{ bubbles:true })); }
                setTimeout(cb, 700);
            } else { setTimeout(cb, 150); }
        }

        function parseTable() {
            const fieldsets = document.querySelectorAll('fieldset');
            let tb = null;
            fieldsets.forEach(fs => {
                const h = fs.querySelector('legend h2');
                if (h && h.textContent.includes('Päiväkirjamerkinnät')) {
                    const b = fs.querySelector('table tbody');
                    if (b) tb = b;
                }
            });
            if (!tb) tb = tbody;

            const rows = Array.from(tb.querySelectorAll('tr'));
            const lessons = {};
            rows.forEach(r => {
                const cells = r.querySelectorAll('td');
                if (cells.length < 6) return;
                const dateText = cells[0].textContent.trim();
                const subject = cells[3].textContent.trim();
                const lasnaText = cells[4].textContent.trim();
                const poissaText = cells[5].textContent.trim();
                if (!subject) return;
                if (!lessons[subject]) lessons[subject] = { lasna:0, poissa:0, poissaDates:[] };
                const lasnaMin = parseToMinutes(lasnaText);
                const poissaMin = parseToMinutes(poissaText);
                lessons[subject].lasna += lasnaMin;
                lessons[subject].poissa += poissaMin;
                if (poissaMin>0) lessons[subject].poissaDates.push({ date: dateText || '(ei päivämäärää)', mins: poissaMin, row: r });
            });
            return { lessons, rows };
        }

        function loadLessonsToSelect(lessonsObj) {
            const keys = Object.keys(lessonsObj).sort((a,b)=>a.localeCompare(b));
            select.innerHTML = '<option value="">Valitse oppiaine...</option>' +
                keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        }

        function escapeHtml(s) { return s.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

        function updateForSelectedSubject() {
            const chosen = select.value;
            tryShowAllAndWait(()=>{
                const { lessons, rows } = parseTable();
                const currentKeys = Object.keys(lessons).sort();
                const selectKeys = Array.from(select.options).slice(1).map(o=>o.value).sort();
                if(JSON.stringify(currentKeys)!==JSON.stringify(selectKeys)) loadLessonsToSelect(lessons);
                if(!chosen){ statsDivAndReset(rows); return; }
                const data = lessons[chosen] || { lasna:0, poissa:0, poissaDates:[] };
                const lasnaH = (data.lasna/60).toFixed(1);
                const poissaH = (data.poissa/60).toFixed(1);
                const totalH = ((data.lasna+data.poissa)/60).toFixed(1);
                const prosentti = (data.lasna+data.poissa)>0?((data.poissa/(data.lasna+data.poissa))*100).toFixed(1):'0.0';

                statsDiv.innerHTML = `<b>${escapeHtml(chosen)}</b><br>
                  Läsnä: ${lasnaH} h<br>
                  Poissa: ${poissaH} h<br>
                  Yhteensä: ${totalH} h<br>
                  <b>Poissaolo: ${prosentti}%</b>`;

                if(data.poissaDates.length){
                    const lines = data.poissaDates.map(d=>`<div class="dateLine">${escapeHtml(d.date)} = ${(d.mins/60).toFixed(1)} h</div>`);
                    datesDiv.innerHTML = `<hr style="margin:6px 0;"><div><b>Poissaolopäivät:</b></div><div style="margin-top:4px;max-height:180px;overflow:auto;">${lines.join('')}</div>`;
                } else { datesDiv.innerHTML = `<hr style="margin:6px 0;"><div><i>Ei kirjattuja poissaolopäiviä.</i></div>`; }

                rows.forEach(r=>{
                    const cells = r.querySelectorAll('td');
                    if(cells.length<6) return;
                    const subj = cells[3].textContent.trim();
                    const poissaVal = parseToMinutes(cells[5].textContent.trim());
                    if(subj===chosen){
                        r.style.opacity='1';
                        r.style.background=poissaVal>0?highlightAbsence:highlightPresent;
                    } else {
                        r.style.opacity='0.35';
                        r.style.background='';
                    }
                });
            });
        }

        function statsDivAndReset(rows){
            statsDiv.textContent='Valitse oppiaine nähdäksesi tiedot';
            datesDiv.innerHTML='';
            rows.forEach(r=>{ r.style.opacity=''; r.style.background=''; });
        }

        function showOver10PercentPopup(){
            tryShowAllAndWait(()=>{
                const { lessons } = parseTable();
                const over10 = Object.entries(lessons).filter(([subj,data])=>{
                    const total = data.lasna+data.poissa;
                    if(total===0) return false;
                    return (data.poissa/total*100)>10;
                });
                if(over10.length===0){
                    alert('Ei oppiaineita, joissa poissaolo yli 10%');
                    return;
                }
                const content = over10.map(([subj,data])=>{
                    const totalH=((data.lasna+data.poissa)/60).toFixed(1);
                    const lasnaH=(data.lasna/60).toFixed(1);
                    const poissaH=(data.poissa/60).toFixed(1);
                    const prosentti=(data.poissa/(data.lasna+data.poissa)*100).toFixed(1);
                    return `${subj}\nLäsnä: ${lasnaH} h\nPoissa: ${poissaH} h\nYhteensä: ${totalH} h\nPoissaolo: ${prosentti}%\n`;
                }).join('\n----------------------\n');
                window.open().document.write(`<pre style="font-family:sans-serif;padding:12px;">${content}</pre>`);
            });
        }

        tryShowAllAndWait(()=>{
            const { lessons, rows } = parseTable();
            loadLessonsToSelect(lessons);
            statsDivAndReset(rows);
        });

        select.addEventListener('change',()=>{ updateForSelectedSubject(); });
        refreshBtn.addEventListener('click',()=>{
            const prev=select.value;
            tryShowAllAndWait(()=>{
                const { lessons, rows } = parseTable();
                loadLessonsToSelect(lessons);
                if(prev && lessons[prev]) select.value=prev; else select.value='';
                updateForSelectedSubject();
            });
        });
        popupBtn.addEventListener('click', showOver10PercentPopup);
    }
})();
