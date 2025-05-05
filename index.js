const { GptService } = require('./services/gpt-service');

app.post('/webhook', async (req, res) => {
  try {
    const userInput = req.body.user_input || '';
    const gpt = new GptService();

    let fullReply = '';

    await new Promise((resolve) => {
      let interactionCount = 1;
      gpt.on('gptreply', (data) => {
        if (data.partialResponse) {
          fullReply += data.partialResponse;
        }
      });

      gpt.completion(userInput, interactionCount).then(resolve);
    });

    return res.json({ say: fullReply || 'Sorry, I didn’t catch that.' });
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return res.status(500).json({ say: 'Sorry, something went wrong.' });
  }
});
