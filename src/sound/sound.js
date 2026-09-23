/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Synthesised sound effects (GAME-DESIGN §3.10, SPEC §14.3.2): WebAudio only, no files. One master gain
 * (volume/100 × 0.6); the AudioContext is created lazily on the first user gesture (`unlockAudio()`), and nothing plays
 * before it. 5 ms attacks and exponential releases avoid clicks. Durations follow the animation speed (never below
 * 0.5×) and sounds still play when animations are off.
 */

/** Sound names of SPEC §14.3.2. */
export const SOUND_NAMES = Object.freeze(['select', 'move', 'capture', 'split', 'merge', 'measure', 'captured', 'moved',
	'missed', 'win', 'loss', 'yourMove', 'kingDanger', 'illegal'])

const SPEEDS = { slow: 1.5, normal: 1, fast: 0.5, off: 0.5 }
const ATTACK = 0.005

const config = { enabled: true, volume: 40 }
let ctx = null
let master = null
let noiseBuffer = null
let pinkBuffer = null
let bursts = 0

/**
 * Configure sound (from the preferences).
 *
 * @param {object} options options
 * @param {boolean} [options.enabled] sound on or off
 * @param {number} [options.volume] 0–100
 */
export function configureSound({ enabled, volume } = {}) {
	if (typeof enabled === 'boolean') {
		config.enabled = enabled
	}
	if (Number.isFinite(volume)) {
		config.volume = Math.max(0, Math.min(100, volume))
	}
	if (master !== null) {
		master.gain.setTargetAtTime(gainValue(), ctx.currentTime, 0.02)
	}
}

/**
 * The current configuration (for tests and the settings dialog).
 *
 * @return {{enabled: boolean, volume: number, unlocked: boolean}}
 */
export function soundState() {
	return { enabled: config.enabled, volume: config.volume, unlocked: ctx !== null }
}

/**
 * Master gain value.
 *
 * @return {number}
 */
function gainValue() {
	return (config.volume / 100) * 0.6
}

/**
 * Create or resume the AudioContext. Call it from a user gesture (pointer or key); later calls are cheap.
 */
export function unlockAudio() {
	if (typeof window === 'undefined') {
		return
	}
	const AC = window.AudioContext ?? window.webkitAudioContext
	if (!AC) {
		return
	}
	try {
		if (ctx === null) {
			ctx = new AC()
			master = ctx.createGain()
			master.gain.value = gainValue()
			master.connect(ctx.destination)
		}
		if (ctx.state === 'suspended') {
			ctx.resume().catch(() => {})
		}
	} catch {
		ctx = null
		master = null
	}
}

/**
 * The context when sound may play now, otherwise null.
 *
 * @return {AudioContext|null}
 */
function ready() {
	if (!config.enabled || config.volume === 0 || ctx === null || master === null || ctx.state !== 'running') {
		return null
	}
	return ctx
}

/**
 * Duration factor for a speed name or number.
 *
 * @param {string|number|undefined} speed animation speed (slow|normal|fast|off) or factor
 * @return {number}
 */
export function soundScale(speed) {
	if (typeof speed === 'number') {
		return Math.max(0.5, speed)
	}
	return SPEEDS[speed] ?? 1
}

/**
 * An envelope-shaped gain node connected to `dest`.
 *
 * @param {number} t0 start time
 * @param {number} peak peak gain
 * @param {number} dur duration in seconds (release to silence)
 * @param {AudioNode} dest destination
 * @return {GainNode}
 */
function envelope(t0, peak, dur, dest) {
	const g = ctx.createGain()
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + ATTACK)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(ATTACK * 2, dur))
	g.connect(dest)
	return g
}

/**
 * A tone.
 *
 * @param {object} o options
 * @param {number} o.freq frequency in Hz
 * @param {number} [o.at] start offset in seconds
 * @param {number} o.dur duration in seconds
 * @param {number} [o.gain] peak gain
 * @param {OscillatorType} [o.type] waveform
 * @param {number} [o.detune] cents
 * @param {number} [o.pan] -1..1
 * @param {number} [o.glideTo] target frequency
 */
