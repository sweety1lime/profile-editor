import type { CSSProperties } from 'react'
import { PROFILE_LAYOUT as L, SHOWCASES, type ShowcaseKind } from '@profile-editor/core'
import { THEMES, type ThemeName } from '../lib/themes'

export interface ReplicaProfile {
  name: string
  level: number
  summary: string
  avatar?: string | null
  frame?: string | null
}

export interface ReplicaShowcase {
  id: string
  kind: ShowcaseKind
  urls: string[]
  // плашка «+N» под правой колонкой иллюстраций и скриншотов, не задано — есть
  counter?: boolean
}

export interface ReplicaBackground {
  url: string
  isVideo: boolean
}

export interface ReplicaLabels {
  level: string
  offline: string
  showcase: Record<ShowcaseKind, string>
  // строка с автором над мастерской и надпись на плашке «+N»
  workshopOwner: string
  counter: string
}

interface Props {
  width: number
  fullWidth: boolean
  theme: ThemeName
  profile: ReplicaProfile
  background: ReplicaBackground | null
  showcases: ReplicaShowcase[]
  labels: ReplicaLabels
}

// Размеры и отступы повторяют страницу профиля Steam, поэтому части ложатся на фон в тех же пикселях

const FONT = '"Motiva Sans", Arial, Helvetica, sans-serif'
const LEVEL_COLORS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#542437', '#997c52']
const BORDERED: CSSProperties = { display: 'block', border: '1px solid #000', boxSizing: 'content-box' }
// Под картинкой Steam пишет название работы: строка в 19 px есть, даже если названия нет
const ITEM_NAME: CSSProperties = { height: 19, marginTop: 4 }
const PANEL: CSSProperties = { background: 'rgba(0, 0, 0, 0.3)', borderRadius: 5 }

const panelBackground = [
  'radial-gradient(farthest-side at 100% 0%, var(--gradient-right), transparent 500px)',
  'radial-gradient(at 0% 0%, var(--gradient-left), transparent 600px)',
  'radial-gradient(at 100% 100%, var(--gradient-background-right), transparent 500px)',
  'radial-gradient(at 0% 100%, var(--gradient-background-left), transparent 600px)',
  'var(--gradient-background)',
].join(', ')

const headerBackground = [
  'radial-gradient(farthest-side at 100% 100%, var(--gradient-right), transparent 500px)',
  'radial-gradient(at 0% 100%, var(--gradient-left), transparent 600px)',
  'var(--gradient-background)',
].join(', ')

// После сотого уровня у Steam картинки вместо кружков, для превью берём цвет по десяткам
const levelColor = (level: number) => LEVEL_COLORS[Math.floor((level % 100) / 10)]

