/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Entry point of the personal settings page (Personal settings, Quantum Chess).
 */

import { createApp } from 'vue'
import PersonalSettings from './settings/components/PersonalSettings.vue'

createApp(PersonalSettings).mount('#quantumchess-personal-settings')
