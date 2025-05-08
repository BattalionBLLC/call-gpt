const express = require('express');
const app = express();
app.use(express.json());

const { GptService } = require('./services/gpt-service');

app.post('/webhook', async (req, res) => {
  try {
    const userInput = req.body.user_input || '';
    const gpt = new GptService();

    let fullReply = '';
    let interactionCount = 1;

    // ✅ Add logs INSIDE this block
    console.log("USER INPUT:", userInput);

    await new Promise((resolve) => {
      gpt.on('gptreply', (data) => {
        if (data.partialResponse) {
          fullReply += data.partialResponse;
        }
      });

      gpt.completion(userInput, interactionCount).then(resolve);
    });

    const isComplete = false; // <-- Replace this with your actual logic or keep for forced looping
    console.log("FULL REPLY:", fullReply);
    console.log("IS COMPLETE:", isComplete);

    return res.json({
      say: fullReply || 'Sorry, I didn’t catch that.',
      done: isComplete
    });
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return res.status(500).json({ say: 'Sorry, something went wrong.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
