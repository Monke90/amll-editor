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
const SNAP_PX = 8

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

function snapMs() {
  return ctx.zoom.value > 0 ? (SNAP_PX / ctx.zoom.value) * 1000 : 0
}

function syncLineBounds(line: LyricLine) {
  const firstTimed = line.syllables.find((s) => s.text.trim())
  const lastTimed = [...line.syllables].reverse().find((s) => s.text.trim())
  if (firstTimed) line.startTime = firstTimed.startTime
  if (lastTimed) line.endTime = lastTimed.endTime
}

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  mode: DragMode
  line: LyricLine
  idx: number
  startClientX: number
  origTimes: { start: number; end: number }[]
}

let drag: DragState | null = null
const draggingSylId = ref<string | null>(null)

function handleBlockMouseDown(e: MouseEvent, line: LyricLine, syl: LyricSyllable, mode: DragMode) {
  if (e.button !== 0) return
  e.preventDefault()
  runtimeStore.selectLineSyl(line, syl)

  const idx = line.syllables.indexOf(syl)
  drag = {
    mode,
    line,
    idx,
    startClientX: e.clientX,
    origTimes: line.syllables.map((s) => ({ start: s.startTime, end: s.endTime })),
  }
  draggingSylId.value = syl.id
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(e: MouseEvent) {
  if (!drag || ctx.zoom.value <= 0) return
  const { line, mode, idx, origTimes } = drag
  const syls = line.syllables
  if (syls.length !== origTimes.length) return
  const deltaPx = e.clientX - drag.startClientX
  const deltaMs = (deltaPx / ctx.zoom.value) * 1000
  const durationMs = ctx.duration.value * 1000
  const snap = snapMs()

  if (mode === 'move') {
    if (deltaMs > 0) {
      let prevNewEnd = origTimes[idx]!.end + deltaMs
      syls[idx]!.startTime = Math.round(origTimes[idx]!.start + deltaMs)
      syls[idx]!.endTime = Math.round(prevNewEnd)
      for (let j = idx + 1; j < syls.length; j++) {
        const origJ = origTimes[j]!
        const gap = origJ.start - prevNewEnd
        if (gap >= snap) break
        const dur = origJ.end - origJ.start
        const newStartJ = prevNewEnd
        syls[j]!.startTime = Math.round(newStartJ)
        syls[j]!.endTime = Math.round(newStartJ + dur)
        prevNewEnd = newStartJ + dur
      }
    } else if (deltaMs < 0) {
      let prevNewStart = origTimes[idx]!.start + deltaMs
      syls[idx]!.startTime = Math.round(prevNewStart)
      syls[idx]!.endTime = Math.round(origTimes[idx]!.end + deltaMs)
      for (let j = idx - 1; j >= 0; j--) {
        const origJ = origTimes[j]!
        const gap = prevNewStart - origJ.end
        if (gap >= snap) break
        const dur = origJ.end - origJ.start
        const newEndJ = prevNewStart
        syls[j]!.endTime = Math.round(newEndJ)
        syls[j]!.startTime = Math.round(newEndJ - dur)
        prevNewStart = newEndJ - dur
      }
    }
    if (syls[0]!.startTime < 0) {
      const fix = -syls[0]!.startTime
      for (const s of syls) {
        s.startTime += fix
        s.endTime += fix
      }
    }
    const lastSyl = syls[syls.length - 1]!
    if (lastSyl.endTime > durationMs) {
      const fix = lastSyl.endTime - durationMs
      for (const s of syls) {
        s.startTime -= fix
        s.endTime -= fix
      }
    }
  } else if (mode === 'start') {
    const prev = idx > 0 ? syls[idx - 1] : null
    const origSyl = origTimes[idx]!
    const lowerHardBound = prev ? origTimes[idx - 1]!.start + MIN_DURATION_MS : 0
    let newStart = origSyl.start + deltaMs
    newStart = Math.max(lowerHardBound, Math.min(newStart, origSyl.end - MIN_DURATION_MS))
    syls[idx]!.startTime = Math.round(newStart)
    if (prev) prev.endTime = Math.round(newStart)
  } else if (mode === 'end') {
    const next = idx < syls.length - 1 ? syls[idx + 1] : null
    const origSyl = origTimes[idx]!
    const upperHardBound = next ? origTimes[idx + 1]!.end - MIN_DURATION_MS : durationMs
    let newEnd = origSyl.end + deltaMs
    newEnd = Math.min(upperHardBound, Math.max(newEnd, origSyl.start + MIN_DURATION_MS))
    syls[idx]!.endTime = Math.round(newEnd)
    if (next) next.startTime = Math.round(newEnd)
  }

  syncLineBounds(line)
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
  width: 3px;
  cursor: ew-resize;
  &.left {
    left: 0;
  }
  &.right {
    right: 0;
  }
  &:hover,
  &:active {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 20%);
  }
}
</style>
