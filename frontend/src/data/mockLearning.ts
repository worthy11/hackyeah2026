import type { IconName } from '../components/Icon'

export type Category = {
  id: number
  name: string
  description: string
  icon: IconName
}

/** Distinct accent per category (fg + soft bg). Indexed by category id. */
export const CATEGORY_COLORS: Record<number, { fg: string; bg: string }> = {
  1:  { fg: '#1e7d5e', bg: '#e5f3ed' }, // Zwroty grzecznościowe — green
  2:  { fg: '#c45c26', bg: '#f8ebe3' }, // Rodzina — terracotta
  3:  { fg: '#2a6f97', bg: '#e6f0f6' }, // Wygląd — blue
  4:  { fg: '#b23a48', bg: '#f6e6e8' }, // Emocje — rose
  5:  { fg: '#3d5a80', bg: '#e8edf3' }, // Kierunki — slate blue
  6:  { fg: '#b68519', bg: '#f7f0de' }, // Jedzenie — gold
  7:  { fg: '#5c6b4a', bg: '#eef1e8' }, // Alfabet — olive
  8:  { fg: '#0d7377', bg: '#e3f2f2' }, // Czas — teal
  9:  { fg: '#8a5a44', bg: '#f2ebe7' }, // Dom — brown
  10: { fg: '#d97706', bg: '#fef3e2' }, // Kolory — amber
  11: { fg: '#475569', bg: '#eceff3' }, // Liczby — gray
  12: { fg: '#0284c7', bg: '#e0f2fe' }, // Pogoda — sky
  13: { fg: '#be185d', bg: '#fce7f0' }, // Zakupy — pink
  14: { fg: '#4f46e5', bg: '#e8e7fa' }, // Szkoła — indigo
  15: { fg: '#15803d', bg: '#e5f5ea' }, // Zdrowie — forest
}

export function categoryColor(id: number): { fg: string; bg: string } {
  return CATEGORY_COLORS[id] ?? { fg: '#1e7d5e', bg: '#e8f0ec' }
}

export type Gesture = {
  id: number
  categoryId: number
  gloss: string          // sign label in caps, e.g. "CZEŚĆ"
  videoPath: string | null
}

export type Phrase = {
  id: number
  categoryId: number
  translation: string    // Polish plaintext
  gestureIds: number[]   // ordered sequence
}

export const categories: Category[] = [
  { id:  1, name: 'Zwroty grzecznościowe', description: 'Powitania, podziękowania i uprzejmości', icon: 'hand' },
  { id:  2, name: 'Rodzina',              description: 'Członkowie rodziny',                icon: 'people'     },
  { id:  3, name: 'Wygląd',              description: 'Opis wyglądu i cech fizycznych',    icon: 'eye'        },
  { id:  4, name: 'Emocje',              description: 'Wyrażanie uczuć i nastrojów',       icon: 'heart'      },
  { id:  5, name: 'Kierunki i transport', description: 'Nawigacja i środki transportu',    icon: 'map'        },
  { id:  6, name: 'Jedzenie',            description: 'Produkty i posiłki',                icon: 'food'       },
  { id:  7, name: 'Alfabet',             description: 'Wszystkie litery polskiego alfabetu', icon: 'vocabulary' },
  { id:  8, name: 'Czas',               description: 'Dni, godziny, pory dnia i roku',    icon: 'clock'      },
  { id:  9, name: 'Dom i mieszkanie',    description: 'Pomieszczenia, meble, codzienność', icon: 'home'       },
  { id: 10, name: 'Kolory',             description: 'Nazwy kolorów',                      icon: 'palette'    },
  { id: 11, name: 'Liczby',             description: 'Cyfry i liczby',                     icon: 'hash'       },
  { id: 12, name: 'Pogoda',             description: 'Warunki atmosferyczne i pory roku',  icon: 'cloud'      },
  { id: 13, name: 'Zakupy',             description: 'Sklep, ceny, produkty',              icon: 'bag'        },
  { id: 14, name: 'Szkoła i praca',     description: 'Edukacja i środowisko pracy',       icon: 'book'       },
  { id: 15, name: 'Zdrowie',            description: 'Samopoczucie, ciało, lekarz',        icon: 'health'     },
]

export const gestures: Gesture[] = [
  // Zwroty grzecznościowe (1)
  { id: 101, categoryId: 1, gloss: 'CZEŚĆ',       videoPath: null },
  { id: 102, categoryId: 1, gloss: 'DZIEŃ DOBRY', videoPath: null },
  { id: 103, categoryId: 1, gloss: 'DO WIDZENIA', videoPath: null },
  { id: 104, categoryId: 1, gloss: 'DZIĘKUJĘ',    videoPath: null },
  { id: 105, categoryId: 1, gloss: 'PROSZĘ',      videoPath: null },
  { id: 106, categoryId: 1, gloss: 'PRZEPRASZAM', videoPath: null },

  // Rodzina (2)
  { id: 201, categoryId: 2, gloss: 'MAMA',     videoPath: null },
  { id: 202, categoryId: 2, gloss: 'TATA',     videoPath: null },
  { id: 203, categoryId: 2, gloss: 'SIOSTRA',  videoPath: null },
  { id: 204, categoryId: 2, gloss: 'BRAT',     videoPath: null },
  { id: 205, categoryId: 2, gloss: 'BABCIA',   videoPath: null },
  { id: 206, categoryId: 2, gloss: 'DZIADEK',  videoPath: null },

  // Wygląd (3)
  { id: 301, categoryId: 3, gloss: 'WYSOKI',    videoPath: null },
  { id: 302, categoryId: 3, gloss: 'NISKI',     videoPath: null },
  { id: 303, categoryId: 3, gloss: 'WŁOSY',     videoPath: null },
  { id: 304, categoryId: 3, gloss: 'OCZY',      videoPath: null },
  { id: 305, categoryId: 3, gloss: 'BLONDYN',   videoPath: null },
  { id: 306, categoryId: 3, gloss: 'BRUNET',    videoPath: null },

  // Emocje (4)
  { id: 401, categoryId: 4, gloss: 'RADOŚĆ',    videoPath: null },
  { id: 402, categoryId: 4, gloss: 'SMUTEK',    videoPath: null },
  { id: 403, categoryId: 4, gloss: 'ZŁOŚĆ',     videoPath: null },
  { id: 404, categoryId: 4, gloss: 'STRACH',    videoPath: null },
  { id: 405, categoryId: 4, gloss: 'ZASKOCZENIE', videoPath: null },
  { id: 406, categoryId: 4, gloss: 'MIŁOŚĆ',    videoPath: null },

  // Kierunki i transport (5)
  { id: 501, categoryId: 5, gloss: 'LEWO',      videoPath: null },
  { id: 502, categoryId: 5, gloss: 'PRAWO',     videoPath: null },
  { id: 503, categoryId: 5, gloss: 'PROSTO',    videoPath: null },
  { id: 504, categoryId: 5, gloss: 'AUTOBUS',   videoPath: null },
  { id: 505, categoryId: 5, gloss: 'POCIĄG',    videoPath: null },
  { id: 506, categoryId: 5, gloss: 'SAMOCHÓD',  videoPath: null },

  // Jedzenie (6)
  { id: 601, categoryId: 6, gloss: 'CHLEB',    videoPath: null },
  { id: 602, categoryId: 6, gloss: 'WODA',     videoPath: null },
  { id: 603, categoryId: 6, gloss: 'JABŁKO',   videoPath: null },
  { id: 604, categoryId: 6, gloss: 'MLEKO',    videoPath: null },
  { id: 605, categoryId: 6, gloss: 'KAWA',     videoPath: null },
  { id: 606, categoryId: 6, gloss: 'HERBATA',  videoPath: null },

  // Czas (8)
  { id: 801, categoryId: 8, gloss: 'DZIŚ',        videoPath: null },
  { id: 802, categoryId: 8, gloss: 'JUTRO',       videoPath: null },
  { id: 803, categoryId: 8, gloss: 'WCZORAJ',     videoPath: null },
  { id: 804, categoryId: 8, gloss: 'TERAZ',       videoPath: null },
  { id: 805, categoryId: 8, gloss: 'RANO',        videoPath: null },
  { id: 806, categoryId: 8, gloss: 'WIECZÓR',     videoPath: null },
  { id: 807, categoryId: 8, gloss: 'TYDZIEŃ',     videoPath: null },
  { id: 808, categoryId: 8, gloss: 'MIESIĄC',     videoPath: null },
  { id: 809, categoryId: 8, gloss: 'ROK',         videoPath: null },

  // Dom i mieszkanie (9)
  { id: 901, categoryId: 9, gloss: 'DOM',         videoPath: null },
  { id: 902, categoryId: 9, gloss: 'POKÓJ',       videoPath: null },
  { id: 903, categoryId: 9, gloss: 'KUCHNIA',     videoPath: null },
  { id: 904, categoryId: 9, gloss: 'ŁAZIENKA',    videoPath: null },
  { id: 905, categoryId: 9, gloss: 'STÓŁ',        videoPath: null },
  { id: 906, categoryId: 9, gloss: 'KRZESŁO',     videoPath: null },
  { id: 907, categoryId: 9, gloss: 'ŁÓŻKO',       videoPath: null },
  { id: 908, categoryId: 9, gloss: 'OKNO',        videoPath: null },

  // Kolory (10)
  { id: 1001, categoryId: 10, gloss: 'CZERWONY',  videoPath: null },
  { id: 1002, categoryId: 10, gloss: 'NIEBIESKI', videoPath: null },
  { id: 1003, categoryId: 10, gloss: 'ZIELONY',   videoPath: null },
  { id: 1004, categoryId: 10, gloss: 'ŻÓŁTY',     videoPath: null },
  { id: 1005, categoryId: 10, gloss: 'CZARNY',    videoPath: null },
  { id: 1006, categoryId: 10, gloss: 'BIAŁY',     videoPath: null },
  { id: 1007, categoryId: 10, gloss: 'RÓŻOWY',    videoPath: null },
  { id: 1008, categoryId: 10, gloss: 'BRĄZOWY',   videoPath: null },

  // Liczby (11)
  { id: 1101, categoryId: 11, gloss: 'JEDEN',     videoPath: null },
  { id: 1102, categoryId: 11, gloss: 'DWA',       videoPath: null },
  { id: 1103, categoryId: 11, gloss: 'TRZY',      videoPath: null },
  { id: 1104, categoryId: 11, gloss: 'CZTERY',    videoPath: null },
  { id: 1105, categoryId: 11, gloss: 'PIĘĆ',      videoPath: null },
  { id: 1106, categoryId: 11, gloss: 'SZEŚĆ',     videoPath: null },
  { id: 1107, categoryId: 11, gloss: 'SIEDEM',    videoPath: null },
  { id: 1108, categoryId: 11, gloss: 'OSIEM',     videoPath: null },
  { id: 1109, categoryId: 11, gloss: 'DZIEWIĘĆ',  videoPath: null },
  { id: 1110, categoryId: 11, gloss: 'DZIESIĘĆ',  videoPath: null },

  // Pogoda (12)
  { id: 1201, categoryId: 12, gloss: 'SŁOŃCE',    videoPath: null },
  { id: 1202, categoryId: 12, gloss: 'DESZCZ',    videoPath: null },
  { id: 1203, categoryId: 12, gloss: 'ŚNIEG',     videoPath: null },
  { id: 1204, categoryId: 12, gloss: 'WIATR',     videoPath: null },
  { id: 1205, categoryId: 12, gloss: 'CIEPŁO',    videoPath: null },
  { id: 1206, categoryId: 12, gloss: 'ZIMNO',     videoPath: null },
  { id: 1207, categoryId: 12, gloss: 'LATO',      videoPath: null },
  { id: 1208, categoryId: 12, gloss: 'ZIMA',      videoPath: null },

  // Zakupy (13)
  { id: 1301, categoryId: 13, gloss: 'SKLEP',     videoPath: null },
  { id: 1302, categoryId: 13, gloss: 'CENA',      videoPath: null },
  { id: 1303, categoryId: 13, gloss: 'DROGI',     videoPath: null },
  { id: 1304, categoryId: 13, gloss: 'TANI',      videoPath: null },
  { id: 1305, categoryId: 13, gloss: 'KUPIĆ',     videoPath: null },
  { id: 1306, categoryId: 13, gloss: 'PŁACIĆ',    videoPath: null },

  // Szkoła i praca (14)
  { id: 1401, categoryId: 14, gloss: 'SZKOŁA',    videoPath: null },
  { id: 1402, categoryId: 14, gloss: 'PRACA',     videoPath: null },
  { id: 1403, categoryId: 14, gloss: 'UCZYĆ SIĘ', videoPath: null },
  { id: 1404, categoryId: 14, gloss: 'NAUCZYCIEL', videoPath: null },
  { id: 1405, categoryId: 14, gloss: 'KSIĄŻKA',   videoPath: null },
  { id: 1406, categoryId: 14, gloss: 'KOMPUTER',  videoPath: null },

  // Zdrowie (15)
  { id: 1501, categoryId: 15, gloss: 'LEKARZ',    videoPath: null },
  { id: 1502, categoryId: 15, gloss: 'SZPITAL',   videoPath: null },
  { id: 1503, categoryId: 15, gloss: 'BÓL',       videoPath: null },
  { id: 1504, categoryId: 15, gloss: 'ZDROWY',    videoPath: null },
  { id: 1505, categoryId: 15, gloss: 'CHORY',     videoPath: null },
  { id: 1506, categoryId: 15, gloss: 'LEKARSTWO', videoPath: null },

  // Alfabet (7)
  { id: 701, categoryId: 7, gloss: 'A',  videoPath: null },
  { id: 702, categoryId: 7, gloss: 'Ą',  videoPath: null },
  { id: 703, categoryId: 7, gloss: 'B',  videoPath: null },
  { id: 704, categoryId: 7, gloss: 'C',  videoPath: null },
  { id: 705, categoryId: 7, gloss: 'Ć',  videoPath: null },
  { id: 706, categoryId: 7, gloss: 'D',  videoPath: null },
  { id: 707, categoryId: 7, gloss: 'E',  videoPath: null },
  { id: 708, categoryId: 7, gloss: 'Ę',  videoPath: null },
  { id: 709, categoryId: 7, gloss: 'F',  videoPath: null },
  { id: 710, categoryId: 7, gloss: 'G',  videoPath: null },
  { id: 711, categoryId: 7, gloss: 'H',  videoPath: null },
  { id: 712, categoryId: 7, gloss: 'I',  videoPath: null },
  { id: 713, categoryId: 7, gloss: 'J',  videoPath: null },
  { id: 714, categoryId: 7, gloss: 'K',  videoPath: null },
  { id: 715, categoryId: 7, gloss: 'L',  videoPath: null },
  { id: 716, categoryId: 7, gloss: 'Ł',  videoPath: null },
  { id: 717, categoryId: 7, gloss: 'M',  videoPath: null },
  { id: 718, categoryId: 7, gloss: 'N',  videoPath: null },
  { id: 719, categoryId: 7, gloss: 'Ń',  videoPath: null },
  { id: 720, categoryId: 7, gloss: 'O',  videoPath: null },
  { id: 721, categoryId: 7, gloss: 'Ó',  videoPath: null },
  { id: 722, categoryId: 7, gloss: 'P',  videoPath: null },
  { id: 723, categoryId: 7, gloss: 'R',  videoPath: null },
  { id: 724, categoryId: 7, gloss: 'S',  videoPath: null },
  { id: 725, categoryId: 7, gloss: 'Ś',  videoPath: null },
  { id: 726, categoryId: 7, gloss: 'T',  videoPath: null },
  { id: 727, categoryId: 7, gloss: 'U',  videoPath: null },
  { id: 728, categoryId: 7, gloss: 'W',  videoPath: null },
  { id: 729, categoryId: 7, gloss: 'Y',  videoPath: null },
  { id: 730, categoryId: 7, gloss: 'Z',  videoPath: null },
  { id: 731, categoryId: 7, gloss: 'Ź',  videoPath: null },
  { id: 732, categoryId: 7, gloss: 'Ż',  videoPath: null },
]

