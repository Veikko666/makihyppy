# Mäkihyppypeli Androidille – suunnitelma

Fysiikkapohjainen 2D-mäkihyppypeli sivukuvakulmasta. Pelin henki on sama kuin
klassisissa PC-mäkihyppypeleissä: yksinkertaiset kontrollit, mutta ajoitus ja
lentoasennon hallinta vaativat harjoittelua, ja jokaisesta metristä joutuu
taistelemaan. Kontrollit suunnitellaan alusta asti kosketusnäytölle.

Pelillä on oma nimi, omat kuvitteelliset mäet ja oma grafiikka – ei lainata
nimiä, mäkiä tai grafiikkaa olemassa olevista peleistä (tärkeää myös Play
Kauppaa varten).

---

## 1. Ydinpelisilmukka

Yksi hyppy kestää noin 10–15 sekuntia ja jakautuu neljään vaiheeseen:

| Vaihe | Mitä tapahtuu | Pelaajan tehtävä |
|---|---|---|
| **1. Vauhti** | Hyppääjä lähtee lähtöportilta ja kiihtyy | Lähtö, pidä asento (vähemmän ilmanvastusta) |
| **2. Ponnistus** | Hyppyrin nokka | Ponnista oikealla hetkellä (ajoitusikkuna ~±40 ms) |
| **3. Lento** | 3–7 s lento, ilmanvastus ja noste | Säädä vartalon kulmaa jatkuvasti – liian pysty → jarruttaa, liian etukeno → kaatuu nokalleen |
| **4. Alastulo** | Laskeutuminen mäkeen | Valitse telemark tai tasajalka oikeaan aikaan; huono kulma = kaatuminen |

Hypyn jälkeen: pituus, tyylipisteet, tuulikorjaus, kokonaispisteet → seuraava
hyppy. Nopea uudelleenyritys on tärkeää (yksi napautus = uusi hyppy).

---

## 2. Mobiilikontrollit

Tavoite: koko hyppy yhdellä peukalolla, mutta syvyyttä riittää.

### Oletusohjaus: "pidä ja vedä"
1. **Vauhti:** Paina sormi ruudulle → hyppääjä lähtee ja menee
   vauhtiasentoon. Sormi pysyy ruudulla koko vauhdin ajan.
2. **Ponnistus:** **Nosta sormi** hyppyrin nokalla. Irrotus on luonnollinen ja
   tarkka ajoitusele (tarkempi kuin napautus).
3. **Lento:** Paina sormi uudelleen ruudulle missä tahansa. **Pystysuuntainen
   veto kosketuskohdasta** ohjaa vartalon kulmaa (ylös = pystympi, alas =
   etukenompi). Suhteellinen ohjaus → ei väliä mihin kohtaan ruutua painaa.
4. **Alastulo:**
   - **Pyyhkäisy alas** = telemark (paremmat tyylipisteet, vaikeampi)
   - **Kahden sormen napautus** tai sormen nosto = tasajalka (turvallisempi)

### Vaihtoehtoinen ohjaus (asetuksista)
- **Kallistus (kiihtyvyysanturi)** lentoasennolle, napautukset muuhun.
- **Napit**: näytön reunoilla ylös/alas-alueet (helppokäyttöisyys).

### Asetukset
- Herkkyys (lentoasennon vetomatka), vasenkätinen tila, värinäpalaute
  ponnistuksessa ja alastulossa, ajoitusapu aloittelijoille (hidastus
  nokalla harjoitustilassa).

### Palaute pelaajalle
- Värinä (haptiikka) ponnistuksessa ja alastulossa.
- Lennon aikana pieni "tasapainomittari" tai vartalon kulman indikaattori
  (voi piilottaa asetuksista).
- Ponnistuksen jälkeen teksti: *"Täydellinen!" / "12 ms myöhässä"*.

---

## 3. Fysiikka

Oma yksinkertainen fysiikka, **ei** pelimoottorin rigidbody-fysiikkaa –
tuntuma pitää pystyä säätämään tarkasti. Kiinteä aika-askel (esim. 120 Hz),
jotta tulokset ovat toistettavia (tärkeää uusinnoille ja haamuhyppääjille).

### Tila
- sijainti `p`, nopeus `v`, vartalon kulma `θ`, kulmanopeus `ω`

### Vauhti
- Kiihtyvyys = `g·sin(kaltevuus) − kitka − ilmanvastus(asento)`
- Lähtöportti määrää lähtökorkeuden → vauhti nokalla (esim. 85–95 km/h K120:lla)

### Ponnistus
- Impulssi kohtisuoraan hyppyrin pöytää vastaan.
- Impulssin suuruus riippuu ajoituksesta: täydellinen = täysi impulssi,
  liian aikaisin = vauhti jää, liian myöhään = impulssi pienenee nopeasti
  (nokan jälkeen ei voi ponnistaa).

