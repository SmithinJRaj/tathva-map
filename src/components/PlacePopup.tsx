import type { ReactNode } from 'react'
import type { Place } from '../data/campus'

interface Props {
  place: Place
  onRouteTo: (placeId: string) => void
}

export function PlacePopup({ place, onRouteTo }: Props) {
  const { id, name, category, floor, description, events, food, amenities, nodeId } = place
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

      <Section title="Events" empty="No events scheduled here.">
        {events.map((e) => (
          <li key={`${e.title}-${e.time}`}>
            <span className="retro-item-main">{e.title}</span>
            <span className="retro-item-sub">
              {e.time}
              {e.note && ` · ${e.note}`}
            </span>
          </li>
        ))}
      </Section>

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
