import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('whisperApi', {
  // Whisper + 번역 모델 목록 조회
  getModelOptions: () => ipcRenderer.invoke('whisper:get-model-options'),

  // 오디오 버퍼 전사 요청
  transcribeBuffer: (payload: {
    arrayBuffer: ArrayBuffer
    inputLanguage?: string
    whisperModel?: string
    translationModel?: string
  }) => ipcRenderer.invoke('whisper:transcribe-buffer', payload),

  // 다운로드 진행률 구독 (cleanup 함수 반환)
  onDownloadProgress: (
    callback: (data: {
      type: string
      desc?: string
      n?: number
      total?: number
      percent?: number
      stage?: string
      model?: string
      status?: string
    }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as Parameters<typeof callback>[0])
    }
    ipcRenderer.on('whisper:download-progress', handler)
    // 구독 해제 함수 반환
    return (): void => {
      ipcRenderer.removeListener('whisper:download-progress', handler)
    }
  }
})
