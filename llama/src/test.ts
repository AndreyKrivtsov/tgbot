import { fileURLToPath } from "url";
import path from "path";
import { getLlama, LlamaChatResponseChunk, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

const llama = await getLlama({ gpu: false });

const modelsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models")

const modelPath = await resolveModelFile(
    "hf:Vikhrmodels/Vikhr-Gemma-2B-instruct-GGUF:Q4_K",
    modelsDirectory
)

const model = await llama.loadModel({ modelPath });
const context = await model.createContext();

const session = new LlamaChatSession({
    contextSequence: context.getSequence()
});

await session.prompt('Привет. Как дела? Сочини анекдот.', {
    onResponseChunk(chunk: LlamaChatResponseChunk) {
        if (chunk.tokens.length) {
            process.stdout.write(chunk.text)
        } else {
            process.stdout.write('\n')
        }
    }
})