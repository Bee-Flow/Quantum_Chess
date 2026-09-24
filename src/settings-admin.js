/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Entry point of the admin settings page (Administration settings, Quantum Chess).
 */

import { createApp } from 'vue'
import AdminSettings from './settings/components/AdminSettings.vue'

createApp(AdminSettings).mount('#quantumchess-admin-settings')
