import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('diwan', { ready: true })
