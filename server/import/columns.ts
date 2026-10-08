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
