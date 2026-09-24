import { useTranslation } from 'react-i18next'
import { SHOP_SLOTS, shopUrl, type ShopPicks, type ShopSlot } from '../lib/kitShop'

interface Props {
  picks: ShopPicks
  // у фона кнопка подбирает его под цвета арта, если арт уже есть
  canMatch: boolean
  // аватар из арта тоже собирается, но в превью встанет купленный
  avatarFromArt: boolean
  onPick: (slot: ShopSlot) => void
  onRemove: (slot: ShopSlot) => void
}

const wide = (slot: ShopSlot) => slot === 'backgrounds' || slot === 'mini'

// Что к комплекту берут из магазина очков: по вещи на каждое место в профиле
export default function KitShop({ picks, canMatch, avatarFromArt, onPick, onRemove }: Props) {
  const { t, i18n } = useTranslation()

  return (
    <div>
      <ul className="space-y-2">
        {SHOP_SLOTS.map((slot) => {
          const pick = picks[slot]
          return (
            <li key={slot} data-shop={slot} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2">
              {pick ? (
                <img
                  src={pick.image}
                  alt=""
                  className={`shrink-0 rounded ${wide(slot) ? 'h-10 w-16 object-cover' : 'h-10 w-10 object-contain'}`}
                />
              ) : (
                <div className={`shrink-0 rounded border border-dashed border-line ${wide(slot) ? 'h-10 w-16' : 'h-10 w-10'}`} />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">{t(`kit.shop.slots.${slot}`)}</div>
                {pick ? (
                  <>
                    <div className="truncate text-sm text-white">{pick.name}</div>
                    <div className="text-xs text-slate-500">
                      {t('kit.shop.points', { points: pick.points.toLocaleString(i18n.language) })}
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => onPick(slot)} className="text-sm text-accent hover:underline">
                    {t(slot === 'backgrounds' && canMatch ? 'kit.shop.match' : 'kit.shop.pick')}
                  </button>
                )}
              </div>
              {pick && (
                <>
                  <a href={shopUrl(pick)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-slate-400 hover:text-white">
                    {t('kit.shop.open')}
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(slot)}
                    title={t('kit.shop.remove')}
                    aria-label={t('kit.shop.remove')}
                    className="shrink-0 px-1 text-slate-400 hover:text-red-400"
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {picks.avatars && avatarFromArt && <p className="mt-2 text-xs text-slate-500">{t('kit.shop.avatarWins')}</p>}
      <p className="mt-2 text-xs text-slate-500">{t('kit.shop.hint')}</p>
    </div>
  )
}
