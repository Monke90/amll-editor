<template>
  <div
    class="spectrogram-playhead"
    :style="{ left: `${playheadLeft}px`, height: `${ctx.displayHeight.value}px` }"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { audioEngine } from '@core/audio'
import { useSpectrogramContext } from '@core/spectrogram/SpectrogramContext'

const ctx = useSpectrogramContext()

const playheadLeft = computed(
  () => (audioEngine.amendedProgressComputed.value / 1000) * ctx.zoom.value - ctx.scrollLeft.value,
)
</script>

<style lang="scss">
.spectrogram-playhead {
  position: absolute;
  top: 0;
  width: 0;
  pointer-events: none;
  z-index: 3;
  box-shadow: var(--p-primary-color) 0 0 0 1px;
}
</style>
