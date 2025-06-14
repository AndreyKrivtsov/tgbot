import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export class SessionStore {
    dir = ''

    constructor(dir?: string) {
        if (dir) {
            this.dir = dir
        } else {
            this.dir = ''
        }
    }

    async get() {
        return this.loadFile()
    }

    async set(session: string) {
        if (session) {
            await this.saveFile(session)
        }
    }

    private async loadFile() {
        try {
            const filePath = this.getFilePath()
            const data = await readFile(filePath, { encoding: 'utf-8' })

            if (data) {
                return data
            }

            return ''
        } catch (e) {
            console.error(e)
            return ''
        }
    }

    private async saveFile(data: string) {
        try {
            const filePath = this.getFilePath()

            await writeFile(filePath, data, { encoding: 'utf-8' })
        } catch (e) {
            console.error(e)
        }
    }

    private getFilePath() {
        const filePath = path.join(process.cwd(), this.dir, 'session.db')

        return filePath
    }
}