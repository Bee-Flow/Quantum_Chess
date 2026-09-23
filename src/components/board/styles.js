/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Global board styles: the design tokens and the six board themes. Imported by every board component, so boards
 * work wherever they are mounted (the bundler includes the files once). App.vue imports tokens.scss as well.
 */

import '../../styles/tokens.scss'
import '../../styles/board-themes.scss'
import './board-global.scss'