function tone({ freq, at = 0, dur, gain = 0.2, type = 'sine', detune = 0, pan = 0, glideTo = null }) {
	const t0 = ctx.currentTime + at
	let dest = master
	if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
		const p = ctx.createStereoPanner()
		p.pan.value = pan
		p.connect(master)
		dest = p
	}
	const g = envelope(t0, gain, dur, dest)
	const o = ctx.createOscillator()
	o.type = type
	o.frequency.setValueAtTime(freq, t0)
	if (glideTo !== null) {
		o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur * 0.8)
	}
	o.detune.value = detune
	o.connect(g)
	o.start(t0)
	o.stop(t0 + dur + 0.05)
}

/**
 * One second of white noise (cached).
 *
 * @return {AudioBuffer}
 */
function whiteNoise() {
	if (noiseBuffer === null) {
		noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
		const data = noiseBuffer.getChannelData(0)
		let seed = 0x9e3779b9
		for (let i = 0; i < data.length; i++) {
			// xorshift: deterministic, no Math.random needed
			seed ^= seed << 13
			seed ^= seed >>> 17
			seed ^= seed << 5
			data[i] = ((seed >>> 0) / 4294967296) * 2 - 1
		}
	}
	return noiseBuffer
}

/**
 * Two seconds of pink noise (Paul Kellet's filter, cached).
 *
 * @return {AudioBuffer}
 */
function pinkNoise() {
	if (pinkBuffer === null) {
		const white = whiteNoise().getChannelData(0)
		pinkBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
		const data = pinkBuffer.getChannelData(0)
		let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0
		for (let i = 0; i < data.length; i++) {
			const w = white[i % white.length]
			b0 = 0.99886 * b0 + w * 0.0555179
			b1 = 0.99332 * b1 + w * 0.0750759
			b2 = 0.969 * b2 + w * 0.153852
			b3 = 0.8665 * b3 + w * 0.3104856
			b4 = 0.55 * b4 + w * 0.5329522
			b5 = -0.7616 * b5 - w * 0.016898
			data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
			b6 = w * 0.115926
		}
	}
	return pinkBuffer
}

/**
 * A band-passed noise burst.
 *
 * @param {object} o options
 * @param {number} o.freq centre frequency
 * @param {number} o.q quality
 * @param {number} o.dur duration in seconds
 * @param {number} o.gain peak gain
 */
function noiseBurst({ freq, q, dur, gain }) {
	const t0 = ctx.currentTime
	const src = ctx.createBufferSource()
	src.buffer = whiteNoise()
	const bp = ctx.createBiquadFilter()
	bp.type = 'bandpass'
	bp.frequency.value = freq
	bp.Q.value = q
	const g = envelope(t0, gain, dur, master)
	src.connect(bp)
	bp.connect(g)
	// start at a different point of the buffer each time, so bursts do not sound identical
	bursts = (bursts + 1) % 7
	src.start(t0, bursts * 0.113)
	src.stop(t0 + dur + 0.05)
}

/**
 * Play a sound effect. Silent before the first gesture, when sound is off or the volume is 0.
 *
 * @param {string} name one of SOUND_NAMES
 * @param {object} [options] options
 * @param {string|number} [options.speed] animation speed (slow|normal|fast|off) or its factor
 * @return {boolean} whether something was scheduled
 */
