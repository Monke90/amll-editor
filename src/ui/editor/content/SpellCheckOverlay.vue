<template>
  <div class="spellcheck-overlay" ref="overlayEl"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

import type { LyricLine } from '@core/types'

import { usePrefStore } from '@states/stores'

/**
 * 拼写检查覆盖层。
 *
 * 音节在内容编辑器中被拆分为多个独立的 <input>，直接对单个音节输入框做拼写检查
 * 会把单词的一部分误判为拼写错误。这里改为：按空格音节把同一行的音节重新拼接回
 * "单词"，再在对应位置铺一层不可见但 `contenteditable + spellcheck` 的浮层，
 * 借助浏览器自带的拼写检查引擎在正确的单词粒度上画出红色波浪线——不需要打包任何
 * 词典，也自动支持浏览器已安装的所有语言。
 *
 * 这是一个"尽力而为"的效果：依赖浏览器行为，且遇到单词跨行换行时会跳过该词。
 */

const props = defineProps<{ line: LyricLine }>()
const prefStore = usePrefStore()
const overlayEl = useTemplateRef('overlayEl')

let runEls: HTMLDivElement[] = []
let resizeObserver: ResizeObserver | null = null
let scheduled = false
let mounted = false

function clearRuns() {
  for (const el of runEls) el.remove()
  runEls = []
}

function scheduleRebuild() {
  if (scheduled || !mounted) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    rebuild()
  })
}

function rebuild() {
  const overlay = overlayEl.value
  clearRuns()
  if (!overlay || !prefStore.spellCheckEnabled) return

  const container = overlay.parentElement
  if (!container) return

  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>(':scope > .csyl .csyl-input'),
  )
  const syls = props.line.syllables
  // 结构对不上（正在渲染过程中）就先跳过，下一次变更会重新触发
  if (inputs.length !== syls.length) return

  const containerRect = container.getBoundingClientRect()

  let i = 0
  while (i < syls.length) {
    if (!syls[i]!.text.trim()) {
      i++
      continue
    }
    const start = i
    let j = i
    const startTop = inputs[start]!.getBoundingClientRect().top
    while (
      j + 1 < syls.length &&
      syls[j + 1]!.text.trim() &&
      Math.abs(inputs[j + 1]!.getBoundingClientRect().top - startTop) < 4
    ) {
      j++
    }

    const word = syls
      .slice(start, j + 1)
      .map((s) => s.text)
      .join('')
    if (word.trim().length > 1) {
      const firstRect = inputs[start]!.getBoundingClientRect()
      const lastRect = inputs[j]!.getBoundingClientRect()

      const div = document.createElement('div')
      div.className = 'spellcheck-run'
      div.contentEditable = 'true'
      div.spellcheck = true
      div.tabIndex = -1
      div.setAttribute('aria-hidden', 'true')
      div.style.left = `${firstRect.left - containerRect.left}px`
      div.style.top = `${firstRect.top - containerRect.top}px`
      div.style.width = `${lastRect.right - firstRect.left}px`
      div.style.height = `${firstRect.height}px`
      div.textContent = word
      overlay.appendChild(div)
      runEls.push(div)

      // 强制浏览器重新触发一次拼写检查（部分浏览器不会对以编程方式写入的文本
      // 自动重新检查）
      div.spellcheck = false
      void div.offsetHeight
      div.spellcheck = true
    }
    i = j + 1
  }
}

watch(
  () => prefStore.spellCheckEnabled,
  () => scheduleRebuild(),
)
watch(
  () => props.line.syllables.map((s) => s.text).join('\u0000'),
  () => scheduleRebuild(),
)
watch(
  () => props.line.syllables.length,
  () => scheduleRebuild(),
)

onMounted(() => {
  mounted = true
  scheduleRebuild()
  const container = overlayEl.value?.parentElement
  if (container) {
    resizeObserver = new ResizeObserver(() => scheduleRebuild())
    resizeObserver.observe(container)
  }
  window.addEventListener('resize', scheduleRebuild)
})
onUnmounted(() => {
  mounted = false
  clearRuns()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleRebuild)
})
</script>

<style lang="scss">
.spellcheck-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.spellcheck-run {
  position: absolute;
  color: transparent;
  background: transparent;
  caret-color: transparent;
  outline: none;
  border: none;
  pointer-events: none;
  user-select: none;
  white-space: pre;
  overflow: hidden;
  font-size: var(--p-inputtext-lg-font-size);
}
</style>
