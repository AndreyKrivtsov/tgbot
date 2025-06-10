# 📊 Диаграмма архитектуры системы

## 🏗️ Общая архитектура

```mermaid
graph TB
    subgraph "App Layer"
        APP[App.ts<br/>Main Application]
        INDEX[index.ts<br/>Entry Point]
    end
    
    subgraph "Core Layer"
        CONTAINER[Container.ts<br/>DI Container]
        APPLICATION[Application.ts<br/>Service Orchestrator]
    end
    
    subgraph "Business Services"
        TELEGRAM[TelegramBot/<br/>Main Bot Logic]
        CAPTCHA[CaptchaService/<br/>User Verification]
        ANTISPAM[AntiSpamService/<br/>Spam Detection]
        AICHAT[AIChatService/<br/>AI Conversations]
    end
    
    subgraph "Infrastructure Services"
        AI[AI/<br/>Gemini API]
        DATABASE[DatabaseService/<br/>PostgreSQL]
        CACHE[CacheService/<br/>Redis/Memory]
        REDIS[RedisService/<br/>Redis Client]
        API[ApiServerService/<br/>Fastify API]
    end
    
    subgraph "Data Layer"
        REPO[Repository<br/>Data Access]
        CONFIG[config.ts<br/>Configuration]
        LOGGER[Logger<br/>Logging]
    end
    
    subgraph "External Systems"
        TELEGRAM_API[Telegram Bot API]
        GEMINI[Google Gemini API]
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis)]
    end
    
    INDEX --> APP
    APP --> APPLICATION
    APPLICATION --> CONTAINER
    
    CONTAINER --> TELEGRAM
    CONTAINER --> CAPTCHA
    CONTAINER --> ANTISPAM
    CONTAINER --> AICHAT
    CONTAINER --> AI
    CONTAINER --> DATABASE
    CONTAINER --> CACHE
    CONTAINER --> REDIS
          CONTAINER --> API
    CONTAINER --> REPO
    
    TELEGRAM --> CAPTCHA
    TELEGRAM --> ANTISPAM
    TELEGRAM --> AICHAT
    TELEGRAM --> REPO
    
    ANTISPAM --> AI
    AICHAT --> AI
    
    AI --> GEMINI
    DATABASE --> POSTGRES
    CACHE --> REDIS
    REDIS --> REDIS
    TELEGRAM --> TELEGRAM_API
    
    CONTAINER --> CONFIG
    CONTAINER --> LOGGER
```

## 🔄 Поток данных - Капча

```mermaid
sequenceDiagram
    participant U as User
    participant T as Telegram API
    participant TBS as TelegramBotService
    participant CS as CaptchaService
    participant REPO as Repository
    
    U->>T: Joins chat
    T->>TBS: chat_member event
    TBS->>CS: generateCaptcha()
    CS-->>TBS: {question, answer, options}
    TBS->>T: Send captcha message
    T-->>U: Shows captcha
    TBS->>T: restrictChatMember()
    TBS->>CS: addRestrictedUser()
    CS->>CS: Start timeout monitoring
    
    U->>T: Clicks answer
    T->>TBS: callback_query event
    TBS->>CS: validateAnswer()
    CS-->>TBS: {isValid, user}
    
    alt Correct Answer
        TBS->>T: unrestrictChatMember()
        TBS->>T: Send welcome message
        TBS->>CS: removeRestrictedUser()
    else Wrong Answer
        TBS->>T: banChatMember()
        TBS->>T: Send failure message
        TBS->>CS: removeRestrictedUser()
    end
```

## 🛡️ Поток данных - Антиспам

