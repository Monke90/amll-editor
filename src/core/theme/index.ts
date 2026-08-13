import { usePreferredDark } from '@vueuse/core'
import { computed, watchEffect } from 'vue'

import { usePrefStore } from '@states/stores'

/** 内置的几种基础配色主题，均取自 PrimeVue Aura 预设自带的调色板 */
export const THEME_ACCENTS = ['emerald', 'blue', 'violet', 'rose', 'amber', 'teal'] as const
export type ThemeAccent = (typeof THEME_ACCENTS)[number]

export const THEME_ACCENT_LABELS: Record<ThemeAccent, string> = {
  emerald: 'Emerald',
  blue: 'Ocean Blue',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
  teal: 'Teal',
}

export function useEffectiveDark() {
  const prefStore = usePrefStore()
  const prefersDark = usePreferredDark()
  return computed(() =>
    prefStore.themeMode === 'system' ? prefersDark.value : prefStore.themeMode === 'dark',
  )
}

export function applyAppTheme() {
  const prefStore = usePrefStore()
  const isDark = useEffectiveDark()

  watchEffect(() => {
    const root = document.documentElement
    root.classList.toggle('app-dark', isDark.value)
    root.style.colorScheme = prefStore.themeMode === 'system' ? 'light dark' : prefStore.themeMode
    root.dataset.accent = prefStore.themeAccent

    root.style.setProperty('--p-primary-color', 'light-dark(var(--p-primary-500), var(--p-primary-400))')
    root.style.setProperty(
      '--p-primary-contrast-color',
      'light-dark(var(--p-surface-0), var(--p-surface-900))',
    )
    root.style.setProperty(
      '--p-primary-hover-color',
      'light-dark(var(--p-primary-600), var(--p-primary-300))',
    )
    root.style.setProperty(
      '--p-primary-active-color',
      'light-dark(var(--p-primary-700), var(--p-primary-200))',
    )
  })
}
