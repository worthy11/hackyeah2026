import type { GradeResult } from '../../hooks/useRecorder'
import { Icon } from '../Icon'

type Props = {
  result: GradeResult
  expectedGlosses: string[]
}

export function GradePanel({ result, expectedGlosses }: Props) {
  const perfect = result.score === 100
  const good    = result.score >= 60

  return (
    <div className={`grade-panel${perfect ? ' grade-panel--perfect' : good ? ' grade-panel--good' : ' grade-panel--poor'}`}>
      {/* Score ring */}
      <div className="grade-score">
        <span className="grade-score__value">{result.score}%</span>
        <span className="grade-score__label">zgodności</span>
      </div>

      <div className="grade-details">
        <p className="grade-verdict">
          {perfect ? '🎉 Idealnie!' : good ? 'Nieźle, ćwicz dalej!' : 'Spróbuj jeszcze raz'}
        </p>

        {/* Expected vs matched */}
        <div className="grade-chips">
          {expectedGlosses.map((g, i) => (
            <span
              key={i}
              className={`grade-chip${result.matched[i] ? ' grade-chip--hit' : ' grade-chip--miss'}`}
            >
              {result.matched[i]
                ? <Icon name="check" size={12} />
                : <Icon name="info" size={12} />
              }
              {g}
            </span>
          ))}
        </div>

        {/* What the API recognised */}
        {result.glosses.length > 0 && (
          <p className="grade-recognized">
            Rozpoznano: {result.glosses.join(' → ')}
          </p>
        )}
        {result.translation && (
          <p className="grade-translation">„{result.translation}"</p>
        )}
      </div>
    </div>
  )
}
