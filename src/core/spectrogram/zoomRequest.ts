import { ref } from 'vue'

/**
 * Waveform.vue（迷你进度条）和 Spectrogram.vue 是兄弟组件，无法通过 provide/inject
 * 直接通信。这里用一个简单的共享 ref 作为桥梁：Waveform.vue 在用户拖动高亮区间时
 * 写入期望的缩放范围，Spectrogram.vue 监听并据此设置自己的 zoom / scrollLeft。
 */
export interface ZoomRangeRequest {
  startMs: number
  endMs: number
}

export const spectrogramZoomRequest = ref<ZoomRangeRequest | null>(null)

export function requestSpectrogramZoom(startMs: number, endMs: number) {
  spectrogramZoomRequest.value = { startMs, endMs }
}
