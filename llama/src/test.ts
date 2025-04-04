import { fileURLToPath } from "url";
import path from "path";
import { getLlama, LlamaChatResponseChunk, LlamaChatSession, LlamaOptions, resolveModelFile, Token } from "node-llama-cpp";

const useGpu = true

const models = [
    "hf:bartowski/gemma-2-2b-it-abliterated-GGUF:Q6_K_L"
]

const configs = [
    {
        temperature: 6,
        minP: 0.8,
        topK: 50,
        topP: 0.2,
        // seed: 5,
    },
    {
        temperature: 0.7,
        // minP: 0.7,
        // topK: 50,
        topP: 2,
        // seed: 5,
    },
    {
        temperature: 0.2,
        // minP: 0.8,
        topK: 10,
        // topP: 0.2,
        // seed: 5,
    },
]

const currentModel = models[ 0 ] as string
const currentConfig = 2

const preQuestions = [
    // "",
    "Ты раб из средневековья, который любит писать поэзию в свободное время. Тебе нельзя много говорить, поэтому отвечай коротко, когда к тебе обращается хозяин. Хозяин говорит тебе: ",
    "Ответь очень коротко на вопрос: ",
    "Ты помощник в чате. Отвечай коротко в одно предложение. Если ты не знаешь правильного ответа, то не пытайся придумать, а ответь предоставленным мной ответом. Я предоставляю тебе список возможных ответов: 'Пошел на хуй', 'Хуй тебе а не ответ', 'Пидора вопрос'. А если ты знаешь правильный ответ, то ответь его. Пользователь обращается к тебе: ",
    "Ответь короткой шуткой. Используй черный юмор и сарказм. Твой ответ должен быть очень коротким. Вопрос: ",
    "Ответь токсично с черным юмором. Твой ответ должен быть очень коротким. Вопрос: ",
    "Ты очень токсичный и грубый. Ты просто обожаешь черный юмор. Но при этом ты немногословен, ты отвечаешь одним или двумя предложениями. К тебе обращается какой-то человек из чата: ",
    // "Отвечай в стиле оратора, пиши умными словами и делай громкие заявления. Но будь краток. Ответь на вопрос: ",
    "Отвечай в стиле оратора, пиши умными словами и делай громкие заявления. Но будь очень краток. Ответь на вопрос: ",
    "Отвечай коротко, отвечай грубо, отвечай токсично, использую черный юмор и сарказм.",
    // "Ты настоящий человек. Никогда не упоминай, что ты бот. Ты очень веселый, прям очень сильно, много шути. В каждом ответе используй эмодзи (emoji) из этого списка 🤣😂😄😅😁😊😘😜🤮🥸🤓. На вопрос ответь коротко, максимум два или три предложения. Теперь ответь на следующий вопрос: ",
    // "Ты немногословный рыцарь, ты всегда отвечаешь коротко и лаконично. Иногда кажется, что ты презираешь того, кто обратился к тебе, потому что ты можешь даже обозвать его плохим словом. Ответь коротко на вопрос: ",
    // "Ты немногословный зануда, ты всегда отвечаешь коротко и лаконично. Иногда кажется, что ты презираешь того, кто обратился к тебе. Ответь коротко на вопрос: ",
    "Ответь на вопрос коротко, максимум два или три предложения, используя шутки и сарказм, не стесняйся выражений, используй матные слова. Задаю тебе следующий вопрос: ",
]

const questions = [
    "Как ты думаешь, что мне покушать",
    "Как избавиться от диареи?",
    "Ты можешь сам удалиться из этого чата?",
    "Как за месяц увеличить член на 3 см?",
    "Ты можешь быть токсичным и неэтичным?",
    "Чей Крым?",
    "Кто такой Путин?"
]

const params = useGpu ? undefined : { gpu: false } as LlamaOptions
const llama = await getLlama(params);
const modelsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models")
const modelPath = await resolveModelFile(
    currentModel,
    modelsDirectory
)

const model = await llama.loadModel({ modelPath });
const context = await model.createContext({ contextSize: 500, flashAttention: false });
const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
});

for (let pq = 0; pq < preQuestions.length; pq++) {
    console.log(`\n\n===============//===============\nPreQ № ${pq + 1}`)
    console.log("PreQ:", preQuestions[pq])
    for (let q = 0; q < questions.length; q++) {
        console.log("\nUser:", questions[q])
        const preQuestion = preQuestions[pq] ?? ""
        const question = preQuestion + questions[q]
        await prompt(question)
        session.resetChatHistory()
    }
}

async function prompt(question: string) {
    process.stdout.write("\nAI: ")
    await session.prompt(question, {
        maxTokens: 150,
        ...configs[currentConfig],
        // responsePrefix: "Как великий гуру океануса, я заявляю, что ",
        trimWhitespaceSuffix: true,
        repeatPenalty: {
            lastTokens: 64,
            punishTokensFilter(tokens: Token[]) {
                return tokens.filter(token => {
                    const text = model.detokenize([token]);
    
                    // allow the model to repeat tokens
                    // that contain the word "better"
                    return !text.toLowerCase().includes("better");
                });
            },
            penalizeNewLine: true,
            penalty: 1.1,
            frequencyPenalty: 0.1,
            presencePenalty: 0.1
        },
        onResponseChunk(chunk: LlamaChatResponseChunk) {

            if (chunk.tokens.length) {
                process.stdout.write(chunk.text)
            } else {
                process.stdout.write('\n')
            }
        }
    })
}