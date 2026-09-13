// Цветовые темы профиля Steam. Значения взяты из profilev2.css
export const THEMES = {
  DefaultTheme: {
    '--gradient-right': 'rgba(109, 38, 44, 0.301)',
    '--gradient-left': 'rgba(50, 255, 193, 0.103)',
    '--gradient-background': 'rgba(34, 35, 48, 0.93)',
    '--gradient-background-right': 'rgba(109, 38, 44, 0)',
    '--gradient-background-left': 'rgba(50, 255, 193, 0.103)',
    '--color-showcase-header': 'rgba(43, 45, 68, 0.93)',
    '--gradient-showcase-header-left': 'rgba(115, 173, 184, 0.247)',
  },
  SummerTheme: {
    '--gradient-right': 'rgba(252, 197, 16, 0.301)',
    '--gradient-left': 'rgba(9, 243, 153, 0.247)',
    '--gradient-background': 'rgba(51, 27, 16, 0.93)',
    '--gradient-background-right': 'rgba(252, 197, 16, 0)',
    '--gradient-background-left': 'rgba(48, 243, 9, 0.13)',
    '--color-showcase-header': 'rgba(70, 53, 31, 0.93)',
    '--gradient-showcase-header-left': 'rgba(33, 78, 76, 0.93)',
  },
  MidnightTheme: {
    '--gradient-right': 'rgba(51, 54, 253, 0.233)',
    '--gradient-left': 'rgba(12, 85, 241, 0.37)',
    '--gradient-background': 'rgba(10, 14, 32, 0.93)',
    '--gradient-background-right': 'rgba(51, 54, 253, 0)',
    '--gradient-background-left': 'rgba(12, 85, 241, 0.13)',
    '--color-showcase-header': 'rgba(34, 32, 61, 0.93)',
    '--gradient-showcase-header-left': 'rgba(20, 33, 68, 0.93)',
  },
  SteelTheme: {
    '--gradient-right': 'rgba(70, 106, 128, 0.233)',
    '--gradient-left': 'rgba(86, 120, 134, 0.37)',
    '--gradient-background': 'rgba(41, 46, 51, 0.93)',
    '--gradient-background-right': 'rgba(17, 24, 29, 0)',
    '--gradient-background-left': 'rgba(19, 27, 31, 0)',
    '--color-showcase-header': 'rgba(55, 62, 76, 0.93)',
    '--gradient-showcase-header-left': 'rgba(68, 83, 93, 0.93)',
  },
  CosmicTheme: {
    '--gradient-right': 'rgba(248, 70, 180, 0.301)',
    '--gradient-left': 'rgba(9, 243, 99, 0.247)',
    '--gradient-background': 'rgba(46, 13, 36, 0.93)',
    '--gradient-background-right': 'rgba(70, 227, 248, 0)',
    '--gradient-background-left': 'rgba(239, 243, 9, 0.13)',
    '--color-showcase-header': 'rgba(57, 24, 61, 0.93)',
    '--gradient-showcase-header-left': 'rgba(20, 60, 68, 0.93)',
  },
  DarkModeTheme: {
    '--gradient-right': 'rgba(49, 49, 49, 0.233)',
    '--gradient-left': 'rgba(51, 51, 51, 0.37)',
    '--gradient-background': 'rgba(24, 24, 24, 0.93)',
    '--gradient-background-right': 'rgba(34, 34, 34, 0)',
    '--gradient-background-left': 'rgba(32, 32, 32, 0.13)',
    '--color-showcase-header': 'rgba(0, 0, 0, 0.5)',
    '--gradient-showcase-header-left': 'rgba(0, 0, 0, 0.5)',
  },
} as const

export type ThemeName = keyof typeof THEMES

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]

// Steam отдаёт тему как «Midnight», а класс у неё MidnightTheme
export function themeFromSteam(id: string | undefined): ThemeName {
  const name = `${id}Theme`
  return name in THEMES ? (name as ThemeName) : 'DefaultTheme'
}
