require('colors');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');

// Load all available tool functions
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor(sessionId = 'session-default') {
    super();
    this.sessionFile = path.join(__dirname, `../transcripts/${sessionId}.json`);
    this.openai = new OpenAI();

    this.userContext = this.loadSession() || [
      {
        role: 'system',
        content: `You are Morgan, a polite, efficient logistics assistant for Battalion Logistics. 
You assist with import, export, shipping, and procurement. 
You always aim to:
- Confirm the purpose of the call.
- Quantity or volume of shipment.
- Collect product type, origin city and state, destination city and state, urgency.
- Capture caller name, company name, email address and callback number.
- Repeat the number back for confirmation.
- Handle sales or spam calls politely and end them quickly.
- gracefully end the call when appropriate. Do a simple recap of what is needed from the caller, Inform caller that the information will be sent to the Battalion Logistics team.
- Individuals that work at Battalion Logistics are currently working on other customer issues and currently unavailable. Capture callback information and reason for calling.
- Trucking companies looking for loads or looking to set up with Battalion Logistics can send email their carrier package to loads@battalionlogistics.com.
- Target customer likely needs wholesale quantities of various products, or shipping containers full, FTL or LTL volume of products. Either by scale or volume. Customer needs these items acquired and relocated from origin to destination essentially hands off. They will need Battalion Logistics to find it and move it.

Your responses are brief, helpful, and professional. 
Add a '•' symbol every 5–10 words at natural pauses to improve text-to-speech clarity. ask only 2-3 questions at a time`
      },
      {
        role: 'assistant',
        content: `Hi, this is Morgan with Battalion Logistics. • How can I assist you today?`
      }
    ];

    this.partialResponseIndex = 0;
  }

  // Load session memory if it exists
  loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const content = fs.readFileSync(this.sessionFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
    return null;
  }

  // Save session memory
  saveSession() {
    try {
      const dir = path.dirname(this.sessionFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.userContext, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
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
      console.warn('Invalid JSON in function arguments:', args);
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
      temperature: 0.7
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    const collectToolInformation = (deltas) => {
      let name = deltas.tool_calls?.[0]?.function?.name || '';
      let args = deltas.tool_calls?.[0]?.function?.arguments || '';
      if (name) functionName = name;
      if (args) functionArgs += args;
    };

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) collectToolInformation(deltas);

      if (finishReason === 'tool_calls') {
        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);

        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);

        const functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;

        if (content.trim().endsWith('•') || finishReason === 'stop') {
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
