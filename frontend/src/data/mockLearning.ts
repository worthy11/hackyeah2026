import type { IconName } from '../components/Icon'

export type Category = {
  id: number
  name: string
  description: string
  icon: IconName
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
  { id: 1, name: 'Powitania',            description: 'Przywitanie i small talk',       icon: 'hand'       },
  { id: 2, name: 'Rodzina',              description: 'Członkowie rodziny',              icon: 'people'     },
  { id: 3, name: 'Wygląd',              description: 'Opis wyglądu i cech fizycznych',  icon: 'eye'        },
  { id: 4, name: 'Emocje',              description: 'Wyrażanie uczuć i nastrojów',     icon: 'heart'      },
  { id: 5, name: 'Kierunki i transport', description: 'Nawigacja i środki transportu',  icon: 'map'        },
  { id: 6, name: 'Jedzenie',            description: 'Produkty i posiłki',              icon: 'food'       },
  { id: 7, name: 'Alfabet',             description: 'Wszystkie litery polskiego alfabetu', icon: 'vocabulary' },
]

export const gestures: Gesture[] = [
  // Powitania (1)
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
  // Powitania (1)
  { id: 1001, categoryId: 1, translation: 'Hej, co słychać?',              gestureIds: [101, 101] },
  { id: 1002, categoryId: 1, translation: 'Dzień dobry, dziękuję bardzo.', gestureIds: [102, 104] },
  { id: 1003, categoryId: 1, translation: 'Przepraszam, muszę już iść.',   gestureIds: [106, 103] },

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