export const phrases: Phrase[] = [
  // Zwroty grzecznościowe (1)
  { id: 1001, categoryId: 1, translation: 'Hej, co słychać?',              gestureIds: [101, 101] },
  { id: 1002, categoryId: 1, translation: 'Dzień dobry, dziękuję bardzo.', gestureIds: [102, 104] },
  { id: 1003, categoryId: 1, translation: 'Przepraszam, muszę już iść.',   gestureIds: [106, 103] },
  { id: 1004, categoryId: 1, translation: 'Czuję się dobrze, a Ty?',       gestureIds: [101] },

  // Rodzina (2)
  { id: 2001, categoryId: 2, translation: 'To moja mama.',                 gestureIds: [201] },
  { id: 2002, categoryId: 2, translation: 'Mam starszą siostrę i brata.',  gestureIds: [203, 204] },
  { id: 2003, categoryId: 2, translation: 'Babcia i dziadek mieszkają razem.', gestureIds: [205, 206] },

  // Wygląd (3)
  { id: 3001, categoryId: 3, translation: 'Jest wysoki i ma blond włosy.', gestureIds: [301, 305, 303] },
  { id: 3002, categoryId: 3, translation: 'Ma piękne ciemne oczy.',        gestureIds: [304] },

  // Emocje (4)
  { id: 4001, categoryId: 4, translation: 'Jestem szczęśliwy i zakochany.', gestureIds: [401, 406] },
  { id: 4002, categoryId: 4, translation: 'Wow, tego się nie spodziewałem!', gestureIds: [405] },
  { id: 4003, categoryId: 4, translation: 'Smutno mi i trochę się boję.',  gestureIds: [402, 404] },

  // Kierunki (5)
  { id: 5001, categoryId: 5, translation: 'Skręć w lewo, a potem w prawo.', gestureIds: [501, 502] },
  { id: 5002, categoryId: 5, translation: 'Jedź prosto, wsiądź w autobus.', gestureIds: [503, 504] },

  // Jedzenie (6)
  { id: 6001, categoryId: 6, translation: 'Poproszę chleb i wodę.',        gestureIds: [601, 602] },
  { id: 6002, categoryId: 6, translation: 'Napiję się kawy albo herbaty.', gestureIds: [605, 606] },
  { id: 6003, categoryId: 6, translation: 'Wezmę jabłko i mleko.',         gestureIds: [603, 604] },
]

// helpers
export const gestureMap = Object.fromEntries(gestures.map(g => [g.id, g]))
