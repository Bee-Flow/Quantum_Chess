/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router.js'

const app = createApp(App)
app.use(createAppRouter())
app.mount('#content')
