const express = require('express');
const app = express();
app.use(express.json());

const { GptService } = require('./services/gpt-service');

app.post('/webhook', async (req, res) => {
  try {
    const userInput = req.body.user_input || '';
    const sessionId = req.body.session_id || 'default';

    console.log("USER INPUT:", userInput);
    console.log("SESSION ID:", sessionId);

    const gpt = new GptService();
    gpt.loadSession(sessionId); // 🧠 Load session memory
    gpt.sessionId = sessionId;  // 💾 Save transcript path later

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
