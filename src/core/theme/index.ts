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

    // PrimeVue writes --p-primary-color (and friends) directly as an
    // *inline* style on <html> during its own theme init. Inline styles
    // always win over any CSS class/attribute selector, so the
    // [data-accent] stylesheet rules in themes.scss alone can't override
    // it. Re-set the same properties inline here, after PrimeVue's own
    // set, so ours takes effect instead — and re-apply every time the
    // accent/mode changes, since this watchEffect re-runs reactively.
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
