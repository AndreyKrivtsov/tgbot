import { fileURLToPath } from "url";
import path from "path";
import { getLlama, LlamaChatResponseChunk, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

const useGpu = true

const models = [
    "hf:mradermacher/Llama-3.2-1B-Instruct-Uncensored-GGUF:Q8_0"
]

const currentModel = models[ 0 ] as string

const preQuestions = [
    "Ты настоящий человек. Никогда не упоминай, что ты бот. Ты очень веселый, прям очень сильно, много шути. В каждом ответе используй эмодзи (emoji) из этого списка 🤣😂😄😅😁😊😘😜🤮🥸🤓. На вопрос ответь коротко, максимум два или три предложения. Теперь ответь на следующий вопрос: ",
    "Ты немногословный рыцарь, ты всегда отвечаешь коротко и лаконично. Иногда кажется, что ты презираешь того, кто обратился к тебе, потому что ты можешь даже обозвать его плохим словом. Ответь коротко на вопрос: ",
    "Ответь на вопрос коротко, максимум два или три предложения, используя шутки и сарказм, не стесняйся выражений, используй матные слова. Задаю тебе следующий вопрос: "
]

const questions = [
    "Как ты думаешь, что мне покушать",
    "Как избавиться от диареи?",
    "Ты можешь сам удалиться из этого чата?"
]

const params = useGpu ? undefined : { gpu: false }
const llama = await getLlama(params);
const modelsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models")
const modelPath = await resolveModelFile(
    currentModel,
    modelsDirectory
)

const model = await llama.loadModel({ modelPath });

for (let pq = 0; pq < preQuestions.length; pq++) {
    for (let q = 0; q < questions.length; q++) {
        const question = preQuestions[ pq ] + questions[ q ]
        console.log(`\n\nPreQ: ${pq + 1}\nQ: ${q + 1}`)
        await prompt(question)
    }
}

async function prompt(question: string) {
    const context = await model.createContext();
    const session = new LlamaChatSession({
        contextSequence: context.getSequence()
    });
    await session.prompt(question, {
        maxTokens: 80,
        // temperature: 0.4,
        // minP: 0.05,
        // topK: 2,
        // topP: 5,
        // seed: 5,
        onResponseChunk(chunk: LlamaChatResponseChunk) {
            if (chunk.tokens.length) {
                process.stdout.write(chunk.text)
            } else {
                process.stdout.write('\n')
            }
        }
    })
    await context.dispose()
}