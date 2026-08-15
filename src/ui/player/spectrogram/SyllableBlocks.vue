<template>
  <div
    class="syl-blocks-layer"
    v-if="prefStore.spectrogramShowSyllableBlocks"
    :style="{ height: `${ctx.displayHeight.value}px` }"
  >
    <div
      v-for="entry in visibleEntries"
      :key="entry.syl.id"
      class="syl-block"
      :class="{
        selected: runtimeStore.selectedSyllables.has(entry.syl),
        active: isActiveSyl(entry.syl),
        'line-alt': entry.lineIndex % 2 === 1,
        dragging: draggingSylId === entry.syl.id,
      }"
      :style="blockStyle(entry.syl)"
      :title="entry.syl.text"
      @mousedown.stop="handleBlockMouseDown($event, entry.line, entry.syl, 'move')"
    >
      <div
        class="syl-block-handle left"
        @mousedown.stop="handleBlockMouseDown($event, entry.line, entry.syl, 'start')"
      ></div>
      <span class="syl-block-text">{{ entry.syl.text }}</span>
      <div
        class="syl-block-handle right"
        @mousedown.stop="handleBlockMouseDown($event, entry.line, entry.syl, 'end')"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import { audioEngine } from '@core/audio'
import { useSpectrogramContext } from '@core/spectrogram/SpectrogramContext'
import type { LyricLine, LyricSyllable } from '@core/types'

import { useCoreStore, usePrefStore, useRuntimeStore } from '@states/stores'


const ctx = useSpectrogramContext()
const coreStore = useCoreStore()
const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()

const MIN_DURATION_MS = 30

const scopeLines = computed<LyricLine[]>(() => {
  if (prefStore.spectrogramBlockScope === 'all') return coreStore.lyricLines
  const line = runtimeStore.getFirstSelectedLine()
  return line ? [line] : []
})

interface BlockEntry {
  line: LyricLine
  lineIndex: number
  syl: LyricSyllable
}

const visibleEntries = computed<BlockEntry[]>(() => {
  if (!prefStore.spectrogramShowSyllableBlocks) return []
  const bufferMs = 1000
  const startMs = ctx.viewStartTime.value * 1000 - bufferMs
  const endMs = ctx.viewEndTime.value * 1000 + bufferMs
  const entries: BlockEntry[] = []
  for (const line of scopeLines.value) {
    const lineIndex = coreStore.lyricLines.indexOf(line)
    for (const syl of line.syllables) {
      if (!syl.text.trim()) continue
      if (syl.endTime < startMs || syl.startTime > endMs) continue
      entries.push({ line, lineIndex, syl })
    }
  }
  return entries
})

function isActiveSyl(syl: LyricSyllable) {
  return (
    Boolean(syl.startTime || syl.endTime) &&
    audioEngine.amendedProgressComputed.value >= syl.startTime &&
    audioEngine.amendedProgressComputed.value <= syl.endTime
  )
}

function msToPx(ms: number) {
  return (ms / 1000) * ctx.zoom.value - ctx.scrollLeft.value
}

function blockStyle(syl: LyricSyllable) {
  const left = msToPx(syl.startTime)
  const width = Math.max(3, msToPx(syl.endTime) - left)
  return { left: `${left}px`, width: `${width}px` }
}

function isFirstTimedSyl(line: LyricLine, syl: LyricSyllable) {
  for (const s of line.syllables) if (s.text.trim()) return s === syl
  return false
}
function isLastTimedSyl(line: LyricLine, syl: LyricSyllable) {
  for (let i = line.syllables.length - 1; i >= 0; i--) {
    const s = line.syllables[i]!
    if (s.text.trim()) return s === syl
  }
  return false
}

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  mode: DragMode
  line: LyricLine
  syl: LyricSyllable
  startClientX: number
  origStart: number
  origEnd: number
  lowerBound: number
  upperBound: number
}

let drag: DragState | null = null
const draggingSylId = ref<string | null>(null)

function neighborBounds(line: LyricLine, syl: LyricSyllable) {
  const idx = line.syllables.indexOf(syl)
  const prev = line.syllables[idx - 1]
  const next = line.syllables[idx + 1]
  const lowerBound = prev ? prev.endTime : 0
  const upperBound = next ? next.startTime : ctx.duration.value * 1000
  return { lowerBound, upperBound }
}

function handleBlockMouseDown(
  e: MouseEvent,
  line: LyricLine,
  syl: LyricSyllable,
  mode: DragMode,
) {
  if (e.button !== 0) return
  e.preventDefault()
  runtimeStore.selectLineSyl(line, syl)

  const { lowerBound, upperBound } = neighborBounds(line, syl)
  drag = {
    mode,
    line,
    syl,
    startClientX: e.clientX,
    origStart: syl.startTime,
    origEnd: syl.endTime,
    lowerBound,
    upperBound,
  }
  draggingSylId.value = syl.id
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent) {
  if (!drag || ctx.zoom.value <= 0) return
  const { syl, line, mode, origStart, origEnd, lowerBound, upperBound } = drag
  const deltaPx = e.clientX - drag.startClientX
  const deltaMs = (deltaPx / ctx.zoom.value) * 1000

  if (mode === 'start') {
    const newStart = Math.max(lowerBound, Math.min(origStart + deltaMs, origEnd - MIN_DURATION_MS))
    syl.startTime = Math.round(newStart)
  } else if (mode === 'end') {
    const newEnd = Math.min(upperBound, Math.max(origEnd + deltaMs, origStart + MIN_DURATION_MS))
    syl.endTime = Math.round(newEnd)
  } else {
    const duration = origEnd - origStart
    const newStart = Math.max(lowerBound, Math.min(origStart + deltaMs, upperBound - duration))
    syl.startTime = Math.round(newStart)
    syl.endTime = Math.round(newStart + duration)
  }

  if (isFirstTimedSyl(line, syl)) line.startTime = syl.startTime
  if (isLastTimedSyl(line, syl)) line.endTime = syl.endTime
}

function handleDragEnd() {
  drag = null
  draggingSylId.value = null
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
})
</script>

<style lang="scss">
.syl-blocks-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}

.syl-block {
  position: absolute;
  top: 0.4rem;
  bottom: 0.4rem;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background-color: color-mix(in srgb, var(--p-primary-color), transparent 78%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--p-primary-color), transparent 45%);
  cursor: grab;
  user-select: none;
  overflow: hidden;
  transition:
    background-color 0.1s,
    box-shadow 0.1s;

  &.line-alt {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 88%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--p-primary-color), transparent 60%);
  }

  &:hover {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 65%);
  }

  &.selected {
    box-shadow: inset 0 0 0 1.5px var(--p-primary-color);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 55%);
  }

  &.active {
    box-shadow: inset 0 0 0 1.5px var(--p-primary-color);
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 40%);
  }

  &.dragging {
    cursor: grabbing;
    z-index: 1;
  }
}

.syl-block-text {
  pointer-events: none;
  font-size: 0.75rem;
  white-space: nowrap;
  padding: 0 0.6rem;
  color: var(--p-text-color);
  text-shadow: 0 0 4px var(--p-content-background);
}

.syl-block-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  &.left {
    left: 0;
  }
  &.right {
    right: 0;
  }
  &:hover {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 30%);
  }
}

.syl-blocks-empty-tip {
  pointer-events: none;
}
</style>
