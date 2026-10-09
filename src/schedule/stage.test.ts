import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { isStageEvent, stageDays, stagePlaceIds, stageRemaining } from './stage.ts'

const at = (title: string, placeId: string, startAt: string, endAt: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: title,
  title,
  description: null,
  category: 'cultural',
  placeId,
  room: null,
  startAt,
  endAt,
  originalStartAt: null,
  status: 'scheduled',
  note: null,
  updatedAt: '2026-10-09T00:00:00.000Z',
  updatedBy: 'whatsapp-bot',
  ...extra,
})

// IST is UTC+5:30, so these are 14:00, 16:40 and 20:30 on 9 Oct IST.
const flashmob = at('Flashmob', 'informals_stage', '2026-10-09T08:30:00.000Z', '2026-10-09T08:50:00.000Z')
const samba = at('Samba Dance', 'informals_stage', '2026-10-09T11:10:00.000Z', '2026-10-09T11:15:00.000Z')
const dj = at('DJ (Foam)', 'informals_stage', '2026-10-09T15:00:00.000Z', '2026-10-09T16:00:00.000Z')
const headline = at('Headline act', 'proshow', '2026-10-09T15:30:00.000Z', '2026-10-09T17:00:00.000Z')
const workshop = at('Soldering', 'elhc', '2026-10-09T09:00:00.000Z', '2026-10-09T10:00:00.000Z')
const dayTwo = at('Reel comp', 'informals_stage', '2026-10-10T08:55:00.000Z', '2026-10-10T09:40:00.000Z')
const yesterday = at('Opening', 'informals_stage', '2026-10-08T08:30:00.000Z', '2026-10-08T09:00:00.000Z')

const all = [dj, workshop, samba, dayTwo, flashmob, headline, yesterday]

test('both stage venues count, and nothing else does', () => {
  expect([...stagePlaceIds].sort()).toEqual(['informals_stage', 'proshow'])
  expect(isStageEvent(flashmob)).toBe(true)
  expect(isStageEvent(headline)).toBe(true)
  expect(isStageEvent(workshop)).toBe(false)
})

test('the order is by day then start time, with the two stages interleaved', () => {
  const days = stageDays(all, new Date('2026-10-09T08:00:00.000Z'))
  expect(days.map((d) => d.dateKey)).toEqual(['2026-10-09', '2026-10-10'])
  expect(days[0].events.map((e) => e.title)).toEqual(['Flashmob', 'Samba Dance', 'DJ (Foam)', 'Headline act'])
  expect(days[1].events.map((e) => e.title)).toEqual(['Reel comp'])
})

test("acts that have finished today stay in the order; yesterday's day is gone", () => {
  // 18:00 IST: the flashmob and the samba are over, the DJ has not started.
  const days = stageDays(all, new Date('2026-10-09T12:30:00.000Z'))
  expect(days[0].events.map((e) => e.title)).toContain('Flashmob')
  expect(days.map((d) => d.dateKey)).not.toContain('2026-10-08')
})

test('the count is what is still to come, not what is listed', () => {
  const now = new Date('2026-10-09T12:30:00.000Z')
  const days = stageDays(all, now)
  expect(days.flatMap((d) => d.events)).toHaveLength(5)
  expect(stageRemaining(days, now)).toBe(3)
})

test('a cancelled act stays in the order rather than leaving a gap', () => {
  const off = at('Kids Show', 'informals_stage', '2026-10-09T11:40:00.000Z', '2026-10-09T12:00:00.000Z', {
    status: 'cancelled',
  })
  const days = stageDays([flashmob, off, dj], new Date('2026-10-09T08:00:00.000Z'))
  expect(days[0].events.map((e) => e.title)).toEqual(['Flashmob', 'Kids Show', 'DJ (Foam)'])
})

test('no stage events is an empty list, not a day with nothing in it', () => {
  expect(stageDays([workshop], new Date('2026-10-09T08:00:00.000Z'))).toEqual([])
  expect(stageRemaining([], new Date())).toBe(0)
})
