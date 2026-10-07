// Hand-authored fest content, layered over the places generated from OpenStreetMap.
//
// Keys are generated place ids (see src/data/generated/campus.json, or log `places` in the
// console). A key that no longer matches a place is reported by data/campus.ts rather than
// silently dropped, so a renamed building cannot quietly lose its schedule.
//
// PLACEHOLDER schedule: replace with the real Tathva programme.

export interface PlaceEvent {
  title: string
  time: string
  note?: string
}

export interface PlaceFood {
  name: string
  note?: string
}

export interface PlaceContent {
  description?: string
  events?: PlaceEvent[]
  food?: PlaceFood[]
  amenities?: string[]
}

export const festContent: Record<string, PlaceContent> = {
  elhc: {
    description: 'Electrical Lecture Hall Complex. Most Tathva workshops run here.',
    events: [
      { title: 'Intro to Embedded Rust', time: 'Day 1, 10:00', note: 'ELHC 301, bring a laptop' },
      { title: 'PCB Design Workshop', time: 'Day 2, 14:00' },
    ],
    amenities: ['Restrooms (ground floor)', 'Drinking water', 'Lift to floor 3'],
  },
  main_building: {
    description: 'Administrative heart of the institute. Registration and help desk.',
    events: [{ title: 'Registration & Kit Pickup', time: 'Day 1, 08:30 to 12:00' }],
    food: [{ name: 'Tea & snacks counter', note: 'Mornings only' }],
    amenities: ['Help desk', 'Lost & found', 'First aid'],
  },
  open_air_theatre: {
    description: 'Pro-shows and the closing ceremony.',
    events: [
      { title: 'Opening Ceremony', time: 'Day 1, 17:30' },
      { title: 'Pro-show Night', time: 'Day 3, 19:00', note: 'Entry with fest band only' },
    ],
    food: [{ name: 'Chai Point stall' }, { name: 'Shawarma cart', note: 'Evenings' }],
  },
  auditorium: {
    description: 'Main indoor stage. Keynotes and the lecture series.',
    events: [
      { title: 'Opening Keynote', time: 'Day 1, 14:00' },
      { title: 'Panel: Build in Public', time: 'Day 2, 16:00' },
    ],
    amenities: ['Air conditioned', 'Restrooms', 'Wheelchair access'],
  },
  nlhc: {
    description: 'New Lecture Hall Complex. Talks, quizzes and paper presentations.',
    events: [{ title: 'Tech Quiz Prelims', time: 'Day 2, 09:30' }],
    amenities: ['Restrooms', 'Drinking water'],
  },
  central_computer_center: {
    description: 'Lab machines for the coding events.',
    events: [{ title: 'Competitive Programming Finals', time: 'Day 3, 10:00' }],
    amenities: ['Wi-Fi', 'Restrooms'],
  },
  it_lab_complex: {
    events: [{ title: 'CTF Qualifiers', time: 'Day 1, 15:00' }],
    amenities: ['Wi-Fi'],
  },
  pg_block: {
    events: [{ title: 'Project Expo', time: 'Day 2, 11:00 to 17:00' }],
    amenities: ['Restrooms'],
  },
  mechanical_lab: {
    events: [{ title: 'Robowars Pit', time: 'Day 2 to Day 3, all day' }],
    amenities: ['Tool access (with volunteer)'],
  },
  green_amphitheatre: {
    events: [{ title: 'Open Mic', time: 'Day 1, 19:00' }],
  },
  nit_ground: {
    events: [{ title: 'Volleyball Finals', time: 'Day 3, 16:00' }],
  },
  nit_football_ground: {
    description: 'Overflow stage and the food street.',
    events: [
      { title: 'Battle of Bands', time: 'Day 2, 18:00' },
      { title: 'Drone Show', time: 'Day 3, 20:30' },
    ],
    food: [{ name: 'Food street', note: 'Day 1 to Day 3, from 17:00' }],
  },
  creative_zone: {
    events: [{ title: 'Street Art Jam', time: 'Day 2, 13:00' }],
  },
  '97th_avenue_student_plaza': {
    events: [{ title: 'Late Night DJ', time: 'Day 2, 22:00' }],
    amenities: ['Seating'],
  },
  center_for_career_development: {
    events: [{ title: 'Recruiter Meet & Greet', time: 'Day 3, 11:00' }],
  },
  abc_auditorium_complex: {
    events: [{ title: 'Short Film Screening', time: 'Day 2, 20:00' }],
    amenities: ['Restrooms'],
  },
  department_of_architecture_and_plannning: {
    events: [{ title: 'Design Charrette', time: 'Day 2, 10:00' }],
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
      events: [{ title: 'Intro to Embedded Rust', time: 'Day 1, 10:00' }],
    },
  },
]
