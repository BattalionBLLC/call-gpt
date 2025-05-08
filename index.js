const express = require('express');
const app = express();
app.use(express.json());

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

    // 🔍 Basic keyword-based logic to decide if conversation is complete
    const inputLower = userInput.toLowerCase();
const hasExportIntent = inputLower.includes('quote') || inputLower.includes('export');
const hasDestination = inputLower.match(/trinidad|barbados|jamaica|dominican/i);
const hasProduct = inputLower.match(/(bleach|cleaning|water|supplies|goods|cargo)/);
const hasCompanyInfo = inputLower.match(/(company|business|supplies|group|limited)/);
const hasContactInfo = inputLower.match(/\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/);

const isComplete = hasExportIntent && hasDestination && hasProduct && hasCompanyInfo && hasContactInfo;

return res.json({
  say: fullReply || 'Sorry, I didn’t catch that.',
  done: isComplete
});


  } catch (error) {
    console.error('Error in webhook handler:', error);
    return res.status(500).json({ say: 'Sorry, something went wrong.', done: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
console.log("USER INPUT:", userInput);
console.log("IS COMPLETE?", isComplete);
console.log("RESPONSE:", fullReply);

});
