// Hand-authored fest content, layered over the places generated from OpenStreetMap.
//
// Keys are generated place ids (see src/data/generated/campus.json, or log `places` in the
// console). A key that no longer matches a place is reported by data/campus.ts rather than
// silently dropped, so a renamed building cannot quietly lose its schedule.
//
// PLACEHOLDER schedule: replace with the real Tathva programme.

export interface PlaceFood {
  name: string
  note?: string
}

export interface PlaceContent {
  description?: string
  food?: PlaceFood[]
  amenities?: string[]
  /**
   * Extra words that should find this place, on top of any the map data already carries. For
   * what a building is *used for* during the fest, which is how people look for it — nobody
   * searching for a workshop knows it is held above the East Campus Lecture Hall Complex.
   */
  aliases?: readonly string[]
}

export const festContent: Record<string, PlaceContent> = {
  elhc: {
    // Not the workshops — those are above ECLHC, one letter away in the name and a different
    // building. ELHC runs the room-numbered competitions, 101 to 303.
    description: 'Electrical Lecture Hall Complex. Competitions run in the numbered rooms; check your room number.',
    amenities: ['Restrooms (ground floor)', 'Drinking water', 'Lift to floor 3'],
  },
  east_campus_lecture_hall_complex_eclhc: {
    description:
      'Workshops run upstairs, on the floor above the lecture halls — 9am to 12pm and 2pm to 5pm, all three days.',
    aliases: ['eclc'],
  },
  main_building: {
    description: 'Administrative heart of the institute. Registration and help desk.',
    food: [{ name: 'Tea & snacks counter', note: 'Mornings only' }],
    amenities: ['Help desk', 'Lost & found', 'First aid'],
  },
  open_air_theatre: {
    description: 'Pro-shows and the closing ceremony.',
    food: [{ name: 'Chai Point stall' }, { name: 'Shawarma cart', note: 'Evenings' }],
  },
  auditorium: {
    description: 'Main indoor stage. Keynotes and the lecture series.',
    amenities: ['Air conditioned', 'Restrooms', 'Wheelchair access'],
  },
  nlhc: {
    description: 'New Lecture Hall Complex. Talks, quizzes and paper presentations.',
    amenities: ['Restrooms', 'Drinking water'],
  },
  central_computer_center: {
    description: 'Lab machines for the coding events.',
    amenities: ['Wi-Fi', 'Restrooms'],
  },
  it_lab_complex: {
    amenities: ['Wi-Fi'],
  },
  pg_block: {
    amenities: ['Restrooms'],
  },
  mechanical_lab: {
    amenities: ['Tool access (with volunteer)'],
  },
  nit_football_ground: {
    description: 'Overflow stage and the food street.',
    food: [{ name: 'Food street', note: 'Day 1 to Day 3, from 17:00' }],
  },
  '97th_avenue_student_plaza': {
    amenities: ['Seating'],
  },
  abc_auditorium_complex: {
    amenities: ['Restrooms'],
  },
  hostel_office_nitc_hostel_main_office: {
    description: 'Accommodation desk for visiting teams.',
    amenities: ['Accommodation desk'],
  },
  bank_of_baroda_atm: {
    description: 'At the ATM / SBI circle.',
    amenities: ['ATM', '24 hours'],
  },
  sampthrupthi_mini_canteen: {
    description: 'Closest food to the east hostels.',
    food: [{ name: 'Snacks & tea', note: 'Open late' }],
  },
}

/**
 * Rooms and other points inside a building, which OpenStreetMap does not map. Each one
 * becomes a place of its own and a routing node sitting on top of its host, reached by a
 * foot-only link costing `climbMetres` — stairs are zero metres on the ground, so without
 * that a route would call them free.
 */
export interface IndoorPlace {
  id: string
  name: string
  /** Generated id of the building this sits in. */
  inside: string
  floor: number
  /** Cost of getting from the building entrance up to this room, in metres of effort. */
  climbMetres: number
  content?: PlaceContent
}

export const indoorPlaces: IndoorPlace[] = [
  {
    id: 'elhc_301',
    name: 'ELHC 301',
    inside: 'elhc',
    floor: 3,
    climbMetres: 60,
    content: {
      description: 'Third-floor workshop hall. Stairs or the lift at the north end.',
    },
  },
]

/**
 * Venues the fest names that are not places on the map. The Proshow is not a building: it is
 * a night on the football ground, and nobody looks for "NITC Football Ground" when they want
 * it. These appear in the From/To pickers and in the schedule's venue list, and they route to
 * whatever they are held on — but they are not drawn, because the ground already is.
 *
 * Add one per fest venue that has a name of its own. Delete them when the fest changes; none
 * of this is campus geography.
 */
export interface FestVenue {
  id: string
  name: string
  /** Generated id of the place it is held at. */
  at: string
  content?: PlaceContent
  /**
   * A main-stage venue: its programme is the headline running order, so it gets its own tab in
   * the event sheet. Two of them, because the afternoon informals and the night proshow are one
   * evening to an attendee even though they are two places.
   */
  stage?: true
  /**
   * Something people come looking for by name. It gets a labelled pin on the map and an accent
   * on its rows, and it is searchable in From/To. Every stage is one of these; so are the
   * flagship events, which attendees know by their own name and not by the building.
   */
  flagship?: true
  /**
   * Event titles that belong to this venue, for a venue that names an **event** rather than a
   * place. Robowars is held at the Open Air Theatre and stored as such, so without this the pin
   * saying "Robowars" would open onto "No events scheduled here" while the theatre beside it
   * held them. Matched on the start of the title, so numbered sessions and shifts come along.
   */
  titles?: readonly string[]
  /**
   * When this venue stops existing, as an ISO instant with its offset. Past it, the pin leaves
   * the map and the name leaves the From/To pickers on their own, without anyone deploying.
   *
   * For a thing that is only there for part of the fest. A hackathon's pin still saying
   * "Tathack" the next morning is worse than no pin: it is an invitation to walk somewhere for
   * something that finished.
   */
  until?: string
}

export const festVenues: FestVenue[] = [
  {
    id: 'proshow',
    name: 'Proshow',
    at: 'nit_football_ground',
    content: { description: 'Held on the NITC Football Ground.' },
    stage: true,
    flagship: true,
  },
  {
    id: 'informals_stage',
    name: 'Informals Stage',
    at: 'atm_circle',
    content: { description: 'The Informals stage, in the ATM circle.' },
    stage: true,
    flagship: true,
  },
  {
    id: 'workshops',
    name: 'Workshops',
    at: 'east_campus_lecture_hall_complex_eclhc',
    content: {
      description:
        'Upstairs at ECLHC, on the floor above the lecture halls — 9am to 12pm and 2pm to 5pm, all three days.',
    },
    flagship: true,
    titles: ['Workshops'],
  },
  {
    id: 'robowars',
    name: 'Robowars',
    at: 'open_air_theatre',
    content: { description: 'At the Open Air Theatre.' },
    flagship: true,
    titles: ['Robowars'],
  },
  {
    id: 'tathack',
    name: 'Tathack',
    at: 'it_lab_complex',
    content: { description: 'The hackathon, in the IT Lab Complex. Runs overnight.' },
    flagship: true,
    titles: ['Tathack'],
    // Packing-up time on day 2, after which there is nothing to walk to.
    until: '2026-10-10T18:00:00+05:30',
  },
]
