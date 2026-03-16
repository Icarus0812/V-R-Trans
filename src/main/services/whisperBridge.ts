import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import readline from 'node:readline'
import { app } from 'electron'
import fs from 'node:fs'

type WhisperResponse = {
  id?: string
  ok?: boolean
  error?: string
  full_text?: string
  text?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
  detected_language?: string
  language_probability?: number
  type?: string
  model?: string
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

  /**
   * 개발/빌드 환경에서 worker 파일 경로를 안전하게 찾는다.
   */
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

  start(): void {
    // 이미 실행 중이면 중복 실행 방지
    if (this.proc) return

    const workerPath = this.resolveWorkerPath()
    const workerDir = path.dirname(workerPath)

    console.log('[whisper] cwd =', process.cwd())
    console.log('[whisper] appPath =', app.getAppPath())

    // python으로 worker 실행
    this.proc = spawn('python', [workerPath], {
      cwd: workerDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.proc.on('error', (error: Error): void => {
      console.error('[whisper] spawn error:', error)
    })

    const rl = readline.createInterface({
      input: this.proc.stdout
    })

    rl.on('line', (line: string): void => {
      try {
        console.log('[whisper stdout]', line)

        const message = JSON.parse(line) as WhisperResponse

        if (message.type === 'ready') {
          this.ready = true
          console.log('[whisper] ready:', message.model)
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
        pending.resolve(message)
      } catch (error) {
        console.error('[whisper] invalid json:', line, error)
      }
    })

    this.proc.stderr.on('data', (chunk: Buffer): void => {
      console.error('[whisper stderr]', chunk.toString())
    })

    this.proc.on('exit', (code, signal): void => {
      console.error('[whisper] exited:', code, signal)

      this.ready = false
      this.proc = null

      for (const [, pending] of this.pending) {
        pending.reject(new Error('Whisper worker exited'))
      }
      this.pending.clear()
    })
  }

  stop(): void {
    if (!this.proc) return

    this.proc.kill()
    this.proc = null
    this.ready = false
  }

  isReady(): boolean {
    return this.ready
  }

  async transcribeFile(audioPath: string): Promise<WhisperResponse> {
    if (!this.proc) {
      throw new Error('Whisper worker is not running')
    }

    if (!this.ready) {
      throw new Error('Whisper worker is starting but not ready yet')
    }

    const id = `req_${Date.now()}_${this.requestSeq++}`

    const payload = {
      id,
      command: 'transcribe',
      audio_path: audioPath
    }

    const promise = new Promise<WhisperResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    this.proc.stdin.write(`${JSON.stringify(payload)}\n`)

    return promise
  }
}

export const whisperBridge = new WhisperBridge()
