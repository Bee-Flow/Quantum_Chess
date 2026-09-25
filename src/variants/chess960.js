/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Placeholder of the chess960 variant: orthodox chess until the variant is implemented.
 */

import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'

export default defineVariant(Object.assign(orthodoxSpec(), { id: 'chess960', category: 'rules', rules: () => [] }))
