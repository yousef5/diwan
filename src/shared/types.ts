export interface Account {
  id: string
  name: string
  color: string
  order: number
  zoom: number
  muted: boolean
  customAvatar: boolean
  createdAt: string
  importedFrom?: string
}

export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  showPreview: boolean
  markUrgent: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  bounds: Rect | null
  maximized: boolean
}

export interface Settings {
  closeToTray: boolean
  startHidden: boolean
  showWindowControls: boolean
  notifications: NotificationSettings
  window: WindowState
}

export interface DiwanFile {
  schemaVersion: number
  importedFromNexus: boolean
  accounts: Account[]
  settings: Settings
  // Ids of removed accounts whose Partitions/acc-<id> folder is deleted again at the next start.
  pendingFolderRemovals: string[]
}

export type ViewState = 'loading' | 'ready' | 'offline' | 'failed' | 'hung' | 'loggingOut'

export interface AccountRuntime {
  state: ViewState
  unread: number
  avatar: string | null
}

export interface Snapshot {
  accounts: Account[]
  settings: Settings
  runtime: Record<string, AccountRuntime>
  activeId: string | null
  recovery: boolean
  importAvailable: boolean
  trayAvailable: boolean
}

export type ShellCommand =
  | { type: 'remount'; id: string }
  | { type: 'reload'; id: string }
  | { type: 'openSettings' }

export type SettingsPatch = Partial<Omit<Settings, 'notifications' | 'window'>> & {
  notifications?: Partial<NotificationSettings>
}

export interface ImportItem {
  sourceId: string
  name: string
  color: string
  sourceDir: string
  bytes: number
}

export interface ImportPlan {
  available: boolean
  reason: string | null
  items: ImportItem[]
  orphanDirs: number
  nexusRunning: boolean
}

export interface ImportResult {
  imported: string[]
  failed: { name: string; error: string }[]
}
