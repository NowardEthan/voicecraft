import { useEffect, useState } from 'react'
import { Check, Layers3, Rows3, Sparkles, Square } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import {
  getSpaceExperience,
  setSpaceDensity,
  setSpaceMaterial,
} from '../model/spacePreferences'

const DENSITIES = [
  {
    id: 'compact',
    label: 'Compacta',
    description: 'Mais canais e pessoas visíveis, no ritmo de uma comunidade ativa.',
    icon: Rows3,
  },
  {
    id: 'comfortable',
    label: 'Confortável',
    description: 'Mais respiro entre itens para leitura e navegação tranquilas.',
    icon: Layers3,
  },
]

const MATERIALS = [
  {
    id: 'glass',
    label: 'Vidro',
    description: 'Transparência, blur e profundidade inspirados no Apple design.',
    icon: Sparkles,
  },
  {
    id: 'solid',
    label: 'Sólido',
    description: 'Superfícies opacas com contraste mais forte e menos efeitos.',
    icon: Square,
  },
]

export default function SpaceExperienceModal({ open, space, onClose }) {
  const [density, setDensity] = useState('compact')
  const [material, setMaterial] = useState('glass')

  useEffect(() => {
    if (!open || !space?.id) return
    const experience = getSpaceExperience(space.id)
    setDensity(experience.density)
    setMaterial(experience.material)
  }, [open, space?.id])

  if (!open || !space) return null

  const chooseDensity = (value) => {
    setDensity(value)
    setSpaceDensity(space.id, value)
  }
  const chooseMaterial = (value) => {
    setMaterial(value)
    setSpaceMaterial(space.id, value)
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      labelledBy="space-experience-title"
      maxWidth="lg"
      panelClassName="vc-space-modal rounded-[22px] overflow-hidden"
    >
      <section className="vc-space-modal__surface vc-space-experience rounded-[22px] overflow-hidden">
        <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.07]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Só para você</p>
          <h2 id="space-experience-title" className="text-[19px] font-semibold text-strong tracking-tight mt-1">
            Experiência em {space.name}
          </h2>
          <p className="text-[12px] text-muted mt-1 leading-relaxed">
            Ajuste como este Space aparece neste dispositivo. Ninguém mais verá essas escolhas.
          </p>
        </header>

        <div className="px-5 sm:px-6 py-5 space-y-6">
          <ChoiceSection
            title="Densidade"
            options={DENSITIES}
            value={density}
            onChange={chooseDensity}
          />
          <ChoiceSection
            title="Material"
            options={MATERIALS}
            value={material}
            onChange={chooseMaterial}
          />
          <div className="vc-space-experience__preview" data-density={density} data-material={material}>
            <div className="vc-space-experience__preview-sidebar">
              <span />
              <span className="is-active" />
              <span />
            </div>
            <div className="vc-space-experience__preview-main">
              <div />
              <div />
              <div />
            </div>
          </div>
        </div>

        <footer className="px-5 sm:px-6 py-3.5 border-t border-white/[0.07] flex items-center justify-between gap-4">
          <p className="text-[11px] text-muted">As mudanças são aplicadas na hora.</p>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-accent text-on-accent text-[12.5px] font-semibold hover:brightness-110 active:scale-[0.98] transition"
          >
            Concluído
          </button>
        </footer>
      </section>
    </ModalShell>
  )
}

function ChoiceSection({ title, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted mb-2.5">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {options.map((option) => {
          const Icon = option.icon
          const active = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={['vc-space-experience__choice', active ? 'is-active' : ''].join(' ')}
            >
              <span className="vc-space-experience__choice-icon"><Icon size={16} /></span>
              <span className="min-w-0 flex-1">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {active && <Check size={15} className="text-accent shrink-0" />}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
