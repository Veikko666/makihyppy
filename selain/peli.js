// Mäkikotka – selainprototyyppi: syöte, kamera, piirto, äänet ja valikot.
(function () {
  'use strict';
  const F = window.Fysiikka;
  const DEG = F.DEG;
  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fi = (n, d = 1) => n.toFixed(d).replace('.', ',').replace('-', '−');

  const VARIT = {
    taivas: ['#040a17', '#0c1a35', '#1c2f55'],
    harju: '#0f1d36', metsa: '#0a1528', maa: '#0d1a30',
    lumi: '#e4ecf5', lumiVarjo: '#b8c8dc', lumiReuna: '#ffffff',
    rakenne: '#2a3a5c', latu: '#cfdcea',
    merkki: '#5c7394', K: '#ff5a4a', HS: '#ffc94d', ennatys: '#63e0a3',
    puku: '#ff6a3d', pukuTumma: '#c84a28', kypara: '#f4f6fa', sukset: '#ffc94d', suksetTumma: '#c99a2a',
    teksti: '#e9f0f7', himmea: '#9db0c9', valo: '#ffc94d', hyva: '#63e0a3', huono: '#ff7a66',
  };

  // ------------------------------------------------------------ tallennus
  function lue(avain, oletus) {
    try { const v = localStorage.getItem(avain); return v ? Object.assign({}, oletus, JSON.parse(v)) : oletus; }
    catch (e) { return oletus; }
  }
  function kirjoita(avain, arvo) { try { localStorage.setItem(avain, JSON.stringify(arvo)); } catch (e) { /* ei tallennusta */ } }

  const asetukset = lue('makikotka.asetukset', { herkkyys: 0.3, kaanna: false, helppo: false, aani: true, maki: 'k90' });
  const ennatykset = lue('makikotka.ennatykset', {});

  // ------------------------------------------------------------ mäet
  const MAET = F.MAET.map((m) => F.rakennaMaki(m));
  let maki = MAET.find((m) => m.id === asetukset.maki) || MAET[1];

  // ------------------------------------------------------------ tila
  let hyppy = null;
  let tila = 'valikko'; // valikko | peli | tulos
  let tulosNaytetty = false;
  let valmisAika = 0;
  const kamera = { x: 0, y: 0, leveys: 80 };
  let viestit = [];
  let hiukkaset = [];
  let edellinenPolku = null;
  let edellinenIrrotettu = false;
  let tahdet = [];

  // ------------------------------------------------------------ canvas-koko
  let W = 0, H = 0, DPR = 1;
  function koko() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  window.addEventListener('resize', koko);
  koko();

  (function luoTahdet() {
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 160; i++) tahdet.push([r(), r() * 0.75, r() * 1.2 + 0.3, r() * 6.28]);
  })();

  // ------------------------------------------------------------ äänet
  let ac = null, tuuliGain = null, tuuliSuodin = null, kohinaPuskuri = null;
  function aaniKaynnista() {
    if (ac || !asetukset.aani) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      kohinaPuskuri = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = kohinaPuskuri.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }
      const lahde = ac.createBufferSource(); lahde.buffer = kohinaPuskuri; lahde.loop = true;
      tuuliSuodin = ac.createBiquadFilter(); tuuliSuodin.type = 'bandpass'; tuuliSuodin.frequency.value = 500; tuuliSuodin.Q.value = 0.7;
      tuuliGain = ac.createGain(); tuuliGain.gain.value = 0;
      lahde.connect(tuuliSuodin).connect(tuuliGain).connect(ac.destination);
      lahde.start();
    } catch (e) { ac = null; }
  }
  function aaniTuuli(v) {
    if (!ac || !tuuliGain) return;
    const g = asetukset.aani ? clamp((v / 30) ** 2 * 0.35, 0, 0.4) : 0;
    tuuliGain.gain.setTargetAtTime(g, ac.currentTime, 0.08);
    tuuliSuodin.frequency.setTargetAtTime(300 + v * 35, ac.currentTime, 0.1);
  }
  function aaniPurske(taajuus, kesto, voima, tyyppi) {
    if (!ac || !asetukset.aani) return;
    const l = ac.createBufferSource(); l.buffer = kohinaPuskuri;
    const f = ac.createBiquadFilter(); f.type = tyyppi || 'lowpass'; f.frequency.value = taajuus; f.Q.value = 0.8;
    const g = ac.createGain(); const t = ac.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(voima, t + Math.min(0.3, kesto * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + kesto);
    l.connect(f).connect(g).connect(ac.destination);
    l.start(t, Math.random()); l.stop(t + kesto + 0.05);
  }

  // ------------------------------------------------------------ viestit
  function viesti(teksti, vari, kesto) {
    viestit = viestit.filter((v) => v.teksti !== teksti);
    viestit.push({ teksti, vari: vari || VARIT.teksti, t: 0, kesto: kesto || 1.6 });
    if (viestit.length > 2) viestit.shift();
  }

  // ------------------------------------------------------------ hyppy
  function uusiHyppy() {
    const tuuli = Math.round((Math.random() * 3.4 - 1.2) * 10) / 10;
    hyppy = F.uusiHyppy(maki, { tuuli, helppo: asetukset.helppo });
    tila = 'peli'; tulosNaytetty = false;
    $('valikko').hidden = true; $('tulos').hidden = true; $('valikkonappi').hidden = false;
    viestit = []; hiukkaset = []; edellinenIrrotettu = false;
    osoittimet.clear();
    asetaKamera(true);
    cv.focus?.();
  }

  function naytaValikko() {
    tila = 'valikko';
    $('tulos').hidden = true; $('valikko').hidden = false; $('valikkonappi').hidden = true;
    rakennaMaet();
    $('b-aloita').focus();
  }

  function rakennaMaet() {
    const el = $('maet');
    el.innerHTML = '';
    MAET.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'maki'; b.id = 'maki-' + m.id;
      b.setAttribute('aria-pressed', m === maki ? 'true' : 'false');
      const e = ennatykset[m.id];
      b.innerHTML = `<b>${m.nimi}</b><small>K${m.K} · HS${m.HS}</small><small>${e ? 'Ennätys ' + fi(e, 1) + ' m' : 'Ei hyppyjä'}</small>`;
      b.addEventListener('click', () => {
        maki = m; asetukset.maki = m.id; kirjoita('makikotka.asetukset', asetukset);
        rakennaMaet();
        asetaKamera(true);
      });
      el.appendChild(b);
    });
  }

  function naytaTulos() {
    const t = hyppy.tulos;
    tila = 'tulos';
    $('t-pituus').textContent = fi(t.pituus, 1);
    const merkki = $('t-merkki');
    const vanha = ennatykset[maki.id];
    if (t.kaatui) { merkki.className = 'merkki kaatui'; merkki.textContent = t.syy; }
    else if (!vanha || t.pituus > vanha) {
      merkki.className = 'merkki ennatys'; merkki.textContent = 'Uusi ennätys!';
      ennatykset[maki.id] = t.pituus; kirjoita('makikotka.ennatykset', ennatykset);
    } else if (t.pituus >= maki.K) { merkki.className = 'merkki ok'; merkki.textContent = 'Yli K-pisteen'; }
    else { merkki.className = 'merkki ok'; merkki.textContent = `${fi(maki.K - t.pituus, 1)} m K-pisteestä`; }
    merkki.hidden = false;

    $('t-ponnistus').textContent = t.ponnistus || '–';
    $('t-nopeus').textContent = fi(t.v0kmh, 1) + ' km/h';
    let alas = t.alastulo === 'telemark' ? 'Telemark' : t.alastulo === 'tasajalka' ? 'Tasajalka' : 'Ei alastuloa';
    if (t.kaatui) alas = 'Kaatuminen';
    else if (t.laatu === 'epavarma') alas += ', epävarma';
    else if (t.laatu === 'kova') alas += ', kova';
    $('t-alastulo').textContent = alas;
    $('t-pp').textContent = fi(Math.max(0, t.pituusPisteet), 1);
    $('t-tp').textContent = fi(t.tyyli, 1);
    $('t-tuuli').textContent = (t.tuuliPisteet > 0 ? '+' : '') + fi(t.tuuliPisteet, 1);
    $('t-yht').textContent = fi(t.yhteensa, 1);
    const tu = $('t-tuomarit');
    tu.innerHTML = '';
    t.tuomarit.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'tuomari' + (t.pois.includes(i) ? ' pois' : '');
      d.innerHTML = `<small>${'ABCDE'[i]}</small>${fi(p, 1)}`;
      tu.appendChild(d);
    });
    $('tulos').hidden = false;
    $('b-uudestaan').focus({ preventScroll: true });
    edellinenPolku = hyppy.polku.slice();
  }

  // ------------------------------------------------------------ syöte
  const osoittimet = new Map();
  let kaksiSormea = false;
  const nappaimet = { ylos: false, alas: false };

  function painallus() {
    if (tila !== 'peli' || !hyppy) return;
    if (hyppy.vaihe === 'portilla') F.aloita(hyppy);
    else if (hyppy.vaihe === 'vauhti') F.kyykisty(hyppy, true);
  }
  function irrotus() {
    if (tila !== 'peli' || !hyppy) return;
    if (hyppy.vaihe === 'vauhti' || (hyppy.vaihe === 'lento' && !hyppy.irrotettu)) F.ponnista(hyppy);
  }
  function alastulo(tyyppi) {
    if (tila !== 'peli' || !hyppy) return;
    if (hyppy.vaihe === 'lento' && !hyppy.irrotettu) return;
    if (F.aloitaAlastulo(hyppy, tyyppi)) viesti(tyyppi === 'telemark' ? 'Telemark' : 'Tasajalka', VARIT.himmea, 0.9);
  }

  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    aaniKaynnista();
    if (ac && ac.state === 'suspended') ac.resume();
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    if (tila !== 'peli') return;
    if (e.button === 2) { alastulo('tasajalka'); return; }
    osoittimet.set(e.pointerId, { y: e.clientY, x: e.clientX, t0: performance.now(), liike: 0 });
    if (osoittimet.size >= 2 && hyppy.vaihe === 'lento') { kaksiSormea = true; alastulo('tasajalka'); return; }
    if (osoittimet.size === 1) painallus();
  });
  cv.addEventListener('pointermove', (e) => {
    const p = osoittimet.get(e.pointerId);
    if (!p || tila !== 'peli') return;
    const dy = e.clientY - p.y, dx = e.clientX - p.x;
    p.y = e.clientY; p.x = e.clientX; p.liike += Math.abs(dx) + Math.abs(dy);
    if (hyppy.vaihe === 'lento' && osoittimet.size === 1 && !kaksiSormea) {
      F.kallista(hyppy, -dy * asetukset.herkkyys * (asetukset.kaanna ? -1 : 1));
    }
  });
  function osoitinYlos(e, peruttu) {
    const p = osoittimet.get(e.pointerId);
    osoittimet.delete(e.pointerId);
    if (!p || tila !== 'peli' || peruttu) { if (osoittimet.size === 0) kaksiSormea = false; return; }
    const kesto = performance.now() - p.t0;
    if (hyppy.vaihe === 'vauhti' || (hyppy.vaihe === 'lento' && !hyppy.irrotettu)) {
      if (osoittimet.size === 0) irrotus();
    } else if (hyppy.vaihe === 'lento' && !kaksiSormea && kesto < 230 && p.liike < 14) {
      alastulo('telemark');
    }
    if (osoittimet.size === 0) kaksiSormea = false;
  }
  cv.addEventListener('pointerup', (e) => osoitinYlos(e, false));
  cv.addEventListener('pointercancel', (e) => osoitinYlos(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    const k = e.key;
    if (tila === 'tulos' && (k === ' ' || k === 'Enter')) { e.preventDefault(); uusiHyppy(); return; }
    if (k === 'Escape') { if (tila !== 'valikko') naytaValikko(); return; }
    if (tila !== 'peli') return;
    aaniKaynnista();
    if (k === ' ') { e.preventDefault(); if (!e.repeat) painallus(); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); nappaimet.ylos = true; }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); nappaimet.alas = true; }
    else if (k === 't' || k === 'T' || k === 'Enter') { e.preventDefault(); alastulo('telemark'); }
    else if (k === 'Shift') { alastulo('tasajalka'); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === ' ' && tila === 'peli') { e.preventDefault(); irrotus(); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') nappaimet.ylos = false;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') nappaimet.alas = false;
  });
  window.addEventListener('blur', () => { nappaimet.ylos = nappaimet.alas = false; });

  // Valikon kontrollit.
  $('a-herkkyys').value = asetukset.herkkyys;
  $('a-kaanna').checked = asetukset.kaanna;
  $('a-helppo').checked = asetukset.helppo;
  $('a-aani').checked = asetukset.aani;
  const tallennaAsetukset = () => {
    asetukset.herkkyys = parseFloat($('a-herkkyys').value);
    asetukset.kaanna = $('a-kaanna').checked;
    asetukset.helppo = $('a-helppo').checked;
    asetukset.aani = $('a-aani').checked;
    kirjoita('makikotka.asetukset', asetukset);
    if (!asetukset.aani && tuuliGain) tuuliGain.gain.value = 0;
  };
  ['a-herkkyys', 'a-kaanna', 'a-helppo', 'a-aani'].forEach((id) => $(id).addEventListener('input', tallennaAsetukset));
  $('b-aloita').addEventListener('click', () => { aaniKaynnista(); uusiHyppy(); });
  $('b-uudestaan').addEventListener('click', uusiHyppy);
  $('b-valikko').addEventListener('click', naytaValikko);
  $('valikkonappi').addEventListener('click', naytaValikko);

  // ------------------------------------------------------------ kamera
  function kameraTavoite() {
    const K = maki.K;
    const h = hyppy;
    if (!h || h.vaihe === 'portilla' || h.vaihe === 'vauhti') {
      const p = h ? { x: h.x, y: h.y } : F.vauhtiU(maki, maki.lahtoU);
      const l = clamp(K * 0.7, 48, 110);
      if (!h) return { x: p.x + l * 0.25, y: p.y - l * 0.12, leveys: l };
      return { x: p.x + l * 0.2, y: p.y - l * 0.1, leveys: l };
    }
    if (h.vaihe === 'lento') {
      const l = clamp(K * 0.95, 70, 190);
      return { x: h.x + l * 0.2, y: h.y - l * 0.14, leveys: l };
    }
    const l = clamp(K * 0.85, 60, 170);
    return { x: h.x + l * 0.05, y: h.y + l * 0.04, leveys: l };
  }
  function asetaKamera(heti) {
    const t = kameraTavoite();
    if (heti) { kamera.x = t.x; kamera.y = t.y; kamera.leveys = t.leveys; }
    return t;
  }
  function paivitaKamera(dt) {
    const t = kameraTavoite();
    const a = 1 - Math.exp(-dt * 5), b = 1 - Math.exp(-dt * 1.6);
    kamera.x = lerp(kamera.x, t.x, a); kamera.y = lerp(kamera.y, t.y, a);
    kamera.leveys = lerp(kamera.leveys, t.leveys, b);
  }
  function mittakaava() { return Math.min(W / kamera.leveys, H / (kamera.leveys * 0.6)); }

  // ------------------------------------------------------------ silmukka
  let edellinen = performance.now(), kertyma = 0;
  function silmukka(nyt) {
    let dt = (nyt - edellinen) / 1000; edellinen = nyt;
    if (dt > 0.1) dt = 0.1;
    if (tila === 'peli' && hyppy) {
      kertyma += dt;
      while (kertyma >= F.DT) {
        if (hyppy.vaihe === 'lento') {
          const nopeus = 75; // °/s näppäimillä
          if (nappaimet.ylos) F.kallista(hyppy, nopeus * F.DT);
          if (nappaimet.alas) F.kallista(hyppy, -nopeus * F.DT);
        }
        F.askel(hyppy);
        kertyma -= F.DT;
      }
      kasitteleTapahtumat();
      if (hyppy.vaihe === 'valmis' && !tulosNaytetty) {
        valmisAika += dt;
        if (valmisAika > 0.5) { tulosNaytetty = true; valmisAika = 0; naytaTulos(); }
      }
    } else kertyma = 0;
    const v = hyppy ? (hyppy.vaihe === 'lento' ? Math.hypot(hyppy.vx, hyppy.vy) : (hyppy.vaihe === 'valmis' ? 0 : hyppy.nopeus)) : 0;
    aaniTuuli(tila === 'valikko' ? 0 : v);
    paivitaKamera(dt);
    viestit.forEach((m) => { m.t += dt; });
    viestit = viestit.filter((m) => m.t < m.kesto);
    paivitaHiukkaset(dt);
    piirra(nyt / 1000);
    requestAnimationFrame(silmukka);
  }

  function kasitteleTapahtumat() {
    const h = hyppy;
    if (h.irrotettu && !edellinenIrrotettu) {
      edellinenIrrotettu = true;
      const q = h.ponnistusLaatu;
      viesti(h.ponnistusTeksti, q >= 0.95 ? VARIT.hyva : q >= 0.6 ? VARIT.valo : VARIT.huono, 1.6);
      if (navigator.vibrate) try { navigator.vibrate(q >= 0.95 ? 25 : 12); } catch (_) { /* */ }
    }
    while (h.tapahtumat.length) {
      const t = h.tapahtumat.shift();
      if (t === 'nokka') aaniPurske(900, 0.35, 0.25, 'bandpass');
      if (t === 'alastulo' || t === 'kaatuminen') {
        const vahva = t === 'kaatuminen';
        aaniPurske(vahva ? 300 : 500, vahva ? 0.6 : 0.3, vahva ? 0.9 : 0.6);
        luoLumipolly(h, vahva ? 70 : 36);
        if (navigator.vibrate) try { navigator.vibrate(vahva ? [40, 30, 60] : 30); } catch (_) { /* */ }
        const tr = h.tulos;
        if (!tr.kaatui) {
          const osuus = clamp((tr.pituus - maki.K * 0.8) / (maki.HS - maki.K * 0.8), 0, 1.2);
          if (osuus > 0.2) setTimeout(() => aaniPurske(1600, 1.8, 0.12 + 0.3 * osuus, 'bandpass'), 120);
          viesti(fi(tr.pituus, 1) + ' m', tr.pituus >= maki.K ? VARIT.valo : VARIT.teksti, 2.2);
        } else {
          viesti(tr.syy, VARIT.huono, 2.2);
        }
      }
    }
  }

  // ------------------------------------------------------------ hiukkaset
  function luoLumipolly(h, n) {
    const r = F.rinneX(maki, h.x);
    for (let i = 0; i < n; i++) {
      const a = -r.f + (Math.random() * 0.9 + 0.15);
      const v = 2 + Math.random() * 7;
      hiukkaset.push({ x: h.x, y: h.y + 0.2, vx: Math.cos(a) * v + h.vx * 0.25, vy: Math.sin(a) * v, t: 0, kesto: 0.6 + Math.random() * 0.8, r: 0.06 + Math.random() * 0.12 });
    }
  }
  function paivitaHiukkaset(dt) {
    hiukkaset.forEach((p) => { p.t += dt; p.vy -= 6 * dt; p.vx *= 1 - dt * 1.5; p.x += p.vx * dt; p.y += p.vy * dt; });
    hiukkaset = hiukkaset.filter((p) => p.t < p.kesto);
  }

  // ------------------------------------------------------------ piirto
  let S = 10; // px / m
  const sx = (x) => (x - kamera.x) * S + W / 2;
  const sy = (y) => H / 2 - (y - kamera.y) * S;

  function piirra(aika) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = mittakaava();
    piirraTaivas(aika);
    piirraTausta();
    piirraMaasto();
    piirraMerkit();
    piirraValot();
    if (edellinenPolku && tila !== 'tulos') piirraPolku(edellinenPolku, 'rgba(157,176,201,0.22)');
    if (hyppy) {
      if (hyppy.vaihe === 'lento' || hyppy.vaihe === 'alas' || hyppy.vaihe === 'valmis') piirraPolku(hyppy.polku, 'rgba(255,255,255,0.35)');
      piirraHyppaaja(hyppy);
    } else {
      piirraHyppaaja(null);
    }
    piirraHiukkaset();
    if (tila === 'peli') piirraHud(aika);
  }

  function piirraTaivas(aika) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, VARIT.taivas[0]); g.addColorStop(0.55, VARIT.taivas[1]); g.addColorStop(1, VARIT.taivas[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // revontulet
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ox = -kamera.x * 0.6;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 14) {
        const u = (x + ox) * 0.004 + k * 1.7;
        const y = H * (0.16 + 0.05 * k) + Math.sin(u * 2.1 + aika * 0.15) * H * 0.05 + Math.sin(u * 5.3) * H * 0.02;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = k === 1 ? 'rgba(90,220,170,0.07)' : 'rgba(80,200,190,0.05)';
      ctx.lineWidth = H * 0.09; ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
    // tähdet
    ctx.fillStyle = '#ffffff';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [tx, ty, r, ph] of tahdet) {
      const x = ((tx * W * 1.3 - kamera.x * 0.3) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
      const y = ty * H + kamera.y * 0.15;
      if (y < -5 || y > H) continue;
      ctx.globalAlpha = 0.35 + (reduce ? 0.3 : 0.3 * Math.sin(aika * 1.3 + ph));
      ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;
  }

  function harju(p, pohja, korkeus, taaj, vari, puut) {
    const ox = kamera.x * p * 8, oy = kamera.y * p * 8;
    const yb = H * pohja + oy;
    ctx.beginPath(); ctx.moveTo(-10, H + 10);
    const piste = (x) => {
      const u = (x + ox) * taaj;
      return yb - korkeus * H * (0.5 + 0.3 * Math.sin(u) + 0.15 * Math.sin(u * 2.7 + 1.3) + 0.05 * Math.sin(u * 7.1));
    };
    for (let x = -10; x <= W + 10; x += 6) ctx.lineTo(x, piste(x));
    ctx.lineTo(W + 10, H + 10); ctx.closePath();
    ctx.fillStyle = vari; ctx.fill();
    if (puut) {
      ctx.fillStyle = vari;
      const vali = 11;
      const alku = Math.floor(ox / vali) * vali - ox;
      for (let x = alku - vali; x < W + vali; x += vali) {
        const n = Math.round(x + ox);
        const kork = 10 + ((n * 7919) % 13);
        const y = piste(x) + 2;
        ctx.beginPath(); ctx.moveTo(x - kork * 0.3, y); ctx.lineTo(x, y - kork); ctx.lineTo(x + kork * 0.3, y); ctx.closePath(); ctx.fill();
      }
    }
  }

  function piirraTausta() {
    harju(0.1, 0.72, 0.22, 0.004, VARIT.harju, false);
    harju(0.3, 0.86, 0.16, 0.007, VARIT.metsa, true);
  }

  function piirraMaasto() {
    const r = maki.rinne, v = maki.vauhti;
    const alkuU = Math.min(maki.lahtoU + 8, v.uMax);
    const alku = F.vauhtiU(maki, alkuU);
    // Maa vauhtimäen alla
    ctx.beginPath();
    ctx.moveTo(sx(alku.x - 60), sy(alku.y - 14));
    ctx.lineTo(sx(alku.x), sy(alku.y - 14));
    for (let u = alkuU; u >= 0; u -= 4) {
      const p = F.vauhtiU(maki, u);
      const syv = 3 + 11 * Math.min(1, u / 40);
      ctx.lineTo(sx(p.x), sy(p.y - syv - maki.nokkaKorkeus * (1 - Math.min(1, u / 30))));
    }
    ctx.lineTo(sx(-2), sy(-maki.nokkaKorkeus));
    ctx.lineTo(sx(-2), sy(-1000));
    ctx.lineTo(sx(alku.x - 60), sy(-1000));
    ctx.closePath();
    ctx.fillStyle = VARIT.maa; ctx.fill();

    // Vauhtimäen rakenteet (tolpat)
    ctx.strokeStyle = VARIT.rakenne; ctx.lineWidth = Math.max(1, 0.25 * S);
    for (let u = 6; u < alkuU; u += 5) {
      const p = F.vauhtiU(maki, u);
      const syv = 3 + 11 * Math.min(1, u / 40) + maki.nokkaKorkeus * (1 - Math.min(1, u / 30));
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x), sy(p.y - syv)); ctx.stroke();
    }

    // Alastulorinne
    const nakyvaVasen = kamera.x - W / 2 / S - 10, nakyvaOikea = kamera.x + W / 2 / S + 10;
    ctx.beginPath();
    ctx.moveTo(sx(-0.5), sy(-maki.nokkaKorkeus));
    let viimX = 0, viimY = 0;
    for (let i = 0; i < r.xs.length; i += 4) {
      if (r.xs[i] < nakyvaVasen - 20) continue;
      ctx.lineTo(sx(r.xs[i]), sy(r.ys[i]));
      viimX = r.xs[i]; viimY = r.ys[i];
      if (r.xs[i] > nakyvaOikea + 20) break;
    }
    ctx.lineTo(sx(viimX), sy(viimY - 2000));
    ctx.lineTo(sx(-0.5 - 2600), sy(-maki.nokkaKorkeus - 2000));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, sy(0), 0, sy(-maki.K));
    g.addColorStop(0, VARIT.lumi); g.addColorStop(1, VARIT.lumiVarjo);
    ctx.fillStyle = g; ctx.fill();
    // Pinnan reuna
    ctx.strokeStyle = VARIT.lumiReuna; ctx.lineWidth = 1.5;
    ctx.beginPath();
    let eka = true;
    for (let i = 0; i < r.xs.length; i += 4) {
      if (r.xs[i] < nakyvaVasen - 20) continue;
      if (eka) { ctx.moveTo(sx(r.xs[i]), sy(r.ys[i])); eka = false; } else ctx.lineTo(sx(r.xs[i]), sy(r.ys[i]));
      if (r.xs[i] > nakyvaOikea + 20) break;
    }
    ctx.stroke();

    // Vauhtimäen kansi ja latu
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let u = alkuU; u >= 0; u -= 0.5) { const p = F.vauhtiU(maki, u); if (u === alkuU) ctx.moveTo(sx(p.x), sy(p.y - 0.35)); else ctx.lineTo(sx(p.x), sy(p.y - 0.35)); }
    ctx.strokeStyle = VARIT.rakenne; ctx.lineWidth = Math.max(3, 0.8 * S); ctx.stroke();
    ctx.beginPath();
    for (let u = alkuU; u >= 0; u -= 0.5) { const p = F.vauhtiU(maki, u); if (u === alkuU) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); }
    ctx.strokeStyle = VARIT.latu; ctx.lineWidth = Math.max(1.5, 0.18 * S); ctx.stroke();
    ctx.lineCap = 'butt';

    // Lähtöportti
    const lp = F.vauhtiU(maki, maki.lahtoU);
    ctx.strokeStyle = VARIT.valo; ctx.lineWidth = Math.max(2, 0.2 * S);
    ctx.beginPath(); ctx.moveTo(sx(lp.x - 0.4), sy(lp.y)); ctx.lineTo(sx(lp.x - 0.4), sy(lp.y + 1.6)); ctx.stroke();
  }

  function piirraMerkit() {
    const fontKoko = clamp(S * 1.6, 10, 15);
    ctx.font = `600 ${fontKoko}px "Saira Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const piirraMerkki = (d, vari, leveys, teksti, pituus) => {
      const p = F.rinneS(maki, d);
      const nx = Math.sin(p.f), ny = Math.cos(p.f);
      const L = pituus || 1.6;
      ctx.strokeStyle = vari; ctx.lineWidth = leveys;
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x - nx * L), sy(p.y - ny * L)); ctx.stroke();
      if (teksti) { ctx.fillStyle = vari; ctx.fillText(teksti, sx(p.x - nx * (L + 0.6)), sy(p.y - ny * (L + 0.6))); }
    };
    const alku = Math.ceil(maki.K * 0.4 / 10) * 10;
    for (let d = alku; d <= maki.HS + 20; d += 5) {
      const iso = d % 10 === 0;
      piirraMerkki(d, VARIT.merkki, iso ? 1.5 : 1, iso && Math.abs(d - maki.K) > 3 && Math.abs(d - maki.HS) > 3 ? String(d) : '', iso ? 1.6 : 0.9);
    }
    piirraMerkki(maki.K, VARIT.K, 3, 'K' + maki.K, 2.6);
    piirraMerkki(maki.HS, VARIT.HS, 3, 'HS' + maki.HS, 2.6);
    const e = ennatykset[maki.id];
    if (e) {
      const p = F.rinneS(maki, e);
      ctx.strokeStyle = VARIT.ennatys; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x + Math.sin(p.f) * 2.2), sy(p.y + Math.cos(p.f) * 2.2)); ctx.stroke();
      ctx.fillStyle = VARIT.ennatys; ctx.textBaseline = 'bottom';
      ctx.fillText('Ennätys ' + fi(e, 1), sx(p.x + Math.sin(p.f) * 2.6), sy(p.y + Math.cos(p.f) * 2.6));
    }
  }

  function piirraValot() {
    // Valonheitinmastot rinteen vieressä
    ctx.save();
    for (let d = maki.K * 0.25; d < maki.HS + maki.K * 0.4; d += maki.K * 0.3) {
      const p = F.rinneS(maki, d);
      const kork = 14 + maki.K * 0.06;
      const x0 = sx(p.x), y0 = sy(p.y), y1 = sy(p.y + kork);
      if (x0 < -200 || x0 > W + 200) continue;
      ctx.strokeStyle = 'rgba(42,58,92,0.9)'; ctx.lineWidth = Math.max(1, 0.25 * S);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const rad = Math.max(30, kork * S * 1.1);
      const g = ctx.createRadialGradient(x0, y1, 0, x0, y1, rad);
      g.addColorStop(0, 'rgba(255,214,120,0.35)'); g.addColorStop(0.15, 'rgba(255,214,120,0.10)'); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g; ctx.fillRect(x0 - rad, y1 - rad, rad * 2, rad * 2);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(x0 - 3, y1 - 2, 6, 3);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  function piirraPolku(polku, vari) {
    ctx.fillStyle = vari;
    for (let i = 0; i < polku.length; i += 2) {
      const [x, y] = polku[i];
      ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2);
    }
  }

  function piirraHiukkaset() {
    ctx.fillStyle = '#ffffff';
    for (const p of hiukkaset) {
      ctx.globalAlpha = 1 - p.t / p.kesto;
      const r = Math.max(1, p.r * S);
      ctx.fillRect(sx(p.x) - r / 2, sy(p.y) - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ hyppääjä
  // Asennot paikallisessa koordinaatistossa: x = suksien suunta eteen, y = ylös (metreinä).
  const ASENNOT = {
    kyykky:   { a1: [0, 0], k1: [0.38, 0.42], a2: [0.05, 0], k2: [0.42, 0.4], lan: [-0.14, 0.58], ol: [0.42, 0.82], pa: [0.68, 0.88], k1k: [-0.28, 0.52], k2k: [-0.22, 0.48] },
    pysty:    { a1: [0, 0], k1: [0.12, 0.48], a2: [0.02, 0], k2: [0.14, 0.47], lan: [0, 0.95], ol: [0.08, 1.48], pa: [0.14, 1.72], k1k: [0.25, 1.0], k2k: [-0.12, 1.0] },
    ponnistus:{ a1: [0, 0], k1: [0.28, 0.45], a2: [0.02, 0], k2: [0.3, 0.44], lan: [0.4, 0.9], ol: [0.95, 1.3], pa: [1.15, 1.48], k1k: [0.35, 0.82], k2k: [0.3, 0.8] },
    lento:    { a1: [0, 0], k1: [0.48, 0.14], a2: [0, 0], k2: [0.48, 0.14], lan: [0.95, 0.28], ol: [1.5, 0.45], pa: [1.76, 0.52], k1k: [1.0, 0.13], k2k: [1.05, 0.17] },
    telemark: { a1: [0.42, 0], k1: [0.64, 0.42], a2: [-0.42, 0], k2: [-0.38, 0.3], lan: [0, 0.74], ol: [0.1, 1.26], pa: [0.17, 1.48], k1k: [0.6, 1.15], k2k: [-0.5, 1.15] },
    tasajalka:{ a1: [0, 0], k1: [0.22, 0.38], a2: [0.04, 0], k2: [0.25, 0.37], lan: [-0.08, 0.72], ol: [0.12, 1.22], pa: [0.2, 1.45], k1k: [0.6, 1.0], k2k: [-0.45, 1.05] },
    kaatunut: { a1: [0, 0], k1: [0.35, 0.08], a2: [0.1, 0.05], k2: [0.4, 0.15], lan: [0.75, 0.15], ol: [1.3, 0.12], pa: [1.55, 0.16], k1k: [1.2, 0.45], k2k: [0.9, -0.05] },
  };
  function sekoita(a, b, t) {
    const o = {};
    for (const k in a) o[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t)];
    return o;
  }

  function hyppaajanAsento(h) {
    if (!h) return { asento: ASENNOT.pysty, v: 0 };
    if (h.vaihe === 'portilla') return { asento: ASENNOT.kyykky, v: 0 };
    if (h.vaihe === 'vauhti') {
      if (h.seisoo) return { asento: ASENNOT.pysty, v: 0 };
      if (h.irrotettu && h.u / Math.max(1, h.nopeus) < 0.12) return { asento: ASENNOT.ponnistus, v: 0 };
      return { asento: h.kyykky ? ASENNOT.kyykky : ASENNOT.pysty, v: 0 };
    }
    if (h.vaihe === 'lento') {
      let a = sekoita(ASENNOT.ponnistus, ASENNOT.lento, clamp(h.tLento / 0.35, 0, 1));
      if (h.alastulo) a = sekoita(a, h.alastulo === 'telemark' ? ASENNOT.telemark : ASENNOT.tasajalka, h.valmius);
      return { asento: a, v: h.alastulo ? 1 - h.valmius : 1 };
    }
    if (h.kaatunut) return { asento: ASENNOT.kaatunut, v: 0, kaatunut: true };
    const loppu = h.alastulo === 'telemark' ? ASENNOT.telemark : ASENNOT.tasajalka;
    return { asento: sekoita(loppu, ASENNOT.pysty, clamp((h.tAlas - 1) / 1, 0, 1)), v: 0 };
  }

  function piirraHyppaaja(h) {
    let x, y, th;
    if (h) { x = h.x; y = h.y; th = h.th; }
    else { const p = F.vauhtiU(maki, maki.lahtoU); x = p.x; y = p.y; th = -p.a; }
    const { asento: A, v: vVaihe, kaatunut } = hyppaajanAsento(h);
    const KOKO = Math.max(1.35, 13 / S); // pienellä näytöllä hyppääjä piirretään suurempana
    const sc = S * KOKO;
    let kulma = th;
    if (kaatunut) kulma = th + Math.sin(h.tAlas * 3) * 0.1;
    ctx.save();
    ctx.translate(sx(x), sy(y));
    ctx.rotate(-kulma);
    ctx.scale(sc, -sc);
    const px = 1 / sc;
    const raaja = Math.max(0.15, 2.4 * px);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const suksi = (ank, vari, kierto) => {
      ctx.save();
      ctx.translate(ank[0], ank[1]);
      ctx.rotate(kierto || 0);
      ctx.strokeStyle = vari; ctx.lineWidth = Math.max(0.09, 1.8 * px);
      ctx.beginPath(); ctx.moveTo(-1.0, 0.02); ctx.lineTo(1.35, 0.02); ctx.quadraticCurveTo(1.55, 0.03, 1.6, 0.14); ctx.stroke();
      ctx.restore();
    };
    const viiva = (pts, vari, lw) => {
      ctx.strokeStyle = vari; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };
    // V-asento: takimmainen suksi hieman eri kulmassa lennossa.
    const vKulma = 0.09 * vVaihe;
    if (kaatunut) {
      suksi([0.4, 0.05], VARIT.suksetTumma, 0.7);
      suksi([-0.6, 0], VARIT.sukset, -0.25);
    } else {
      suksi(A.a2, VARIT.suksetTumma, vKulma);
    }
    // taempi jalka ja käsi
    viiva([A.a2, A.k2, A.lan], VARIT.pukuTumma, raaja * 1.15);
    viiva([A.ol, A.k2k], VARIT.pukuTumma, raaja * 0.85);
    // vartalo
    viiva([A.lan, A.ol], VARIT.puku, raaja * 1.6);
    // etummainen jalka
    viiva([A.a1, A.k1, A.lan], VARIT.puku, raaja * 1.2);
    if (!kaatunut) suksi(A.a1, VARIT.sukset, 0);
    // käsi
    viiva([A.ol, A.k1k], VARIT.puku, raaja * 0.9);
    // pää
    ctx.fillStyle = VARIT.kypara;
    ctx.beginPath(); ctx.arc(A.pa[0], A.pa[1], Math.max(0.15, 3.2 * px), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ HUD
  function piirraHud(aika) {
    const h = hyppy;
    const pieni = W < 560;
    const m = 14;
    ctx.save();
    ctx.shadowColor = 'rgba(2,6,14,0.85)'; ctx.shadowBlur = 6;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    // Mäki
    ctx.fillStyle = VARIT.teksti;
    ctx.font = `700 ${pieni ? 16 : 20}px "Saira Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(maki.nimi.toUpperCase(), m, m);
    ctx.fillStyle = VARIT.himmea;
    ctx.font = `500 ${pieni ? 12 : 13}px Saira, system-ui, sans-serif`;
    const e = ennatykset[maki.id];
    ctx.fillText(`K${maki.K} · HS${maki.HS}${e ? ' · ennätys ' + fi(e, 1) + ' m' : ''}`, m, m + (pieni ? 20 : 24));

    // Tuuli
    const tuuli = h.tuuli;
    const vasta = tuuli >= 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = vasta ? VARIT.hyva : VARIT.huono;
    ctx.font = `700 ${pieni ? 16 : 20}px "Saira Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(`${fi(Math.abs(tuuli), 1)} m/s`, W - m, m);
    ctx.fillStyle = VARIT.himmea;
    ctx.font = `500 ${pieni ? 12 : 13}px Saira, system-ui, sans-serif`;
    ctx.fillText(vasta ? 'vastatuuli' : 'myötätuuli', W - m, m + (pieni ? 20 : 24));
    ctx.restore();
    // nuoli
    const nx = W - m - (pieni ? 70 : 90), ny = m + (pieni ? 9 : 11);
    ctx.strokeStyle = vasta ? VARIT.hyva : VARIT.huono; ctx.lineWidth = 2;
    const suunta = vasta ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(nx - 10 * suunta, ny); ctx.lineTo(nx + 10 * suunta, ny);
    ctx.moveTo(nx + 10 * suunta - 5 * suunta, ny - 4); ctx.lineTo(nx + 10 * suunta, ny); ctx.lineTo(nx + 10 * suunta - 5 * suunta, ny + 4);
    ctx.stroke();

    // Nopeus tai asentomittari
    const ax = m, ay = H - m;
    if (h.vaihe === 'vauhti' || h.vaihe === 'portilla') {
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = VARIT.teksti;
      ctx.font = `800 ${pieni ? 30 : 40}px "Saira Condensed", "Arial Narrow", sans-serif`;
      const kmh = fi(h.nopeus * 3.6, 1);
      ctx.fillText(kmh, ax, ay - 2);
      const lev = ctx.measureText(kmh).width;
      ctx.fillStyle = VARIT.himmea;
      ctx.font = `500 13px Saira, system-ui, sans-serif`;
      ctx.fillText('km/h', ax + lev + 6, ay - 8);
    } else if (h.vaihe === 'lento' && !h.alastulo) {
      piirraAsentomittari(ax, ay, pieni);
    }

    // Vihje
    let vihje = '';
    if (h.vaihe === 'portilla') vihje = 'Paina ja pidä pohjassa (tai välilyönti) – lasku alkaa';
    else if (h.vaihe === 'vauhti' && !h.irrotettu) vihje = h.u < 25 ? 'Irrota nokalla!' : 'Pidä pohjassa… irrota hyppyrin nokalla';
    else if (h.vaihe === 'lento' && !h.alastulo) {
      vihje = h.tLento < 1.2 ? 'Paina ja vedä: alas = eteen, ylös = kärjet ylös' : 'Napauta = telemark · kaksi sormea / oikea nappi = tasajalka';
    }
    if (vihje) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = `500 ${pieni ? 13 : 15}px Saira, system-ui, sans-serif`;
      const kiire = vihje === 'Irrota nokalla!';
      const lev = ctx.measureText(vihje).width + 24;
      const yb = pieni ? H - 64 : H - m;
      ctx.fillStyle = 'rgba(8,16,31,0.65)';
      pyoristetty(W / 2 - lev / 2, yb - 30, lev, 30, 6); ctx.fill();
      ctx.fillStyle = kiire ? VARIT.valo : VARIT.teksti;
      ctx.fillText(vihje, W / 2, yb - 7);
    }

    // Viestit
    viestit.forEach((v, i) => {
      const t = v.t, a = t < 0.12 ? t / 0.12 : t > v.kesto - 0.3 ? (v.kesto - t) / 0.3 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${pieni ? 24 : 32}px "Saira Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle = 'rgba(4,10,23,0.55)';
      ctx.fillText(v.teksti, W / 2 + 2, H * 0.24 + i * (pieni ? 30 : 38) + 2);
      ctx.fillStyle = v.vari;
      ctx.fillText(v.teksti, W / 2, H * 0.24 + i * (pieni ? 30 : 38));
    });
    ctx.globalAlpha = 1;
  }

  function pyoristetty(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Kohtauskulma-mittari: 0–70°, vihreä alue 23–33°.
  function piirraAsentomittari(x, y, pieni) {
    const R = pieni ? 46 : 60;
    const cx = x + R + 4, cy = y - 18;
    const kulma = (a) => Math.PI + (clamp(a, 0, 70) / 70) * Math.PI;
    ctx.lineWidth = pieni ? 8 : 10; ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(8,16,31,0.6)';
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,201,77,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, R, kulma(17), kulma(40)); ctx.stroke();
    ctx.strokeStyle = VARIT.hyva;
    ctx.beginPath(); ctx.arc(cx, cy, R, kulma(23), kulma(33)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,122,102,0.7)';
    ctx.beginPath(); ctx.arc(cx, cy, R, kulma(0), kulma(6)); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, kulma(62), kulma(70)); ctx.stroke();
    const a = hyppy.alfa;
    const k = kulma(a);
    ctx.strokeStyle = VARIT.teksti; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(k) * (R + 6), cy + Math.sin(k) * (R + 6)); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = VARIT.himmea; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `500 ${pieni ? 11 : 12}px Saira, system-ui, sans-serif`;
    ctx.fillText('Lentoasento', cx, cy + 4);
  }

  // Testejä ja virheenjäljitystä varten.
  window.makikotka = { get hyppy() { return hyppy; }, get tila() { return tila; } };

  // ------------------------------------------------------------ käynnistys
  rakennaMaet();
  asetaKamera(true);
  requestAnimationFrame(silmukka);
})();
