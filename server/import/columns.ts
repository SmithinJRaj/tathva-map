/**
 * Header names accepted for each field, lowercased, first match wins.
 *
 * Two vocabularies, because the real events sheet does not use the canonical one: it says
 * "Event" for the title and keeps start and end together in one "Time" column. Both are
 * listed rather than renaming the sheet, so an export and a hand-written CSV both import.
 *
 * Absent on purpose: the sheet's "what's happening" and "map" are yes/no flags rather than
 * prose, so neither is a Description; and "Point of Contact" holds volunteers' names and
 * phone numbers, which the user asked to drop and which would otherwise be published in a
 * venue popup.
 */
export const COLUMN_MAP = {
  title: ['title', 'event'],
  description: ['description'],
  category: ['category'],
  venue: ['venue'],
  date: ['date'],
  start: ['start'],
  end: ['end'],
  /** The sheet's single column holding a whole range; see times.ts. */
  time: ['time'],
  note: ['note'],
} as const satisfies Record<string, readonly string[]>

export type ColumnField = keyof typeof COLUMN_MAP

/**
 * Normalised alias (see normalise in venues.ts) -> place id. Lowercase, single-spaced.
 *
 * This is the campus shorthand volunteers actually type, in the sheet and in the WhatsApp
 * group the dispatch bridge parses. It belongs here rather than in anyone's prompt: this
 * matcher is deterministic, and one list serves the importer and the bridge alike.
 *
 * Names the matcher already resolves on their own (ELHC, NLHC, CSED, hostel letters) are not
 * repeated here. Deliberately absent: a bare "ground" — see the note below.
 */
export const VENUE_ALIASES: Record<string, string> = {
  oat: 'open_air_theatre',
  audi: 'auditorium',
  auditorium: 'auditorium',
  eclhc: 'east_campus_lecture_hall_complex_eclhc',
  'east campus': 'east_campus_lecture_hall_complex_eclhc',
  mb: 'main_building',
  me: 'mechanical_lab',
  mech: 'mechanical_lab',
  'mech lab': 'mechanical_lab',
  tbi: 'technology_business_incubator',
  ccc: 'central_computer_center',
  'computer centre': 'central_computer_center',
  gymkhana: 'nit_calicut_gymkhana',
  abc: 'abc_auditorium_complex',
  eclc: 'east_campus_lecture_hall_complex_eclhc',
  'volley ball ground': 'volleyball_court',
  'volleyball ground': 'volleyball_court',
  // Word order and the id's own "plannning" typo keep these from matching by name.
  'architecture department': 'department_of_architecture_and_plannning',
  'architecture dept': 'department_of_architecture_and_plannning',
  'architechture dept': 'department_of_architecture_and_plannning',
  // Fourth and fifth spellings, from the Adizya schedule images.
  dap: 'department_of_architecture_and_plannning',
  'dap nitc': 'department_of_architecture_and_plannning',
  // OSM carries this one itself, as name:en.
  msed: 'material_science_engineering_department',
  /*
   * S.M is Strength of Materials, and a strength-of-materials lab is what "material testing
   * lab" means in a civil-engineering context. Two independent lines agree: the user's
   * coordinate for it (art px 1464,627) touches the S.M Lab outline — 0 m to its edge, where
   * centroid distance had made it look like a four-way coin flip — and the art shows no
   * unnamed building there, so it is an existing shed under another name rather than a place
   * the map is missing.
   *
   * The residual doubt is one shed over: T.E Lab's edge is 5 m away. If anyone reports being
   * sent to the wrong one, that is the fix, not a new place.
   */
  'material testing lab': 's_m_lab',
  // Which of the three halls is unknown, and they share one entrance, so the building is the
  // honest answer rather than a guess at a room.
  amphi: 'green_amphitheatre',
  // The same patch of ground under another local name: the user's coordinate for it lands
  // 4 m from the Volleyball Court, with nothing else within 69 m. It is a multi-use ground,
  // which is also why OSM calls the shape "NIT ground".
  'kho kho ground': 'volleyball_court',
  'kho kho': 'volleyball_court',
  'archi dept': 'department_of_architecture_and_plannning',
  'abc hall': 'abc_auditorium_complex',
  /*
   * A fest-week name for the ABC complex, not a place on any map: no name in the campus data
   * matched it under any spelling, which is why it was asked rather than guessed. The user
   * confirmed it means the whole complex, so the stalls written "dhwani" and "near dhwani"
   * both pin the building — the locative strip reduces the second one once this is known.
   */
  dhwani: 'abc_auditorium_complex',
  aryabatta: 'aryabhatta_park',
  aryabhatta: 'aryabhatta_park',
  'football ground': 'nit_football_ground',
  'volleyball court': 'volleyball_court',
  'basketball court': 'basketball_court',
  proshow: 'proshow',
}

