/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Probability text: every number comes from the engine's `pct()`, so an uncertain event
 * is never shown as 0 % or 100 %, and is printed with `Intl.NumberFormat` ("50%" in English, "50 %" in Dutch and
 * German). The Fraction format shows exact dyadic fractions (½, ¼, ⅜) when the weight is a multiple of T/64.
 */

import { getCanonicalLocale } from '@nextcloud/l10n'
import { pct, T } from '../index.js'

const VULGAR = Object.freeze({ '1/2': '½', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' })
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUB = '₀₁₂₃₄₅₆₇₈₉'

const formatters = new Map()

/**
 * The canonical locale of the page ("en-US"), or "en".
 *
 * @return {string}
 */
function uiLocale() {
	try {
		return getCanonicalLocale() || 'en'
	} catch {
		return 'en'
	}
}

/**
 * A cached percent formatter for the page locale.
 *
 * @return {Intl.NumberFormat}
 */
function percentFormatter() {
	const locale = uiLocale()
	let f = formatters.get(locale)
	if (f === undefined) {
		try {
			f = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
		} catch {
			f = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 })
		}
		formatters.set(locale, f)
	}
	return f
}

/**
 * A weight on the T scale from a weight or a probability. Numbers above 1 are weights; numbers from 0 to 1 are
 * probabilities (pass `{weight: true}` for the weight 1).
 *
 * @param {number} value weight 0..T or probability 0..1
 * @param {boolean} [isWeight] force the weight interpretation
 * @return {number}
 */
function toWeight(value, isWeight = false) {
	if (!Number.isFinite(value) || value <= 0) {
		return 0
	}
	return isWeight || value > 1 ? value : value * T
}

/**
 * Locale-aware percentage text of a whole percent value ("50%" / "50 %").
 *
 * @param {number} percent integer 0..100
 * @return {string}
 */
export function formatPercentNumber(percent) {
	return percentFormatter().format(percent / 100)
}

/**
 * Digits in super- or subscript.
 *
 * @param {number} value non-negative integer
 * @param {string} digits the ten digit characters
 * @return {string}
 */
function scriptDigits(value, digits) {
	return String(value).split('').map((d) => digits[Number(d)]).join('')
}

/**
 * The exact dyadic fraction of a weight, or null when the weight is not a multiple of T/64.
 *
 * @param {number} weight weight 0..T
 * @return {string|null}
 */
function dyadicFraction(weight) {
	const unit = T / 64
	if (!Number.isInteger(weight) || weight % unit !== 0) {
		return null
	}
	let num = weight / unit
	let den = 64
	if (num === 0) {
		return '0'
	}
	if (num === den) {
		return '1'
	}
	while (num % 2 === 0) {
		num /= 2
		den /= 2
	}
	const key = num + '/' + den
	return VULGAR[key] ?? scriptDigits(num, SUP) + '⁄' + scriptDigits(den, SUB)
}

/**
 * Probability text for badges, previews and copy.
 *
 * @param {number} weightOrProb a weight 0..T (integers above 1) or a probability 0..1
 * @param {object} [options] options
 * @param {'percent'|'fraction'} [options.format] display format (default percent)
 * @param {boolean} [options.weight] the value is a weight even if it is 1
 * @return {string}
 */
export function formatProbability(weightOrProb, { format = 'percent', weight = false } = {}) {
	const w = toWeight(weightOrProb, weight)
	if (format === 'fraction') {
		const frac = dyadicFraction(w)
		if (frac !== null) {
			return frac
		}
	}
	return formatPercentNumber(pct(w))
}
