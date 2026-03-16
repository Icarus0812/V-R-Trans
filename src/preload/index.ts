import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const whisperApi = {
  /**
   * 오디오 ArrayBuffer를 메인 프로세스로 보내서 전사 요청
   */
  transcribeBuffer: async (arrayBuffer: ArrayBuffer) => {
    return await ipcRenderer.invoke('whisper:transcribe-buffer', arrayBuffer)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('whisperApi', whisperApi)
  } catch (error) {
    console.error('[preload expose error]', error)
  }
} else {
  // contextIsolation이 꺼진 경우 fallback
  ;(window as typeof window & { electron: typeof electronAPI }).electron = electronAPI
  ;(
    window as typeof window & {
      whisperApi: typeof whisperApi
    }
  ).whisperApi = whisperApi
}
