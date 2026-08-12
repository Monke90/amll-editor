import { updatePreset } from '@primeuix/themes'
import { usePreferredDark } from '@vueuse/core'
import { computed, watchEffect } from 'vue'

import { usePrefStore } from '@states/stores'

import { makePrimeColorSet } from '@utils/makePrimeColorSet'

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

/**
 * 当前是否应实际按暗色显示：
 * - themeMode === 'system' 时跟随系统 prefers-color-scheme
 * - 否则按用户显式选择
 */
export function useEffectiveDark() {
  const prefStore = usePrefStore()
  const prefersDark = usePreferredDark()
  return computed(() =>
    prefStore.themeMode === 'system' ? prefersDark.value : prefStore.themeMode === 'dark',
  )
}

/**
 * 将当前主题设置（明暗模式 + 强调色）应用到文档根节点。
 * 只需在应用启动时调用一次。
 */
export function applyAppTheme() {
  const prefStore = usePrefStore()
  const isDark = useEffectiveDark()

  watchEffect(() => {
    const root = document.documentElement
    root.classList.toggle('app-dark', isDark.value)
    root.style.colorScheme = prefStore.themeMode === 'system' ? 'light dark' : prefStore.themeMode
    root.dataset.accent = prefStore.themeAccent

    // Re-run PrimeVue's own theme computation with the new primary color.
    // This is the officially supported way to change the accent at
    // runtime — PrimeVue writes --p-primary-color (and its hover/active/
    // contrast siblings) as an *inline* style on <html> during its own
    // theme init, which always beats a plain CSS class/attribute
    // selector. Going through updatePreset() lets PrimeVue itself
    // recompute and re-apply all of those derived tokens consistently,
    // instead of us trying to out-specificity it from a stylesheet.
    updatePreset({
      semantic: {
        primary: makePrimeColorSet(prefStore.themeAccent),
      },
    })
  })
}
