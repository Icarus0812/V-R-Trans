import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const whisperApi = {
  /**
   * 오디오 ArrayBuffer와 입력 언어를 메인 프로세스로 보내서 전사 요청
   * @param arrayBuffer 녹음된 오디오 데이터
   * @param inputLanguage Whisper 입력 언어 (auto, ja, en, ko 등)
   */
  transcribeBuffer: async (arrayBuffer: ArrayBuffer, inputLanguage: string) => {
    return await ipcRenderer.invoke('whisper:transcribe-buffer', {
      arrayBuffer,
      inputLanguage
    })
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
  ;(window as typeof window & { electron: typeof electronAPI }).electron = electronAPI
  ;(
    window as typeof window & {
      whisperApi: typeof whisperApi
    }
  ).whisperApi = whisperApi
}
