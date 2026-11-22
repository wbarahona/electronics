import type { PartTexts } from '../parts.ts';

// The parts' descriptions in Spanish, by part type (the English is with each
// part: its info in src/parts). `of` and `aboutOf` are the fingerprints of
// the English summary and about each was translated from (see
// src/i18n/fingerprint.ts).
const texts: PartTexts = {
  battery: {
    summary: 'Una fuente de corriente continua con resistencia interna: se descarga al entregar corriente, y su tensión baja a medida que se agota.',
    of: 'ckngsa',
    about: {
      how: 'Una celda química convierte energía química almacenada en una tensión continua. Parte de esa tensión se pierde en su interior al entregar corriente, más cuanto más se la exige.',
      sim: 'Una tensión tras su resistencia interna. Su carga (en Ah) baja con la corriente que entrega, y su tensión sigue una curva de descarga que cae cerca del final; «Recargar» la llena de nuevo. Por encima de su corriente máxima se sobrecalienta.',
      uses: 'Circuitos portátiles, alimentación de respaldo y todo lo que necesita una continua estable lejos de la red.',
    },
    aboutOf: '1plmyzj',
  },
  ground: {
    summary: 'La referencia común de 0 V del circuito; cada símbolo de tierra es el mismo nodo.',
    of: 'kp6bcj',
    about: {
      how: 'El punto desde el que se mide toda tensión de un circuito: 0 V. En equipos reales suele conectarse al chasis o a tierra.',
      sim: 'Cada símbolo de tierra es un nodo a 0 V. Un circuito aparte sin tierra recibe igualmente una referencia, para tener siempre solución.',
      uses: 'El retorno común de un circuito y la referencia para medir tensiones y niveles lógicos.',
    },
    aboutOf: '1s5bqts',
  },
  netLabel: {
    summary: 'Da nombre a una red: todas las etiquetas con el mismo nombre están conectadas, como si estuvieran cableadas.',
    of: '24zde5',
    about: {
      how: 'Un nombre para una red, para que la misma conexión aparezca en varios puntos de un esquema sin un cable entre ellos.',
      sim: 'Todas las etiquetas con el mismo nombre son un nodo, igual que si estuvieran cableadas. Dentro de un módulo, una etiqueta solo une con otras de la misma copia.',
      uses: 'Líneas de alimentación y señales que cruzan un esquema grande, para mantenerlo legible.',
    },
    aboutOf: '10wo2d6',
  },
  terminal: {
    summary: 'Un punto de conexión donde puede terminar un cable; en el borde del marco de un módulo se convierte en uno de sus pines.',
    of: '1669yxg',
    about: {
      how: 'Un punto donde se conectan cables, como un borne de tornillo en una regleta.',
      sim: 'Un extremo abierto sin efecto en el circuito; su lectura muestra la tensión allí, así que también sirve de punto de medida. En el borde de un marco se convierte en pin cuando el marco pasa a ser un módulo.',
      uses: 'Dejar un cable listo para después, puntos de medida y los pines de un módulo.',
    },
    aboutOf: '1i0jq15',
  },
  generator: {
    summary: 'Una fuente de tensión alterna senoidal, ajustada por su valor eficaz y su frecuencia; el pin 0 se hace positivo primero.',
    of: 'to5mv9',
    about: {
      how: 'Una fuente de tensión alterna que oscila suavemente entre positivo y negativo, como la red o un generador de señales.',
      sim: 'Una senoide ajustada por su valor eficaz, su frecuencia y su fase inicial; el pin 0 se hace positivo primero. Las lecturas de componentes en alterna muestran valores eficaces y medios.',
      uses: 'Alimentar transformadores, filtros y rectificadores, y probar cómo responde un circuito a la alterna.',
    },
    aboutOf: 'b8ky5u',
  },
  rail: {
    summary: 'Un riel de alimentación: mantiene su red a una tensión fija respecto a 0 V, sin necesidad de dibujar el cable de retorno.',
    of: 'wnvl9s',
    about: {
      how: 'Una forma abreviada de una alimentación: el esquema muestra la tensión en un punto en vez de un cable de vuelta a la fuente.',
      sim: 'Mantiene su red a la tensión ajustada respecto a 0 V, hasta su corriente máxima; muy por encima y por mucho tiempo se sobrecalienta como una fuente que salta. Su tensión puede ser negativa.',
      uses: 'La alimentación de +5 V o +12 V de circuitos electrónicos, sin dibujar la fuente.',
    },
    aboutOf: 'tn8ka4',
  },
  phase: {
    summary: 'Una fase de la red: una tensión alterna (eficaz) respecto al neutro en 0 V; tres, desfasadas 120°, forman un sistema trifásico.',
    of: '1yf0cb9',
    about: {
      how: 'Una fase de la red: una tensión alterna respecto al neutro. Un sistema trifásico tiene tres, cada una 120° detrás de la anterior.',
      sim: 'Una senoide (valor eficaz, frecuencia y ángulo de fase) respecto al neutro en 0 V, a través de un interruptor que salta muy por encima de su valor nominal. Tres de ellas a 0°, −120° y 120° mueven un motor trifásico.',
      uses: 'Circuitos de red: lámparas, transformadores, contactores y motores.',
    },
    aboutOf: 'wtv6vv',
  },
  resistor: {
    summary: 'Limita la corriente en proporción a la tensión aplicada (ley de Ohm) y se calienta con la potencia que disipa; se quema si supera su potencia nominal.',
    of: 'e2pdqx',
    about: {
      how: 'Un componente que se opone a la corriente: la corriente es la tensión aplicada dividida por su resistencia (ley de Ohm), y la potencia que recibe se convierte en calor.',
      sim: 'Una resistencia ideal que se calienta con la potencia que disipa y se quema por encima de su potencia nominal. Con «Dispersión real» elegido en Ajustes, cada una se aparta un poco de su valor marcado, dentro de su tolerancia, como las reales.',
      uses: 'Limitar corriente (la de un LED, por ejemplo), dividir tensiones, poner entradas a positivo o a masa y fijar la temporización de circuitos RC.',
    },
    aboutOf: 'if30rr',
  },
  capacitor: {
    summary: 'Almacena carga: bloquea la corriente continua una vez cargado, y deja pasar la alterna con más facilidad cuanto mayor es la frecuencia.',
    of: '52qcgu',
    about: {
      how: 'Dos placas separadas por un aislante. Solo circula corriente mientras se carga o descarga, así que una continua constante lo bloquea pero las tensiones que cambian lo atraviesan.',
      sim: 'Una capacidad ideal que se carga y descarga con el tiempo. Por encima de su tensión nominal se sobreesfuerza y falla.',
      uses: 'Desacoplar alimentaciones, acoplar señales alternas, filtros y temporizar con una resistencia.',
    },
    aboutOf: 'ylz8o8',
  },
  electrolytic: {
    summary: 'Un condensador polarizado de gran capacidad para filtrar y temporizar; conectado al revés, falla.',
    of: '12vkm73',
    about: {
      how: 'Un condensador de capacidad muy grande para su tamaño, fabricado con una capa química que solo funciona en un sentido.',
      sim: 'Una capacidad que falla si su tensión va más de un voltio al revés o supera su tensión nominal. Su capacidad puede desviarse según su tolerancia, a menudo un 20 % en los reales.',
      uses: 'Filtrar una tensión rectificada, almacenar energía y constantes de tiempo largas.',
    },
    aboutOf: 'snwpu9',
  },
  inductor: {
    summary: 'Una bobina que se opone a los cambios de corriente: deja pasar la continua, frena la alterna más cuanto mayor es la frecuencia, y da un pico de tensión al desconectarla.',
    of: '1gvp3r2',
    about: {
      how: 'Una bobina de hilo cuyo campo magnético almacena energía. Se opone a todo cambio de corriente: si se corta de golpe, produce un pico de tensión alto.',
      sim: 'Una inductancia en serie con la resistencia de su devanado; la corriente cambia en ella solo poco a poco, y se calienta por encima de su corriente nominal.',
      uses: 'Filtros, choques en fuentes de alimentación y almacenamiento de energía en convertidores conmutados.',
    },
    aboutOf: '1t9an95',
  },
  potentiometer: {
    summary: 'Una pista resistiva con un cursor deslizante: un divisor de tensión variable, ajustado con su deslizador.',
    of: 'j44pd8',
    about: {
      how: 'Una pista resistiva con un cursor que se desliza por ella y la divide en dos resistencias: un divisor de tensión ajustable.',
      sim: 'La pista entre sus pines extremos, y el cursor (tercer pin) en la posición fijada con su deslizador. Se calienta con la potencia en la pista y se quema por encima de su potencia nominal.',
      uses: 'Controles de volumen y nivel, fijar una tensión de referencia, ajustar umbrales.',
    },
    aboutOf: 'x9q33s',
  },
  rheostat: {
    summary: 'Una resistencia cuyo valor se ajusta con un deslizador, para regular una corriente o un nivel.',
    of: '14xcadv',
    about: {
      how: 'Una resistencia de valor ajustable: un potenciómetro usado solo con dos de sus terminales.',
      sim: 'Una resistencia fijada con su deslizador entre cero y su valor máximo, que se calienta con la potencia que recibe.',
      uses: 'Ajustar una corriente, afinar una temporización o un umbral.',
    },
    aboutOf: '153o2wp',
  },
  ldr: {
    summary: 'Una fotorresistencia: su resistencia baja cuanto más luz recibe, de lámparas y LED cercanos.',
    of: 'fw5whq',
    about: {
      how: 'Una fotorresistencia: un material cuya resistencia baja porque la luz libera más portadores de carga en él.',
      sim: 'Su resistencia se mueve entre su valor en oscuridad y en plena luz según la luz que le llega: su ajuste de luz ambiente más las lámparas y LED del tablero, más cuanto más cerca y más brillantes.',
      uses: 'Luces nocturnas, sensores de luz e interruptores crepusculares.',
    },
    aboutOf: '1ptwkxe',
  },
  ntc: {
    summary: 'Un termistor cuya resistencia baja al calentarse: mide la temperatura a su alrededor, incluidas resistencias calefactoras y componentes calientes cercanos.',
    of: 'xhk8f',
    about: {
      how: 'Un termistor de coeficiente de temperatura negativo: su resistencia cae con fuerza al calentarse.',
      sim: 'Su resistencia sigue su temperatura según la ecuación del parámetro B. Siente la temperatura ambiente y los componentes calientes cercanos, y su propia corriente también lo calienta un poco.',
      uses: 'Medir temperatura, termostatos y limitar la corriente de arranque.',
    },
    aboutOf: '8q3aw0',
  },
  transformer: {
    summary: 'Dos devanados acoplados: elevan o reducen una tensión alterna según su relación de espiras y aíslan ambos lados; la continua no pasa.',
    of: 'tasv7r',
    about: {
      how: 'Dos devanados en un núcleo: una corriente alterna en uno induce una tensión alterna en el otro, escalada por la relación de espiras. Los dos lados no están conectados.',
      sim: 'Dos inductancias acopladas, con la inductancia y la resistencia del primario, la relación de espiras y el grado de acoplamiento. Solo se transfiere la corriente que cambia: la continua en el primario solo lo calienta.',
      uses: 'Reducir la tensión de red para la electrónica, timbres y aislar circuitos.',
    },
    aboutOf: 'pd88sb',
  },
  fuse: {
    summary: 'Casi un cable hasta que la corriente supera claramente su valor nominal; entonces se funde y abre el circuito.',
    of: '1g2e081',
    about: {
      how: 'Un hilo fino que se funde cuando lo atraviesa demasiada corriente, protegiendo el resto del circuito.',
      sim: 'Casi un cable hasta que lleva claramente más de su valor nominal; entonces se calienta y se funde en un instante, abriendo el circuito. Se repone desde su panel.',
      uses: 'Proteger fuentes, cableado y componentes de cortocircuitos y sobrecargas.',
    },
    aboutOf: '17c64og',
  },
  lamp: {
    summary: 'Una lámpara incandescente: alumbra con la potencia que recibe, en alterna o en continua, y se funde si se sobrecarga.',
    of: '16p4ij1',
    about: {
      how: 'Un filamento que la corriente calienta hasta que brilla. Su brillo sigue la potencia que recibe.',
      sim: 'Su resistencia en caliente (su tensión nominal al cuadrado entre su potencia), brillando según su potencia media, así que la alterna y la continua la encienden igual. Sobrecargada, se funde. No reproduce el pico de arranque de un filamento frío.',
      uses: 'Iluminación, indicadores y una carga sencilla para probar un circuito.',
    },
    aboutOf: '1dwrs3s',
  },
  pilot: {
    summary: 'Un piloto luminoso tras una lente de color, como en un panel de control.',
    of: 'ont6hs',
    about: {
      how: 'Una pequeña lámpara indicadora tras una lente de color, montada en paneles de control para mostrar que algo está encendido.',
      sim: 'Una lámpara (como la Lámpara) tras una lente del color elegido.',
      uses: 'Mostrar que una máquina funciona, que hay alimentación o que ha habido una avería.',
    },
    aboutOf: '128hyqq',
  },
  led: {
    summary: 'Un diodo emisor de luz: se ilumina cuando la corriente va del ánodo al cátodo por encima de su tensión directa; necesita una resistencia que limite la corriente.',
    of: 'fny05o',
    about: {
      how: 'Un diodo que emite luz cuando la corriente lo atraviesa en sentido directo. Apenas conduce por debajo de su tensión directa y luego la corriente sube de golpe, así que necesita una resistencia que la limite.',
      sim: 'Una unión de diodo con la tensión directa de su color, que brilla en proporción a su corriente. Por encima de su corriente máxima se quema; al revés, simplemente bloquea.',
      uses: 'Indicadores, pantallas e iluminación.',
    },
    aboutOf: 'khml48',
  },
  stackLight: {
    summary: 'Una torre de lámparas roja, ámbar y verde con un pin común, que indica el estado de una máquina.',
    of: 'fxowh2',
    about: {
      how: 'Una torre de lámparas de color en una máquina: verde en marcha, ámbar para avisar, rojo para una avería.',
      sim: 'Tres lámparas desde sus pines a un pin común, cada una iluminada por su propia potencia media.',
      uses: 'Señalizar el estado de máquinas y procesos.',
    },
    aboutOf: '1ly8ezy',
  },
  rgbLed: {
    summary: 'LED rojo, verde y azul en una misma lente: la mezcla de sus brillos da cualquier color.',
    of: 'rte9i4',
    about: {
      how: 'Chips LED rojo, verde y azul en un mismo encapsulado. Mezclar sus brillos da cualquier color.',
      sim: 'Tres LED con ánodo o cátodo común, cada uno con su tensión directa e intensidad; el color mostrado es su luz mezclada. Una lente difusa los funde, una transparente deja ver los chips.',
      uses: 'Indicadores de color, iluminación ambiental, mezcla de colores con PWM.',
    },
    aboutOf: 'fr2l5m',
  },
  dotMatrix: {
    summary: 'Una cuadrícula de LED conectados en filas y columnas: barriéndola se muestran caracteres o dibujos, monocolor o RGB.',
    of: 'z6bgk4',
    about: {
      how: 'Una cuadrícula de LED conectados en filas y columnas. Encendiendo una fila cada vez, lo bastante rápido (multiplexado), se muestran caracteres o dibujos.',
      sim: 'Hasta 16 × 16 puntos, cada uno un LED entre su fila y su columna (filas como ánodos o cátodos), monocolor o RGB. Los puntos encendidos se funden en el tiempo como los ve el ojo.',
      uses: 'Texto desplazable, símbolos y pequeños gráficos.',
    },
    aboutOf: 'm7gh7v',
  },
  barGraph: {
    summary: 'Diez LED en fila con un pin común: un indicador de nivel.',
    of: '1qnsl7y',
    about: {
      how: 'Diez LED en fila que se encienden por turnos para mostrar un nivel, como un vúmetro.',
      sim: 'Diez LED desde sus pines a un ánodo o cátodo común, del color elegido.',
      uses: 'Indicadores de nivel, de batería y la salida de un contador.',
    },
    aboutOf: '10p7e62',
  },
  bicolorLed: {
    summary: 'LED rojo y verde en antiparalelo: rojo en un sentido, verde en el otro, ámbar en alterna.',
    of: '5e1qbp',
    about: {
      how: 'Un LED rojo y uno verde en antiparalelo en un mismo encapsulado: el sentido de la corriente elige el color.',
      sim: 'El rojo se enciende con el pin 0 positivo, el verde al revés; en alterna se encienden por turnos y se ve ámbar.',
      uses: 'Indicadores de dos estados (encendido/apagado, cargando/lleno) con solo dos cables.',
    },
    aboutOf: 'csfsn5',
  },
  sevenSeg: {
    summary: 'Siete segmentos LED y un punto con un pin común: muestra una cifra, controlada por un decodificador como el CD4511.',
    of: 'numvxg',
    about: {
      how: 'Siete LED en forma de barra (a a g) y un punto, dispuestos para que encendiendo los adecuados se vea cualquier cifra del 0 al 9.',
      sim: 'Ocho LED con cátodo o ánodo común, del color elegido; cada segmento se enciende con su corriente.',
      uses: 'Relojes, contadores e indicadores, normalmente mediante un decodificador como el CD4511.',
    },
    aboutOf: '1bdwa9',
  },
  switch: {
    summary: 'Un interruptor de encendido y apagado: haz clic en su control para abrirlo o cerrarlo.',
    of: '1413cux',
    about: {
      how: 'Un contacto que queda abierto o cerrado hasta que lo cambias.',
      sim: 'Abierto, o cerrado con una resistencia mínima; sus contactos se calientan por encima de su corriente nominal. Haz clic en su control del tablero para cambiarlo. Hasta cuatro polos en la misma palanca (bipolar, tripolar…).',
      uses: 'Encender y apagar circuitos y fijar entradas a mano.',
    },
    aboutOf: '1pv69ny',
  },
  button: {
    summary: 'Un pulsador que solo cierra mientras se mantiene pulsado (normalmente abierto).',
    of: 'z9plog',
    about: {
      how: 'Un interruptor momentáneo: su contacto solo cierra mientras lo pulsas y se abre solo al soltarlo (normalmente abierto, NA).',
      sim: 'Cerrado mientras se mantiene: pulsa y mantén su control en el tablero. Hasta cuatro polos en el mismo pulsador.',
      uses: 'Pulsadores de marcha, timbres y entradas lógicas.',
    },
    aboutOf: 'nhtkjq',
  },
  buttonNC: {
    summary: 'Un pulsador que solo abre mientras se mantiene pulsado (normalmente cerrado): un pulsador de paro.',
    of: 'gccl5d',
    about: {
      how: 'Un interruptor momentáneo cuyo contacto está cerrado en reposo y se abre al pulsarlo (normalmente cerrado, NC).',
      sim: 'Abierto mientras se mantiene: pulsa y mantén su control en el tablero. Hasta cuatro polos en el mismo pulsador.',
      uses: 'Pulsadores de paro y circuitos de seguridad, que deben cortar al pulsarlos.',
    },
    aboutOf: '7xlrzb',
  },
  buttonBlocks: {
    summary: 'Un pulsador con contactos NA y NC a la vez: al pulsarlo cierra unos y abre los otros al mismo tiempo.',
    of: '19shaj',
    about: {
      how: 'Un pulsador momentáneo con varios bloques de contacto: mientras está pulsado, sus contactos NA se cierran y sus contactos NC se abren.',
      sim: 'Cada contacto es un par de pines propio, numerado como en EN 50005 (13–14 NA, 21–22 NC); todos conmutan mientras mantienes su control en el tablero.',
      uses: 'Pulsadores de marcha con enclavamiento, avisar de una pulsación a un segundo circuito, y mandos a dos manos o de emergencia.',
    },
    aboutOf: 'xgr3mi',
  },
  changeover: {
    summary: 'Un conmutador que une su común con uno de dos contactos: conmutación desde dos puntos, como la luz de una escalera.',
    of: '1rhho8',
    about: {
      how: 'Un interruptor que une su terminal común con uno de otros dos.',
      sim: 'Su común unido a un contacto o al otro; haz clic en su control para cambiarlo. Hasta cuatro polos en la misma palanca (conmutador bipolar…).',
      uses: 'Encender una luz desde dos puntos, elegir entre dos fuentes o señales.',
    },
    aboutOf: '1wmkiej',
  },
  selectorSwitch: {
    summary: 'Un interruptor que une su común con uno de varios contactos, una posición cada vez: un selector o conmutador rotativo.',
    of: 'arfjg0',
    about: {
      how: 'Un interruptor con un terminal común y varias posiciones, cada una de las cuales lo une a un contacto distinto.',
      sim: 'Su común unido al contacto de la posición en la que está, los demás abiertos; haz clic en su perilla para pasar a la siguiente posición (tras la última, vuelve a la 1).',
      uses: 'Elegir entre fuentes, velocidades, rangos o salidas: selectores de velocidad de ventilador, rangos de un medidor, Manual–Apagado–Automático.',
    },
    aboutOf: 'o78sfa',
  },
  crank: {
    summary: 'Hace girar un eje a mano mientras mantienes su control: acopla una dinamo y enciende una lámpara con tu propio esfuerzo.',
    of: '1s2nrij',
    about: {
      how: 'Una manivela que giras para mover una máquina, a través de engranajes que aumentan la velocidad: aquí, el eje en el que va una dinamo u otra carga.',
      sim: 'Mientras mantienes su control en el tablero, una persona girando la manivela: el mayor par desde parado, que baja con la velocidad, y su potencia máxima, el esfuerzo fijado, a un cómodo giro por segundo. La relación de transmisión lo eleva a la velocidad del eje. Una carga mayor la frena; si la sueltas, se detiene poco a poco.',
      uses: 'Generadores y linternas de manivela, y sentir cuánto esfuerzo exige una carga.',
    },
    aboutOf: '1n4suqr',
  },
  turbine: {
    summary: 'Movido por el aire de un ventilador que sopla hacia él: acopla una dinamo y verás qué poco vuelve de la potencia del ventilador.',
    of: 'jzai8x',
    about: {
      how: 'Palas que el viento hace girar y que mueven un generador. La potencia del viento crece con el cubo de su velocidad; una turbina capta una parte, nunca más del 59 % (el límite de Betz), y la mayor cuando las puntas de sus palas van unas cuatro veces más rápido que el viento.',
      sim: 'Capta el aire de los ventiladores que soplan hacia su frente (desde debajo de su símbolo), como lo hace su refrigeración: con más fuerza cerca del ventilador y en su eje. Su par crece con el cuadrado del viento y baja con su velocidad. Su eje mueve una carga acoplada; el aire tras ella sale frenado por lo que captó, así que hace sombra a las piezas y turbinas de detrás.',
      uses: 'La energía eólica, y ver por qué un ventilador no puede alimentarse a sí mismo: la turbina recupera solo una pequeña parte de lo que consume el ventilador.',
    },
    aboutOf: 'al8u9n',
  },
  dynamo: {
    summary: 'Un generador de corriente continua acoplado al eje de un motor: produce una tensión según la velocidad a la que gira, y lo que le pides frena el motor.',
    of: '928o7f',
    about: {
      how: 'Convierte el giro en electricidad: una bobina que gira en el campo de un imán produce una tensión proporcional a su velocidad. La corriente que entrega se opone a lo que la hace girar.',
      sim: 'Una fuerza electromotriz proporcional a su velocidad tras la resistencia de su inducido (su tensión cae una décima a corriente nominal), acoplado al eje de un motor al colocarlo allí. La potencia que entrega, y sus pérdidas, salen del eje del motor: al cargarlo, el motor gira más despacio y consume más corriente. Si el motor gira al revés, su polaridad se invierte. No funciona como motor.',
      uses: 'Grupos motor-generador, dinamos de bicicleta, tacogeneradores (una tensión que mide la velocidad), y ver adónde va la energía.',
    },
    aboutOf: 'xkz9na',
  },
  motor: {
    summary: 'Un motor de continua, monofásico o trifásico que mueve una carga en su eje; su velocidad y su corriente siguen a la carga, y se cala si se sobrecarga.',
    of: 'ley0j7',
    about: {
      how: 'Convierte potencia eléctrica en giro. La velocidad de un motor de continua sube con su tensión y su corriente con su carga; un motor de inducción (alterna) gira algo más lento que el campo giratorio de su alimentación, deslizando más cuanto mayor es la carga.',
      sim: 'Mecánica del eje con inercia y rozamiento, moviendo una carga acoplada a su eje. Continua: fuerza contraelectromotriz y resistencia del inducido. Alterna: deslizamiento, par según la curva de Kloss hasta su par máximo y corriente según un circuito equivalente, a la frecuencia medida en sus bornes. Intercambia dos fases (o la polaridad en continua) para invertirlo. Calado, se sobrecalienta.',
      uses: 'Ventiladores, bombas, cintas transportadoras, accionamientos; en la industria, motores trifásicos con contactores.',
    },
    aboutOf: 'iu4qzv',
  },
  conveyor: {
    summary: 'Una carga mecánica con un tiro constante, acoplada al eje de un motor: retiene un motor que no puede vencerla.',
    of: '6ns533',
    about: {
      how: 'Una cinta contra la que el motor tira con una fuerza constante, sea cual sea su velocidad.',
      sim: 'Un par de carga constante (como fracción del par nominal del motor) e inercia; retiene calado un motor que no puede vencerla. Se acopla al eje de un motor colocándola allí.',
      uses: 'Probar un motor con una carga fija y verlo calarse si se sobrecarga.',
    },
    aboutOf: '19ts3yv',
  },
  pump: {
    summary: 'Una carga mecánica acoplada al eje de un motor, cuyo par crece con el cuadrado de la velocidad, como en una bomba o un ventilador.',
    of: '1yythms',
    about: {
      how: 'Una carga cuyo par crece con el cuadrado de su velocidad, como el de una bomba o un ventilador: cuesta girarla rápido y poco despacio.',
      sim: 'Su par a velocidad nominal (como fracción del par nominal del motor) escalado por el cuadrado de la velocidad, más su inercia. Se acopla al eje de un motor colocándola allí.',
      uses: 'Ver cómo se estabiliza un motor con una carga de ventilador o de bomba.',
    },
    aboutOf: '1jy8lvw',
  },
  flywheel: {
    summary: 'Una rueda pesada en el eje de un motor: sin par de carga, solo inercia, así que el motor tarda más en acelerar y sigue girando al desconectarlo.',
    of: '1hh27a2',
    about: {
      how: 'Una rueda pesada que almacena energía en su giro.',
      sim: 'Solo inercia (un múltiplo del rotor del motor), sin par de carga: el motor acelera y frena más despacio.',
      uses: 'Ver el efecto de la inercia al arrancar y al detenerse.',
    },
    aboutOf: 'wng5bg',
  },
  fan: {
    summary: 'Un pequeño ventilador de continua: sopla aire que enfría los componentes en su corriente.',
    of: '17qkmro',
    about: {
      how: 'Un pequeño motor de continua con una hélice que sopla aire sobre los componentes cercanos para enfriarlos.',
      sim: 'Un motor de continua con sus aspas como carga, cuya velocidad sigue a su tensión. Su corriente de aire enfría los componentes en ella; en la pared de una envolvente cambia el aire de dentro por aire de fuera. Su tamaño fija cuánto aire mueve.',
      uses: 'Enfriar componentes calientes y envolventes.',
    },
    aboutOf: '16pdxij',
  },
  heater: {
    summary: 'Una resistencia calefactora: se calienta con el tiempo según la potencia que recibe, calienta lo que tiene cerca y brilla cuando está caliente.',
    of: '115cgpo',
    about: {
      how: 'Un hilo resistivo hecho para convertir electricidad en calor.',
      sim: 'Una resistencia fija dada por su tensión y potencia nominales. Su elemento se calienta a lo largo de su tiempo de calentamiento, calienta los componentes cercanos y brilla en rojo cuando está caliente.',
      uses: 'Calentar, y una fuente de calor para probar termostatos y ventiladores.',
    },
    aboutOf: 'yurfha',
  },
  solenoid: {
    summary: 'Una bobina con un émbolo que se atrae cuando su corriente alcanza el valor nominal, en alterna o en continua.',
    of: 'f4n0ps',
    about: {
      how: 'Una bobina alrededor de un émbolo de hierro móvil: la corriente por la bobina atrae el émbolo.',
      sim: 'Una bobina (resistencia según su tensión y corriente nominales, más su inductancia). El émbolo se atrae a tres cuartos de su corriente nominal y se suelta por debajo del 40 %, en alterna según el valor eficaz. Sobrecargada, se sobrecalienta.',
      uses: 'Cerraduras, válvulas y empujar o tirar de algo a voluntad.',
    },
    aboutOf: '1r54wtn',
  },
  tube: {
    summary: 'Un tubo fluorescente: dos filamentos y un arco que se enciende a alta tensión; necesita una reactancia y un cebador.',
    of: 'v8dzsg',
    about: {
      how: 'Un tubo de vidrio con gas y un filamento en cada extremo. Una vez que el gas se rompe, un arco conduce por él y el recubrimiento brilla.',
      sim: 'Dos filamentos y un arco entre ellos que se enciende por encima de su tensión de encendido y luego funciona a su tensión de arco. Necesita una reactancia que limite la corriente y un cebador que lo precaliente.',
      uses: 'La iluminación fluorescente clásica con reactancia y cebador.',
    },
    aboutOf: 'o4f2yl',
  },
  ballast: {
    summary: 'Una reactancia en serie con un tubo fluorescente: limita su corriente y da el pico de tensión que enciende el arco.',
    of: 'qqbhef',
    about: {
      how: 'Una inductancia en serie con un tubo fluorescente. Limita su corriente y, cuando el cebador se abre, da el pico de tensión que enciende el arco.',
      sim: 'Una inductancia con la resistencia de su devanado, dimensionada para su tubo.',
      uses: 'La reactancia de una lámpara fluorescente.',
    },
    aboutOf: '1qpsxj1',
  },
  starter: {
    summary: 'Un cebador: precalienta los filamentos de un tubo fluorescente y luego se abre para que la reactancia encienda el arco.',
    of: 'su5g6t',
    about: {
      how: 'Una pequeña lámpara de efluvios con un contacto bimetálico. Su brillo calienta el bimetal hasta que cierra y precalienta los filamentos; luego se enfría y abre, y el pico de la reactancia enciende el tubo.',
      sim: 'Brilla (con poca corriente) cuando tiene tensión suficiente, calentando su bimetal hasta que cierra, y luego se enfría y abre: el ciclo completo de arranque de un fluorescente.',
      uses: 'Arrancar un tubo fluorescente.',
    },
    aboutOf: 'm0npuk',
  },
  buzzer: {
    summary: 'Un zumbador magnético: suena en continua con la polaridad correcta, o en alterna.',
    of: 'h03g6',
    about: {
      how: 'Un electroimán que hace vibrar un disco metálico para producir un tono.',
      sim: 'Una carga resistiva que suena mientras su tensión está cerca de la nominal: en continua con la polaridad correcta o en alterna. Se oye mientras corre la simulación.',
      uses: 'Alarmas, pitidos y avisos.',
    },
    aboutOf: '13fxka1',
  },
  piezo: {
    summary: 'Un zumbador piezoeléctrico: suena en continua con la polaridad correcta y calla si se invierte.',
    of: '1h2oigr',
    about: {
      how: 'Un disco piezoeléctrico con su propio oscilador, que se flexiona para producir un tono.',
      sim: 'Suena a su frecuencia cuando su tensión continua está cerca de la nominal y con la polaridad correcta; calla al revés o en alterna. Se oye mientras corre la simulación.',
      uses: 'Pitidos en equipos electrónicos y temporizadores.',
    },
    aboutOf: '1egnnt7',
  },
  bell: {
    summary: 'Un timbre electromecánico: suena con su tensión nominal, alterna o continua.',
    of: 'prwawe',
    about: {
      how: 'Un electroimán atrae un martillo contra una campana y corta su propio circuito, una y otra vez, y la campana suena.',
      sim: 'Suena mientras su tensión (eficaz, alterna o continua) está cerca de la nominal. Se oye mientras corre la simulación.',
      uses: 'Timbres de puerta, de escuela y de incendio.',
    },
    aboutOf: '145jsc5',
  },
  chime: {
    summary: 'Un carillón de puerta: un tono al pulsar y otro al soltar (din-don), con la alterna de un transformador de timbre.',
    of: 'i69j7t',
    about: {
      how: 'Un émbolo en una bobina golpea una placa sonora al recibir corriente y otra al soltarse: din-don.',
      sim: 'Un tono cuando llega su tensión y otro cuando se va, a su tensión eficaz nominal. Se oye mientras corre la simulación.',
      uses: 'Carillones de puerta con un transformador de timbre.',
    },
    aboutOf: 'j8cvhb',
  },
  speaker: {
    summary: 'Un altavoz: reproduce la parte alterna de la tensión aplicada, a la frecuencia de esa señal.',
    of: '1tyvrsg',
    about: {
      how: 'Una bobina unida a un cono en el campo de un imán: una corriente que cambia mueve el cono, que produce sonido.',
      sim: 'Una resistencia (su impedancia) que reproduce la parte alterna de la tensión aplicada, a la frecuencia de esa señal, tan fuerte como su potencia respecto a la nominal. Se oye mientras corre la simulación.',
      uses: 'Sonido de osciladores, amplificadores y circuitos de audio.',
    },
    aboutOf: 'ns1jw4',
  },
  relay: {
    summary: 'Una bobina que, al excitarse, conmuta sus contactos: una pequeña corriente controla un circuito distinto y mayor.',
    of: '1dnwige',
    about: {
      how: 'Un electroimán que mueve contactos: una pequeña corriente por la bobina conmuta un circuito distinto, a menudo mucho mayor.',
      sim: 'Una bobina (su resistencia) que se activa a tres cuartos de su tensión nominal y se suelta por debajo del 40 %; continua, o alterna según el valor eficaz. Hasta cuatro contactos, conmutados o de cierre; contactos y bobina se calientan por encima de sus valores nominales. Bobina y contactos son circuitos separados.',
      uses: 'Conmutar cargas de red desde la electrónica, y lógica de relés.',
    },
    aboutOf: '1osdz9z',
  },
  contactor: {
    summary: 'Un relé de potencia para motores y otras cargas: tres contactos principales, contactos auxiliares, normalmente con bobina de alterna.',
    of: '15niclw',
    about: {
      how: 'Un relé de potencia hecho para conmutar motores y cargas grandes, con contactos principales para la carga y pequeños contactos auxiliares para el control.',
      sim: 'Como un relé: hasta cuatro contactos principales que cierran al excitarse, y contactos auxiliares numerados como en EN 50012 (13–14 de cierre, 21–22 de apertura). Su bobina suele ser de alterna.',
      uses: 'Arrancadores de motor, inversores de giro y conmutación de cargas grandes.',
    },
    aboutOf: 'a2lg3b',
  },
  and: {
    summary: 'AND lógica: su salida es 1 solo cuando ambas entradas son 1.',
    of: '1v0jfjf',
    about: {
      how: 'Una puerta lógica cuya salida es 1 solo cuando todas sus entradas son 1.',
      sim: 'Las puertas lógicas funcionan con una alimentación interna de 5 V respecto a 0 V: las entradas leen 1 por encima del 55 % de ella y 0 por debajo del 45 % (entre ambos mantienen su último nivel) y apenas cargan la señal; las salidas mueven cargas reales a través de 25 Ω. Cada puerta conmuta un paso después de sus entradas, igual que las reales tienen un retardo.',
      uses: 'Combinar condiciones: esto Y aquello.',
    },
    aboutOf: '1ccnuvg',
  },
  or: {
    summary: 'OR lógica: su salida es 1 cuando alguna entrada es 1, o ambas.',
    of: 'a70i3w',
    about: {
      how: 'Una puerta lógica cuya salida es 1 cuando cualquier entrada es 1.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entradas con histéresis, salidas de 25 Ω y un paso de retardo.',
      uses: 'Combinar condiciones: esto O aquello.',
    },
    aboutOf: '1p5iwc0',
  },
  not: {
    summary: 'NOT lógica (inversor): su salida es lo contrario de su entrada.',
    of: 'h86tu3',
    about: {
      how: 'Una puerta lógica de una entrada cuya salida es siempre lo contrario.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entrada con histéresis, salida de 25 Ω y un paso de retardo. Un número impar en anillo oscila.',
      uses: 'Invertir una señal, y osciladores en anillo.',
    },
    aboutOf: '1n41ht4',
  },
  nand: {
    summary: 'NAND lógica: su salida es 0 solo cuando ambas entradas son 1, lo contrario de AND.',
    of: 'wp2dp6',
    about: {
      how: 'Una puerta lógica cuya salida es 0 solo cuando todas sus entradas son 1: AND seguida de NOT. Cualquier lógica puede construirse solo con puertas NAND.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entradas con histéresis, salidas de 25 Ω y un paso de retardo.',
      uses: 'Biestables, y construir otras puertas.',
    },
    aboutOf: '1s8yi8i',
  },
  nor: {
    summary: 'NOR lógica: su salida es 1 solo cuando ambas entradas son 0, lo contrario de OR.',
    of: 'cjnozq',
    about: {
      how: 'Una puerta lógica cuya salida es 1 solo cuando todas sus entradas son 0: OR seguida de NOT.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entradas con histéresis, salidas de 25 Ω y un paso de retardo.',
      uses: 'Biestables RS, y construir otras puertas.',
    },
    aboutOf: 'pjk52z',
  },
  xor: {
    summary: 'XOR lógica: su salida es 1 cuando sus entradas son distintas.',
    of: '7964u9',
    about: {
      how: 'Una puerta lógica cuya salida es 1 cuando sus entradas son distintas.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entradas con histéresis, salidas de 25 Ω y un paso de retardo.',
      uses: 'Sumadores, paridad y comparar dos bits.',
    },
    aboutOf: 'iahla1',
  },
  xnor: {
    summary: 'XNOR lógica: su salida es 1 cuando sus entradas son iguales.',
    of: '1ampqme',
    about: {
      how: 'Una puerta lógica cuya salida es 1 cuando sus entradas son iguales.',
      sim: 'Como la puerta AND: alimentación lógica interna de 5 V, entradas con histéresis, salidas de 25 Ω y un paso de retardo.',
      uses: 'Comprobar igualdad.',
    },
    aboutOf: '1ccbsg',
  },
  dff: {
    summary: 'Guarda su entrada D en cada flanco de subida del reloj; S y R la ponen a 1 o a 0 al instante.',
    of: '1szb3ue',
    about: {
      how: 'Una memoria de un bit: en cada flanco de subida del reloj toma el valor de D y lo mantiene hasta el siguiente.',
      sim: 'Se actualiza en el flanco de subida de C; sus entradas asíncronas S y R lo ponen a 1 o a 0 al instante (gana R si ambas). Niveles lógicos como los de las puertas; al arrancar no ve ningún flanco.',
      uses: 'Registros, sincronizar señales, divisores y registros de desplazamiento.',
    },
    aboutOf: '1io7w6z',
  },
  jkff: {
    summary: 'En cada flanco de subida del reloj, J lo pone a 1, K lo pone a 0, y ambos juntos lo invierten; S y R actúan al instante.',
    of: 'yyyiga',
    about: {
      how: 'Un biestable que en cada flanco de subida del reloj se pone a 1 con J, a 0 con K, y se invierte con ambas.',
      sim: 'Como el biestable D: reloj por flanco de subida, S y R asíncronas (gana R), niveles lógicos como los de las puertas.',
      uses: 'Contadores y máquinas de estados.',
    },
    aboutOf: '1r3lr72',
  },
  tff: {
    summary: 'Invierte su salida en cada flanco de subida del reloj mientras T es 1: divide un reloj entre dos.',
    of: 'suo4eg',
    about: {
      how: 'Un biestable que cambia de estado en cada flanco de subida del reloj mientras T es 1, dividiendo la frecuencia del reloj entre dos.',
      sim: 'Como el biestable D: reloj por flanco de subida, S y R asíncronas (gana R), niveles lógicos como los de las puertas.',
      uses: 'Divisores de frecuencia y contadores asíncronos.',
    },
    aboutOf: '1otrwqm',
  },
  logicSwitch: {
    summary: 'Una entrada lógica fijada a mano: su interruptor cambia su salida entre 1 y 0.',
    of: 'bu9bh',
    about: {
      how: 'Un interruptor que da un 1 o un 0 lógico.',
      sim: 'Lleva su pin a la alimentación lógica o a 0 V a través de una resistencia pequeña; haz clic en su interruptor para cambiarlo.',
      uses: 'Fijar a mano las entradas de circuitos lógicos.',
    },
    aboutOf: 's5sens',
  },
  clock: {
    summary: 'Un reloj lógico de onda cuadrada, con frecuencia y ciclo de trabajo ajustables.',
    of: '9lkzo4',
    about: {
      how: 'Una fuente de pulsos cuadrados que mantiene los circuitos lógicos sincronizados.',
      sim: 'En alto durante su ciclo de trabajo de cada periodo, a su frecuencia. A frecuencias altas la simulación va más despacio para seguir cada flanco.',
      uses: 'Mover contadores, biestables y pantallas multiplexadas.',
    },
    aboutOf: '1iyn1fw',
  },
  probe: {
    summary: 'Muestra un nivel lógico: se enciende con 1, y su indicador marca 1 o 0.',
    of: 'mtcrfd',
    about: {
      how: 'Muestra si un punto está a 1 o a 0 lógico, como la punta de una sonda lógica.',
      sim: 'Apenas carga su punto; se enciende en rojo por encima del 55 % de la alimentación lógica, y su indicador marca 1 por encima de la mitad.',
      uses: 'Observar señales lógicas.',
    },
    aboutOf: '10gyjjo',
  },
  cd4511: {
    summary: 'Un decodificador CMOS de BCD a 7 segmentos: convierte un número de 4 bits en los segmentos de un display de cátodo común.',
    of: 'fgzsvu',
    about: {
      how: 'Un circuito CMOS que decodifica un número binario de 4 bits (BCD) en los siete segmentos de una cifra, con un latch que la mantiene.',
      sim: 'Entradas BCD A–D, habilitación de latch LE, prueba de segmentos y borrado (activas en bajo); sus salidas a–g dan corriente a un display de cátodo común, así que cada segmento sigue necesitando una resistencia. Por encima de 9 se apaga. Funciona con su propio VDD y VSS.',
      uses: 'Mover displays de 7 segmentos desde contadores.',
    },
    aboutOf: 'do5y3',
  },
  cd4017: {
    summary: 'Un contador de décadas CMOS: una de sus diez salidas está en alto cada vez, y avanza con cada pulso de reloj.',
    of: '4fx69p',
    about: {
      how: 'Un contador de décadas CMOS: activa una de diez salidas cada vez y avanza con cada pulso de reloj.',
      sim: 'Cada flanco de subida del reloj (con INH en bajo) mueve la única salida activa de Q0 a Q9 y vuelta a empezar; RST en alto la devuelve a Q0, y CO está en alto de 0 a 4. Funciona con su propio VDD y VSS.',
      uses: 'Luces secuenciales, secuenciadores y dividir entre diez.',
    },
    aboutOf: '1o5o934',
  },
  lm358: {
    summary: 'Dos amplificadores operacionales con una sola alimentación: cada uno amplifica la diferencia entre sus entradas, hasta cerca de sus límites de alimentación; también sirven de comparadores.',
    of: '13yoine',
    about: {
      how: 'Dos amplificadores operacionales para alimentación simple. Cada uno amplifica con gran ganancia la diferencia entre sus entradas + y −.',
      sim: 'Cada salida tiende a ganancia × (V+ − V−), limitada a su margen respecto a los límites de alimentación; su corriente sale de VCC o va a GND. Sin realimentación conmuta como un comparador.',
      uses: 'Amplificadores, comparadores, filtros activos e interfaces de sensores.',
    },
    aboutOf: 'orsa9u',
  },
  uln2003: {
    summary: 'Siete drivers Darlington con los que la lógica puede conmutar relés, lámparas o motores, con diodos de protección incorporados.',
    of: '1d4mas',
    about: {
      how: 'Siete interruptores Darlington en un circuito, cada uno capaz de absorber unos cientos de miliamperios, con diodos para los picos inductivos.',
      sim: 'Una entrada por encima de unos 1,6 V activa su canal, que lleva su salida a GND con un voltio aproximado de caída; cada salida tiene un diodo de protección hacia COM (conecta COM a la alimentación de la carga).',
      uses: 'Mover relés, lámparas, solenoides y motores paso a paso desde la lógica.',
    },
    aboutOf: '5t49st',
  },
  ne555: {
    summary: 'Un temporizador: un oscilador (astable) o un pulso único (monoestable), fijado por resistencias y un condensador.',
    of: 'mo59yk',
    about: {
      how: 'Un temporizador: dos comparadores y un biestable que cargan y descargan un condensador entre un tercio y dos tercios de la alimentación.',
      sim: 'Un modelo de comportamiento del 555 con sus propios pines de alimentación: comparadores a 1/3 y 2/3 de VCC, el transistor de descarga, reset y una salida que en alto queda unos 1,7 V por debajo de VCC. Su lectura muestra la frecuencia a la que funciona.',
      uses: 'Intermitentes, generadores de tono, temporizadores y PWM.',
    },
    aboutOf: 'hcip2z',
  },
  regulator: {
    summary: 'Mantiene su salida a una tensión fija (un 7805 a 5 V) mientras su entrada esté un par de voltios por encima.',
    of: '9xws3x',
    about: {
      how: 'Un regulador lineal: mantiene su salida a tensión fija absorbiendo la diferencia con la entrada y convirtiéndola en calor.',
      sim: 'Mantiene OUT a su tensión ajustada sobre GND mientras su entrada esté al menos su tensión de caída por encima; por debajo, la salida sigue a la entrada. Se calienta con la potencia que disipa y falla por encima de su potencia o corriente máximas.',
      uses: 'Una alimentación estable de 5 V o 12 V a partir de otra mayor y menos limpia.',
    },
    aboutOf: '1qv1f8r',
  },
  scopeProbe: {
    summary: 'Lleva la tensión de su punto al osciloscopio, como la traza de su canal.',
    of: 'dgc7gn',
    about: {
      how: 'Conecta un punto del circuito a un osciloscopio, para ver su tensión en el tiempo.',
      sim: 'La tensión de su punto respecto a 0 V, como la traza de su canal en el panel del osciloscopio; carga el punto como una entrada de osciloscopio de 10 MΩ.',
      uses: 'Observar formas de onda: rizado, osciladores, conmutaciones.',
    },
    aboutOf: '1pmnvxj',
  },
  panelMeter: {
    summary: 'Un instrumento de bobina móvil: su aguja muestra la tensión continua o alterna aplicada respecto a su fondo de escala.',
    of: '1lllevb',
    about: {
      how: 'Un instrumento de bobina móvil: la corriente por su bobina gira una aguja contra un muelle.',
      sim: 'Su aguja muestra la tensión continua (media) o alterna (eficaz) aplicada respecto a su fondo de escala, amortiguada como un mecanismo real, y topa más allá de los extremos; aguanta algo de sobrecarga, no varias veces el fondo de escala de forma sostenida.',
      uses: 'Mostrar de un vistazo una tensión o un nivel en un panel.',
    },
    aboutOf: '1qpv8vm',
  },
  voltmeter: {
    summary: 'Mide la tensión entre sus terminales (continua, o alterna como valor eficaz) casi sin consumir corriente: se conecta en paralelo con un componente.',
    of: '66ez3l',
    about: {
      how: 'Mide la tensión entre sus dos puntas. Conectado en paralelo con un componente, debe consumir la menor corriente posible.',
      sim: 'Una entrada de 10 MΩ que muestra continua o alterna (eficaz) en su pantalla; cambia entre ambas con su pestaña. Admite hasta 1000 V.',
      uses: 'Medir tensiones en componentes y fuentes.',
    },
    aboutOf: '1q0vrkl',
  },
  ammeter: {
    summary: 'Mide la corriente que lo atraviesa (continua, o alterna como valor eficaz): se conecta en serie. Su fusible interno salta por encima de 10 A.',
    of: '1wea6np',
    about: {
      how: 'Mide la corriente que lo atraviesa, así que debe conectarse en serie, en el camino de la corriente.',
      sim: 'Un shunt de 0,05 Ω que muestra continua o alterna (eficaz) en su pantalla. Su fusible interno salta por encima de 10 A, como en un polímetro real conectado por error en paralelo con una fuente.',
      uses: 'Medir la corriente que consume un componente o un circuito.',
    },
    aboutOf: '1ugz6xq',
  },
  diode: {
    summary: 'Deja pasar la corriente en un solo sentido, del ánodo al cátodo, a partir de unos 0,65 V: rectifica la alterna y bloquea la tensión inversa.',
    of: '1nyair8',
    about: {
      how: 'Una unión semiconductora que conduce en sentido directo (ánodo a cátodo) a partir de su tensión directa, y bloquea en el otro.',
      sim: 'Una unión con la tensión directa y la corriente máxima de su referencia. Una tensión inversa por encima de su valor nominal la sobreesfuerza, y demasiada corriente en cualquier sentido la quema.',
      uses: 'Rectificar la alterna, proteger contra la polaridad inversa y absorber el pico de una bobina (diodo de libre circulación).',
    },
    aboutOf: 'mf8q8e',
  },
  schottky: {
    summary: 'Un diodo rápido con baja caída directa (unos 0,3 V), para fuentes de alimentación y protección.',
    of: '1tyyi4c',
    about: {
      how: 'Un diodo metal-semiconductor con menor tensión directa y conmutación más rápida que un diodo corriente.',
      sim: 'Como el diodo, con una tensión directa de unos 0,3 V.',
      uses: 'Rectificadores eficientes, fuentes de alimentación y protección.',
    },
    aboutOf: '53c2ay',
  },
  zener: {
    summary: 'Un diodo que, polarizado en inversa, mantiene una tensión fija: una referencia de tensión o un regulador sencillo.',
    of: '1joott3',
    about: {
      how: 'Un diodo hecho para romper a una tensión inversa precisa y mantenerla estable mientras circula corriente.',
      sim: 'En directa, un diodo corriente; en inversa, mantiene su tensión zener. Se calienta con la potencia que recibe y falla por encima de su potencia nominal.',
      uses: 'Referencias de tensión, reguladores sencillos y protección contra sobretensiones.',
    },
    aboutOf: '1otudv7',
  },
  npn: {
    summary: 'Un transistor bipolar: una pequeña corriente de base controla una corriente de colector mucho mayor, para conmutar o amplificar.',
    of: '18w1w83',
    about: {
      how: 'Un transistor bipolar: la corriente que entra en su base deja pasar una corriente de colector a emisor unas veces su ganancia mayor.',
      sim: 'El modelo de Ebers–Moll, con su ganancia y sus límites según su referencia; se calienta con la potencia que recibe. (El efecto Early no se modela.)',
      uses: 'Conmutar cargas con señales pequeñas, y amplificadores.',
    },
    aboutOf: '94k4zc',
  },
  pnp: {
    summary: 'La imagen especular del NPN: conmuta o amplifica con corriente saliendo de su base, para conmutar el lado positivo.',
    of: '17ysw06',
    about: {
      how: 'Un transistor bipolar como el NPN con todas las polaridades invertidas: la corriente que sale de su base lo activa.',
      sim: 'El modelo de Ebers–Moll, como el del NPN con todas las tensiones y corrientes invertidas.',
      uses: 'Conmutar el lado positivo de una carga (interruptores de lado alto) y etapas complementarias.',
    },
    aboutOf: '1oofm4u',
  },
  nmos: {
    summary: 'Un MOSFET que se activa con la tensión de su puerta, que no consume corriente: conmutación de cargas con pocas pérdidas.',
    of: '2zjoqj',
    about: {
      how: 'Un MOSFET de canal N: una tensión en su puerta por encima del umbral abre un canal de drenador a fuente; la puerta misma no consume corriente.',
      sim: 'Un modelo cuadrático con su tensión umbral y su resistencia en conducción con 10 V en la puerta. El canal conduce en ambos sentidos; su diodo de cuerpo no se modela.',
      uses: 'Conmutar con pocas pérdidas motores, lámparas y LED, y PWM.',
    },
    aboutOf: '11002se',
  },
  note: {
    summary: 'Una nota en el tablero para explicar un circuito; una referencia entre llaves ({R1}) sigue la norma de dibujo.',
    of: 'uguamk',
    about: {
      how: 'Una nota en el esquema para explicar qué hace un circuito.',
      sim: 'No forma parte del circuito. Una referencia entre llaves, como {R1}, aparece como la referencia de ese componente en la norma de dibujo en uso.',
      uses: 'Explicar circuitos y ejemplos.',
    },
    aboutOf: '15oxfai',
  },
  textLabel: {
    summary: 'Una línea de texto en el tablero: un título o un rótulo.',
    of: '13e1spt',
    about: {
      how: 'Una línea de texto en el esquema.',
      sim: 'No forma parte del circuito.',
      uses: 'Títulos, rótulos y etiquetas.',
    },
    aboutOf: '1t08vv',
  },
  frame: {
    summary: 'Un marco alrededor de una parte de un circuito, con título; también puede ser una envolvente que se calienta por dentro, o convertirse en módulo.',
    of: 'st108h',
    about: {
      how: 'Un marco alrededor de una parte de un circuito, para mostrar que sus componentes van juntos.',
      sim: 'No forma parte del circuito, pero arrastra lo que contiene al moverlo. Como envolvente, sus componentes comparten el aire interior, que su calor calienta y sus paredes y ventiladores enfrían. «Crear módulo» lo convierte en un bloque reutilizable.',
      uses: 'Organizar esquemas, envolventes que se calientan y crear módulos.',
    },
    aboutOf: '1ewljpg',
  },
  module: {
    summary: 'Una copia de un módulo: una parte de un circuito convertida en un bloque; haz doble clic para ver su interior.',
    of: '12f4ahi',
    about: {
      how: 'Una parte de un circuito convertida en un bloque con pines, colocado tantas veces como quieras; todas las copias son el mismo módulo.',
      sim: 'Cada copia simula su propia copia de los componentes de dentro, con sus propias lecturas y posiciones de los interruptores. Doble clic para ver el interior; «Editar módulo» cambia todas las copias.',
      uses: 'Reutilizar subcircuitos y mantener legibles los esquemas grandes.',
    },
    aboutOf: 'zsyjff',
  },
};

export default texts;
