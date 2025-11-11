// ==UserScript==
// @name         kebabmies

// @namespace    https://github.com/YOURUSERNAME/studenta-analyzer
// @version      1.3
// @description  Enhanced UI, shows absences with color, better stats panel, and per-date highlights.
// @author       YOU
// @match        *://*/studentgo/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

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
    const panelId = 'studentaAnalyzer';
    if (document.getElementById(panelId)) return;

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.innerHTML = `
      <div style="
        position:fixed;bottom:20px;right:20px;background:#fdfdfd;padding:16px;
        border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,0.25);
        font-family:'Segoe UI',sans-serif;width:350px;z-index:999999;
        max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 10px;font-size:16px;color:#2c3e50;">📘 Poissaoloanalyysi</h3>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <select id="lessonSelect" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #ccc;">
            <option value="">Ladataan oppiaineita...</option>
          </select>
          <button id="refreshBtn" title="Päivitä taulukko" style="
            padding:6px 10px;border-radius:6px;border:none;background:#3498db;color:#fff;
            cursor:pointer;font-weight:bold;">⟳</button>
        </div>
        <div id="lessonStats" style="font-size:14px;color:#2c3e50;line-height:1.4;">Valitse oppiaine nähdäksesi tiedot</div>
        <div id="lessonDates" style="margin-top:10px;font-size:13px;color:#34495e;max-height:180px;overflow:auto;"></div>
        <div style="margin-top:12px;font-size:12px;color:#7f8c8d;">Vihje: jos sivu näyttää vain poissaolot, paina ⟳ (Refresh) ennen valintaa.</div>
      </div>
    `;
    document.body.appendChild(panel);

    const select = panel.querySelector('#lessonSelect');
    const refreshBtn = panel.querySelector('#refreshBtn');
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
      } else {
        setTimeout(cb, 150);
      }
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

        // show dates
        if(data.poissaDates.length){
          const lines = data.poissaDates.map(d=>`<div class="dateLine" data-row-index="${rows.indexOf(d.row)}">${escapeHtml(d.date)} = ${(d.mins/60).toFixed(1)} h</div>`);
          datesDiv.innerHTML = `<hr style="margin:8px 0;"><div><b>Poissaolopäivät:</b></div><div style="margin-top:6px;max-height:180px;overflow:auto;">${lines.join('')}</div>`;
        } else { datesDiv.innerHTML = `<hr style="margin:8px 0;"><div><i>Ei kirjattuja poissaolopäiviä.</i></div>`; }

        // highlight table
        rows.forEach(r=>{
          const cells = r.querySelectorAll('td');
          if(cells.length<6) return;
          const subj = cells[3].textContent.trim();
          const poissaVal = parseToMinutes(cells[5].textContent.trim());
          if(subj===chosen){
            r.style.opacity='1';
            r.style.background=poissaVal>0?'rgba(255,100,100,0.35)':'rgba(200,255,200,0.25)';
          } else {
            r.style.opacity='0.35';
            r.style.background='';
          }
        });

        // hover effect: highlight row when hovering date
        Array.from(datesDiv.querySelectorAll('.dateLine')).forEach(dl=>{
          const row = rows[parseInt(dl.dataset.rowIndex)];
          dl.addEventListener('mouseenter',()=>{ row.style.background='rgba(255,80,80,0.6)'; });
          dl.addEventListener('mouseleave',()=>{ row.style.background=poissaVal>0?'rgba(255,100,100,0.35)':'rgba(200,255,200,0.25)'; });
        });
      });
    }

    function statsDivAndReset(rows){
      statsDiv.textContent='Valitse oppiaine nähdäksesi tiedot';
      datesDiv.innerHTML='';
      rows.forEach(r=>{ r.style.opacity=''; r.style.background=''; });
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
  }
})();
