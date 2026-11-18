import type { PartTexts } from '../parts.ts';

// The parts' descriptions in German, by part type (the English is with each
// part: its info in src/parts). `of` and `aboutOf` are the fingerprints of
// the English summary and about each was translated from (see
// src/i18n/fingerprint.ts).
const texts: PartTexts = {
  battery: {
    summary: 'Eine Gleichspannungsquelle mit Innenwiderstand: Sie entlädt sich mit dem gelieferten Strom, und ihre Spannung sinkt, je leerer sie wird.',
    of: 'ckngsa',
    about: {
      how: 'Eine chemische Zelle wandelt gespeicherte chemische Energie in eine Gleichspannung um. Ein Teil dieser Spannung geht in ihr selbst verloren, wenn sie Strom liefert, umso mehr, je stärker sie belastet wird.',
      sim: 'Eine Spannung hinter ihrem Innenwiderstand. Ihre Ladung (in Ah) nimmt mit dem gelieferten Strom ab, und ihre Spannung folgt einer Entladekurve, die gegen Ende abfällt; „Aufladen“ füllt sie wieder. Über ihrem Höchststrom überhitzt sie.',
      uses: 'Tragbare Schaltungen, Notstromversorgung und alles, was fern vom Netz eine stabile Gleichspannung braucht.',
    },
    aboutOf: '1plmyzj',
  },
  ground: {
    summary: 'Der gemeinsame 0-V-Bezug der Schaltung; jedes Massesymbol ist derselbe Knoten.',
    of: 'kp6bcj',
    about: {
      how: 'Der Punkt, von dem aus jede Spannung einer Schaltung gemessen wird: 0 V. In echten Geräten ist er oft mit dem Gehäuse oder der Erde verbunden.',
      sim: 'Jedes Massesymbol ist ein Knoten auf 0 V. Auch eine getrennte Schaltung ohne Masse erhält einen Bezug, damit sie immer eine Lösung hat.',
      uses: 'Die gemeinsame Rückleitung einer Schaltung und der Bezug für Spannungs- und Logikpegel.',
    },
    aboutOf: '1s5bqts',
  },
  netLabel: {
    summary: 'Benennt ein Netz: Alle Bezeichnungen mit demselben Namen sind verbunden, als wären sie verdrahtet.',
    of: '24zde5',
    about: {
      how: 'Ein Name für ein Netz, damit dieselbe Verbindung an mehreren Stellen einer Zeichnung erscheinen kann, ohne dass eine Leitung dazwischen nötig ist.',
      sim: 'Alle Bezeichnungen mit demselben Namen sind ein Knoten, genau als wären sie verdrahtet. In einer Baugruppe verbindet eine Bezeichnung nur innerhalb derselben Kopie.',
      uses: 'Versorgungs- und Signalleitungen, die über eine große Zeichnung laufen, damit sie übersichtlich bleibt.',
    },
    aboutOf: '10wo2d6',
  },
  terminal: {
    summary: 'Ein Anschlusspunkt, an dem eine Leitung enden kann; auf dem Rand eines Baugruppenrahmens wird er zu einem ihrer Anschlüsse.',
    of: '1669yxg',
    about: {
      how: 'Ein Punkt, an dem Leitungen angeschlossen werden, wie eine Schraubklemme auf einer Klemmleiste.',
      sim: 'Ein offenes Ende ohne Wirkung auf die Schaltung; seine Anzeige zeigt die Spannung dort, also dient sie auch als Messpunkt. Auf dem Rand eines Rahmens wird sie zum Anschluss, wenn der Rahmen zur Baugruppe wird.',
      uses: 'Eine Leitung für später bereithalten, Messpunkte und die Anschlüsse einer Baugruppe.',
    },
    aboutOf: '1i0jq15',
  },
  generator: {
    summary: 'Eine Sinus-Wechselspannungsquelle, eingestellt über Effektivwert und Frequenz; Pin 0 wird zuerst positiv.',
    of: 'to5mv9',
    about: {
      how: 'Eine Quelle einer Wechselspannung, die gleichmäßig zwischen positiv und negativ schwingt, wie das Netz oder ein Signalgenerator.',
      sim: 'Eine Sinusspannung, eingestellt über Effektivwert, Frequenz und Anfangsphase; Pin 0 wird zuerst positiv. Die Anzeigen von Wechselstrom-Bauteilen zeigen Effektiv- und Mittelwerte.',
      uses: 'Transformatoren, Filter und Gleichrichter speisen und testen, wie eine Schaltung auf Wechselspannung reagiert.',
    },
    aboutOf: 'b8ky5u',
  },
  rail: {
    summary: 'Eine Versorgungsschiene: hält ihr Netz auf einer festen Spannung gegen 0 V, ohne dass eine Rückleitung gezeichnet werden muss.',
    of: 'wnvl9s',
    about: {
      how: 'Eine Kurzschreibweise für eine Versorgung: Die Zeichnung zeigt die Spannung an einem Punkt statt einer Leitung zurück zum Netzteil.',
      sim: 'Hält ihr Netz auf der eingestellten Spannung gegen 0 V, bis zu ihrem Höchststrom; deutlich und länger darüber überhitzt sie wie ein ausgelöstes Netzteil. Ihre Spannung kann negativ sein.',
      uses: 'Die +5-V- oder +12-V-Versorgung elektronischer Schaltungen, ohne das Netzteil selbst zu zeichnen.',
    },
    aboutOf: 'tn8ka4',
  },
  phase: {
    summary: 'Ein Außenleiter des Netzes: eine Wechselspannung (Effektivwert) gegen den Neutralleiter auf 0 V; drei, um 120° versetzt, ergeben Drehstrom.',
    of: '1yf0cb9',
    about: {
      how: 'Ein Außenleiter des Netzes: eine Wechselspannung gegen den Neutralleiter. Ein Drehstromnetz hat drei, jeder um 120° nach dem vorigen.',
      sim: 'Eine Sinusspannung (Effektivwert, Frequenz und Phasenwinkel) gegen den Neutralleiter auf 0 V, über einen Schutzschalter, der deutlich über seinem Nennwert auslöst. Drei davon mit 0°, −120° und 120° treiben einen Drehstrommotor.',
      uses: 'Netzbetriebene Schaltungen: Lampen, Transformatoren, Schütze und Motoren.',
    },
    aboutOf: 'wtv6vv',
  },
  resistor: {
    summary: 'Begrenzt den Strom proportional zur anliegenden Spannung (ohmsches Gesetz) und erwärmt sich mit der aufgenommenen Leistung; über seiner Belastbarkeit brennt er durch.',
    of: 'e2pdqx',
    about: {
      how: 'Ein Bauteil, das dem Strom Widerstand entgegensetzt: Der Strom ist die anliegende Spannung geteilt durch den Widerstand (ohmsches Gesetz), und die aufgenommene Leistung wird zu Wärme.',
      sim: 'Ein idealer Widerstand, der sich mit der umgesetzten Leistung erwärmt und über seiner Belastbarkeit durchbrennt. Mit „Reale Streuung“ in den Einstellungen weicht jeder ein wenig von seinem Nennwert ab, innerhalb seiner Toleranz, wie echte.',
      uses: 'Strom begrenzen (etwa für eine LED), Spannungen teilen, Eingänge hoch- oder herunterziehen und die Zeit von RC-Gliedern bestimmen.',
    },
    aboutOf: 'if30rr',
  },
  capacitor: {
    summary: 'Speichert Ladung: sperrt Gleichstrom, sobald er geladen ist, und lässt Wechselstrom umso leichter durch, je höher die Frequenz.',
    of: '52qcgu',
    about: {
      how: 'Zwei Platten mit einem Isolator dazwischen. Strom fließt nur beim Laden oder Entladen; eine konstante Gleichspannung sperrt er also, sich ändernde Spannungen lässt er durch.',
      sim: 'Eine ideale Kapazität, die sich mit der Zeit lädt und entlädt. Über ihrer Nennspannung wird sie überlastet und fällt aus.',
      uses: 'Versorgungen abblocken, Wechselsignale koppeln, Filter und Zeitglieder mit einem Widerstand.',
    },
    aboutOf: 'ylz8o8',
  },
  electrolytic: {
    summary: 'Ein großer gepolter Kondensator zum Glätten und für Zeitglieder; falsch herum angeschlossen fällt er aus.',
    of: '12vkm73',
    about: {
      how: 'Ein Kondensator mit sehr großer Kapazität für seine Größe, aufgebaut mit einer chemischen Schicht, die nur in einer Richtung funktioniert.',
      sim: 'Eine Kapazität, die ausfällt, wenn ihre Spannung mehr als etwa ein Volt falsch herum anliegt oder ihre Nennspannung übersteigt. Ihr Nennwert kann um ihre Toleranz abweichen, bei echten oft um 20 %.',
      uses: 'Eine gleichgerichtete Spannung glätten, Energie speichern und lange Zeitkonstanten.',
    },
    aboutOf: 'snwpu9',
  },
  inductor: {
    summary: 'Eine Spule, die Stromänderungen entgegenwirkt: lässt Gleichstrom durch, behindert Wechselstrom umso mehr, je höher die Frequenz, und erzeugt beim Abschalten einen Spannungsstoß.',
    of: '1gvp3r2',
    about: {
      how: 'Eine Drahtspule, deren Magnetfeld Energie speichert. Sie wirkt jeder Stromänderung entgegen: Plötzlich unterbrochen, erzeugt sie eine hohe Spannungsspitze.',
      sim: 'Eine Induktivität in Reihe mit ihrem Wicklungswiderstand; der Strom durch sie ändert sich nur allmählich, und über ihrem Nennstrom erwärmt sie sich.',
      uses: 'Filter, Drosseln in Netzteilen und Energiespeicher in Schaltreglern.',
    },
    aboutOf: '1t9an95',
  },
  potentiometer: {
    summary: 'Eine Widerstandsbahn mit Schleifer: ein einstellbarer Spannungsteiler, bedient über seinen Schieberegler.',
    of: 'j44pd8',
    about: {
      how: 'Eine Widerstandsbahn mit einem Schleifer, der darauf gleitet und die Bahn in zwei Widerstände teilt: ein einstellbarer Spannungsteiler.',
      sim: 'Die Bahn zwischen den äußeren Anschlüssen und der Schleifer (dritter Anschluss) an der mit dem Schieberegler gewählten Stelle. Er erwärmt sich mit der Leistung in der Bahn und brennt über seiner Belastbarkeit durch.',
      uses: 'Lautstärke- und Pegelsteller, eine Referenzspannung einstellen, Schwellen anpassen.',
    },
    aboutOf: 'x9q33s',
  },
  rheostat: {
    summary: 'Ein Widerstand, dessen Wert man mit einem Schieberegler einstellt, um einen Strom oder Pegel anzupassen.',
    of: '14xcadv',
    about: {
      how: 'Ein Widerstand mit einstellbarem Wert: ein Potentiometer, von dem nur zwei Anschlüsse genutzt werden.',
      sim: 'Ein Widerstand, eingestellt mit seinem Schieberegler zwischen null und seinem Höchstwert, der sich mit der aufgenommenen Leistung erwärmt.',
      uses: 'Einen Strom einstellen, eine Zeit oder Schwelle abgleichen.',
    },
    aboutOf: '153o2wp',
  },
  ldr: {
    summary: 'Ein Fotowiderstand: Sein Widerstand sinkt, je mehr Licht auf ihn fällt, etwa von Lampen und LEDs in der Nähe.',
    of: 'fw5whq',
    about: {
      how: 'Ein Fotowiderstand: ein Material, dessen Widerstand sinkt, weil Licht mehr Ladungsträger in ihm freisetzt.',
      sim: 'Sein Widerstand bewegt sich zwischen Dunkel- und Hellwert mit dem Licht, das ihn erreicht: seine Einstellung für Umgebungslicht plus Lampen und LEDs auf der Arbeitsfläche, je näher und heller, desto mehr.',
      uses: 'Nachtlichter, Lichtsensoren und Dämmerungsschalter.',
    },
    aboutOf: '1ptwkxe',
  },
  ntc: {
    summary: 'Ein Heißleiter, dessen Widerstand bei Erwärmung sinkt: misst die Temperatur um ihn herum, auch von Heizungen und warmen Bauteilen in der Nähe.',
    of: 'xhk8f',
    about: {
      how: 'Ein Heißleiter mit negativem Temperaturkoeffizienten: Sein Widerstand fällt stark, wenn er sich erwärmt.',
      sim: 'Sein Widerstand folgt seiner Temperatur nach der B-Parameter-Gleichung. Er spürt die Umgebungstemperatur und warme Bauteile in der Nähe, und sein eigener Strom erwärmt ihn ebenfalls ein wenig.',
      uses: 'Temperatur messen, Thermostate und Einschaltstrombegrenzung.',
    },
    aboutOf: '8q3aw0',
  },
  transformer: {
    summary: 'Zwei gekoppelte Wicklungen: setzen eine Wechselspannung im Windungsverhältnis herauf oder herab und trennen beide Seiten galvanisch; Gleichspannung wird nicht übertragen.',
    of: 'tasv7r',
    about: {
      how: 'Zwei Wicklungen auf einem Kern: Ein Wechselstrom in der einen erzeugt eine Wechselspannung in der anderen, im Verhältnis ihrer Windungen. Die beiden Seiten sind nicht verbunden.',
      sim: 'Zwei gekoppelte Induktivitäten, mit Induktivität und Widerstand der Primärseite, dem Windungsverhältnis und der Kopplung. Nur sich ändernder Strom wird übertragen: Gleichstrom auf der Primärseite erwärmt sie nur.',
      uses: 'Das Netz für Elektronik heruntersetzen, Klingeln und galvanische Trennung.',
    },
    aboutOf: 'pd88sb',
  },
  fuse: {
    summary: 'Fast ein Draht, bis der Strom seinen Nennwert deutlich überschreitet; dann schmilzt sie und unterbricht den Stromkreis.',
    of: '1g2e081',
    about: {
      how: 'Ein dünner Draht, der schmilzt, wenn zu viel Strom durch ihn fließt, und so den Rest der Schaltung schützt.',
      sim: 'Fast ein Draht, bis sie deutlich mehr als ihren Nennstrom führt; dann erwärmt sie sich, schmilzt binnen Augenblicken und öffnet den Stromkreis. Ersetzen über ihr Panel.',
      uses: 'Netzteile, Leitungen und Bauteile vor Kurzschluss und Überlast schützen.',
    },
    aboutOf: '17c64og',
  },
  lamp: {
    summary: 'Eine Glühlampe: leuchtet mit der aufgenommenen Leistung, an Wechsel- oder Gleichspannung, und brennt bei Überlastung durch.',
    of: '16p4ij1',
    about: {
      how: 'Ein Glühfaden, der vom Strom erhitzt wird, bis er leuchtet. Seine Helligkeit folgt der aufgenommenen Leistung.',
      sim: 'Ihr Warmwiderstand (Nennspannung zum Quadrat geteilt durch Leistung), leuchtend nach ihrer mittleren Leistung, also an Wechsel- und Gleichspannung gleich. Überlastet brennt sie durch. Den Einschaltstrom eines kalten Fadens bildet sie nicht nach.',
      uses: 'Beleuchtung, Anzeigen und eine einfache Last zum Testen einer Schaltung.',
    },
    aboutOf: '1dwrs3s',
  },
  pilot: {
    summary: 'Eine Meldeleuchte hinter einer farbigen Kappe, wie auf einem Bedienfeld.',
    of: 'ont6hs',
    about: {
      how: 'Eine kleine Meldelampe hinter einer farbigen Kappe, auf Bedienfeldern montiert, um anzuzeigen, dass etwas eingeschaltet ist.',
      sim: 'Eine Lampe (wie die Lampe) hinter einer Kappe in der gewählten Farbe.',
      uses: 'Anzeigen, dass eine Maschine läuft, eine Versorgung an ist oder ein Fehler auftrat.',
    },
    aboutOf: '128hyqq',
  },
  led: {
    summary: 'Eine Leuchtdiode: leuchtet, wenn Strom von der Anode zur Kathode über ihre Durchlassspannung hinaus fließt; sie braucht einen Vorwiderstand zur Strombegrenzung.',
    of: 'fny05o',
    about: {
      how: 'Eine Diode, die leuchtet, wenn Strom in Durchlassrichtung fließt. Unter ihrer Durchlassspannung leitet sie kaum, darüber steigt der Strom steil an, daher braucht sie einen Vorwiderstand.',
      sim: 'Ein Diodenübergang mit der Durchlassspannung ihrer Farbe, leuchtend im Verhältnis zu ihrem Strom. Über ihrem Höchststrom brennt sie durch; falsch herum sperrt sie einfach.',
      uses: 'Anzeigen, Displays und Beleuchtung.',
    },
    aboutOf: 'khml48',
  },
  stackLight: {
    summary: 'Eine Säule aus roter, gelber und grüner Leuchte an einem gemeinsamen Anschluss, die den Zustand einer Maschine anzeigt.',
    of: 'fxowh2',
    about: {
      how: 'Eine Säule farbiger Leuchten an einer Maschine: grün für Betrieb, gelb für Achtung, rot für Störung.',
      sim: 'Drei Lampen von ihren Anschlüssen zu einem gemeinsamen, jede nach ihrer eigenen mittleren Leistung leuchtend.',
      uses: 'Zustandsanzeige von Maschinen und Prozessen.',
    },
    aboutOf: '1ly8ezy',
  },
  rgbLed: {
    summary: 'Rote, grüne und blaue LED unter einer Linse: Die Mischung ihrer Helligkeiten ergibt jede Farbe.',
    of: 'rte9i4',
    about: {
      how: 'Rote, grüne und blaue LED-Chips in einem Gehäuse. Die Mischung ihrer Helligkeiten ergibt jede Farbe.',
      sim: 'Drei LEDs an gemeinsamer Anode oder Kathode, jede mit ihrer Durchlassspannung und Lichtstärke; die angezeigte Farbe ist ihre Lichtmischung. Eine diffuse Linse mischt sie, eine klare zeigt die Chips.',
      uses: 'Farbanzeigen, Stimmungslicht, Farbmischung per PWM.',
    },
    aboutOf: 'fr2l5m',
  },
  dotMatrix: {
    summary: 'Ein Raster aus LEDs in Zeilen und Spalten: im Multiplexbetrieb zeigt es Zeichen oder Muster, einfarbig oder RGB.',
    of: 'z6bgk4',
    about: {
      how: 'Ein Raster aus LEDs in Zeilen und Spalten. Wird schnell genug Zeile für Zeile angesteuert (Multiplexbetrieb), entstehen Zeichen oder Bilder.',
      sim: 'Bis zu 16 × 16 Punkte, jeder eine LED zwischen Zeilen- und Spaltenleitung (Zeilen als Anoden oder Kathoden), einfarbig oder RGB. Leuchtende Punkte verschmelzen über die Zeit, wie das Auge sie sieht.',
      uses: 'Lauftext, Symbole und kleine Grafiken.',
    },
    aboutOf: 'm7gh7v',
  },
  barGraph: {
    summary: 'Zehn LEDs in einer Reihe an einem gemeinsamen Anschluss: eine Pegelanzeige.',
    of: '1qnsl7y',
    about: {
      how: 'Zehn LEDs in einer Reihe, nacheinander leuchtend, um einen Pegel zu zeigen, wie eine Aussteuerungsanzeige.',
      sim: 'Zehn LEDs von ihren Anschlüssen zu einer gemeinsamen Anode oder Kathode, in der gewählten Farbe.',
      uses: 'Pegelanzeigen, Akkuanzeigen und die Ausgabe eines Zählers.',
    },
    aboutOf: '10p7e62',
  },
  bicolorLed: {
    summary: 'Rote und grüne LED antiparallel: in der einen Richtung rot, in der anderen grün, an Wechselspannung gelb.',
    of: '5e1qbp',
    about: {
      how: 'Eine rote und eine grüne LED antiparallel in einem Gehäuse: Die Stromrichtung bestimmt die Farbe.',
      sim: 'Rot leuchtet, wenn Pin 0 positiv ist, grün in der Gegenrichtung; an Wechselspannung leuchten beide abwechselnd und sie erscheint gelb.',
      uses: 'Zwei-Zustands-Anzeigen (an/aus, lädt/voll) mit nur zwei Leitungen.',
    },
    aboutOf: 'csfsn5',
  },
  sevenSeg: {
    summary: 'Sieben LED-Segmente und ein Punkt an einem gemeinsamen Anschluss: zeigt eine Ziffer, angesteuert von einem Decoder wie dem CD4511.',
    of: 'numvxg',
    about: {
      how: 'Sieben balkenförmige LEDs (a bis g) und ein Punkt, so angeordnet, dass die richtigen zusammen jede Ziffer von 0 bis 9 zeigen.',
      sim: 'Acht LEDs an gemeinsamer Kathode oder Anode, in der gewählten Farbe; jedes Segment leuchtet mit seinem Strom.',
      uses: 'Uhren, Zähler und Anzeigen, meist über einen Decoder wie den CD4511.',
    },
    aboutOf: '1bdwa9',
  },
  switch: {
    summary: 'Ein Ein-/Ausschalter: Ein Klick auf sein Bedienelement öffnet oder schließt ihn.',
    of: '1413cux',
    about: {
      how: 'Ein Kontakt, der offen oder geschlossen bleibt, bis man ihn umlegt.',
      sim: 'Offen oder geschlossen mit winzigem Widerstand; seine Kontakte erwärmen sich über ihrem Nennstrom. Ein Klick auf sein Bedienelement legt ihn um.',
      uses: 'Schaltungen ein- und ausschalten und Eingänge von Hand setzen.',
    },
    aboutOf: 'ysyqrz',
  },
  button: {
    summary: 'Ein Taster, der nur schließt, solange er gedrückt wird (Schließer).',
    of: 'z9plog',
    about: {
      how: 'Ein Taster: Sein Kontakt schließt nur, solange man drückt, und öffnet wieder von selbst (Schließer).',
      sim: 'Geschlossen, solange gehalten: sein Bedienelement auf der Arbeitsfläche drücken und halten.',
      uses: 'Starttaster, Klingeltaster und Logikeingänge.',
    },
    aboutOf: '1rtuiih',
  },
  buttonNC: {
    summary: 'Ein Taster, der nur öffnet, solange er gedrückt wird (Öffner): ein Halt-Taster.',
    of: 'gccl5d',
    about: {
      how: 'Ein Taster, dessen Kontakt in Ruhe geschlossen ist und beim Drücken öffnet (Öffner).',
      sim: 'Offen, solange gehalten: sein Bedienelement auf der Arbeitsfläche drücken und halten.',
      uses: 'Halt-Taster und Sicherheitskreise, die beim Drücken unterbrechen müssen.',
    },
    aboutOf: '8t2va2',
  },
  changeover: {
    summary: 'Ein Schalter, der seinen gemeinsamen Anschluss mit einem von zwei Kontakten verbindet: Wechselschaltung wie bei einer Treppenhausbeleuchtung.',
    of: '1rhho8',
    about: {
      how: 'Ein Schalter, der seinen gemeinsamen Anschluss mit einem von zwei anderen verbindet.',
      sim: 'Der gemeinsame Anschluss ist mit dem einen oder dem anderen Kontakt verbunden; ein Klick auf das Bedienelement schaltet um.',
      uses: 'Wechselschaltung von Licht, Auswahl zwischen zwei Quellen oder Signalen.',
    },
    aboutOf: '1abeykb',
  },
  motor: {
    summary: 'Ein Gleichstrom-, Einphasen- oder Drehstrommotor, der eine Last an seiner Welle antreibt; Drehzahl und Strom folgen der Last, und bei Überlast bleibt er stehen.',
    of: 'ley0j7',
    about: {
      how: 'Wandelt elektrische Leistung in Drehung. Die Drehzahl eines Gleichstrommotors steigt mit der Spannung und sein Strom mit der Last; ein Asynchronmotor (AC) dreht etwas langsamer als das Drehfeld seiner Versorgung und schlüpft umso mehr, je größer die Last.',
      sim: 'Wellenmechanik mit Trägheit und Reibung, die eine an der Welle angedockte Last antreibt. DC: Gegen-EMK und Ankerwiderstand. AC: Schlupf, Drehmoment nach der Kloss-Kurve bis zum Kippmoment und Strom aus einem Ersatzschaltbild, bei der an den Klemmen gemessenen Frequenz. Zwei Phasen (oder die DC-Polarität) tauschen, um ihn umzukehren. Blockiert überhitzt er.',
      uses: 'Lüfter, Pumpen, Förderbänder, Maschinenantriebe; in der Industrie Drehstrommotoren mit Schützen.',
    },
    aboutOf: 'iu4qzv',
  },
  conveyor: {
    summary: 'Eine mechanische Last mit gleichbleibendem Zug an der Motorwelle: Einen Motor, der sie nicht überwinden kann, hält sie fest.',
    of: '6ns533',
    about: {
      how: 'Ein Band, gegen das der Motor mit gleichbleibender Kraft zieht, unabhängig von der Geschwindigkeit.',
      sim: 'Ein konstantes Lastmoment (als Anteil des Nennmoments des Motors) und Trägheit; einen Motor, der es nicht überwinden kann, hält es fest. Zum Andocken an die Welle eines Motors dort platzieren.',
      uses: 'Einen Motor bei fester Last testen und ihn bei Überlast stehen bleiben sehen.',
    },
    aboutOf: '19ts3yv',
  },
  pump: {
    summary: 'Eine mechanische Last an der Motorwelle, deren Drehmoment mit dem Quadrat der Drehzahl wächst, wie bei einer Pumpe oder einem Lüfter.',
    of: '1yythms',
    about: {
      how: 'Eine Last, deren Drehmoment mit dem Quadrat der Drehzahl wächst, wie bei einer Pumpe oder einem Lüfter: schwer schnell, leicht langsam zu drehen.',
      sim: 'Ihr Drehmoment bei Nenndrehzahl (als Anteil des Nennmoments des Motors), skaliert mit dem Quadrat der Drehzahl, plus ihre Trägheit. Zum Andocken an die Welle eines Motors dort platzieren.',
      uses: 'Sehen, wie sich ein Motor mit einer Lüfter- oder Pumpenlast einpendelt.',
    },
    aboutOf: '1jy8lvw',
  },
  flywheel: {
    summary: 'Ein schweres Rad an der Motorwelle: kein Lastmoment, nur Trägheit, sodass der Motor länger zum Hochlaufen braucht und nach dem Abschalten nachläuft.',
    of: '1hh27a2',
    about: {
      how: 'Ein schweres Rad, das Energie in seiner Drehung speichert.',
      sim: 'Reine Trägheit (ein Vielfaches des Motorläufers) ohne Lastmoment: Der Motor läuft langsamer hoch und aus.',
      uses: 'Die Wirkung der Trägheit beim Anlaufen und Auslaufen sehen.',
    },
    aboutOf: 'wng5bg',
  },
  fan: {
    summary: 'Ein kleiner Gleichstrom-Lüfter: bläst Luft, die die Bauteile in seinem Luftstrom kühlt.',
    of: '17qkmro',
    about: {
      how: 'Ein kleiner Gleichstrommotor mit Propeller, der Luft über nahe Bauteile bläst, um sie zu kühlen.',
      sim: 'Ein Gleichstrommotor mit seinen Flügeln als Last, dessen Drehzahl der Spannung folgt. Sein Luftstrom kühlt die Bauteile darin; an der Wand eines Gehäuses tauscht er die Innenluft gegen Außenluft. Seine Größe bestimmt, wie viel Luft er fördert.',
      uses: 'Heiße Bauteile und Gehäuse kühlen.',
    },
    aboutOf: '16pdxij',
  },
  heater: {
    summary: 'Ein Heizelement: erwärmt sich mit der Zeit mit der aufgenommenen Leistung, wärmt seine Umgebung und glüht, wenn es heiß ist.',
    of: '115cgpo',
    about: {
      how: 'Ein Widerstandsdraht, der Strom in Wärme umsetzen soll.',
      sim: 'Ein fester Widerstand aus Nennspannung und Leistung. Sein Element erwärmt sich über seine Aufheizzeit, wärmt die Bauteile in der Nähe und glüht rot, wenn es heiß ist.',
      uses: 'Heizen und eine Wärmequelle, um Thermostate und Lüfter zu testen.',
    },
    aboutOf: 'yurfha',
  },
  solenoid: {
    summary: 'Eine Spule mit Anker, der anzieht, sobald ihr Strom den Nennwert erreicht, an Wechsel- oder Gleichspannung.',
    of: 'f4n0ps',
    about: {
      how: 'Eine Spule um einen beweglichen Eisenanker: Strom durch die Spule zieht den Anker hinein.',
      sim: 'Eine Spule (Widerstand aus Nennspannung und Nennstrom, plus Induktivität). Der Anker zieht bei drei Vierteln des Nennstroms an und fällt unter 40 % ab, an Wechselspannung nach dem Effektivwert. Überlastet überhitzt sie.',
      uses: 'Türschlösser, Ventile und auf Befehl drücken oder ziehen.',
    },
    aboutOf: '1r54wtn',
  },
  tube: {
    summary: 'Eine Leuchtstoffröhre: zwei Glühwendeln und ein Bogen, der bei hoher Spannung zündet; sie braucht ein Vorschaltgerät und einen Starter.',
    of: 'v8dzsg',
    about: {
      how: 'Eine Glasröhre mit Gas und je einer Glühwendel an den Enden. Ist das Gas durchgeschlagen, leitet ein Bogen hindurch und die Beschichtung leuchtet.',
      sim: 'Zwei Wendeln und ein Bogen dazwischen, der über seiner Zündspannung zündet und dann etwa bei seiner Brennspannung arbeitet. Sie braucht ein Vorschaltgerät zur Strombegrenzung und einen Starter zum Vorheizen.',
      uses: 'Klassische Leuchtstofflampen mit Drossel und Starter.',
    },
    aboutOf: 'o4f2yl',
  },
  ballast: {
    summary: 'Eine Drossel in Reihe mit einer Leuchtstoffröhre: begrenzt ihren Strom und liefert den Spannungsstoß, der den Bogen zündet.',
    of: 'qqbhef',
    about: {
      how: 'Eine Induktivität in Reihe mit einer Leuchtstoffröhre. Sie begrenzt den Röhrenstrom und liefert, wenn der Starter öffnet, den Spannungsstoß, der den Bogen zündet.',
      sim: 'Eine Induktivität mit ihrem Wicklungswiderstand, passend zu ihrer Röhre.',
      uses: 'Die Drossel einer Leuchtstofflampe.',
    },
    aboutOf: '1qpsxj1',
  },
  starter: {
    summary: 'Ein Glimmstarter: heizt die Wendeln einer Leuchtstoffröhre vor und öffnet dann, damit das Vorschaltgerät den Bogen zünden kann.',
    of: 'su5g6t',
    about: {
      how: 'Eine kleine Glimmlampe mit Bimetallkontakt. Ihr Glimmen erwärmt das Bimetall, bis es schließt und die Wendeln der Röhre vorheizt; dann kühlt es ab und öffnet, und der Stoß des Vorschaltgeräts zündet die Röhre.',
      sim: 'Glimmt (mit wenig Strom), wenn genug Spannung anliegt, und erwärmt ihr Bimetall, bis es schließt; dann kühlt es ab und öffnet wieder: der ganze Startzyklus einer Leuchtstofflampe.',
      uses: 'Eine Leuchtstoffröhre starten.',
    },
    aboutOf: 'm0npuk',
  },
  buzzer: {
    summary: 'Ein magnetischer Summer: tönt an Gleichspannung in der richtigen Richtung oder an Wechselspannung.',
    of: 'h03g6',
    about: {
      how: 'Ein Elektromagnet, der eine Metallscheibe zum Schwingen bringt und so einen Ton erzeugt.',
      sim: 'Eine ohmsche Last, die tönt, solange ihre Spannung nahe ihrem Nennwert liegt: an Gleichspannung richtig herum oder an Wechselspannung. Zu hören, während die Simulation läuft.',
      uses: 'Alarme, Piepser und Hinweise.',
    },
    aboutOf: '13fxka1',
  },
  piezo: {
    summary: 'Ein Piezo-Summer: tönt an Gleichspannung in der richtigen Richtung und bleibt verpolt stumm.',
    of: '1h2oigr',
    about: {
      how: 'Eine Piezoscheibe mit eigenem Oszillator, die sich verbiegt und so einen Ton erzeugt.',
      sim: 'Tönt mit ihrer eingestellten Frequenz, wenn ihre Gleichspannung nahe ihrem Nennwert und richtig herum ist; verpolt oder an Wechselspannung stumm. Zu hören, während die Simulation läuft.',
      uses: 'Pieptöne in Elektronik und Timern.',
    },
    aboutOf: '1egnnt7',
  },
  bell: {
    summary: 'Eine elektromechanische Klingel: läutet an ihrer Nennspannung, Wechsel- oder Gleichspannung.',
    of: 'prwawe',
    about: {
      how: 'Ein Elektromagnet zieht einen Klöppel gegen eine Glocke und unterbricht dabei seinen eigenen Stromkreis, immer wieder, und die Glocke läutet.',
      sim: 'Läutet, solange ihre Spannung (Effektivwert, Wechsel- oder Gleichspannung) nahe ihrem Nennwert liegt. Zu hören, während die Simulation läuft.',
      uses: 'Türklingeln, Schul- und Feuerglocken.',
    },
    aboutOf: '145jsc5',
  },
  chime: {
    summary: 'Ein Türgong: ein Ton beim Drücken und ein anderer beim Loslassen (Ding-Dong), an der Wechselspannung eines Klingeltransformators.',
    of: 'i69j7t',
    about: {
      how: 'Ein Anker in einer Spule schlägt beim Einschalten eine Klangplatte an und beim Loslassen eine andere: Ding-Dong.',
      sim: 'Ein Ton, wenn ihre Spannung kommt, und ein anderer, wenn sie geht, bei ihrer Nennspannung (Effektivwert). Zu hören, während die Simulation läuft.',
      uses: 'Türgongs an einem Klingeltransformator.',
    },
    aboutOf: 'j8cvhb',
  },
  speaker: {
    summary: 'Ein Lautsprecher: gibt den Wechselanteil der anliegenden Spannung mit der Frequenz dieses Signals wieder.',
    of: '1tyvrsg',
    about: {
      how: 'Eine Spule an einer Membran im Feld eines Magneten: Ein sich ändernder Strom bewegt die Membran, was Schall erzeugt.',
      sim: 'Ein Widerstand (seine Impedanz), der den Wechselanteil der anliegenden Spannung mit der Frequenz dieses Signals wiedergibt, so laut wie seine Leistung im Verhältnis zur Nennleistung. Zu hören, während die Simulation läuft.',
      uses: 'Ton von Oszillatoren, Verstärkern und Audioschaltungen.',
    },
    aboutOf: 'ns1jw4',
  },
  relay: {
    summary: 'Eine Spule, die im erregten Zustand ihre Kontakte umschaltet: Ein kleiner Strom steuert einen getrennten, größeren Stromkreis.',
    of: '1dnwige',
    about: {
      how: 'Ein Elektromagnet, der Schaltkontakte bewegt: Ein kleiner Strom durch die Spule schaltet einen getrennten, oft viel größeren Stromkreis.',
      sim: 'Eine Spule (ihr Widerstand), die bei drei Vierteln ihrer Nennspannung anzieht und unter 40 % abfällt; Gleichspannung oder Wechselspannung nach dem Effektivwert. Bis zu vier Kontakte, Wechsler oder Schließer; Kontakte und Spule erwärmen sich über ihren Nennwerten. Spule und Kontakte sind getrennte Stromkreise.',
      uses: 'Netzlasten aus Elektronik schalten und Relaislogik.',
    },
    aboutOf: '1osdz9z',
  },
  contactor: {
    summary: 'Ein Leistungsrelais für Motoren und andere Lasten: drei Hauptkontakte, Hilfskontakte, meist mit Wechselspannungsspule.',
    of: '15niclw',
    about: {
      how: 'Ein Leistungsrelais zum Schalten von Motoren und großen Lasten, mit Hauptkontakten für die Last und kleinen Hilfskontakten für die Steuerung.',
      sim: 'Wie ein Relais: bis zu vier Hauptkontakte, die erregt schließen, und Hilfskontakte nummeriert wie in EN 50012 (13–14 Schließer, 21–22 Öffner). Seine Spule ist meist für Wechselspannung.',
      uses: 'Motorstarter, Wendeschützschaltungen und das Schalten großer Lasten.',
    },
    aboutOf: 'a2lg3b',
  },
  and: {
    summary: 'Logisches UND: Der Ausgang ist nur 1, wenn beide Eingänge 1 sind.',
    of: '1v0jfjf',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang nur 1 ist, wenn alle Eingänge 1 sind.',
      sim: 'Logikgatter arbeiten an einer eingebauten 5-V-Versorgung gegen 0 V: Eingänge lesen 1 über 55 % davon und 0 unter 45 % (dazwischen behalten sie ihren letzten Pegel) und belasten das Signal kaum; Ausgänge treiben echte Lasten über 25 Ω. Jedes Gatter schaltet einen Schritt nach seinen Eingängen, wie echte Gatter eine Verzögerung haben.',
      uses: 'Bedingungen verknüpfen: dies UND das.',
    },
    aboutOf: '1ccnuvg',
  },
  or: {
    summary: 'Logisches ODER: Der Ausgang ist 1, wenn mindestens ein Eingang 1 ist.',
    of: 'a70i3w',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang 1 ist, wenn irgendein Eingang 1 ist.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingänge mit Hysterese, 25-Ω-Ausgänge und ein Schritt Verzögerung.',
      uses: 'Bedingungen verknüpfen: dies ODER das.',
    },
    aboutOf: '1p5iwc0',
  },
  not: {
    summary: 'Logisches NICHT (Inverter): Der Ausgang ist das Gegenteil des Eingangs.',
    of: 'h86tu3',
    about: {
      how: 'Ein Logikgatter mit einem Eingang, dessen Ausgang immer das Gegenteil ist.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingang mit Hysterese, 25-Ω-Ausgang und ein Schritt Verzögerung. Eine ungerade Anzahl im Ring schwingt.',
      uses: 'Ein Signal invertieren und Ringoszillatoren.',
    },
    aboutOf: '1n41ht4',
  },
  nand: {
    summary: 'Logisches NAND: Der Ausgang ist nur 0, wenn beide Eingänge 1 sind, das Gegenteil von UND.',
    of: 'wp2dp6',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang nur 0 ist, wenn alle Eingänge 1 sind: UND gefolgt von NICHT. Jede Logik lässt sich allein aus NAND-Gattern bauen.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingänge mit Hysterese, 25-Ω-Ausgänge und ein Schritt Verzögerung.',
      uses: 'Flipflops und der Aufbau anderer Gatter.',
    },
    aboutOf: '1s8yi8i',
  },
  nor: {
    summary: 'Logisches NOR: Der Ausgang ist nur 1, wenn beide Eingänge 0 sind, das Gegenteil von ODER.',
    of: 'cjnozq',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang nur 1 ist, wenn alle Eingänge 0 sind: ODER gefolgt von NICHT.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingänge mit Hysterese, 25-Ω-Ausgänge und ein Schritt Verzögerung.',
      uses: 'RS-Flipflops und der Aufbau anderer Gatter.',
    },
    aboutOf: 'pjk52z',
  },
  xor: {
    summary: 'Logisches XOR: Der Ausgang ist 1, wenn sich die Eingänge unterscheiden.',
    of: '7964u9',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang 1 ist, wenn sich die Eingänge unterscheiden.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingänge mit Hysterese, 25-Ω-Ausgänge und ein Schritt Verzögerung.',
      uses: 'Addierer, Parität und der Vergleich zweier Bits.',
    },
    aboutOf: 'iahla1',
  },
  xnor: {
    summary: 'Logisches XNOR: Der Ausgang ist 1, wenn die Eingänge gleich sind.',
    of: '1ampqme',
    about: {
      how: 'Ein Logikgatter, dessen Ausgang 1 ist, wenn die Eingänge gleich sind.',
      sim: 'Wie das UND-Gatter: eingebaute 5-V-Logikversorgung, Eingänge mit Hysterese, 25-Ω-Ausgänge und ein Schritt Verzögerung.',
      uses: 'Gleichheitsprüfungen.',
    },
    aboutOf: '1ccbsg',
  },
  dff: {
    summary: 'Speichert seinen D-Eingang bei jeder steigenden Taktflanke; S und R setzen oder löschen ihn sofort.',
    of: '1szb3ue',
    about: {
      how: 'Ein Speicher für ein Bit: Bei jeder steigenden Taktflanke übernimmt er den Wert an D und hält ihn bis zur nächsten.',
      sim: 'Übernimmt bei der steigenden Flanke von C; seine asynchronen Eingänge S und R setzen oder löschen ihn sofort (R gewinnt, wenn beide). Logikpegel wie bei den Gattern; beim Einschalten sieht er keine Flanke.',
      uses: 'Register, Signale synchronisieren, Teiler und Schieberegister.',
    },
    aboutOf: '1io7w6z',
  },
  jkff: {
    summary: 'Bei jeder steigenden Taktflanke setzt J ihn, K löscht ihn, und beide zusammen kippen ihn; S und R wirken sofort.',
    of: 'yyyiga',
    about: {
      how: 'Ein Flipflop, das bei jeder steigenden Taktflanke mit J setzt, mit K löscht und mit beiden kippt.',
      sim: 'Wie das D-Flipflop: Takt mit steigender Flanke, asynchrone S und R (R gewinnt), Logikpegel wie bei den Gattern.',
      uses: 'Zähler und Zustandsautomaten.',
    },
    aboutOf: '1r3lr72',
  },
  tff: {
    summary: 'Kippt seinen Ausgang bei jeder steigenden Taktflanke, solange T 1 ist: halbiert die Taktfrequenz.',
    of: 'suo4eg',
    about: {
      how: 'Ein Flipflop, das bei jeder steigenden Taktflanke seinen Zustand wechselt, solange T 1 ist, und so die Taktfrequenz halbiert.',
      sim: 'Wie das D-Flipflop: Takt mit steigender Flanke, asynchrone S und R (R gewinnt), Logikpegel wie bei den Gattern.',
      uses: 'Frequenzteiler und asynchrone Zähler.',
    },
    aboutOf: '1otrwqm',
  },
  logicSwitch: {
    summary: 'Ein von Hand gesetzter Logikeingang: Sein Schalter wechselt den Ausgang zwischen 1 und 0.',
    of: 'bu9bh',
    about: {
      how: 'Ein Schalter, der eine logische 1 oder 0 liefert.',
      sim: 'Zieht seinen Anschluss über einen kleinen Widerstand auf die Logikversorgung oder auf 0 V; ein Klick auf seinen Schalter wechselt ihn.',
      uses: 'Die Eingänge von Logikschaltungen von Hand setzen.',
    },
    aboutOf: 's5sens',
  },
  clock: {
    summary: 'Ein Rechteck-Taktgeber mit einstellbarer Frequenz und einstellbarem Tastverhältnis.',
    of: '9lkzo4',
    about: {
      how: 'Eine Quelle von Rechteckimpulsen, die Logikschaltungen im Gleichtakt hält.',
      sim: 'High für sein Tastverhältnis jeder Periode bei seiner Frequenz. Bei hohen Frequenzen läuft die Simulation langsamer, um jeder Flanke zu folgen.',
      uses: 'Zähler, Flipflops und gemultiplexte Anzeigen takten.',
    },
    aboutOf: '1iyn1fw',
  },
  probe: {
    summary: 'Zeigt einen Logikpegel an: leuchtet bei 1, und seine Anzeige zeigt 1 oder 0.',
    of: 'mtcrfd',
    about: {
      how: 'Zeigt, ob ein Punkt auf logisch 1 oder 0 liegt, wie die Spitze eines Logiktesters.',
      sim: 'Belastet ihren Punkt kaum; leuchtet rot über 55 % der Logikversorgung, und ihre Anzeige zeigt 1 über deren Hälfte.',
      uses: 'Logiksignale beobachten.',
    },
    aboutOf: '10gyjjo',
  },
  cd4511: {
    summary: 'Ein CMOS-BCD-zu-7-Segment-Decoder: macht aus einer 4-Bit-Zahl die Segmente einer Anzeige mit gemeinsamer Kathode.',
    of: 'fgzsvu',
    about: {
      how: 'Ein CMOS-Baustein, der eine 4-Bit-Binärzahl (BCD) in die sieben Segmente einer Ziffer decodiert, mit einem Latch, das sie hält.',
      sim: 'BCD-Eingänge A–D, Latch-Freigabe LE, Lampentest und Dunkeltastung (low-aktiv); seine Ausgänge a–g liefern Strom für eine Anzeige mit gemeinsamer Kathode, jedes Segment braucht also noch einen Widerstand. Über 9 bleibt sie dunkel. Arbeitet an eigenen VDD und VSS.',
      uses: '7-Segment-Anzeigen aus Zählern ansteuern.',
    },
    aboutOf: 'do5y3',
  },
  cd4017: {
    summary: 'Ein CMOS-Dekadenzähler: Von seinen zehn Ausgängen ist jeweils einer high, und er schaltet mit jedem Taktimpuls weiter.',
    of: '4fx69p',
    about: {
      how: 'Ein CMOS-Dekadenzähler: Er schaltet jeweils einen von zehn Ausgängen ein und rückt mit jedem Taktimpuls weiter.',
      sim: 'Jede steigende Taktflanke (mit INH low) schiebt den einen aktiven Ausgang von Q0 bis Q9 und wieder von vorn; RST high setzt auf Q0 zurück, und CO ist high für 0–4. Arbeitet an eigenen VDD und VSS.',
      uses: 'Lauflichter, Ablaufsteuerungen und Teilen durch zehn.',
    },
    aboutOf: '1o5o934',
  },
  lm358: {
    summary: 'Zwei Operationsverstärker an einer Versorgung: Jeder verstärkt die Differenz seiner Eingänge bis nahe an die Versorgungsgrenzen; sie arbeiten auch als Komparatoren.',
    of: '13yoine',
    about: {
      how: 'Zwei Operationsverstärker für eine einfache Versorgung. Jeder verstärkt die Differenz zwischen seinem +- und −-Eingang mit hoher Verstärkung.',
      sim: 'Jeder Ausgang strebt Verstärkung × (V+ − V−) an, begrenzt auf seinen Abstand zu den Versorgungsgrenzen; sein Strom kommt aus VCC oder fließt nach GND. Ohne Gegenkopplung schaltet er wie ein Komparator.',
      uses: 'Verstärker, Komparatoren, aktive Filter und Sensoranbindungen.',
    },
    aboutOf: 'orsa9u',
  },
  uln2003: {
    summary: 'Sieben Darlington-Treiber, mit denen Logik Relais, Lampen oder Motoren schalten kann, mit eingebauten Freilaufdioden.',
    of: '1d4mas',
    about: {
      how: 'Sieben Darlington-Transistorschalter in einem Baustein, jeder kann einige hundert Milliampere aufnehmen, mit Dioden für induktive Spannungsspitzen.',
      sim: 'Ein Eingang über etwa 1,6 V schaltet seinen Kanal ein, der seinen Ausgang mit etwa einem Volt Restspannung nach GND zieht; jeder Ausgang hat eine Freilaufdiode nach COM (COM mit der Versorgung der Last verbinden).',
      uses: 'Relais, Lampen, Hubmagnete und Schrittmotoren aus Logik ansteuern.',
    },
    aboutOf: '5t49st',
  },
  ne555: {
    summary: 'Ein Timer-Baustein: ein Oszillator (astabil) oder ein Einzelimpuls (monostabil), bestimmt durch Widerstände und einen Kondensator.',
    of: 'mo59yk',
    about: {
      how: 'Ein Timer-Baustein: zwei Komparatoren und ein Flipflop, die einen Kondensator zwischen einem und zwei Dritteln der Versorgung laden und entladen.',
      sim: 'Ein Verhaltensmodell des 555 an eigenen Versorgungsanschlüssen: Komparatoren bei 1/3 und 2/3 von VCC, der Entladetransistor, Reset und ein Ausgang, der im High-Zustand etwa 1,7 V unter VCC liegt. Seine Anzeige zeigt die Frequenz, mit der er läuft.',
      uses: 'Blinker, Tongeneratoren, Zeitschalter und PWM.',
    },
    aboutOf: 'hcip2z',
  },
  regulator: {
    summary: 'Hält seinen Ausgang auf einer festen Spannung (ein 7805 auf 5 V), solange der Eingang ein paar Volt höher bleibt.',
    of: '9xws3x',
    about: {
      how: 'Ein Linearregler: Er hält seinen Ausgang auf fester Spannung, indem er die Differenz zum Eingang selbst aufnimmt und in Wärme umsetzt.',
      sim: 'Hält OUT auf seiner eingestellten Spannung über GND, solange sein Eingang mindestens um seine Dropout-Spannung höher ist; darunter folgt der Ausgang dem Eingang. Er erwärmt sich mit der abfallenden Leistung und fällt über seiner Belastbarkeit oder seinem Höchststrom aus.',
      uses: 'Eine stabile 5- oder 12-V-Versorgung aus einer höheren, unruhigeren.',
    },
    aboutOf: '1qv1f8r',
  },
  scopeProbe: {
    summary: 'Gibt die Spannung an ihrem Punkt an das Oszilloskop weiter, als Kurve ihres Kanals.',
    of: 'dgc7gn',
    about: {
      how: 'Verbindet einen Punkt der Schaltung mit einem Oszilloskop, um seine Spannung über der Zeit zu sehen.',
      sim: 'Die Spannung an ihrem Punkt gegen 0 V, als Kurve ihres Kanals im Oszilloskop-Panel; sie belastet den Punkt wie ein 10-MΩ-Oszilloskopeingang.',
      uses: 'Signalverläufe beobachten: Brummen, Oszillatoren, Schaltvorgänge.',
    },
    aboutOf: '1pmnvxj',
  },
  panelMeter: {
    summary: 'Ein Drehspulinstrument: Sein Zeiger zeigt die anliegende Gleich- oder Wechselspannung im Verhältnis zum Endwert.',
    of: '1lllevb',
    about: {
      how: 'Ein Drehspulinstrument: Der Strom durch seine Spule dreht einen Zeiger gegen eine Feder.',
      sim: 'Sein Zeiger zeigt die anliegende Gleich- (Mittelwert) oder Wechselspannung (Effektivwert) im Verhältnis zum Endwert, gedämpft wie ein echtes Messwerk, und schlägt über beide Enden an; etwas Überlast verkraftet es, nicht aber dauerhaft ein Mehrfaches des Endwerts.',
      uses: 'Eine Spannung oder einen Pegel auf einem Bedienfeld auf einen Blick zeigen.',
    },
    aboutOf: '1qpv8vm',
  },
  voltmeter: {
    summary: 'Misst die Spannung an ihm (Gleich- oder Wechselspannung als Effektivwert) und nimmt dabei fast keinen Strom auf: parallel zu einem Bauteil anschließen.',
    of: '66ez3l',
    about: {
      how: 'Misst die Spannung zwischen seinen beiden Messleitungen. Parallel zu einem Bauteil angeschlossen, soll es möglichst wenig Strom aufnehmen.',
      sim: 'Ein 10-MΩ-Eingang, der Gleich- oder Wechselspannung (Effektivwert) auf seiner Anzeige zeigt; umschalten über seinen Reiter. Ausgelegt bis 1000 V.',
      uses: 'Spannungen an Bauteilen und Versorgungen messen.',
    },
    aboutOf: '1q0vrkl',
  },
  ammeter: {
    summary: 'Misst den Strom durch ihn (Gleich- oder Wechselstrom als Effektivwert): in Reihe schalten. Seine interne Sicherung löst über 10 A aus.',
    of: '1wea6np',
    about: {
      how: 'Misst den Strom, der durch es fließt, muss also in Reihe im Strompfad liegen.',
      sim: 'Ein 0,05-Ω-Shunt, der Gleich- oder Wechselstrom (Effektivwert) auf seiner Anzeige zeigt. Seine interne Sicherung löst über 10 A aus, wie bei einem echten Messgerät, das versehentlich parallel zu einer Versorgung angeschlossen wird.',
      uses: 'Den Strom messen, den ein Bauteil oder eine Schaltung aufnimmt.',
    },
    aboutOf: '1ugz6xq',
  },
  diode: {
    summary: 'Lässt Strom nur in einer Richtung durch, von der Anode zur Kathode, ab etwa 0,65 V: richtet Wechselspannung gleich und sperrt Rückwärtsspannung.',
    of: '1nyair8',
    about: {
      how: 'Ein Halbleiterübergang, der in Durchlassrichtung (Anode zu Kathode) ab seiner Durchlassspannung leitet und in Gegenrichtung sperrt.',
      sim: 'Ein Übergang mit Durchlassspannung und Höchststrom aus seiner Typenbezeichnung. Sperrspannung über dem Nennwert belastet ihn, und zu viel Strom in beiden Richtungen lässt ihn durchbrennen.',
      uses: 'Wechselspannung gleichrichten, vor Verpolung schützen und die Spannungsspitze einer Spule abfangen (Freilaufdiode).',
    },
    aboutOf: 'mf8q8e',
  },
  schottky: {
    summary: 'Eine schnelle Diode mit geringer Durchlassspannung (etwa 0,3 V), für Netzteile und Schutzschaltungen.',
    of: '1tyyi4c',
    about: {
      how: 'Eine Metall-Halbleiter-Diode mit geringerer Durchlassspannung und schnellerem Schalten als eine gewöhnliche Diode.',
      sim: 'Wie die Diode, mit einer Durchlassspannung von etwa 0,3 V.',
      uses: 'Effiziente Gleichrichter, Netzteile und Schutzschaltungen.',
    },
    aboutOf: '53c2ay',
  },
  zener: {
    summary: 'Eine Diode, die in Sperrrichtung eine feste Spannung hält: eine einfache Spannungsreferenz oder Stabilisierung.',
    of: '1joott3',
    about: {
      how: 'Eine Diode, die bei einer genauen Sperrspannung durchbricht und diese konstant hält, während Strom fließt.',
      sim: 'In Durchlassrichtung eine gewöhnliche Diode; in Sperrrichtung hält sie ihre Zenerspannung. Sie erwärmt sich mit der aufgenommenen Leistung und fällt über ihrer Belastbarkeit aus.',
      uses: 'Spannungsreferenzen, einfache Stabilisierungen und Überspannungsschutz.',
    },
    aboutOf: '1otudv7',
  },
  npn: {
    summary: 'Ein Bipolartransistor: Ein kleiner Basisstrom steuert einen viel größeren Kollektorstrom, zum Schalten oder Verstärken.',
    of: '18w1w83',
    about: {
      how: 'Ein Bipolartransistor: Strom in seine Basis lässt einen etwa um seine Verstärkung größeren Strom vom Kollektor zum Emitter fließen.',
      sim: 'Das Ebers-Moll-Modell, mit Verstärkung und Grenzwerten aus seiner Typenbezeichnung; er erwärmt sich mit der aufgenommenen Leistung. (Der Early-Effekt ist nicht nachgebildet.)',
      uses: 'Lasten mit kleinen Signalen schalten und Verstärker.',
    },
    aboutOf: '94k4zc',
  },
  pnp: {
    summary: 'Das Spiegelbild des NPN: schaltet oder verstärkt mit einem Strom aus seiner Basis heraus, um die Plusseite zu schalten.',
    of: '17ysw06',
    about: {
      how: 'Ein Bipolartransistor wie der NPN mit umgekehrten Polaritäten: Strom aus seiner Basis heraus schaltet ihn ein.',
      sim: 'Das Ebers-Moll-Modell wie beim NPN, mit umgekehrten Spannungen und Strömen.',
      uses: 'Die Plusseite einer Last schalten (High-Side-Schalter) und Komplementärstufen.',
    },
    aboutOf: '1oofm4u',
  },
  nmos: {
    summary: 'Ein MOSFET, der über die Spannung an seinem Gate geschaltet wird, das keinen Strom aufnimmt: verlustarmes Schalten von Lasten.',
    of: '2zjoqj',
    about: {
      how: 'Ein N-Kanal-MOSFET: Eine Spannung an seinem Gate über der Schwellenspannung öffnet einen Kanal von Drain zu Source; das Gate selbst nimmt keinen Strom auf.',
      sim: 'Ein quadratisches Modell mit Schwellenspannung und Durchlasswiderstand bei 10 V am Gate. Der Kanal leitet in beiden Richtungen; seine Body-Diode ist nicht nachgebildet.',
      uses: 'Verlustarmes Schalten von Motoren, Lampen und LEDs sowie PWM.',
    },
    aboutOf: '11002se',
  },
  note: {
    summary: 'Eine Notiz auf der Arbeitsfläche, um eine Schaltung zu erklären; ein Kennzeichen in geschweiften Klammern ({R1}) folgt der Zeichennorm.',
    of: 'uguamk',
    about: {
      how: 'Eine Notiz in der Zeichnung, um zu erklären, was eine Schaltung tut.',
      sim: 'Nicht Teil der Schaltung. Ein Kennzeichen in geschweiften Klammern, etwa {R1}, erscheint als Kennzeichen dieses Bauteils in der gewählten Zeichennorm.',
      uses: 'Schaltungen und Beispiele erklären.',
    },
    aboutOf: '15oxfai',
  },
  textLabel: {
    summary: 'Eine Textzeile auf der Arbeitsfläche: ein Titel oder eine Beschriftung.',
    of: '13e1spt',
    about: {
      how: 'Eine Textzeile in der Zeichnung.',
      sim: 'Nicht Teil der Schaltung.',
      uses: 'Titel, Beschriftungen und Bezeichnungen.',
    },
    aboutOf: '1t08vv',
  },
  frame: {
    summary: 'Ein Rahmen um einen Teil einer Schaltung, mit Titel; er kann auch ein Gehäuse sein, das sich innen erwärmt, oder zur Baugruppe werden.',
    of: 'st108h',
    about: {
      how: 'Ein Rahmen um einen Teil einer Schaltung, der zeigt, dass seine Bauteile zusammengehören.',
      sim: 'Nicht Teil der Schaltung, nimmt aber seinen Inhalt beim Verschieben mit. Als Gehäuse teilen sich seine Bauteile die Innenluft, die ihre Wärme erwärmt und die Wände und Lüfter kühlen. „Baugruppe erstellen“ macht daraus einen wiederverwendbaren Block.',
      uses: 'Zeichnungen ordnen, Gehäuse, die sich erwärmen, und Baugruppen erstellen.',
    },
    aboutOf: '1ewljpg',
  },
  module: {
    summary: 'Eine Kopie einer Baugruppe: ein Teil einer Schaltung als ein Block; ein Doppelklick zeigt das Innere.',
    of: '12f4ahi',
    about: {
      how: 'Ein Teil einer Schaltung als ein Block mit Anschlüssen, beliebig oft platziert; jede Kopie ist dieselbe Baugruppe.',
      sim: 'Jede Kopie rechnet ihre eigene Kopie der Bauteile darin, mit eigenen Messwerten und Schalterstellungen. Doppelklick zeigt das Innere; „Baugruppe bearbeiten“ ändert jede Kopie.',
      uses: 'Teilschaltungen wiederverwenden und große Zeichnungen übersichtlich halten.',
    },
    aboutOf: 'zsyjff',
  },
};

export default texts;
