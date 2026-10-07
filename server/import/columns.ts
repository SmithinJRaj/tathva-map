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

// Normalised alias (see normalise in venues.ts) -> place id.
export const VENUE_ALIASES: Record<string, string> = {
  oat: 'open_air_theatre',
}