```mermaid
sequenceDiagram
    participant U as User
    participant T as Telegram API
    participant TBS as TelegramBotService
    participant AS as AntiSpamService
    participant AI as AIService
    participant G as Gemini API
    
    U->>T: Sends message
    T->>TBS: message event
    TBS->>AS: checkMessage(userId, message)
    AS->>AS: Check message count (≤5?)
    
    alt First 5 messages
        AS->>AS: performBasicChecks()
        alt Basic spam detected
            AS-->>TBS: {isSpam: true, reason}
            TBS->>T: Delete message
            TBS->>T: Send warning
        else No basic spam
            AS->>AI: checkSpam(prompt)
            AI->>G: Analyze message
            G-->>AI: "СПАМ" or "НЕ СПАМ"
            AI-->>AS: spam result
            AS-->>TBS: {isSpam: boolean, reason}
            
            alt AI detected spam
                TBS->>T: Delete message
                TBS->>T: Send warning
            else Message approved
                TBS->>TBS: Continue processing
            end
        end
    else More than 5 messages
        AS-->>TBS: {isSpam: false, shouldCheck: false}
        TBS->>TBS: Continue processing
    end
```

## 🤖 Поток данных - AI Чат

```mermaid
sequenceDiagram
    participant U as User
    participant T as Telegram API
    participant TBS as TelegramBotService
    participant ACS as AIChatService
    participant AI as AIService
    participant G as Gemini API
    
    U->>T: Sends "@bot hello"
    T->>TBS: message event
    TBS->>ACS: isBotMention(message)
    ACS-->>TBS: true
    TBS->>ACS: processMessage()
    
    ACS->>ACS: checkDailyLimit()
    alt Limit exceeded
        ACS-->>TBS: {success: false, reason: "Daily limit"}
        TBS->>T: Send limit message
    else Limit OK
        ACS->>ACS: Check queue size (≤8?)
        alt Queue full
            ACS-->>TBS: {success: false, reason: "Queue full"}
            TBS->>T: Send queue message
        else Queue OK
            ACS->>ACS: prepareContextualMessage()
            ACS->>ACS: Add to MessageQueue
            ACS-->>TBS: {success: true, queued: true}
            
            loop Queue Processing
                ACS->>ACS: processQueuedMessage()
                ACS->>T: Send typing action
                ACS->>AI: request(contextId, message)
                AI->>G: Generate response
                G-->>AI: AI response
                AI-->>ACS: response text
                ACS->>TBS: onMessageResponse(contextId, response)
                TBS->>T: Send response to chat
                T-->>U: Shows AI response
                ACS->>ACS: Update chat context
                ACS->>ACS: Wait throttle delay (3s)
            end
        end
    end
```

## 🏗️ Lifecycle Управление

```mermaid
stateDiagram-v2
    [*] --> Created: new App()
    Created --> Initializing: app.run()
    
    state Initializing {
        [*] --> RegisteringServices: Application.initialize()
        RegisteringServices --> CreatingInstances: Container.initialize()
        CreatingInstances --> InitializingServices: service.initialize()
        InitializingServices --> [*]
    }
    
    Initializing --> Starting: Application.start()
    
    state Starting {
        [*] --> StartingServices: Container.start()
        StartingServices --> ServiceRunning: service.start()
        ServiceRunning --> [*]
    }
    
    Starting --> Running: All services started
    
    state Running {
        [*] --> ProcessingEvents
        ProcessingEvents --> ProcessingEvents: Handle events
        ProcessingEvents --> GracefulShutdown: SIGINT/SIGTERM
    }
    
    Running --> Stopping: app.stop()
    
    state Stopping {
        [*] --> StoppingServices: Container.stop()
        StoppingServices --> DisposingServices: Container.dispose()
        DisposingServices --> [*]
    }
    
    Stopping --> [*]: Process exit
```

## 🔧 Dependency Graph