### Lento
- Kohtauskulma `α = θ − γ` (γ = lentoradan kulma)
- Noste `L = k_L(α) · v²` ja vastus `D = k_D(α) · v²`, missä `k_L` ja `k_D`
  ovat säädettäviä käyriä (taulukko + interpolointi).
- **Epävakaus = pelin ydin:** ilmavirta pyrkii kääntämään vartaloa pois
  ihannekulmasta (pieni positiivinen takaisinkytkentä). Pelaaja korjaa
  jatkuvasti. Ilman korjausta hyppääjä kallistuu joko taakse (jarruttaa,
  lyhyt hyppy) tai eteen (kaatuu).
- **Tuuli** lisätään suhteelliseen ilmannopeuteen (vasta-/myötätuuli,
  pieni puuskaisuus).

### Alastulo
- Törmäys: hyppääjän korkeus vs. mäen profiili `y_mäki(x)`.
- Kaatuminen, jos vartalon kulma poikkeaa liikaa rinteen kulmasta tai
  rinteeseen nähden kohtisuora nopeus on liian suuri (esim. mäen alla
  tasaisella).
- Pituus mitataan pitkin profiilia puolen metrin tarkkuudella.

### Mäkiprofiili
Mäet generoidaan parametreista (vauhtimäen kulma, nokan kulma, K-piste,
HS-piste jne.) – ei käsin piirrettyjä. Sama data tuottaa sekä fysiikan että
grafiikan. Uuden mäen lisääminen = uusi JSON-tiedosto.

```json
{
  "nimi": "Kuusivaara",
  "k_piste": 120, "hs": 140,
  "vauhtimaki_kulma": 35, "nokka_kulma": 11, "nokka_pituus": 6.5,
  "alastulo_kulma": 35, "portit": 25
}
```

---

## 4. Pisteytys (yksinkertaistettu kilpailusääntö)

- **Pituuspisteet:** K-pisteeseen hyppy = 60 p (lentomäki 120 p).
  Metriarvo mäen koon mukaan (esim. normaalimäki 2,0 p/m, suurmäki 1,8 p/m,
  lentomäki 1,2 p/m).
- **Tyylipisteet:** 5 tuomaria, 0–20 p, suurin ja pienin pois → max 60 p.
  Perustuu lennon tasaisuuteen, alastulon tyyppiin (telemark) ja
  alastulon laatuun. Kaatuminen = iso vähennys.
- **Tuuli- ja porttikorjaus:** vastatuuli antaa lisäpisteitä, myötätuuli
  vähentää (voi jättää versioon 2).

---

## 5. Pelimuodot

| Muoto | Kuvaus | Versio |
|---|---|---|
| **Harjoittelu** | Vapaa hyppiminen, valittava mäki, portti ja tuuli | MVP |
| **Kilpailu** | 2 kierrosta tekoälyhyppääjiä vastaan, 30 parasta toiselle kierrokselle | MVP |
| **Mäkiennätykset ja avaukset** | Seuraava mäki aukeaa, kun edellisestä hyppää tietyn pituuden | MVP |
| **Maailmancup / kausi** | Useita kilpailuja, kokonaispisteet | v1.1 |
| **Päivän haaste** | Sama mäki + tuuli kaikille, paikallinen ennätys | v1.1 |
| **Haamuhyppääjä / uusinta** | Oman parhaan hypyn uusinta (toistettava fysiikka mahdollistaa) | v1.1 |
| **Online-tulostaulut** | Google Play Games -palvelut | v1.2 |

### Tekoälykilpailijat
Ei simuloida oikeasti – arvotaan pituudet taitotason ja mäen mukaan
(normaalijakauma + pieni kaatumistodennäköisyys). Kuvitteelliset nimet ja maat.

### Mäet (kuvitteellisia)
1. Pikkumäki K25 – opettelu
2. Harjoitusmäki K60
3. Normaalimäki K90
4. Suurmäki K120
5. Suurmäki K125 (eri profiili, enemmän tuulta)
6. Lentomäki K200 – avautuu viimeisenä

---

## 6. Tekniikka

### Suositus: **Godot 4** (GDScript)
- Ilmainen ja avoin, ei rojalteja.
- Erinomainen 2D-tuki, kevyt APK/AAB (~30–40 Mt).
- Suora vienti Androidille (AAB Play Kauppaan), kosketus ja kiihtyvyysanturi
  valmiina.
- Toimii myös PC:llä → nopea testaus ilman puhelinta.

Vaihtoehdot: *Unity* (raskaampi, lisenssiehdot), *Kotlin + libGDX*
(enemmän käsityötä, ei editoria). Godot on tähän kokoon paras.

