<template>
  <div
    class="waveform"
    ref="container"
    @mousemove="handleMouseMove"
    @mousedown="handleMouseDown"
    @mouseenter="handleMounseEnter"
    @mouseleave="handleContainerMouseMove"
  >
    <div class="wavesurfer-container" ref="wavesurferEl" :class="{ active: isMouseDown }"></div>
    <div
      class="waveform-interact"
      :style="{ transform: `translateX(${cursorLeftPxRef}px)` }"
      :class="{ active: isMouseDown }"
    >
      <div class="cursor"></div>
      <div class="time" ref="timeEl" :class="{ rev: timeAlignRev }">{{ displayCursorTimeRef }}</div>
    </div>
    <div class="progress-highlights" v-if="prefStore.highlightSelectedLineOnProgress">
      <div
        v-for="range in highlightRanges"
        :key="range.key"
        class="progress-highlight"
        :class="{ adjustable: range.adjustable }"
        :style="{ left: `${range.left}px`, width: `${range.width}px` }"
      >
        <template v-if="range.adjustable">
          <div
            class="progress-highlight-handle left"
            @mousedown.stop="handleZoomHandleMouseDown($event, 'start')"
          ></div>
          <div
            class="progress-highlight-handle right"
            @mousedown.stop="handleZoomHandleMouseDown($event, 'end')"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCssVar, useElementBounding } from '@vueuse/core'
import { clamp } from 'lodash-es'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'

import { audioEngine } from '@core/audio'
import { requestSpectrogramZoom } from '@core/spectrogram/zoomRequest'

import { usePrefStore, useRuntimeStore } from '@states/stores'

import { ms2str } from '@utils/formatTime'

const containerEl = useTemplateRef('container')
const timeEl = useTemplateRef('timeEl')
const prefStore = usePrefStore()
const runtimeStore = useRuntimeStore()
const timeAlignRev = ref(false)
const isMouseDown = ref(false)
let playingWhenMouseDown = false
const cursorTimeRef = ref(0)
const displayCursorTimeRef = computed(() => ms2str(cursorTimeRef.value))
const cursorLeftPxRef = ref(0)
const hoverCursorShown = ref(false)
const containRect = useElementBounding(containerEl)
let timeRect: DOMRect | null = null

