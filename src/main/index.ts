import { app, shell, BrowserWindow, ipcMain, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { whisperBridge } from './services/whisperBridge'
import fs from 'node:fs'
import path from 'node:path'

const AVAILABLE_WHISPER_MODELS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large-v1',
  'large-v2',
  'large-v3',
  'distil-large-v3'
] as const

const DEFAULT_WHISPER_MODEL = 'small'

function normalizeWhisperModel(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_WHISPER_MODEL
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return DEFAULT_WHISPER_MODEL
  }

  if (!AVAILABLE_WHISPER_MODELS.includes(trimmed as (typeof AVAILABLE_WHISPER_MODELS)[number])) {
    console.warn('[main] unsupported whisper model, fallback to default:', trimmed)
    return DEFAULT_WHISPER_MODEL
  }

  return trimmed
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 현재 실제로 어떤 페이지를 불러왔는지 확인용 로그
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] did-finish-load url:', mainWindow.webContents.getURL())
    console.log('[main] did-finish-load title:', mainWindow.getTitle())
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('[main] load renderer url:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererFilePath = join(__dirname, '../renderer/index.html')
    console.log('[main] load renderer file:', rendererFilePath)
    mainWindow.loadFile(rendererFilePath)
  }
}

app.whenReady().then(async () => {
  try {
    electronApp.setAppUserModelId('com.electron')

    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window']
        })

        const firstSource = sources[0]

        if (!firstSource) {
          callback({
            video: undefined,
            audio: undefined
          })
          return
        }

        callback({
          video: firstSource,
          audio: 'loopback'
        })
      } catch (error) {
        console.error('[display media request handler] error:', error)

        callback({
          video: undefined,
          audio: undefined
        })
      }
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('ping', () => console.log('pong'))

    ipcMain.handle('whisper:get-model-options', async () => {
      return {
        ok: true,
        defaultModel: DEFAULT_WHISPER_MODEL,
        models: [...AVAILABLE_WHISPER_MODELS]
      }
    })

    ipcMain.handle(
      'whisper:transcribe-buffer',
      async (
        _event,
        payload: {
          arrayBuffer: unknown
          inputLanguage?: string
          whisperModel?: string
          translationModel?: string
        }
      ) => {
        const tempDir = path.join(app.getPath('userData'), 'temp')

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        const { arrayBuffer, inputLanguage, whisperModel, translationModel } = payload
        const outputLanguage = 'ko'
        const selectedWhisperModel = normalizeWhisperModel(whisperModel)
        const selectedTranslationModel =
          typeof translationModel === 'string' && translationModel.trim()
            ? translationModel.trim()
            : 'facebook/nllb-200-distilled-600M'
        const filePath = path.join(tempDir, `chunk_${Date.now()}.webm`)

        try {
          let audioNodeBuffer: Buffer

          if (arrayBuffer instanceof ArrayBuffer) {
            audioNodeBuffer = Buffer.from(arrayBuffer)
          } else if (ArrayBuffer.isView(arrayBuffer)) {
            audioNodeBuffer = Buffer.from(
              arrayBuffer.buffer,
              arrayBuffer.byteOffset,
              arrayBuffer.byteLength
            )
          } else if (
            typeof arrayBuffer === 'object' &&
            arrayBuffer !== null &&
            'data' in arrayBuffer &&
            Array.isArray((arrayBuffer as { data: number[] }).data)
          ) {
            audioNodeBuffer = Buffer.from((arrayBuffer as { data: number[] }).data)
          } else {
            throw new Error('Cannot parse audio buffer format.')
          }

          fs.writeFileSync(filePath, audioNodeBuffer)

          console.log('[main] whisper request', {
            filePath,
            inputLanguage,
            outputLanguage,
            whisperModel: selectedWhisperModel,
            byteLength: audioNodeBuffer.byteLength
          })

          const result = await whisperBridge.transcribeFile(
            filePath,
            inputLanguage ?? 'auto',
            outputLanguage,
            selectedWhisperModel,
            selectedTranslationModel
          )

          console.log('[main] whisper response', result)

          return {
            ok: true,
            ...result
          }
        } catch (error) {
          console.error('[whisper:transcribe-buffer] error:', error)

          return {
            ok: false,
            text: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        } finally {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath)
            }
          } catch (deleteError) {
            console.error('[temp file delete error]:', deleteError)
          }
        }
      }
    )

    // 다운로드 진행률을 renderer 로 전달
    whisperBridge.onProgress((data) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('whisper:download-progress', data)
      })
    })

    await whisperBridge.start()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    console.error('[app.whenReady] startup error:', error)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  try {
    await whisperBridge.stop()
  } catch (error) {
    console.error('[before-quit] whisper stop error:', error)
  }
})
