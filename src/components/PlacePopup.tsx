import type { ReactNode } from 'react'
import type { Place } from '../data/campus'
import { useScheduleData } from '../schedule/ScheduleContext'
import { venueSections } from '../schedule/venueSections'
import { EventRow } from './EventRow'

interface Props {
  place: Place
  onRouteTo: (placeId: string) => void
}

export function PlacePopup({ place, onRouteTo }: Props) {
  const { id, name, category, floor, description, food, amenities, nodeId } = place
  const { byPlace, now } = useScheduleData()
  const sections = venueSections(byPlace.get(id) ?? [], now)
  return (
    <div className="retro-popup-body">
      <header className="retro-head">
        <h2 className="retro-title">{name}</h2>
        <span className="retro-badge" data-category={category}>
          {category}
        </span>
      </header>
      {floor > 0 && <p className="retro-desc">Floor {floor}</p>}
      {description && <p className="retro-desc">{description}</p>}

      {nodeId && (
        <button type="button" className="retro-route-btn" onClick={() => onRouteTo(id)}>
          Route here
        </button>
      )}

      {sections.length > 0 ? (
        sections.map((section) => (
          <section key={section.title} className="retro-section">
            <h3 className="retro-section-title">{section.title}</h3>
            <ul className="retro-list retro-events">
              {section.events.map((e) => (
                <li key={e.id}>
                  <EventRow event={e} now={now} showVenue={false} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <section className="retro-section">
          <h3 className="retro-section-title">Events</h3>
          <p className="retro-empty">No events scheduled here.</p>
        </section>
      )}

      <Section title="Food" empty="No food stalls here.">
        {food.map((f) => (
          <li key={f.name}>
            <span className="retro-item-main">{f.name}</span>
            {f.note && <span className="retro-item-sub">{f.note}</span>}
          </li>
        ))}
      </Section>

      <Section title="Amenities" empty="No amenities listed.">
        {amenities.map((a) => (
          <li key={a}>
            <span className="retro-item-main">{a}</span>
          </li>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="retro-section">
      <h3 className="retro-section-title">{title}</h3>
      {children.length > 0 ? <ul className="retro-list">{children}</ul> : <p className="retro-empty">{empty}</p>}
    </section>
  )
}
