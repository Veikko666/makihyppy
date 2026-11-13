# Mäkikotka – selainprototyyppi

Pelattava prototyyppi mobiiliohjauksen ja lentofysiikan testaamiseen PC:llä.

Avaa `index.html` selaimessa (tai aja esim. `python3 -m http.server` tässä
kansiossa ja mene osoitteeseen http://localhost:8000).

| Vaihe | Hiiri / kosketus | Näppäimistö |
|---|---|---|
| Vauhti | Klikkaus / napautus | Välilyönti |
| Ponnistus | Klikkaus / napautus nokalla | Välilyönti uudelleen |
| Lento | Hiiri: liikuta ilman painallusta · kosketus: paina ja vedä (alas = eteen) | ↓ / ↑ |
| Alastulo | Klikkaus / napautus = telemark, oikea nappi / kaksi sormea = tasajalka | T / Shift |

- `fysiikka.js` – mäkiprofiilit, fysiikka ja pisteytys (toimii myös Nodessa)
- `peli.js` – syöte, kamera, piirto, äänet ja valikot