/**
 * "Ground" is left unresolvable on purpose. Three places answer to it — the football ground,
 * the Football Court and the Volleyball Court — and guessing between them puts people at the
 * wrong end of campus. An unknown venue is a loud import error; a wrong one is silent.
 */
export const AMBIGUOUS_VENUES: readonly string[] = ['ground', 'court', 'lab', 'block']

/**
 * Venue text that names a room rather than a place. An alias cannot express these: it maps a
 * whole string to a place and drops the part that says *which* room, which is the only part
 * that tells someone where to go once they are in the building.
 *
 * Confirmed by the user: SSL and NSL are in the IT Lab Complex, BDL is in the CCC, and
 * Aryabhatta, Bhaskara and Chanakya are three halls inside one building — the one OSM
 * named "Aryabhatta Park". The user's own words: people "just enter the building" and find
 * the hall, so the hall is a room, and `aryabatta` on its own routes to the building with no
 * room because the building is where you would walk to anyway.
 */
export const VENUE_ROOMS: Record<string, { placeId: string; room: string | null }> = {
  ssl: { placeId: 'it_lab_complex', room: 'SSL' },
  nsl: { placeId: 'it_lab_complex', room: 'NSL' },
  bdl: { placeId: 'central_computer_center', room: 'BDL' },
  'aryabhatta hall': { placeId: 'aryabhatta_park', room: 'Aryabhatta Hall' },
  'aryabatta hall': { placeId: 'aryabhatta_park', room: 'Aryabhatta Hall' },
  'bhaskara hall': { placeId: 'aryabhatta_park', room: 'Bhaskara Hall' },
  'chanakya hall': { placeId: 'aryabhatta_park', room: 'Chanakya Hall' },

  // Venues naming more than one place, which the conjunction guard refuses by default
  // because guessing between them is how someone ends up in the wrong building. Each of
  // these was put to the user and confirmed, so they are knowledge rather than a guess.
  'elhc 301 electronics lab': { placeId: 'elhc', room: '301' },
  // "CAMPUS" means the event roams; ELHC 203 is the only part of it that can be pinned.
  'campus elhc 203': { placeId: 'elhc', room: '203' },
  // Two of the three labs are in the IT Lab Complex, so that is where to send people.
  'ssl nsl and bdl': { placeId: 'it_lab_complex', room: null },
  'ssl nsl': { placeId: 'it_lab_complex', room: null },
}

/**
 * The sheet groups rows under section headers ("EXPO:", "Informals:") instead of carrying a
 * Category column. Settled with the user; PC is the Program Committee and GPC the Gaming
 * Program Committee, whose go-kart and paintball read as attractions rather than contests.
 */
export const SECTION_CATEGORIES: Record<string, string> = {
  expo: 'other',
  'tech conclave': 'talk',
  informals: 'cultural',
  wheels: 'other',
  pc: 'competition',
  lecture: 'talk',
  gpc: 'other',
  tedex: 'talk',
  proshow: 'proshow',
}
