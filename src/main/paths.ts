import { join } from 'node:path'
import { app } from 'electron'

export interface Paths {
  userData: string
  avatars: string
  partitions: string
  logs: string
  downloads: string
  nexusConfig: string
  nexusUserData: string
}

export function resolvePaths(): Paths {
  const nexusHome = process.env.DIWAN_NEXUS_HOME
  const userData = app.getPath('userData')
  return {
    userData,
    avatars: join(userData, 'avatars'),
    partitions: join(userData, 'Partitions'),
    logs: join(userData, 'logs'),
    downloads: app.getPath('downloads'),
    nexusConfig: join(nexusHome ?? app.getPath('home'), '.newwhatsapp', 'config.json'),
    nexusUserData: nexusHome
      ? join(nexusHome, '.config', 'MultiWhatsApp')
      : join(app.getPath('appData'), 'MultiWhatsApp'),
  }
}
