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
}

export const festContent: Record<string, PlaceContent> = {
  elhc: {
    description: 'Electrical Lecture Hall Complex. Most Tathva workshops run here.',
    amenities: ['Restrooms (ground floor)', 'Drinking water', 'Lift to floor 3'],
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