function handleMounseEnter() {
  if (!containerEl.value || !timeEl.value) return
  timeRect = timeEl.value.getBoundingClientRect()
}
function handleContainerMouseMove(event: MouseEvent) {
  if (isMouseDown.value) return
  handleMouseMove(event)
}
function handleDocumentMouseMove(event: MouseEvent) {
  if (!isMouseDown.value) return
  handleMouseMove(event)
}
function handleMouseMove(event: MouseEvent) {
  if (!containerEl.value || !timeEl.value) return
  if (!containRect || !timeRect) return
  const x = clamp(event.clientX - containRect.left.value, 0, containRect.width.value)
  const percentage = x / containRect.width.value
  const time = percentage * audioEngine.lengthComputed.value
  cursorTimeRef.value = time
  cursorLeftPxRef.value = x
  timeAlignRev.value = x + timeRect.width > containRect.width.value
  hoverCursorShown.value = true
  return time
}
function handleMouseDown() {
  isMouseDown.value = true
  playingWhenMouseDown = audioEngine.playingComputed.value
  if (playingWhenMouseDown) audioEngine.pause()
  document.addEventListener('mousemove', handleDocumentMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}
function handleMouseUp() {
  if (!isMouseDown.value) return
  isMouseDown.value = false
  audioEngine.seek(cursorTimeRef.value)
  if (playingWhenMouseDown) audioEngine.play()
  document.removeEventListener('mousemove', handleDocumentMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

// 只选中一行时，该行的高亮区间可以拖动调整——但这只用于控制频谱图的缩放范围，
// 不会写回歌词行本身的时间
const zoomRangeMs = ref<{ start: number; end: number } | null>(null)

watch(
  () => [...runtimeStore.selectedLines.values()],
  (lines) => {
    if (lines.length === 1) {
      const line = lines[0]!
      const start = !prefStore.hideLineTiming ? line.startTime : (line.syllables[0]?.startTime ?? 0)
      const end = !prefStore.hideLineTiming ? line.endTime : (line.syllables.at(-1)?.endTime ?? 0)
      zoomRangeMs.value = { start, end }
    } else {
      zoomRangeMs.value = null
    }
  },
  { immediate: true },
)

const highlightRanges = computed(() => {
  if (!prefStore.highlightSelectedLineOnProgress || !containRect) return []
  const containerWidth = containRect.width.value
  const selected = [...runtimeStore.selectedLines.values()]
  if (selected.length === 1 && zoomRangeMs.value) {
    const { start, end } = zoomRangeMs.value
    return [
      {
        key: selected[0]!.id,
        left: (start / audioEngine.lengthComputed.value) * containerWidth,
        width: ((end - start) / audioEngine.lengthComputed.value) * containerWidth,
        adjustable: true,
      },
    ]
  }
  return selected.map((line) => {
    const start = !prefStore.hideLineTiming ? line.startTime : (line.syllables[0]?.startTime ?? 0)
    const end = !prefStore.hideLineTiming ? line.endTime : (line.syllables.at(-1)?.endTime ?? 0)
    const dur = end - start
    return {
      key: line.id,
      left: (start / audioEngine.lengthComputed.value) * containerWidth,
      width: (dur / audioEngine.lengthComputed.value) * containerWidth,
      adjustable: false,
    }
  })
})

const MIN_ZOOM_RANGE_MS = 200
let zoomDragMode: 'start' | 'end' | null = null
let zoomDragStartClientX = 0
let zoomDragOrig: { start: number; end: number } | null = null

function handleZoomHandleMouseDown(e: MouseEvent, mode: 'start' | 'end') {
  if (e.button !== 0 || !zoomRangeMs.value) return
  e.preventDefault()
  e.stopPropagation()
  zoomDragMode = mode
  zoomDragStartClientX = e.clientX
  zoomDragOrig = { ...zoomRangeMs.value }
  document.addEventListener('mousemove', handleZoomHandleMouseMove)
  document.addEventListener('mouseup', handleZoomHandleMouseUp)
}
function handleZoomHandleMouseMove(e: MouseEvent) {
  if (!zoomDragMode || !zoomDragOrig || !containRect) return
  const pxPerMs = containRect.width.value / audioEngine.lengthComputed.value
  if (!pxPerMs) return
  const deltaMs = (e.clientX - zoomDragStartClientX) / pxPerMs
  if (zoomDragMode === 'start') {
    let newStart = zoomDragOrig.start + deltaMs
    newStart = Math.max(0, Math.min(newStart, zoomDragOrig.end - MIN_ZOOM_RANGE_MS))
    zoomRangeMs.value = { start: newStart, end: zoomDragOrig.end }
  } else {
    let newEnd = zoomDragOrig.end + deltaMs
    newEnd = Math.min(
      audioEngine.lengthComputed.value,
      Math.max(newEnd, zoomDragOrig.start + MIN_ZOOM_RANGE_MS),
    )
    zoomRangeMs.value = { start: zoomDragOrig.start, end: newEnd }
  }
  if (zoomRangeMs.value) requestSpectrogramZoom(zoomRangeMs.value.start, zoomRangeMs.value.end)
}
function handleZoomHandleMouseUp() {
  zoomDragMode = null
  zoomDragOrig = null
  document.removeEventListener('mousemove', handleZoomHandleMouseMove)
  document.removeEventListener('mouseup', handleZoomHandleMouseUp)
}

const wavesurferEl = useTemplateRef('wavesurferEl')
const primaryColor = useCssVar('--p-primary-color')
let wsInstance: WaveSurfer | null = null
const createWs = () => {
  if (!wavesurferEl.value || !containerEl.value) return
  wsInstance = WaveSurfer.create({
    media: audioEngine.audioEl,
    container: wavesurferEl.value,
    height: containerEl.value.clientHeight + 1,
    hideScrollbar: true,
    waveColor: primaryColor.value,
    progressColor: primaryColor.value,
    cursorWidth: 0,
    barHeight: 0.8,
    interact: false,
  })
}

onMounted(createWs)
const refresher = () => {
  wsInstance?.destroy()
  createWs()
}
audioEngine.onLoaded(refresher)
onBeforeUnmount(() => {
  wsInstance?.destroy()
  wsInstance = null
  audioEngine.offLoaded(refresher)
})
</script>

<style lang="scss">
.waveform {
  flex: 1;
  background-color: var(--p-button-secondary-background);
  border-radius: var(--p-border-radius-md);
  overflow: hidden;
  cursor: text;
  position: relative;
  --hover-cursor-color: color-mix(
    in srgb,
    var(--p-primary-color),
    var(--p-button-text-plain-color) 70%
  );
}
.waveform-interact {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 2;
  .cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    box-shadow: var(--hover-cursor-color) 0 0 0 0.5px;
  }
  &.active .cursor {
    box-shadow: var(--hover-cursor-color) 0 0 0 1px;
  }
  .time {
    position: absolute;
    top: 0;
    bottom: 0;
    font-family: var(--font-monospace);
    display: flex;
    align-items: center;
    line-height: 1;
    padding: 0 0.75rem;
    color: var(--hover-cursor-color);
    &.rev {
      right: 0;
    }
  }
  &.active .time {
    font-weight: bold;
  }
  opacity: 0;
  transition: opacity 0.2s;
  .waveform:hover &,
  &.active {
    opacity: 1;
  }
}
.wavesurfer-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: auto;
  ::part(canvases) {
    opacity: 0.3;
  }
  ::part(wrapper) {
    overflow: hidden;
  }
  ::part(progress) {
    background-color: color-mix(in srgb, var(--p-primary-color), transparent 70%);
    opacity: 0.5;
  }
  ::part(cursor) {
    box-shadow: var(--p-primary-color) 0 0 0 1px;
  }
  &.active ::part(cursor) {
    opacity: 0.6;
  }
}

.progress-highlights {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
  .progress-highlight {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: var(--p-primary-color);
    opacity: 0.25;

    &.adjustable {
      pointer-events: auto;
      opacity: 0.35;
    }
  }
  .progress-highlight-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    pointer-events: auto;
    cursor: ew-resize;
    &.left {
      left: -4px;
    }
    &.right {
      right: -4px;
    }
  }
}
</style>
