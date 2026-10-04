import { gestureMap, type Phrase } from '../../data/mockLearning'
import { useGestureVideos } from '../../hooks/useGestureVideos'
import { PracticeShell } from './GesturePractice'

type Props = { phrase: Phrase; onBack: () => void }

export function PhrasePractice({ phrase, onBack }: Props) {
  const expectedGlosses = phrase.gestureIds.map(id => gestureMap[id]?.gloss ?? '?')
  const phraseKey = phrase.translation.toUpperCase().trim()
  const { versions } = useGestureVideos()

  const videos =
    (versions[phraseKey]?.length ? versions[phraseKey] : undefined)
    ?? phrase.gestureIds
      .map(gid => versions[(gestureMap[gid]?.gloss ?? '').toUpperCase().trim()] ?? [])
      .find(vs => vs.length > 0)
    ?? []

  return (
    <PracticeShell
      title={phrase.translation}
      videos={videos}
      expectedGlosses={expectedGlosses}
      demoKey={phraseKey}
      onBack={onBack}
    />
  )
}
