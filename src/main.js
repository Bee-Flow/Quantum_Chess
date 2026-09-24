/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Entry point of the app page: mounts the shell (`App.vue`) with the router on the page's content element.
 */

import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router.js'

const app = createApp(App)
app.use(createAppRouter())
app.mount('#content')
