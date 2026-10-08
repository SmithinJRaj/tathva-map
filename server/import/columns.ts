// Sheet header for each field. Replace with the real headers once the sheet is shared.
export const COLUMN_MAP: Record<'title' | 'description' | 'category' | 'venue' | 'date' | 'start' | 'end' | 'note', string> = {
  title: 'Title',
  description: 'Description',
  category: 'Category',
  venue: 'Venue',
  date: 'Date',
  start: 'Start',
  end: 'End',
  note: 'Note',
}

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
 * Confirmed by the user: SSL and NSL are in the IT Lab Complex, BDL is in the CCC.
 */
export const VENUE_ROOMS: Record<string, { placeId: string; room: string }> = {
  ssl: { placeId: 'it_lab_complex', room: 'SSL' },
  nsl: { placeId: 'it_lab_complex', room: 'NSL' },
  bdl: { placeId: 'central_computer_center', room: 'BDL' },
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
