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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
        }
      ) => {
        const tempDir = path.join(app.getPath('userData'), 'temp')

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        const { arrayBuffer, inputLanguage, whisperModel } = payload
        const outputLanguage = 'ko'
        const selectedWhisperModel = normalizeWhisperModel(whisperModel)

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
            throw new Error('오디오 버퍼 형식을 해석할 수 없습니다.')
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
            selectedWhisperModel
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
