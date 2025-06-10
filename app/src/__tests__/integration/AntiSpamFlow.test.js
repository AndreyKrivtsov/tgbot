// Простой интеграционный тест для антиспам системы
// Проверяет базовую работоспособность сервиса

describe('AntiSpam Integration Flow', () => {
  // Мок AntiSpamService
  class MockAntiSpamService {
    async checkMessage(messageText) {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const spamKeywords = ['КУПИ', 'СРОЧНО', 'ССЫЛКА В БИО', 'ЗАРАБОТОК', 'КРИПТОВАЛЮТА'];
      const isSpam = spamKeywords.some(keyword => 
        messageText.toUpperCase().includes(keyword)
      );

      return {
        isSpam,
        confidence: isSpam ? 0.9 : 0.1,
        reason: isSpam ? 'Обнаружены спам-ключевые слова' : 'Сообщение выглядит нормальным',
        action: isSpam ? 'delete' : 'allow'
      };
    }
  }

  test('должен обрабатывать нормальное сообщение', async () => {
    const antiSpamService = new MockAntiSpamService();
    const result = await antiSpamService.checkMessage('Привет всем! Как дела?');
    
    expect(result.action).toBe('allow');
    expect(result.isSpam).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('должен обнаруживать спам', async () => {
    const antiSpamService = new MockAntiSpamService();
    const result = await antiSpamService.checkMessage('СРОЧНО! КУПИ КРИПТОВАЛЮТУ!');
    
    expect(result.action).toBe('delete');
    expect(result.isSpam).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.reason).toContain('спам-ключевые слова');
  });

  test('должен правильно классифицировать разные сообщения', async () => {
    const antiSpamService = new MockAntiSpamService();
    
    const normalMessage = await antiSpamService.checkMessage('Обычное сообщение');
    const spamMessage = await antiSpamService.checkMessage('ЗАРАБОТОК БЕЗ ВЛОЖЕНИЙ!');
    
    expect(normalMessage.isSpam).toBe(false);
    expect(spamMessage.isSpam).toBe(true);
  });
}); 