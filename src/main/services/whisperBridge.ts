import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import readline from 'node:readline'
import { app } from 'electron'
import fs from 'node:fs'

type WhisperSegment = {
  start: number
  end: number
  text: string
}

type WhisperResponse = {
  id?: string
  ok?: boolean
  error?: string
  full_text?: string
  text?: string
  english_pivot_text?: string
  segments?: WhisperSegment[]
  translated_segments?: WhisperSegment[]
  detected_language?: string
  language_probability?: number
  type?: string
  model?: string
  whisper_model?: string
  default_whisper_model?: string
  available_whisper_models?: string[]
  translation_model?: string
  pong?: boolean
}

type PendingResolver = {
  resolve: (value: WhisperResponse) => void
  reject: (reason?: unknown) => void
}

class WhisperBridge {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready = false
  private pending = new Map<string, PendingResolver>()
  private requestSeq = 0
  private startPromise: Promise<void> | null = null
  private stderrBuffer = ''

  private resolveWorkerPath(): string {
    const candidatePaths = [
      path.join(process.cwd(), 'backend', 'whisper_worker.py'),
      path.join(app.getAppPath(), 'backend', 'whisper_worker.py'),
      path.join(app.getAppPath(), '..', 'backend', 'whisper_worker.py'),
      path.join(app.getAppPath(), '..', '..', 'backend', 'whisper_worker.py')
    ]

    const foundPath = candidatePaths.find((candidate) => fs.existsSync(candidate))

    if (!foundPath) {
      console.error('[whisper] worker file not found')
      console.error('[whisper] checked paths:')
      candidatePaths.forEach((candidate) => {
        console.error(' -', candidate)
      })
      throw new Error('whisper_worker.py 파일을 찾지 못했습니다.')
    }

    console.log('[whisper] workerPath =', foundPath)
    return foundPath
  }

  async start(): Promise<void> {
    if (this.proc && this.ready) return
    if (this.startPromise) return this.startPromise

    this.startPromise = new Promise<void>((resolve, reject) => {
      const workerPath = this.resolveWorkerPath()
      const workerDir = path.dirname(workerPath)

      console.log('[whisper] cwd =', process.cwd())
      console.log('[whisper] appPath =', app.getAppPath())

      const child = spawn('python', ['-X', 'utf8', workerPath], {
        cwd: workerDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      })

      this.proc = child
      this.ready = false
      this.stderrBuffer = ''

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')

      child.on('error', (error: Error): void => {
        console.error('[whisper] spawn error:', error)
        this.proc = null
        this.ready = false
        reject(error)
      })

      const rl = readline.createInterface({
        input: child.stdout
      })

      rl.on('line', (line: string): void => {
        try {
          console.log('[whisper stdout]', line)

          const message = JSON.parse(line) as WhisperResponse

          if (message.type === 'ready') {
            this.ready = true
            console.log('[whisper] ready', {
              defaultWhisperModel: message.default_whisper_model ?? message.model,
              availableWhisperModels: message.available_whisper_models ?? [],
              translationModel: message.translation_model
            })
            resolve()
            return
          }

          const id = message.id
          if (!id) {
            console.log('[whisper] message without id:', message)
            return
          }

          const pending = this.pending.get(id)
          if (!pending) return

          this.pending.delete(id)

          if (message.ok === false) {
            pending.reject(new Error(message.error || 'Whisper worker request failed.'))
            return
          }

          pending.resolve(message)
        } catch (error) {
          console.error('[whisper] invalid json:', line, error)
        }
      })

      child.stderr.on('data', (chunk: string): void => {
        this.stderrBuffer += chunk

        if (this.stderrBuffer.length > 8000) {
          this.stderrBuffer = this.stderrBuffer.slice(-8000)
        }

        console.error('[whisper stderr]', chunk)
      })

      child.on('exit', (code: number | null, signal: NodeJS.Signals | null): void => {
        console.error('[whisper] exited:', code, signal)

        const error = new Error(
          `Whisper worker exited. code=${code} signal=${signal}\n${this.stderrBuffer}`
        )

        this.ready = false
        this.proc = null

        for (const [, pending] of this.pending) {
          pending.reject(error)
        }
        this.pending.clear()

        reject(error)
      })
    }).finally((): void => {
      this.startPromise = null
    })

    return this.startPromise
  }

  async stop(): Promise<void> {
    if (!this.proc) return

    this.proc.kill()
    this.proc = null
    this.ready = false
  }

  isReady(): boolean {
    return this.ready
  }

  async transcribeFile(
    audioPath: string,
    inputLanguage?: string,
    outputLanguage: string = 'source',
    whisperModel?: string
  ): Promise<WhisperResponse> {
    await this.start()

    if (!this.proc || !this.ready) {
      throw new Error(`Whisper worker failed to start.\n${this.stderrBuffer}`)
    }

    const id = `req_${Date.now()}_${this.requestSeq++}`

    const normalizedLanguage = inputLanguage && inputLanguage !== 'auto' ? inputLanguage : undefined

    const normalizedOutputLanguage =
      outputLanguage && outputLanguage.trim() !== '' ? outputLanguage : 'source'

    const normalizedWhisperModel =
      whisperModel && whisperModel.trim() !== '' ? whisperModel.trim() : undefined

    const payload = {
      id,
      command: 'transcribe',
      audio_path: audioPath,
      input_language: normalizedLanguage,
      output_language: normalizedOutputLanguage,
      whisper_model: normalizedWhisperModel
    }

    const promise = new Promise<WhisperResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    this.proc.stdin.write(`${JSON.stringify(payload)}\n`, 'utf8')

    return promise
  }
}

export const whisperBridge = new WhisperBridge()