```mermaid
graph TD
    subgraph "Level 1 - Core Dependencies"
        CONFIG[config.ts]
        LOGGER[Logger]
        REPO[Repository]
    end
    
    subgraph "Level 2 - Infrastructure"
        DATABASE[DatabaseService]
        CACHE[CacheService]
        AI[AIService]
    end
    
    subgraph "Level 3 - Business Logic"
        CAPTCHA[CaptchaService]
        ANTISPAM[AntiSpamService]
        AICHAT[AIChatService]
    end
    
    subgraph "Level 4 - Application Services"
        TELEGRAM[TelegramBotService]
        API[ApiServerService]
    end
    
    CONFIG --> DATABASE
    CONFIG --> CACHE
    CONFIG --> AI
    CONFIG --> CAPTCHA
    CONFIG --> ANTISPAM
    CONFIG --> AICHAT
    CONFIG --> TELEGRAM
    CONFIG --> API
    
    LOGGER --> DATABASE
    LOGGER --> CACHE
    LOGGER --> AI
    LOGGER --> CAPTCHA
    LOGGER --> ANTISPAM
    LOGGER --> AICHAT
    LOGGER --> TELEGRAM
    LOGGER --> API
    
    REPO --> CAPTCHA
    REPO --> TELEGRAM
    REPO --> API
    
    AI --> ANTISPAM
    AI --> AICHAT
    DATABASE --> AICHAT
    DATABASE --> API
    
    CAPTCHA --> TELEGRAM
    ANTISPAM --> TELEGRAM
    AICHAT --> TELEGRAM
    
    DATABASE --> API
    REPO --> API
    TELEGRAM --> API
```

## 📡 Event Flow

```mermaid
flowchart TD
    subgraph "Telegram Events"
        E1[chat_member]
        E2[new_chat_members]
        E3[left_chat_member]
        E4[message]
        E5[callback_query]
    end
    
    subgraph "TelegramBotService Handlers"
        H1[handleChatMember]
        H2[handleNewChatMembers]
        H3[handleLeftChatMember]
        H4[handleMessage]
        H5[handleCallbackQuery]
    end
    
    subgraph "Service Logic"
        S1[initiateUserCaptcha]
        S2[checkMessage - AntiSpam]
        S3[processMessage - AI Chat]
        S4[validateAnswer - Captcha]
    end
    
    subgraph "Bot Actions"
        A1[Send Captcha]
        A2[Restrict User]
        A3[Delete Message]
        A4[Send Warning]
        A5[Send AI Response]
        A6[Ban User]
        A7[Unrestrict User]
    end
    
    E1 --> H1
    E2 --> H2
    E3 --> H3
    E4 --> H4
    E5 --> H5
    
    H1 --> S1
    H2 --> S1
    H4 --> S2
    H4 --> S3
    H5 --> S4
    
    S1 --> A1
    S1 --> A2
    S2 --> A3
    S2 --> A4
    S3 --> A5
    S4 --> A6
    S4 --> A7
```

## 🏭 Service Factory Pattern

```mermaid
classDiagram
    class Container {
        -services: Map~string, any~
        -factories: Map~string, Function~
        +register(name, factory)
        +get(name) T
        +getAsync(name) Promise~T~
        +initialize()
        +start()
        +stop()
        +dispose()
    }
    
    class IService {
        <<interface>>
        +initialize() Promise~void~
        +start() Promise~void~
        +stop() Promise~void~
        +dispose() Promise~void~
    }
    
    class Application {
        -container: Container
        +initialize()
        +start()
        +stop()
        +registerCoreServices()
        +registerBusinessServices()
        +registerWebServices()
    }
    
    class TelegramBotService {
        -bot: Bot
        -captchaService: CaptchaService
        -antiSpamService: AntiSpamService
        -aiChatService: AIChatService
        +initialize()
        +start()
        +stop()
        +handleMessage()
        +handleCaptcha()
    }
    
    class CaptchaService {
        -restrictedUsers: Map
        +generateCaptcha()
        +validateAnswer()
        +addRestrictedUser()
        +startTimeoutMonitoring()
    }
    
    class AntiSpamService {
        -userChecks: Map
        +checkMessage()
        +performBasicChecks()
        +checkWithAI()
    }
    
    class AIChatService {
        -chatContexts: Map
        -messageQueue: Array
        +processMessage()
        +isBotMention()
        +startQueueProcessor()
    }
    
    Container --> Application : uses
    Application --> IService : creates
    TelegramBotService ..|> IService
    CaptchaService ..|> IService
    AntiSpamService ..|> IService
    AIChatService ..|> IService
    TelegramBotService --> CaptchaService : depends on
    TelegramBotService --> AntiSpamService : depends on
    TelegramBotService --> AIChatService : depends on
```

---

*Диаграммы обновлены: 05.06.2025*  
*Версия: 2.0* 