### Projektirakenne
```
project.godot
scenes/
  main_menu.tscn
  jump.tscn          # yksi hyppy: mäki, hyppääjä, kamera, HUD
  results.tscn
scripts/
  physics/
    jumper_physics.gd    # tila + integrointi, ei riippuvuutta grafiikkaan
    aero_curves.gd       # k_L(α), k_D(α)
    hill_profile.gd      # profiilin generointi ja y_mäki(x)
  input/
    touch_controller.gd  # eleet → abstraktit komennot
    tilt_controller.gd
  game/
    scoring.gd
    competition.gd
    ai_jumpers.gd
  ui/
data/
  hills/*.json
  ai_names.json
tests/                   # fysiikan ja pisteytyksen yksikkötestit (GUT)
```

**Tärkeä periaate:** syöte muunnetaan abstrakteiksi komennoiksi
(`aloita`, `ponnista`, `aseta_kulma(x)`, `alastulo(tyyppi)`). Fysiikka ei
tiedä mistään kosketuksista → ohjaustavat vaihdettavissa ja fysiikka
testattavissa ilman ruutua.

### Grafiikka
- Vektorityylinen 2D, mäki piirretään profiilista (`Polygon2D`/`Line2D`).
- Parallaksitaustat (metsä, tunturi, katsomo).
- Kamera seuraa ja zoomaa ulos lennon aikana, jotta alastulorinne näkyy.
- Hyppääjä: muutama osa (vartalo, sukset), kulmat fysiikasta.
- Pysty- vai vaakanäyttö? → **Vaakanäyttö** (mäen pituus näkyy paremmin).

### Ääni
Tuulen suhina (voimakkuus = nopeus), ponnistus, alastulo, yleisön reaktio
pituuden mukaan.

### Tallennus
Paikallinen JSON (`user://`): ennätykset, avatut mäet, asetukset.

---

## 7. Vaiheistus

| Vaihe | Sisältö | Valmis kun |
|---|---|---|
| **M0 – Prototyyppi** | Godot-projekti, yksi mäki profiilista, fysiikka, debug-piirto, näppäinohjaus PC:llä | Hyppääjä lähtee, lentää ja laskeutuu |
| **M1 – Tuntuma** | Kosketusohjaus, ponnistuksen ajoitus, lennon epävakaus, kaatuminen; testaus oikealla puhelimella | Hyppy tuntuu hauskalta ja taito ratkaisee pituuden – **tärkein vaihe, iteroidaan kunnes kunnossa** |
| **M2 – Pisteet** | Pituusmittaus, tyylipisteet, tulosruutu, nopea uusi yritys | Yksi hyppy on kokonainen "peli" |
| **M3 – Sisältö** | 4–6 mäkeä, tuuli, valikot, mäkien avaus, tallennus | Harjoittelutila valmis |
| **M4 – Kilpailu** | Tekoälyhyppääjät, 2 kierrosta, tulostaulu | Kilpailutila valmis |
| **M5 – Viimeistely** | Grafiikka, äänet, haptiikka, asetukset, ohjeistus/tutoriaali | Näyttää ja kuulostaa valmiilta |
| **M6 – Julkaisu** | Allekirjoitus, AAB, Play Console, sisäinen testi → suljettu testi → julkaisu | Pelissä Play Kaupassa |

Play Kaupan huomioita: uusilta henkilökohtaisilta kehittäjätileiltä
vaaditaan suljettu testi (useita testaajia ~2 viikon ajan) ennen
tuotantojulkaisua – kannattaa aloittaa M5:n aikana.

---

## 8. Riskit

| Riski | Torjunta |
|---|---|
| Lento ei tunnu hyvältä kosketuksella | M1 ennen kaikkea muuta; säätöarvot data-tiedostoon, kehitystilan säätöpaneeli pelin sisällä |
| Liian vaikea / liian helppo | Pikkumäki opettelua varten, aloittelija-avut, tuulen määrä mäkikohtainen |
| Eri näyttökoot ja suhteet | Suhteellinen kosketusohjaus, kamera skaalautuu, testaus 2–3 laitteella |
| Fysiikka epätoistettava | Kiinteä aika-askel, ei satunnaisuutta ilman siementä |
| Laajuus kasvaa | MVP = harjoittelu + kilpailu + 4 mäkeä; muut v1.1:een |

---

## 9. Avoimet kysymykset

1. Godot 4 sopii? Onko aiempaa kokemusta jostain moottorista?
2. Grafiikkatyyli: yksinkertainen vektori vai pikselitaide?
3. Ilmainen peli vai maksullinen / mainokset?
4. Pitääkö olla moninpeli (esim. samalla laitteella vuorotellen)?
5. Kieli: suomi + englanti?
