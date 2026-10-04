const RESOURCES = [
  {
    name: 'KSPJM',
    href: 'https://www.slownikpjm.uw.edu.pl/',
    image: null as string | null,
    blurb:
      'Korpusowy Słownik Polskiego Języka Migowego (UW). Wyszukiwanie znaków PJM według kształtu dłoni, lokalizacji i znaczenia.',
  },
  {
    name: 'PLM',
    href: 'https://www.plm.uw.edu.pl/',
    image: null as string | null,
    blurb:
      'Pracownia Lingwistyki Migowej UW: badania nad PJM, korpus, słownik i studia filologii polskiego języka migowego.',
  },
  {
    name: 'Świat Głuchych',
    href: 'https://swiatgluchych.pl/fundacja-swiat-gluchych/',
    image: '/resources/swiat-gluchych.png',
    blurb:
      'Fundacja wspierająca społeczność Głuchych: słownik PJM, wolontariat i treści z tłumaczem języka migowego.',
  },
  {
    name: 'PZG',
    href: 'https://www.pzg.org.pl/',
    image: '/resources/pzg.png',
    blurb:
      'Polski Związek Głuchych. Organizacja ogólnopolska, informacje o prawach, wsparciu i działaniach lokalnych.',
  },
  {
    name: 'Migam',
    href: 'https://migam.org/',
    image: '/resources/migam.png',
    blurb:
      'Platforma wideotłumaczeń PJM: szybki kontakt z tłumaczem języka migowego online.',
  },
  {
    name: 'Migaj',
    href: 'https://migaj.eu/',
    image: '/resources/migaj.png',
    blurb:
      'Kursy i słownik polskiego języka migowego: nauka PJM w formie aplikacji.',
  },
] as const

export function ResourcesView() {
  return (
    <main className="learn-view resources-view">
      <header className="learn-header">
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
              {r.image ? (
                <img src={r.image} alt="" loading="lazy" />
              ) : (
                <span className="resource-tile__mono" aria-hidden>
                  {r.name.slice(0, 2)}
                </span>
              )}
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
