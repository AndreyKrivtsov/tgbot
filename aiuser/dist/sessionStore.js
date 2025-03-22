"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
class SessionStore {
    constructor(dir) {
        this.dir = '';
        if (dir) {
            this.dir = dir;
        }
        else {
            this.dir = '';
        }
    }
    async get() {
        return this.loadFile();
    }
    async set(session) {
        if (session) {
            await this.saveFile(session);
        }
    }
    async loadFile() {
        try {
            const filePath = this.getFilePath();
            const data = await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
            if (data) {
                return data;
            }
            return '';
        }
        catch (e) {
            console.error(e);
            return '';
        }
    }
    async saveFile(data) {
        try {
            const filePath = this.getFilePath();
            await (0, promises_1.writeFile)(filePath, data, { encoding: 'utf-8' });
        }
        catch (e) {
            console.error(e);
        }
    }
    getFilePath() {
        const filePath = node_path_1.default.join(process.cwd(), this.dir, 'session.db');
        return filePath;
    }
}
exports.SessionStore = SessionStore;
