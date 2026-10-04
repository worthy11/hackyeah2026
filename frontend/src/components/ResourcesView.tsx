const RESOURCES = [
  {
    name: 'Świat Głuchych',
    href: 'https://swiatgluchych.pl/fundacja-swiat-gluchych/',
    image: '/resources/swiat-gluchych.jpg',
    blurb:
      'Fundacja wspierająca społeczność Głuchych — słownik PJM, wolontariat i treści z tłumaczem języka migowego.',
  },
  {
    name: 'PZG',
    href: 'https://www.pzg.org.pl/',
    image: '/resources/pzg.png',
    blurb:
      'Polski Związek Głuchych — organizacja ogólnopolska, informacje o prawach, wsparciu i działaniach lokalnych.',
  },
  {
    name: 'Migam',
    href: 'https://migam.org/',
    image: '/resources/migam.png',
    blurb:
      'Platforma wideotłumaczeń PJM — szybki kontakt z tłumaczem języka migowego online.',
  },
  {
    name: 'Migaj',
    href: 'https://migaj.eu/',
    image: '/resources/migaj.png',
    blurb:
      'Kursy i słownik polskiego języka migowego — nauka PJM w formie aplikacji.',
  },
] as const

export function ResourcesView() {
  return (
    <main className="learn-view resources-view">
      <header className="learn-header">
        <span className="eyebrow eyebrow--green">Zasoby</span>
        <h2>Przydatne strony</h2>
        <p>Miejsca warte odwiedzenia, jeśli uczysz się PJM lub szukasz wsparcia.</p>
      </header>

      <div className="resources-grid">
        {RESOURCES.map(r => (
          <a
            key={r.name}
            className="resource-tile"
            href={r.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="resource-tile__media">
              <img src={r.image} alt="" loading="lazy" />
            </span>
            <span className="resource-tile__body">
              <strong>{r.name}</strong>
              <span>{r.blurb}</span>
            </span>
          </a>
        ))}
      </div>
    </main>
  )
}