export function playSound(name, { speed = 'normal' } = {}) {
	if (ready() === null) {
		return false
	}
	const k = soundScale(speed)
	const s = (ms) => (ms / 1000) * k
	switch (name) {
	case 'select':
		tone({ freq: 880, dur: s(30), gain: 0.12 })
		break
	case 'move':
		noiseBurst({ freq: 1200, q: 1.5, dur: s(60), gain: 0.22 })
		tone({ freq: 300, dur: s(60), gain: 0.1 })
		break
	case 'capture':
		noiseBurst({ freq: 1200, q: 1.5, dur: s(60), gain: 0.24 })
		tone({ freq: 300, dur: s(60), gain: 0.1 })
		tone({ freq: 180, dur: s(120), gain: 0.32 })
		break
	case 'split':
		tone({ freq: 523.25, dur: s(180), gain: 0.1, detune: -6, pan: -0.3 })
		tone({ freq: 783.99, dur: s(180), gain: 0.08, detune: 6, pan: 0.3 })
		break
	case 'merge':
		tone({ freq: 523.25, dur: s(200), gain: 0.1, glideTo: 659.25, pan: -0.2 })
		tone({ freq: 783.99, dur: s(200), gain: 0.08, glideTo: 659.25, pan: 0.2 })
		break
	case 'measure':
		tone({ freq: 1318.51, dur: s(150), gain: 0.14 })
		break
	case 'captured':
		tone({ freq: 1046.5, dur: s(400), gain: 0.16 })
		tone({ freq: 1568, dur: s(330), gain: 0.09 })
		tone({ freq: 2637, dur: s(120), gain: 0.025 })
		break
	case 'moved':
	case 'missed':
		tone({ freq: 196, dur: s(200), gain: 0.22, type: 'triangle' })
		tone({ freq: 392, dur: s(90), gain: 0.04, type: 'triangle' })
		break
	case 'win':
		[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, at: s(i * 95), dur: s(i === 3 ? 215 : 150), gain: 0.13 }))
		break
	case 'loss':
		tone({ freq: 329.63, dur: s(180), gain: 0.12 })
		tone({ freq: 261.63, at: s(160), dur: s(190), gain: 0.12 })
		break
	case 'yourMove':
		tone({ freq: 659.25, dur: s(130), gain: 0.12 })
		tone({ freq: 880, at: s(110), dur: s(140), gain: 0.12 })
		break
	case 'kingDanger':
		tone({ freq: 110, dur: s(90), gain: 0.2 })
		tone({ freq: 110, at: s(110), dur: s(90), gain: 0.2 })
		break
	case 'illegal':
		tone({ freq: 120, dur: s(40), gain: 0.06 })
		break
	default:
		return false
	}
	return true
}

/**
 * Start the suspense swell of a roll: pink noise through a rising low-pass (400 → 1600 Hz) plus 330 Hz with an 8 Hz
 * tremolo, rising from .02 to .1. It lasts until `stop()`.
 *
 * @param {object} [options] options
 * @param {string|number} [options.speed] animation speed (the swell rises over 600 ms × speed)
 * @return {() => void} stop (fades out in 80 ms; safe to call twice)
 */
export function startSuspense({ speed = 'normal' } = {}) {
	if (ready() === null) {
		return () => {}
	}
	const k = soundScale(speed)
	const t0 = ctx.currentTime
	const rise = 0.6 * k
	const out = ctx.createGain()
	out.gain.setValueAtTime(0.0001, t0)
	out.gain.exponentialRampToValueAtTime(0.02, t0 + 0.02)
	out.gain.exponentialRampToValueAtTime(0.1, t0 + rise)
	out.connect(master)

	const noise = ctx.createBufferSource()
	noise.buffer = pinkNoise()
	noise.loop = true
	const lp = ctx.createBiquadFilter()
	lp.type = 'lowpass'
	lp.frequency.setValueAtTime(400, t0)
	lp.frequency.exponentialRampToValueAtTime(1600, t0 + rise)
	const noiseGain = ctx.createGain()
	noiseGain.gain.value = 0.7
	noise.connect(lp)
	lp.connect(noiseGain)
	noiseGain.connect(out)

	const osc = ctx.createOscillator()
	osc.frequency.value = 330
	const trem = ctx.createGain()
	trem.gain.value = 0.25
	const lfo = ctx.createOscillator()
	lfo.frequency.value = 8
	const lfoDepth = ctx.createGain()
	lfoDepth.gain.value = 0.2
	lfo.connect(lfoDepth)
	lfoDepth.connect(trem.gain)
	osc.connect(trem)
	trem.connect(out)

	noise.start(t0)
	osc.start(t0)
	lfo.start(t0)
	let stopped = false
	return () => {
		if (stopped || ctx === null) {
			return
		}
		stopped = true
		const t1 = ctx.currentTime
		out.gain.cancelScheduledValues(t1)
		out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t1)
		out.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.08)
		for (const node of [noise, osc, lfo]) {
			node.stop(t1 + 0.1)
		}
	}
}