// Витрины повторяют живую страницу, см. layout.ts: у иллюстраций и избранной нет подложки,
// у мастерской снизу строка счётчиков, у иллюстраций и скриншотов справа плашка «+N»
function ShowcaseBody({ showcase, labels }: { showcase: ReplicaShowcase; labels: ReplicaLabels }) {
  const { kind, urls } = showcase
  if (kind === 'featured') {
    return (
      <div>
        {urls[0] && <img src={urls[0]} alt="" style={{ ...BORDERED, width: 630 }} />}
        <div style={ITEM_NAME} />
      </div>
    )
  }
  if (kind === 'workshop') {
    return (
      <div>
        <div style={{ display: 'flex' }}>
          {SHOWCASES.workshop.slices.map((slice, i) => (
            // картинки стоят в строке, и под ними остаётся место под буквы — 5 px
            <div key={slice.id} style={{ width: '20%', paddingBottom: 5 }}>
              <div style={{ margin: 2 }}>
                {urls[i] ? (
                  <img src={urls[i]} alt="" style={{ display: 'block', width: '100%' }} />
                ) : (
                  <div style={{ paddingTop: '100%', background: 'rgba(255, 255, 255, 0.04)' }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...PANEL, height: 89 }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ width: 508, marginRight: 7, flexShrink: 0 }}>
        {urls[0] && <img src={urls[0]} alt="" style={{ ...BORDERED, width: 506 }} />}
        <div style={ITEM_NAME} />
      </div>
      <div style={{ width: 102, flexShrink: 0 }}>
        {urls[1] && <img src={urls[1]} alt="" style={{ ...BORDERED, width: 100, marginBottom: 11 }} />}
        {showcase.counter !== false && (
          <div
            data-counter
            style={{
              height: 57,
              lineHeight: '57px',
              marginBottom: 11,
              background: '#222223',
              textAlign: 'center',
              fontSize: 13,
            }}
          >
            {labels.counter}
          </div>
        )}
      </div>
    </div>
  )
}

function Background({ background, fullWidth }: { background: ReplicaBackground; fullWidth: boolean }) {
  if (background.isVideo) {
    return (
      <div data-replica-background style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <video
          src={background.url}
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: fullWidth ? '100%' : 1920,
            maxWidth: 'none',
          }}
        />
      </div>
    )
  }
  return (
    <div
      data-replica-background
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url("${background.url}")`,
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        backgroundSize: fullWidth ? '100%' : 'auto',
      }}
    />
  )
}

export default function ProfileReplica({ width, fullWidth, theme, profile, background, showcases, labels }: Props) {
  return (
    <div
      data-replica
      style={{
        ...(THEMES[theme] as CSSProperties),
        width,
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
        color: '#fff',
        fontFamily: FONT,
        textAlign: 'left',
      }}
    >
      <div style={{ height: L.navHeight, background: '#171a21', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            width: L.contentWidth,
            height: '100%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            fontSize: 15,
            fontWeight: 600,
            color: '#dcdedf',
          }}
        >
          <span style={{ fontSize: 26, letterSpacing: 2, marginRight: 30 }}>STEAM</span>
          <span>STORE</span>
          <span style={{ color: '#1a9fff' }}>COMMUNITY</span>
          <span>ABOUT</span>
          <span>SUPPORT</span>
        </div>
      </div>

      <div style={{ position: 'relative', minHeight: 1080 - L.navHeight, paddingBottom: 48 }}>
        {background && <Background background={background} fullWidth={fullWidth} />}

        <div style={{ position: 'relative', width: L.contentWidth, margin: '0 auto' }}>
          <div style={{ position: 'relative', height: L.headerHeight, background: headerBackground }}>
            <div style={{ position: 'absolute', left: 24, top: 34, width: 168, height: 168, padding: 2, background: '#515151' }}>
              {profile.avatar && (
                <img src={profile.avatar} alt="" data-avatar style={{ display: 'block', width: 164, height: 164 }} />
              )}
              {profile.frame && (
                <img
                  src={profile.frame}
                  alt=""
                  style={{ position: 'absolute', left: -16, top: -16, width: 200, height: 200, maxWidth: 'none' }}
                />
              )}
            </div>
            <div style={{ position: 'absolute', left: 228, top: 39, fontSize: 24, lineHeight: '30px', whiteSpace: 'nowrap' }}>
              {profile.name}
            </div>
            {profile.summary && (
              <div
                style={{
                  position: 'absolute',
                  left: 228,
                  top: 111,
                  width: 430,
                  maxHeight: 57,
                  overflow: 'hidden',
                  fontSize: 13,
                  lineHeight: '18px',
                  color: '#dcdedf',
                  whiteSpace: 'pre-line',
                }}
              >
                {profile.summary}
              </div>
            )}
            <div style={{ position: 'absolute', left: 676, top: 39, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24, lineHeight: '32px' }}>{labels.level}</span>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  border: `2px solid ${levelColor(profile.level)}`,
                  fontSize: 16,
                  lineHeight: '28px',
                  textAlign: 'center',
                  color: '#e5e5e5',
                }}
              >
                {profile.level}
              </span>
            </div>
          </div>

          <div style={{ height: L.headerGap }} />

          <div
            style={{
              display: 'flex',
              gap: L.columnsGap,
              padding: `${L.columnsPaddingTop}px ${L.columnsPadding}px ${L.columnsPadding}px`,
              minHeight: 600,
              background: panelBackground,
            }}
          >
            <div style={{ width: L.leftWidth, flexShrink: 0 }}>
              {showcases.map((s) => {
                // у иллюстраций и избранной Steam заголовок прячет
                const titled = s.kind === 'screenshot' || s.kind === 'workshop'
                return (
                  <div
                    key={s.id}
                    data-showcase={s.kind}
                    style={{ marginBottom: L.showcaseGap, background: 'rgba(0, 0, 0, 0.3)', borderRadius: 3 }}
                  >
                    {titled && (
                      <div
                        style={{
                          height: L.showcaseHeader,
                          padding: '5px 10px',
                          fontSize: 16,
                          lineHeight: '30px',
                          background: 'linear-gradient(90deg, var(--gradient-showcase-header-left) 0%, var(--color-showcase-header) 90%)',
                        }}
                      >
                        {labels.showcase[s.kind]}
                      </div>
                    )}
                    {s.kind === 'workshop' && (
                      <div
                        style={{
                          height: 58,
                          margin: 10,
                          padding: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 14,
                          color: '#dcdedf',
                        }}
                      >
                        <div style={{ width: 38, height: 38, flexShrink: 0, background: '#515151' }} />
                        <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {labels.workshopOwner}
                        </span>
                      </div>
                    )}
                    <div style={{ padding: titled ? '20px 10px 11px' : '15px 10px 11px', borderRadius: 5, overflow: 'hidden' }}>
                      <ShowcaseBody showcase={s} labels={labels} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ width: L.rightWidth, flexShrink: 0, padding: 10, background: 'rgba(0, 0, 0, 0.3)', alignSelf: 'flex-start' }}>
              <div style={{ fontSize: 20, color: '#898989', padding: '6px 0 16px' }}>{labels.offline}</div>
              {[70, 52, 60].map((w, i) => (
                <div key={i} style={{ height: 14, width: `${w}%`, margin: '14px 0', borderRadius: 3, background: 'rgba(255, 255, 255, 0.06)' }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
