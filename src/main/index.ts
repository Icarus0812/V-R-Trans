import { app, shell, BrowserWindow, ipcMain, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { whisperBridge } from './services/whisperBridge'
import fs from 'node:fs'
import path from 'node:path'

function createWindow(): void {
  // 메인 브라우저 창 생성
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,

    // 기본 Electron 메뉴바 자동 숨김
    autoHideMenuBar: true,

    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      // preload 연결
      preload: join(__dirname, '../preload/index.js'),

      // Electron 보안 옵션
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 기본 Electron 메뉴바 완전히 숨김
  // TopBar는 renderer에서 hover로 따로 제어하므로 이건 꺼도 된다.
  mainWindow.setMenuBarVisibility(false)

  // 준비되면 창 표시
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 새 창 요청은 외부 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 개발 환경이면 dev server 로드, 아니면 빌드 파일 로드
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    // Windows 앱 식별자 설정
    electronApp.setAppUserModelId('com.electron')

    // renderer의 getDisplayMedia 요청을 Electron이 처리하도록 연결
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        // 사용 가능한 화면/창 목록 가져오기
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

        // 첫 번째 화면을 기본 선택하고 시스템 오디오는 loopback으로 연결
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

    // 개발 중 단축키 설정
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // IPC 테스트
    ipcMain.on('ping', () => console.log('pong'))

    /**
     * 렌더러가 보낸 오디오 버퍼를 임시 파일로 저장하고
     * Whisper worker로 전사 요청을 보낸다.
     *
     * payload:
     * - arrayBuffer: 녹음된 오디오 데이터
     * - inputLanguage: Whisper 입력 언어 (auto, ja, en, ko 등)
     */
    ipcMain.handle(
      'whisper:transcribe-buffer',
      async (
        _event,
        payload: {
          arrayBuffer: unknown
          inputLanguage: string
        }
      ) => {
        // userData 아래 temp 폴더 사용
        const tempDir = path.join(app.getPath('userData'), 'temp')

        // temp 폴더가 없으면 생성
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        // payload에서 데이터 꺼내기
        const { arrayBuffer, inputLanguage } = payload

        // 임시 파일 경로 생성
        const filePath = path.join(tempDir, `chunk_${Date.now()}.webm`)

        try {
          /**
           * preload -> main IPC 과정에서 arrayBuffer가
           * 진짜 ArrayBuffer가 아니라 일반 객체처럼 들어올 수 있어서
           * 여기서 안전하게 Node Buffer로 정규화한다.
           */
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
            // 직렬화 과정에서 { data: [...] } 형태로 온 경우 처리
            audioNodeBuffer = Buffer.from((arrayBuffer as { data: number[] }).data)
          } else {
            throw new Error('오디오 버퍼 형식을 해석할 수 없습니다.')
          }

          // 렌더러에서 받은 오디오 버퍼를 파일로 저장
          fs.writeFileSync(filePath, audioNodeBuffer)

          // 저장한 파일을 Whisper worker에 전달해서 전사
          const result = await whisperBridge.transcribeFile(filePath, inputLanguage)

          // 성공 결과 반환
          return {
            ok: true,
            ...result
          }
        } catch (error) {
          console.error('[whisper:transcribe-buffer] error:', error)

          // 실패 결과 반환
          return {
            ok: false,
            text: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        } finally {
          // 임시 파일 삭제
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

    // Whisper Python worker 시작
    await whisperBridge.start()

    // 메인 창 생성
    createWindow()

    app.on('activate', () => {
      // macOS에서 창이 하나도 없으면 다시 생성
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
