// Mäkikotka – fysiikka, mäkiprofiilit ja pisteytys.
// Ei riippuvuuksia selaimeen: sama koodi toimii Nodessa testeissä.
(function (global) {
  'use strict';

  const G = 9.81;
  const DEG = Math.PI / 180;
  const ILMA = 1.2 / (2 * 70); // ρ / (2m), m = 70 kg
  const DT = 1 / 120;          // kiinteä aika-askel

  // ---------------------------------------------------------------- mäet
  const MAET = [
    { id: 'k60',  nimi: 'Kotimäki',     K: 60,  HS: 68,  kulmaVauhti: 33, kulmaNokka: 10.5, nokkaPituus: 5.0, R1: 60,  nokkaKorkeus: 2.0, beta: 34, f0: 6, metriarvo: 2.4, kPisteet: 60,  tuulikerroin: 6 },
    { id: 'k90',  nimi: 'Kuusivaara',   K: 90,  HS: 100, kulmaVauhti: 35, kulmaNokka: 11,   nokkaPituus: 6.0, R1: 85,  nokkaKorkeus: 2.6, beta: 35, f0: 6, metriarvo: 2.0, kPisteet: 60,  tuulikerroin: 8 },
    { id: 'k125', nimi: 'Revontulimäki', K: 125, HS: 140, kulmaVauhti: 35, kulmaNokka: 11,   nokkaPituus: 6.8, R1: 105, nokkaKorkeus: 3.2, beta: 35.5, f0: 6, metriarvo: 1.8, kPisteet: 60,  tuulikerroin: 10 },
    { id: 'k185', nimi: 'Tunturilento', K: 185, HS: 215, kulmaVauhti: 36, kulmaNokka: 11.5, nokkaPituus: 7.5, R1: 120, nokkaKorkeus: 4.0, beta: 37, f0: 7, metriarvo: 1.2, kPisteet: 120, tuulikerroin: 14 },
  ];

  const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    const u = Math.max(1e-9, rng()), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Alastulorinteen kaltevuus (rad, positiivinen = alamäki) kaarenpituuden funktiona.
  function rinteenKulma(m, s) {
    const b = m.beta * DEG, f0 = m.f0 * DEG, bL = (m.beta - 5) * DEG;
    const sP = m.K * 0.55, sK = m.K, sL = m.HS, sU = m.HS + m.K * 0.5;
    if (s < 0) return f0;
    if (s < sP) return f0 + (b - f0) * smooth(s / sP);
    if (s < sK) return b;
    if (s < sL) return b + (bL - b) * (s - sK) / (sL - sK);
    if (s < sU) return bL * (1 - smooth((s - sL) / (sU - sL)));
    if (s < sU + 120) return 0;
    return -4 * DEG * smooth((s - sU - 120) / 20); // loiva vastamäki lopussa
  }

  function rakennaMaki(m) {
    const maki = Object.assign({}, m);
    // Alastulorinne: taulukko kaarenpituuden mukaan.
    const ds = 0.25, pituus = m.HS + m.K * 0.5 + 170;
    const xs = [], ys = [], ss = [], fs = [];
    let x = 0, y = -m.nokkaKorkeus;
    for (let s = 0; s <= pituus; s += ds) {
      const f = rinteenKulma(m, s);
      xs.push(x); ys.push(y); ss.push(s); fs.push(f);
      x += Math.cos(f) * ds; y -= Math.sin(f) * ds;
    }
    maki.rinne = { xs, ys, ss, fs };

    // Vauhtimäki: u = matka nokalta taaksepäin.
    const du = 0.1, uMax = 160;
    const an = m.kulmaNokka * DEG, av = m.kulmaVauhti * DEG;
    const uSiirtyma = m.nokkaPituus + m.R1 * (av - an);
    const vx = [], vy = [], va = [];
    let px = 0, py = 0;
    for (let u = 0; u <= uMax + 1e-9; u += du) {
      let a;
      if (u <= m.nokkaPituus) a = an;
      else if (u <= uSiirtyma) a = an + (u - m.nokkaPituus) / m.R1;
      else a = av;
      vx.push(px); vy.push(py); va.push(a);
      px -= Math.cos(a) * du; py += Math.sin(a) * du;
    }
    maki.vauhti = { du, vx, vy, va, uMax };

    // Ponnistusnopeus ja lähtöpaikka viritetään niin, että hyvä hyppy osuu K-pisteen yli.
    maki.v0 = viritaNopeus(maki);
    maki.lahtoU = etsiLahto(maki, maki.v0);
    return maki;
  }

  function rinneX(maki, x) {
    const r = maki.rinne, xs = r.xs;
    if (x <= 0) return { y: r.ys[0] + Math.tan(r.fs[0]) * (-x) * 0 , f: r.fs[0], s: 0, i: 0 };
    let lo = 0, hi = xs.length - 1;
    if (x >= xs[hi]) return { y: r.ys[hi], f: r.fs[hi], s: r.ss[hi], i: hi };
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return {
      y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t,
      f: r.fs[lo] + (r.fs[hi] - r.fs[lo]) * t,
      s: r.ss[lo] + (r.ss[hi] - r.ss[lo]) * t,
      i: lo,
    };
  }
  function rinneS(maki, s) {
    const r = maki.rinne, ds = r.ss[1] - r.ss[0];
    const i = clamp(Math.floor(s / ds), 0, r.ss.length - 2);
    const t = clamp((s - r.ss[i]) / ds, 0, 1);
    return { x: r.xs[i] + (r.xs[i + 1] - r.xs[i]) * t, y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t, f: r.fs[i] };
  }
  function vauhtiU(maki, u) {
    const v = maki.vauhti;
    const i = clamp(Math.floor(u / v.du), 0, v.vx.length - 2);
    const t = clamp((u - i * v.du) / v.du, 0, 1);
    return { x: v.vx[i] + (v.vx[i + 1] - v.vx[i]) * t, y: v.vy[i] + (v.vy[i + 1] - v.vy[i]) * t, a: v.va[i] };
  }

  // ---------------------------------------------------------------- aerodynamiikka
  // Noste- ja vastuspinta-alat (m²) kohtauskulman funktiona (asteina).
  function nosteA(aDeg) {
    const a = clamp(aDeg, -35, 70);
    return 0.82 * Math.sin(Math.PI * a / 70);
  }
  function vastusA(aDeg) {
    const s = Math.sin(clamp(aDeg, -90, 90) * DEG);
    return 0.2 + 1.15 * s * s;
  }

  const ASETUKSET = {
    alfaTasapaino: 27,   // kulma, jossa vartalo ei itsestään kierry
    epavakaus: 0.85,     // 1/s – kuinka nopeasti vartalo karkaa tasapainosta
    kohina: 5,           // °/s puuskaisuus
    alfaAlku: 40,        // kohtauskulma heti ponnistuksen jälkeen
    kitka: 0.02,
    vastusKyyky: 0.0016,
    vastusPysty: 0.0045,
  };

  // ---------------------------------------------------------------- hyppy
  function uusiHyppy(maki, opt) {
    opt = opt || {};
    const rng = mulberry32(opt.siemen != null ? opt.siemen : (Math.random() * 2 ** 31) | 0);
    const vaikeus = opt.helppo ? 0.45 : 1;
    const alku = vauhtiU(maki, maki.lahtoU || 0);
    return {
      maki, rng,
      tuuli: opt.tuuli != null ? opt.tuuli : 0,       // + = vastatuuli (m/s)
      vaikeus,
      vaihe: 'portilla',                               // portilla | vauhti | lento | alas | valmis
      t: 0, tLento: 0,
      u: maki.lahtoU, nopeus: 0, kyykky: true, seisoo: false,
      irrotettu: false, irrotusAika: null, ponnistusLaatu: null, ponnistusMs: null, ponnistusTeksti: '',
      x: alku.x, y: alku.y, vx: 0, vy: 0, th: -alku.a, alfa: 0,
      puuska: 0,
      alastulo: null, alastuloT: null, valmius: 0,
      kaatuu: false, kaatumisSyy: '',
      polku: [],
      poikkeamat: 0, poikkeamaAika: 0,
      tulos: null,
      tapahtumat: [],
    };
  }

  function aloita(h) { if (h.vaihe === 'portilla') { h.vaihe = 'vauhti'; h.kyykky = true; } }

  // Sormi irti / välilyönti irti: ponnistus.
  function ponnista(h) {
    if (h.vaihe === 'vauhti' && !h.irrotettu) {
      h.irrotettu = true;
      const aikaaNokalle = h.u / Math.max(1, h.nopeus);
      h.irrotusAika = aikaaNokalle;
      if (aikaaNokalle > 0.4) {
        h.seisoo = true; h.kyykky = false;
        h.ponnistusLaatu = 0.15;
        h.ponnistusTeksti = 'Liian aikaisin';
        h.ponnistusMs = -Math.round(aikaaNokalle * 1000);
      } else if (aikaaNokalle <= 0.035) {
        h.ponnistusLaatu = 1;
        h.ponnistusTeksti = 'Täydellinen ponnistus!';
        h.ponnistusMs = 0;
      } else {
        h.ponnistusLaatu = clamp(1 - (aikaaNokalle - 0.035) / 0.5, 0.2, 1);
        h.ponnistusMs = -Math.round(aikaaNokalle * 1000);
        h.ponnistusTeksti = `Aikaisin ${Math.round(aikaaNokalle * 1000)} ms`;
      }
    } else if (h.vaihe === 'lento' && !h.irrotettu && h.tLento < 0.15) {
      // Myöhäinen ponnistus nokan jälkeen.
      h.irrotettu = true;
      const q = clamp(0.85 * (1 - h.tLento / 0.15), 0, 0.85);
      h.ponnistusLaatu = q;
      h.ponnistusMs = Math.round(h.tLento * 1000);
      h.ponnistusTeksti = `Myöhässä ${h.ponnistusMs} ms`;
      lisaaPonnistus(h, q);
    }
  }

  function kyykisty(h, paalla) {
    if (h.vaihe === 'vauhti' && !h.irrotettu) h.kyykky = paalla;
  }

  function aloitaAlastulo(h, tyyppi) {
    if (h.vaihe !== 'lento' || h.alastulo || h.tLento < 0.4) return false;
    h.alastulo = tyyppi; h.alastuloT = h.tLento;
    return true;
  }

  // Pelaajan ohjaus: kallistus asteina (+ = kärjet ylös, − = eteenpäin).
  function kallista(h, asteet) {
    if (h.vaihe === 'lento' && !h.alastulo && !h.kaatuu) h.th += asteet * DEG;
  }

  function lisaaPonnistus(h, q) {
    const an = h.maki.kulmaNokka * DEG;
    const vp = 0.3 + 2.5 * q;
    h.vx += Math.sin(an) * vp;
    h.vy += Math.cos(an) * vp;
  }

  function askel(h) {
    const m = h.maki, A = ASETUKSET;
    h.t += DT;
    if (h.vaihe === 'vauhti') {
      const p = vauhtiU(m, h.u);
      const k = h.kyykky ? A.vastusKyyky : A.vastusPysty;
      const ilma = h.nopeus + h.tuuli * 0.3;
      h.nopeus += (G * Math.sin(p.a) - A.kitka * G * Math.cos(p.a) - k * ilma * ilma) * DT;
      h.u -= h.nopeus * DT;
      if (h.u <= 0) {
        // Nokka – lentoon.
        const an = m.kulmaNokka * DEG;
        h.vaihe = 'lento'; h.tLento = 0;
        h.x = 0; h.y = 0;
        h.vx = Math.cos(an) * h.nopeus; h.vy = -Math.sin(an) * h.nopeus;
        h.v0 = h.nopeus;
        if (h.irrotettu) lisaaPonnistus(h, h.ponnistusLaatu);
        const g = Math.atan2(h.vy, h.vx);
        h.th = g + A.alfaAlku * DEG;
        h.tapahtumat.push('nokka');
      } else {
        h.x = p.x; h.y = p.y; h.th = -p.a;
      }
      return;
    }
    if (h.vaihe === 'lento') {
      h.tLento += DT;
      if (!h.irrotettu && h.tLento >= 0.15) {
        h.irrotettu = true; h.ponnistusLaatu = 0; h.ponnistusTeksti = 'Ei ponnistusta';
      }
      const ax = h.vx + h.tuuli, ay = h.vy;
      const V = Math.hypot(ax, ay);
      const ux = ax / V, uy = ay / V;
      const gam = Math.atan2(ay, ax);
      h.alfa = (h.th - gam) / DEG;

      // Alastuloasento: nostetaan vartalo ja kääntö kohti rinnettä.
      let nk = 1, vk = 1;
      if (h.alastulo) {
        h.valmius = Math.min(1, h.valmius + DT / 0.3);
        nk = 1 - 0.55 * h.valmius; vk = 1 + 0.9 * h.valmius;
        const r = rinneX(m, h.x);
        const tavoite = -r.f + 6 * DEG;
        h.th += (tavoite - h.th) * Math.min(1, 5 * DT);
      }
      let LA = nosteA(h.alfa) * nk, DA = vastusA(h.alfa) * vk;
      if (h.kaatuu) { LA = -0.2; DA = 0.9; }
      const q = ILMA * V * V;
      h.vx += (-uy * LA * q - ux * DA * q) * DT;
      h.vy += (ux * LA * q - uy * DA * q - G) * DT;
      h.x += h.vx * DT; h.y += h.vy * DT;

      // Vartalon epävakaus + puuskat.
      if (!h.alastulo && !h.kaatuu) {
        h.puuska += -h.puuska * DT / 0.5 + A.kohina * h.vaikeus * Math.sqrt(DT) * gauss(h.rng) * 1.4;
        const lam = A.epavakaus * h.vaikeus * (V / 25);
        h.th += (lam * (h.alfa - A.alfaTasapaino) + h.puuska) * DEG * DT;
        if (h.tLento > 0.25) {
          const dev = h.alfa - 30;
          h.poikkeamat += dev * dev * DT; h.poikkeamaAika += DT;
        }
        if (h.alfa < -2) { h.kaatuu = true; h.kaatumisSyy = 'Kaatui eteenpäin ilmassa'; }
        else if (h.alfa > 78) { h.kaatuu = true; h.kaatumisSyy = 'Menetti tasapainon taaksepäin'; }
      }
      if (h.kaatuu) h.th -= 3.5 * DT;

      if ((h.polku.length === 0) || h.t - h.polku[h.polku.length - 1][2] > 0.05) h.polku.push([h.x, h.y, h.t]);

      const r = rinneX(m, h.x);
      if (h.y <= r.y && h.tLento > 0.05) kosketus(h, r);
      return;
    }
    if (h.vaihe === 'alas') {
      // Alastulon jälkeen liu'taan rinnettä pitkin.
      h.tAlas += DT;
      const r = rinneS(m, h.sAlas);
      const jarru = h.kaatunut ? 0.35 : (h.tAlas > 1.8 ? 0.12 : A.kitka);
      h.nopeus += (G * Math.sin(r.f) - jarru * G * Math.cos(r.f) - A.vastusPysty * h.nopeus * h.nopeus) * DT;
      if (h.nopeus < 0) h.nopeus = 0;
      h.sAlas += h.nopeus * DT;
      h.x = r.x; h.y = r.y; h.th = -r.f;
      if (h.tAlas > 3.2 || (h.nopeus < 0.5 && h.tAlas > 1)) h.vaihe = 'valmis';
    }
  }

  function kosketus(h, r) {
    const m = h.maki;
    const f = r.f;
    const nx = Math.sin(f), ny = Math.cos(f);
    const tx = Math.cos(f), ty = -Math.sin(f);
    const vn = -(h.vx * nx + h.vy * ny);
    const vt = h.vx * tx + h.vy * ty;
    const valmis = h.alastulo ? h.tLento - h.alastuloT : null;
    const pituus = Math.floor(r.s * 2) / 2;

    let kaatui = h.kaatuu, syy = h.kaatumisSyy, laatu = 'hyva';
    if (!kaatui) {
      if (valmis == null) { kaatui = true; syy = 'Ei alastuloasentoa'; }
      else if (h.alastulo === 'telemark') {
        if (valmis < 0.12) { kaatui = true; syy = 'Telemark liian myöhään'; }
        else if (vn > 6.3) { kaatui = true; syy = 'Liian kova alastulo'; }
        else if (vn > 4.6 || valmis < 0.25) laatu = 'epavarma';
      } else {
        if (valmis < 0.08) { kaatui = true; syy = 'Alastulo liian myöhään'; }
        else if (vn > 8.2) { kaatui = true; syy = 'Liian kova alastulo'; }
        else if (vn > 6) laatu = 'kova';
      }
    }
    h.vaihe = 'alas'; h.tAlas = 0; h.sAlas = r.s; h.nopeus = Math.max(0, vt) * (kaatui ? 0.7 : 0.97);
    h.kaatunut = kaatui;
    h.tapahtumat.push(kaatui ? 'kaatuminen' : 'alastulo');
    h.tulos = pisteyta(h, { pituus, vn, valmis, kaatui, syy, laatu });
  }

  // ---------------------------------------------------------------- pisteet
  function pisteyta(h, a) {
    const m = h.maki;
    const pituusPisteet = m.kPisteet + (a.pituus - m.K) * m.metriarvo;
    let vah = 0;
    const rms = h.poikkeamaAika > 0 ? Math.sqrt(h.poikkeamat / h.poikkeamaAika) : 10;
    const lentoVah = clamp((rms - 5) / 4, 0, 2.5);
    vah += lentoVah;
    if (a.kaatui) vah = 10 + h.rng() * 1.5;
    else if (h.alastulo === 'telemark') vah += a.laatu === 'epavarma' ? 1.5 : 0;
    else vah += 2 + (a.laatu === 'kova' ? 1.5 : 0);
    if (h.ponnistusLaatu != null && h.ponnistusLaatu < 0.3 && !a.kaatui) vah += 0.5;

    const tuomarit = [];
    for (let i = 0; i < 5; i++) {
      const p = 20 - vah + (h.rng() - 0.5) * 1.2;
      tuomarit.push(clamp(Math.round(p * 2) / 2, 0, 20));
    }
    const jarj = tuomarit.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
    const pois = [jarj[0][1], jarj[4][1]];
    const tyyli = jarj.slice(1, 4).reduce((s, p) => s + p[0], 0);
    const tuuliPisteet = -(h.tuuli >= 0 ? h.tuuli : h.tuuli * 1.21) * m.tuulikerroin;
    const yht = Math.max(0, pituusPisteet) + tyyli + tuuliPisteet;
    return {
      pituus: a.pituus, pituusPisteet, tuomarit, pois, tyyli,
      tuuliPisteet: Math.round(tuuliPisteet * 10) / 10,
      yhteensa: Math.round(yht * 10) / 10,
      kaatui: a.kaatui, syy: a.syy, laatu: a.laatu,
      alastulo: h.alastulo, vn: a.vn, v0kmh: (h.v0 || 0) * 3.6,
      ponnistus: h.ponnistusTeksti, lentoRms: rms,
    };
  }

  // ---------------------------------------------------------------- viritys
  // "Tasainen hyvä hyppy": täydellinen ponnistus, kohtauskulma pidetään vakiona.
  function botti(maki, v0, alfaTavoite, maxT) {
    const h = uusiHyppy(maki, { siemen: 1 });
    h.vaihe = 'lento'; h.irrotettu = true; h.ponnistusLaatu = 1;
    const an = maki.kulmaNokka * DEG;
    h.vx = Math.cos(an) * v0; h.vy = -Math.sin(an) * v0; h.v0 = v0;
    lisaaPonnistus(h, 1);
    h.th = Math.atan2(h.vy, h.vx) + ASETUKSET.alfaAlku * DEG;
    let n = 0;
    while (h.vaihe === 'lento' && n++ < (maxT || 20) / DT) {
      if (!h.alastulo) {
        const g = Math.atan2(h.vy, h.vx);
        const tav = g + alfaTavoite * DEG;
        h.th += (tav - h.th) * Math.min(1, 8 * DT) ; // ohjaus kohti tavoitetta
        const r = rinneX(maki, h.x + h.vx * 0.45);
        if (h.y + h.vy * 0.45 - r.y < 0.3 && h.tLento > 0.5) aloitaAlastulo(h, 'telemark');
      }
      h.puuska = 0;
      askel(h);
    }
    return h.tulos ? h.tulos.pituus : 0;
  }

  function viritaNopeus(maki) {
    const tavoite = maki.K + (maki.HS - maki.K) * 0.45;
    let lo = 12, hi = 40;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const d = botti(maki, mid, 30);
      if (d < tavoite) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function etsiLahto(maki, v0) {
    let lo = 5, hi = maki.vauhti.uMax;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const h = uusiHyppy(maki, { siemen: 1 });
      h.u = mid; h.vaihe = 'vauhti';
      let n = 0;
      while (h.vaihe === 'vauhti' && n++ < 20000) askel(h);
      if ((h.v0 || 0) < v0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const api = {
    DT, DEG, MAET, ASETUKSET, rakennaMaki, uusiHyppy, askel, aloita, ponnista, kyykisty,
    aloitaAlastulo, kallista, rinneX, rinneS, vauhtiU, botti, nosteA, vastusA,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Fysiikka = api;
})(typeof window !== 'undefined' ? window : globalThis);
