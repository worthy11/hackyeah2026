import { useState } from 'react'
import type { Category } from '../../data/mockLearning'
import { CategoryGrid } from './CategoryGrid'
import { CategoryDetail } from './CategoryDetail'

export function LearnView() {
  const [selected, setSelected] = useState<Category | null>(null)

  if (selected) {
    return <CategoryDetail category={selected} onBack={() => setSelected(null)} />
  }
  return <CategoryGrid onSelect={setSelected} />
}
