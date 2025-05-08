
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');
const fs = require('fs');
const path = require('path');

// Import all functions included in function manifest
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId || 'default';
    this.sessionFilePath = path.join(__dirname, `../transcripts/session-${this.sessionId}.json`);
    this.openai = new OpenAI();
    this.userContext = this.loadSession() || [
      {
        role: 'system',
        content: `You are Morgan, a polite and efficient virtual assistant for Battalion Logistics.
You handle voice calls professionally, helping callers determine if they need import/export logistics or procurement services.
You always aim to:
- Confirm the purpose of the call.
- Extract meaningful information such as product type, origin location (not just caller location), destination, and urgency.
- Capture caller's name, company name, and callback number.
- Repeat the callback number back for clarity.
- End sales calls or irrelevant inquiries politely but firmly.

Use clear, friendly language with short responses and a professional tone.
Add a '•' symbol every 5–10 words at natural pauses to allow for text-to-speech breaks.`
      },
      {
        role: 'assistant',
        content: `Hi, this is Morgan with Battalion Logistics. • How can I assist you today?`
      }
    ];
    this.partialResponseIndex = 0;
  }

  loadSession() {
    if (fs.existsSync(this.sessionFilePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.sessionFilePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  saveSession() {
    try {
      fs.writeFileSync(this.sessionFilePath, JSON.stringify(this.userContext, null, 2));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }

  setCallSid(callSid) {
    this.userContext.push({
      role: 'system',
      content: `callSid: ${callSid}`
    });
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      if (args.indexOf('{') !== args.lastIndexOf('{')) {
        return JSON.parse(args.substring(args.indexOf('{'), args.indexOf('}') + 1));
      }
    }
  }

  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ role, name, content: text });
    } else {
      this.userContext.push({ role, content: text });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: this.userContext,
      tools: tools,
      stream: true,
      max_tokens: 200,
      temperature: 0.7,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name) functionName = name;
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args) functionArgs += args;
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) {
        collectToolInformation(deltas);
      }

      if (finishReason === 'tool_calls') {
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);

        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;

        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);

        let functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;

        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          this.emit('gptreply', {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          }, interactionCount);

          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }

    this.userContext.push({ role: 'assistant', content: completeResponse });
    this.saveSession();
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };
