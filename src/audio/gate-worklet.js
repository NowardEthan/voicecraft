// Classic AudioWorklet — noise gate with peak-detecting envelope.
// Smooth attack/release + soft knee around threshold (no clicks on transitions).
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    // Pull defaults from processorOptions so the host can tune per-preset.
    const opts = (options && options.processorOptions) || {}
    this.threshold = opts.threshold ?? 0.015      // ~ -36 dBFS
    this.attack = opts.attack ?? 0.001            // 1 ms time constant
    this.release = opts.release ?? 0.12          // 120 ms time constant
    this.env = 0

    this.port.onmessage = (e) => {
      if (!e.data) return
      if (e.data.type === 'threshold') this.threshold = Math.max(0, Number(e.data.value) || 0)
      else if (e.data.type === 'attack') this.attack = Math.max(0.0001, Number(e.data.value) || 0.001)
      else if (e.data.type === 'release') this.release = Math.max(0.001, Number(e.data.value) || 0.1)
    }
  }

  process(inputs, outputs /* , parameters */) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || input.length === 0 || !output || output.length === 0) return true

    const sr = sampleRate
    const attackCoef = Math.exp(-1 / (this.attack * sr))
    const releaseCoef = Math.exp(-1 / (this.release * sr))
    const lowThresh = this.threshold * 0.7
    const highThresh = this.threshold

    for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
      const inCh = input[ch]
      const outCh = output[ch]
      for (let i = 0; i < inCh.length; i++) {
        const sample = inCh[i]
        const abs = sample < 0 ? -sample : sample
        const coef = abs > this.env ? attackCoef : releaseCoef
        this.env = this.env * coef + abs * (1 - coef)
        // Soft-knee gate: linear ramp between lowThresh and highThresh.
        let gain
        if (this.env <= lowThresh) gain = 0
        else if (this.env >= highThresh) gain = 1
        else gain = (this.env - lowThresh) / (highThresh - lowThresh)
        outCh[i] = sample * gain
      }
    }

    return true
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor)
