const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const gptService = require('./services/gpt-service');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const userInput = req.body.user_input || '';
    const say = await gptService(userInput);
    return res.json({ say });
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return res.status(500).json({ say: 'Sorry, something went wrong.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
