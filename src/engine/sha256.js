/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Synchronous pure-JS SHA-256 (FIPS 180-4) over the UTF-8 bytes of a string. Works in browsers, Web Workers and
 * Node without Web Crypto (whose digest is asynchronous).
 *
 * PHP twin: PHP's built-in `hash('sha256', …)`. Section numbers (§) refer to docs/engine-rules.md.
 */

const K = new Uint32Array([
	0x428a2f98,
	0x71374491,
	0xb5c0fbcf,
	0xe9b5dba5,
	0x3956c25b,
	0x59f111f1,
	0x923f82a4,
	0xab1c5ed5,
	0xd807aa98,
	0x12835b01,
	0x243185be,
	0x550c7dc3,
	0x72be5d74,
	0x80deb1fe,
	0x9bdc06a7,
	0xc19bf174,
	0xe49b69c1,
	0xefbe4786,
	0x0fc19dc6,
	0x240ca1cc,
	0x2de92c6f,
	0x4a7484aa,
	0x5cb0a9dc,
	0x76f988da,
	0x983e5152,
	0xa831c66d,
	0xb00327c8,
	0xbf597fc7,
	0xc6e00bf3,
	0xd5a79147,
	0x06ca6351,
	0x14292967,
	0x27b70a85,
	0x2e1b2138,
	0x4d2c6dfc,
	0x53380d13,
	0x650a7354,
	0x766a0abb,
	0x81c2c92e,
	0x92722c85,
	0xa2bfe8a1,
	0xa81a664b,
	0xc24b8b70,
	0xc76c51a3,
	0xd192e819,
	0xd6990624,
	0xf40e3585,
	0x106aa070,
	0x19a4c116,
	0x1e376c08,
	0x2748774c,
	0x34b0bcb5,
	0x391c0cb3,
	0x4ed8aa4a,
	0x5b9cca4f,
	0x682e6ff3,
	0x748f82ee,
	0x78a5636f,
	0x84c87814,
	0x8cc70208,
	0x90befffa,
	0xa4506ceb,
	0xbef9a3f7,
	0xc67178f2,
])

/**
 * UTF-8 encode a string (lone surrogates become U+FFFD, like TextEncoder).
 *
 * @param {string} s text
 * @return {Uint8Array}
 */
function utf8Bytes(s) {
	const out = []
	for (let i = 0; i < s.length; i++) {
		let c = s.charCodeAt(i)
		if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
			const d = s.charCodeAt(i + 1)
			if (d >= 0xdc00 && d <= 0xdfff) {
				c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00)
				i++
			} else {
				c = 0xfffd
			}
		} else if (c >= 0xd800 && c <= 0xdfff) {
			c = 0xfffd
		}
		if (c < 0x80) {
			out.push(c)
		} else if (c < 0x800) {
			out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
		} else if (c < 0x10000) {
			out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
		} else {
			out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
		}
	}
	return Uint8Array.from(out)
}

/**
 * SHA-256 of bytes, as 64 lowercase hex digits.
 *
 * @param {Uint8Array} bytes message
 * @return {string}
 */
function sha256Bytes(bytes) {
	const len = bytes.length
	const total = ((len + 9 + 63) >> 6) << 6
	const buf = new Uint8Array(total)
	buf.set(bytes)
	buf[len] = 0x80
	const bitLen = len * 8
	// 64-bit big-endian length (messages here are far below 2^53 bits)
	const hi = Math.floor(bitLen / 4294967296)
	const lo = bitLen >>> 0
	buf[total - 8] = hi >>> 24
	buf[total - 7] = (hi >>> 16) & 255
	buf[total - 6] = (hi >>> 8) & 255
	buf[total - 5] = hi & 255
	buf[total - 4] = lo >>> 24
	buf[total - 3] = (lo >>> 16) & 255
	buf[total - 2] = (lo >>> 8) & 255
	buf[total - 1] = lo & 255
	const H = new Uint32Array([
		0x6a09e667,
		0xbb67ae85,
		0x3c6ef372,
		0xa54ff53a,
		0x510e527f,
		0x9b05688c,
		0x1f83d9ab,
		0x5be0cd19,
	])
	const W = new Uint32Array(64)
	for (let off = 0; off < total; off += 64) {
		for (let t = 0; t < 16; t++) {
			const j = off + t * 4
			W[t] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3]
		}
		for (let t = 16; t < 64; t++) {
			const x = W[t - 15]
			const y = W[t - 2]
			const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
			const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
			W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
		}
		let a = H[0]
		let b = H[1]
		let c = H[2]
		let d = H[3]
		let e = H[4]
		let f = H[5]
		let g = H[6]
		let h = H[7]
		for (let t = 0; t < 64; t++) {
			const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
			const ch = (e & f) ^ (~e & g)
			const t1 = (h + S1 + ch + K[t] + W[t]) | 0
			const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
			const maj = (a & b) ^ (a & c) ^ (b & c)
			const t2 = (S0 + maj) | 0
			h = g
			g = f
			f = e
			e = (d + t1) | 0
			d = c
			c = b
			b = a
			a = (t1 + t2) | 0
		}
		H[0] += a
		H[1] += b
		H[2] += c
		H[3] += d
		H[4] += e
		H[5] += f
		H[6] += g
		H[7] += h
	}
	let out = ''
	for (let i = 0; i < 8; i++) {
		out += (H[i] >>> 0).toString(16).padStart(8, '0')
	}
	return out
}

/**
 * sha256hex (§9.4): lowercase hex SHA-256 over the UTF-8 bytes of a string.
 *
 * @param {string} text text
 * @return {string}
 */
export function sha256hex(text) {
	return sha256Bytes(utf8Bytes(text))
}
